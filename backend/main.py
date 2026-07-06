import json
import os
import random
import shutil
import string
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import (
    create_access_token,
    decode_token,
    get_current_user,
    hash_password,
    security,
    verify_password,
)
from database import CRITERIA_DIR, PHOTOS_DIR, Base, engine, get_db
from migrate import run_migrations
from models import (
    AppRole,
    Audit,
    AuditAnswer,
    AuditPhoto,
    Criterion,
    Department,
    InspectionPlan,
    Manager,
    User,
    UserSession,
)
from pdf_report import generate_audit_pdf
from permissions import (
    ALL_PERMISSIONS,
    PERMISSION_LABELS,
    assert_assignable_role,
    get_permissions,
    has_permission,
    require_permission,
)

Base.metadata.create_all(bind=engine)
run_migrations()

app = FastAPI(title="QRM Quality Report Manager API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Schemas ───────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5)
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=2)
    role: str = Field(pattern="^(admin|inspector)$")


class AdminUserCreate(BaseModel):
    email: str = Field(min_length=5)
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=2)
    role: str = Field(min_length=2, max_length=64)


class AdminUserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    password: str | None = Field(default=None, min_length=6)


class AdminPasswordReset(BaseModel):
    password: str = Field(min_length=6)


class FollowupScheduleIn(BaseModel):
    days: int = Field(ge=1, le=90)


class InspectionPlanIn(BaseModel):
    department_id: str
    planned_date: date
    plan_type: str = Field(pattern="^(regular|extra|followup)$")
    sort_order: int = 0
    notes: str | None = None
    description: str | None = Field(default=None, max_length=2000)
    source_audit_id: str | None = None
    followup_days: int | None = None
    check_frequency: str | None = Field(default=None, pattern="^(Daily|Weekly|Monthly)$")


class QualityResponseIn(BaseModel):
    quality_response: str = Field(min_length=1, max_length=5000)


class RoleIn(BaseModel):
    code: str = Field(min_length=2, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")
    label: str = Field(min_length=2, max_length=255)
    permissions: list[str] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    label: str | None = None
    permissions: list[str] | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class DepartmentIn(BaseModel):
    id: str | None = None
    name: str
    qr_id: str | None = None
    parent_id: str | None = None
    audit_completed_today: bool = False
    last_score: float | None = None


class ManagerIn(BaseModel):
    id: str | None = None
    full_name: str
    position: str
    department_id: str


class CriterionIn(BaseModel):
    id: str | None = None
    code: str
    title: str
    category: str
    department_id: str
    frequency: str
    active: bool = True
    description: str | None = None
    image_url: str | None = None


class CriterionUpdate(BaseModel):
    code: str | None = None
    title: str | None = None
    category: str | None = None
    department_id: str | None = None
    frequency: str | None = None
    active: bool | None = None
    description: str | None = None


class AnswerIn(BaseModel):
    criterion_id: str
    value: str
    notes: str | None = None


class AuditIn(BaseModel):
    id: str | None = None
    department_id: str
    inspector_name: str
    shift: str
    score: float
    status: str
    notes: str | None = None
    conclusion: str | None = None
    check_frequency: str | None = None
    answers: list[AnswerIn] = []


# ─── Helpers ───────────────────────────────────────────────────────────────


def generate_qr(name: str, dept_id: str) -> str:
    prefix = "".join(c for c in (name or "QR")[:3].upper() if c.isalnum()) or "QR"
    suffix = dept_id.replace("-", "")[:6].upper()
    return f"QR-{prefix}-{suffix}"


def create_user_session(db: Session, user_id: str, request: Request) -> str:
    session_id = str(uuid.uuid4())
    db.add(
        UserSession(
            id=session_id,
            user_id=user_id,
            ip_address=request.client.host if request.client else None,
            user_agent=(request.headers.get("user-agent") or "")[:500] or None,
        )
    )
    db.commit()
    return session_id


def revoke_user_sessions(db: Session, user_id: str, except_session_id: str | None = None) -> None:
    q = db.query(UserSession).filter(UserSession.user_id == user_id, UserSession.revoked.is_(False))
    if except_session_id:
        q = q.filter(UserSession.id != except_session_id)
    for session in q.all():
        session.revoked = True
    db.commit()


def user_public_dict(user: User, db: Session) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "permissions": get_permissions(db, user.role),
    }


def user_to_admin_dict(user: User, db: Session) -> dict:
    cutoff = datetime.utcnow() - timedelta(minutes=5)
    online = (
        db.query(UserSession)
        .filter(
            UserSession.user_id == user.id,
            UserSession.revoked.is_(False),
            UserSession.last_active >= cutoff,
        )
        .count()
        > 0
    )
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "password_note": user.password_note,
        "created_at": user.created_at.isoformat(),
        "is_online": online,
    }


def role_to_dict(role: AppRole) -> dict:
    try:
        perms = json.loads(role.permissions)
    except (json.JSONDecodeError, TypeError):
        perms = []
    return {
        "id": role.id,
        "code": role.code,
        "label": role.label,
        "permissions": [p for p in perms if p in ALL_PERMISSIONS],
        "is_system": role.is_system,
        "created_at": role.created_at.isoformat(),
    }


def session_to_dict(session: UserSession, db: Session) -> dict:
    user = db.query(User).filter(User.id == session.user_id).first()
    cutoff = datetime.utcnow() - timedelta(minutes=5)
    return {
        "id": session.id,
        "user_id": session.user_id,
        "user_email": user.email if user else None,
        "user_name": user.full_name if user else None,
        "user_role": user.role if user else None,
        "ip_address": session.ip_address,
        "user_agent": session.user_agent,
        "last_active": session.last_active.isoformat(),
        "created_at": session.created_at.isoformat(),
        "is_active": session.last_active >= cutoff and not session.revoked,
    }


@app.on_event("startup")
def bootstrap_superadmin() -> None:
    email = os.getenv("SUPERADMIN_EMAIL", "salichyk8888@gmail.com").strip().lower()
    if not email:
        return
    db = next(get_db())
    try:
        user = db.query(User).filter(User.email == email).first()
        if user and user.role != "superadmin":
            user.role = "superadmin"
            db.commit()
    finally:
        db.close()


def save_upload(file: UploadFile, dest_dir: Path, prefix: str = "") -> tuple[str, str]:
    ext = Path(file.filename or "file.bin").suffix or ".bin"
    safe_name = f"{prefix}{uuid.uuid4().hex}{ext}"
    dest = dest_dir / safe_name
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    return str(dest), file.filename or safe_name


def dept_to_dict(d: Department) -> dict:
    return {
        "id": d.id,
        "name": d.name,
        "qr_id": d.qr_id,
        "parent_id": d.parent_id,
        "audit_completed_today": d.audit_completed_today,
        "last_score": d.last_score,
    }


def criterion_to_dict(c: Criterion) -> dict:
    image_url = None
    if c.image_path:
        image_url = f"/files/criteria/{Path(c.image_path).name}"
    return {
        "id": c.id,
        "code": c.code,
        "title": c.title,
        "category": c.category,
        "department_id": c.department_id,
        "frequency": c.frequency,
        "active": c.active,
        "description": c.description,
        "image_url": image_url,
    }


def audit_to_dict(a: Audit, db: Session) -> dict:
    dept = db.query(Department).filter(Department.id == a.department_id).first()
    pdf_url = f"/reports/{a.id}/pdf" if a.pdf_path else None
    photos = [
        {"id": p.id, "url": f"/files/photos/{Path(p.file_path).name}", "name": p.original_name}
        for p in a.photos
    ]
    answers = []
    for ans in a.answers:
        crit = db.query(Criterion).filter(Criterion.id == ans.criterion_id).first()
        answers.append(
            {
                "criterion_id": ans.criterion_id,
                "code": crit.code if crit else ans.criterion_id[:8],
                "title": crit.title if crit else "—",
                "value": ans.value,
                "notes": ans.notes,
            }
        )
    return {
        "id": a.id,
        "department_id": a.department_id,
        "department_name": dept.name if dept else None,
        "inspector_name": a.inspector_name,
        "inspector_user_id": a.inspector_user_id,
        "shift": a.shift,
        "score": a.score,
        "status": a.status,
        "notes": a.notes,
        "conclusion": a.conclusion,
        "quality_response": a.quality_response,
        "quality_responder_name": a.quality_responder_name,
        "quality_response_at": a.quality_response_at.isoformat() if a.quality_response_at else None,
        "answers": answers,
        "pdf_url": pdf_url,
        "photos": photos,
        "check_frequency": a.check_frequency,
        "created_at": a.created_at.isoformat(),
    }


def plan_to_dict(p: InspectionPlan, db: Session) -> dict:
    dept = db.query(Department).filter(Department.id == p.department_id).first()
    meta = frequency_meta(db, p.department_id, p.check_frequency)
    return {
        "id": p.id,
        "department_id": p.department_id,
        "department_name": dept.name if dept else None,
        "planned_date": p.planned_date.isoformat(),
        "sort_order": p.sort_order,
        "plan_type": p.plan_type,
        "status": p.status,
        "notes": p.notes,
        "description": p.description,
        "source_audit_id": p.source_audit_id,
        "followup_days": p.followup_days,
        "completed_audit_id": p.completed_audit_id,
        "check_frequency": p.check_frequency,
        "is_due": meta["is_due"] if p.status == "pending" else False,
        "last_check_at": meta["last_check_at"],
        "last_score": meta["last_score"],
        "period_label": meta["period_label"],
        "created_at": p.created_at.isoformat(),
    }


def rollover_pending_plans(db: Session) -> int:
    """Move unfinished plans from past days to today (inspector sees them next morning)."""
    today = date.today()
    overdue = (
        db.query(InspectionPlan)
        .filter(InspectionPlan.status == "pending", InspectionPlan.planned_date < today)
        .order_by(InspectionPlan.planned_date, InspectionPlan.sort_order)
        .all()
    )
    moved = 0
    for plan in overdue:
        duplicate = (
            db.query(InspectionPlan)
            .filter(
                InspectionPlan.department_id == plan.department_id,
                InspectionPlan.planned_date == today,
                InspectionPlan.status == "pending",
                InspectionPlan.id != plan.id,
            )
        )
        if plan.check_frequency:
            duplicate = duplicate.filter(InspectionPlan.check_frequency == plan.check_frequency)
        if duplicate.first():
            plan.status = "cancelled"
            continue
        old_date = plan.planned_date
        plan.planned_date = today
        tag = f"Přeneseno z {old_date.strftime('%d.%m.%Y')}"
        if not plan.notes or tag not in plan.notes:
            plan.notes = f"{plan.notes}\n{tag}".strip() if plan.notes else tag
        moved += 1
    if overdue:
        db.commit()
    return moved


def complete_inspection_plan(
    db: Session,
    department_id: str,
    audit_id: str,
    check_frequency: str | None = None,
) -> None:
    today = date.today()
    base_q = db.query(InspectionPlan).filter(
        InspectionPlan.department_id == department_id,
        InspectionPlan.planned_date <= today,
        InspectionPlan.status == "pending",
    )
    plan = None
    if check_frequency:
        plan = (
            base_q.filter(InspectionPlan.check_frequency == check_frequency)
            .order_by(InspectionPlan.planned_date.desc(), InspectionPlan.sort_order)
            .first()
        )
    if not plan:
        plan = base_q.order_by(
            InspectionPlan.planned_date.desc(), InspectionPlan.sort_order
        ).first()
    if plan:
        plan.status = "done"
        plan.completed_audit_id = audit_id


# ─── Auth ──────────────────────────────────────────────────────────────────


@app.post("/auth/register", response_model=TokenResponse)
def register(
    body: RegisterRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
):
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(400, "E-mail je již registrován")
    assert_assignable_role(db, body.role)
    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        password_note=body.password,
        full_name=body.full_name.strip(),
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    session_id = create_user_session(db, user.id, request)
    token = create_access_token(user.id, user.role, session_id)
    return TokenResponse(
        access_token=token,
        user=user_public_dict(user, db),
    )


@app.post("/auth/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Neplatný e-mail nebo heslo")
    session_id = create_user_session(db, user.id, request)
    token = create_access_token(user.id, user.role, session_id)
    return TokenResponse(
        access_token=token,
        user=user_public_dict(user, db),
    )


@app.post("/auth/logout")
def logout(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[Session, Depends(get_db)],
):
    if not credentials:
        return {"ok": True}
    try:
        payload = decode_token(credentials.credentials)
        jti = payload.get("jti")
        if jti:
            session = db.query(UserSession).filter(UserSession.id == jti).first()
            if session:
                session.revoked = True
                db.commit()
    except Exception:
        pass
    return {"ok": True}


@app.get("/auth/me")
def me(user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]):
    return user_public_dict(user, db)


# ─── Superadmin: users & sessions ──────────────────────────────────────────


@app.get("/admin/users")
def list_users(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("users"))],
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [user_to_admin_dict(u, db) for u in users]


@app.post("/admin/users")
def admin_create_user(
    body: AdminUserCreate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("users"))],
):
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(400, "E-mail je již registrován")
    assert_assignable_role(db, body.role)
    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        password_note=body.password,
        full_name=body.full_name.strip(),
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_to_admin_dict(user, db)


@app.delete("/admin/users/{user_id}")
def admin_delete_user(
    user_id: str,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(require_permission("users"))],
):
    if user_id == current.id:
        raise HTTPException(400, "Nemůžete smazat vlastní účet")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Uživatel nenalezen")
    if user.role == "superadmin":
        raise HTTPException(400, "Superadmin účet nelze smazat")
    revoke_user_sessions(db, user_id)
    db.delete(user)
    db.commit()
    return {"ok": True}


@app.put("/admin/users/{user_id}/password")
def admin_reset_password(
    user_id: str,
    body: AdminPasswordReset,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("users"))],
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Uživatel nenalezen")
    user.password_hash = hash_password(body.password)
    user.password_note = body.password
    revoke_user_sessions(db, user_id)
    db.commit()
    return {"ok": True, "password_note": body.password}


@app.put("/admin/users/{user_id}")
def admin_update_user(
    user_id: str,
    body: AdminUserUpdate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("users"))],
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Uživatel nenalezen")
    if user.role == "superadmin" and body.role and body.role != "superadmin":
        raise HTTPException(400, "Roli superadmin nelze změnit")
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.role is not None:
        assert_assignable_role(db, body.role)
        user.role = body.role
        revoke_user_sessions(db, user_id)
    if body.password is not None:
        user.password_hash = hash_password(body.password)
        user.password_note = body.password
        revoke_user_sessions(db, user_id)
    db.commit()
    db.refresh(user)
    return user_to_admin_dict(user, db)


@app.get("/admin/sessions")
def list_sessions(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("sessions"))],
):
    cutoff = datetime.utcnow() - timedelta(days=7)
    sessions = (
        db.query(UserSession)
        .filter(UserSession.revoked.is_(False), UserSession.last_active >= cutoff)
        .order_by(UserSession.last_active.desc())
        .all()
    )
    return [session_to_dict(s, db) for s in sessions]


@app.delete("/admin/sessions/{session_id}")
def revoke_session(
    session_id: str,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("sessions"))],
):
    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Relace nenalezena")
    session.revoked = True
    db.commit()
    return {"ok": True}


# ─── Superadmin: roles ─────────────────────────────────────────────────────


@app.get("/admin/roles")
def list_roles(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("roles"))],
):
    roles = db.query(AppRole).order_by(AppRole.created_at.asc()).all()
    return [role_to_dict(r) for r in roles]


@app.get("/admin/permissions")
def list_permission_catalog(
    _: Annotated[User, Depends(require_permission("roles"))],
):
    return [{"code": code, "label": PERMISSION_LABELS[code]} for code in ALL_PERMISSIONS]


@app.post("/admin/roles")
def create_role(
    body: RoleIn,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("roles"))],
):
    if body.code == "superadmin":
        raise HTTPException(400, "Roli superadmin nelze vytvořit")
    if db.query(AppRole).filter(AppRole.code == body.code).first():
        raise HTTPException(400, "Role s tímto kódem již existuje")
    perms = [p for p in body.permissions if p in ALL_PERMISSIONS and p != "roles"]
    role = AppRole(
        code=body.code,
        label=body.label.strip(),
        permissions=json.dumps(perms),
        is_system=False,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return role_to_dict(role)


@app.put("/admin/roles/{role_id}")
def update_role(
    role_id: str,
    body: RoleUpdate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("roles"))],
):
    role = db.query(AppRole).filter(AppRole.id == role_id).first()
    if not role:
        raise HTTPException(404, "Role nenalezena")
    if role.code == "superadmin":
        raise HTTPException(400, "Roli superadmin nelze upravit")
    if body.label is not None:
        role.label = body.label.strip()
    if body.permissions is not None:
        perms = [p for p in body.permissions if p in ALL_PERMISSIONS]
        if role.code != "superadmin":
            perms = [p for p in perms if p not in ("roles", "users", "sessions")]
        role.permissions = json.dumps(perms)
    db.commit()
    db.refresh(role)
    return role_to_dict(role)


@app.delete("/admin/roles/{role_id}")
def delete_role(
    role_id: str,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("roles"))],
):
    role = db.query(AppRole).filter(AppRole.id == role_id).first()
    if not role:
        raise HTTPException(404, "Role nenalezena")
    if role.is_system or role.code == "superadmin":
        raise HTTPException(400, "Systémovou roli nelze smazat")
    in_use = db.query(User).filter(User.role == role.code).count()
    if in_use:
        raise HTTPException(400, f"Role je použita u {in_use} uživatelů")
    db.delete(role)
    db.commit()
    return {"ok": True}


# ─── Departments ───────────────────────────────────────────────────────────


@app.get("/departments")
def list_departments(db: Annotated[Session, Depends(get_db)]):
    return [dept_to_dict(d) for d in db.query(Department).all()]


@app.post("/departments")
def create_department(
    body: DepartmentIn,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("structure"))],
):
    dept_id = body.id or str(uuid.uuid4())
    dept = Department(
        id=dept_id,
        name=body.name,
        qr_id=generate_qr(body.name, dept_id),
        parent_id=body.parent_id,
    )
    db.add(dept)
    db.commit()
    return dept_to_dict(dept)


@app.put("/departments/{dept_id}")
def update_department(
    dept_id: str,
    body: DepartmentIn,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("structure"))],
):
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(404, "Oddělení nenalezeno")
    dept.name = body.name
    dept.parent_id = body.parent_id
    dept.audit_completed_today = body.audit_completed_today
    dept.last_score = body.last_score
    db.commit()
    return dept_to_dict(dept)


@app.delete("/departments/{dept_id}")
def delete_department(
    dept_id: str,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("structure"))],
):
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(404, "Oddělení nenalezeno")
    db.delete(dept)
    db.commit()
    return {"ok": True}


CHECK_FREQUENCY_ORDER = ["Shiftly", "Daily", "Weekly", "Monthly"]

CHECK_FREQUENCY_LABELS = {
    "Shiftly": "Kontrola každou směnu",
    "Daily": "Denní kontrola",
    "Weekly": "Týdenní kontrola",
    "Monthly": "Měsíční kontrola",
}

FREQUENCY_PERIOD_LABELS = {
    "Shiftly": "dnes",
    "Daily": "dnes",
    "Weekly": "tento týden",
    "Monthly": "tento měsíc",
}


def frequency_period_start(frequency: str, on: date | None = None) -> date:
    today = on or date.today()
    if frequency in ("Daily", "Shiftly"):
        return today
    if frequency == "Weekly":
        return today - timedelta(days=today.weekday())
    if frequency == "Monthly":
        return today.replace(day=1)
    return today


def last_audit_in_period(
    db: Session, department_id: str, frequency: str, on: date | None = None
) -> Audit | None:
    period_start = frequency_period_start(frequency, on)
    start_dt = datetime.combine(period_start, datetime.min.time())
    return (
        db.query(Audit)
        .filter(
            Audit.department_id == department_id,
            Audit.check_frequency == frequency,
            Audit.created_at >= start_dt,
        )
        .order_by(Audit.created_at.desc())
        .first()
    )


def is_frequency_due(db: Session, department_id: str, frequency: str | None) -> bool:
    if not frequency:
        return True
    return last_audit_in_period(db, department_id, frequency) is None


def last_audit_ever(db: Session, department_id: str, frequency: str) -> Audit | None:
    return (
        db.query(Audit)
        .filter(Audit.department_id == department_id, Audit.check_frequency == frequency)
        .order_by(Audit.created_at.desc())
        .first()
    )


def frequency_meta(db: Session, department_id: str, frequency: str | None) -> dict:
    if not frequency:
        return {"is_due": True, "last_check_at": None, "last_score": None, "period_label": None}
    in_period = last_audit_in_period(db, department_id, frequency)
    last = in_period or last_audit_ever(db, department_id, frequency)
    return {
        "is_due": in_period is None,
        "last_check_at": last.created_at.isoformat() if last else None,
        "last_score": last.score if last else None,
        "last_status": last.status if last else None,
        "period_label": FREQUENCY_PERIOD_LABELS.get(frequency),
    }


def sync_satisfied_plans(db: Session) -> None:
    """Mark pending plans as done when that frequency was already completed in the current period."""
    today = date.today()
    pending = (
        db.query(InspectionPlan)
        .filter(
            InspectionPlan.planned_date == today,
            InspectionPlan.status == "pending",
            InspectionPlan.check_frequency.isnot(None),
        )
        .all()
    )
    changed = False
    for plan in pending:
        if not is_frequency_due(db, plan.department_id, plan.check_frequency):
            done_audit = last_audit_in_period(db, plan.department_id, plan.check_frequency)
            plan.status = "done"
            if done_audit:
                plan.completed_audit_id = done_audit.id
            changed = True
    if changed:
        db.commit()


@app.get("/departments/{dept_id}/check-overview")
def department_check_overview(
    dept_id: str,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("inspector"))],
):
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(404, "Oddělení nenalezeno")

    criteria = (
        db.query(Criterion)
        .filter(Criterion.department_id == dept_id, Criterion.active.is_(True))
        .all()
    )
    freq_counts: dict[str, int] = {}
    for c in criteria:
        freq_counts[c.frequency] = freq_counts.get(c.frequency, 0) + 1

    items = []
    for freq in CHECK_FREQUENCY_ORDER:
        count = freq_counts.get(freq, 0)
        if count == 0:
            continue
        last = last_audit_ever(db, dept_id, freq)
        meta = frequency_meta(db, dept_id, freq)
        items.append(
            {
                "frequency": freq,
                "label": CHECK_FREQUENCY_LABELS.get(freq, freq),
                "criteria_count": count,
                "last_check_at": last.created_at.isoformat() if last else None,
                "last_score": last.score if last else None,
                "last_status": last.status if last else None,
                "is_due": meta["is_due"],
                "period_label": meta["period_label"],
            }
        )

    for freq, count in freq_counts.items():
        if freq in CHECK_FREQUENCY_ORDER:
            continue
        last = last_audit_ever(db, dept_id, freq)
        meta = frequency_meta(db, dept_id, freq)
        items.append(
            {
                "frequency": freq,
                "label": CHECK_FREQUENCY_LABELS.get(freq, freq),
                "criteria_count": count,
                "last_check_at": last.created_at.isoformat() if last else None,
                "last_score": last.score if last else None,
                "last_status": last.status if last else None,
                "is_due": meta["is_due"],
                "period_label": meta["period_label"],
            }
        )

    return {"department_id": dept_id, "department_name": dept.name, "checks": items}


STATS_FREQUENCIES = ["Daily", "Weekly", "Monthly"]


@app.get("/departments/{dept_id}/stats")
def department_stats(
    dept_id: str,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("stats", "structure"))],
    period: str = "week",
):
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(404, "Oddělení nenalezeno")

    today = date.today()
    if period == "day":
        start_date = today
    elif period == "month":
        start_date = today - timedelta(days=29)
    else:
        period = "week"
        start_date = today - timedelta(days=6)

    start_dt = datetime.combine(start_date, datetime.min.time())
    audits = (
        db.query(Audit)
        .filter(Audit.department_id == dept_id, Audit.created_at >= start_dt)
        .order_by(Audit.created_at.desc())
        .all()
    )

    items = []
    for freq in STATS_FREQUENCIES:
        freq_audits = [a for a in audits if a.check_frequency == freq]
        last = freq_audits[0] if freq_audits else None
        scores = [a.score for a in freq_audits]
        items.append(
            {
                "frequency": freq,
                "label": CHECK_FREQUENCY_LABELS.get(freq, freq),
                "checks_count": len(freq_audits),
                "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
                "last_check_at": last.created_at.isoformat() if last else None,
                "last_score": last.score if last else None,
                "last_status": last.status if last else None,
                "history": [
                    {
                        "id": a.id,
                        "score": a.score,
                        "status": a.status,
                        "inspector_name": a.inspector_name,
                        "created_at": a.created_at.isoformat(),
                    }
                    for a in reversed(freq_audits[:20])
                ],
            }
        )

    return {
        "department_id": dept_id,
        "department_name": dept.name,
        "period": period,
        "from_date": start_date.isoformat(),
        "to_date": today.isoformat(),
        "frequencies": items,
    }


# ─── Managers ──────────────────────────────────────────────────────────────


@app.get("/managers")
def list_managers(db: Annotated[Session, Depends(get_db)]):
    return [
        {
            "id": m.id,
            "full_name": m.full_name,
            "position": m.position,
            "department_id": m.department_id,
        }
        for m in db.query(Manager).all()
    ]


@app.post("/managers")
def create_manager(
    body: ManagerIn,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("structure"))],
):
    mgr = Manager(
        id=body.id or str(uuid.uuid4()),
        full_name=body.full_name,
        position=body.position,
        department_id=body.department_id,
    )
    db.add(mgr)
    db.commit()
    return {"id": mgr.id, "full_name": mgr.full_name, "position": mgr.position, "department_id": mgr.department_id}


@app.delete("/managers/{mgr_id}")
def delete_manager(
    mgr_id: str,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("structure"))],
):
    mgr = db.query(Manager).filter(Manager.id == mgr_id).first()
    if mgr:
        db.delete(mgr)
        db.commit()
    return {"ok": True}


# ─── Criteria ──────────────────────────────────────────────────────────────


@app.get("/criteria")
def list_criteria(db: Annotated[Session, Depends(get_db)]):
    return [criterion_to_dict(c) for c in db.query(Criterion).all()]


@app.post("/criteria")
async def create_criterion(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("criteria"))],
    code: str = Form(...),
    title: str = Form(...),
    department_id: str = Form(...),
    category: str = Form(...),
    frequency: str = Form(...),
    description: str = Form(""),
    file: UploadFile | None = File(None),
):
    image_path = None
    if file and file.filename:
        image_path, _ = save_upload(file, CRITERIA_DIR, "crit_")

    crit = Criterion(
        code=code,
        title=title,
        category=category,
        department_id=department_id,
        frequency=frequency,
        description=description or None,
        image_path=image_path,
    )
    db.add(crit)
    db.commit()
    db.refresh(crit)
    return criterion_to_dict(crit)


@app.post("/criteria/json")
def create_criterion_json(
    body: CriterionIn,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("criteria"))],
):
    crit = Criterion(
        id=body.id or str(uuid.uuid4()),
        code=body.code,
        title=body.title,
        category=body.category,
        department_id=body.department_id,
        frequency=body.frequency,
        active=body.active,
        description=body.description,
    )
    db.add(crit)
    db.commit()
    return criterion_to_dict(crit)


@app.put("/criteria/{crit_id}")
def update_criterion(
    crit_id: str,
    body: CriterionUpdate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("criteria"))],
):
    crit = db.query(Criterion).filter(Criterion.id == crit_id).first()
    if not crit:
        raise HTTPException(404, "Kritérium nenalezeno")
    if body.code is not None:
        crit.code = body.code
    if body.title is not None:
        crit.title = body.title
    if body.category is not None:
        crit.category = body.category
    if body.department_id is not None:
        crit.department_id = body.department_id
    if body.frequency is not None:
        crit.frequency = body.frequency
    if body.active is not None:
        crit.active = body.active
    if body.description is not None:
        crit.description = body.description or None
    db.commit()
    db.refresh(crit)
    return criterion_to_dict(crit)


@app.put("/criteria/{crit_id}/image")
async def update_criterion_image(
    crit_id: str,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("criteria"))],
    file: UploadFile = File(...),
):
    crit = db.query(Criterion).filter(Criterion.id == crit_id).first()
    if not crit:
        raise HTTPException(404, "Kritérium nenalezeno")
    if crit.image_path and Path(crit.image_path).exists():
        Path(crit.image_path).unlink(missing_ok=True)
    if file.filename:
        crit.image_path, _ = save_upload(file, CRITERIA_DIR, "crit_")
    db.commit()
    db.refresh(crit)
    return criterion_to_dict(crit)


@app.delete("/criteria/{crit_id}")
def delete_criterion(
    crit_id: str,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("criteria"))],
):
    crit = db.query(Criterion).filter(Criterion.id == crit_id).first()
    if crit:
        if crit.image_path and Path(crit.image_path).exists():
            Path(crit.image_path).unlink(missing_ok=True)
        db.delete(crit)
        db.commit()
    return {"ok": True}


# ─── Audits & Reports ──────────────────────────────────────────────────────


@app.get("/audits")
def list_audits(db: Annotated[Session, Depends(get_db)]):
    audits = db.query(Audit).order_by(Audit.created_at.desc()).all()
    return [audit_to_dict(a, db) for a in audits]


@app.get("/audits/mine")
def list_my_audits(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("inspector"))],
):
    audits = (
        db.query(Audit)
        .filter(Audit.inspector_user_id == user.id)
        .order_by(Audit.created_at.desc())
        .all()
    )
    return [audit_to_dict(a, db) for a in audits]


@app.get("/audits/{audit_id}")
def get_audit(audit_id: str, db: Annotated[Session, Depends(get_db)]):
    audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not audit:
        raise HTTPException(404, "Audit nenalezen")
    return audit_to_dict(audit, db)


@app.put("/audits/{audit_id}/quality-response")
def save_quality_response(
    audit_id: str,
    body: QualityResponseIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("reports"))],
):
    audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not audit:
        raise HTTPException(404, "Audit nenalezen")
    audit.quality_response = body.quality_response.strip()
    audit.quality_responder_name = user.full_name
    audit.quality_response_at = datetime.utcnow()
    db.commit()
    db.refresh(audit)
    return audit_to_dict(audit, db)


@app.post("/audits/{audit_id}/followup")
def schedule_followup(
    audit_id: str,
    body: FollowupScheduleIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("reports"))],
):
    audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not audit:
        raise HTTPException(404, "Audit nenalezen")
    if audit.status != "failed":
        raise HTTPException(400, "Opakovaná kontrola lze naplánovat pouze po nevyhovujícím auditu")

    planned = date.today() + timedelta(days=body.days)
    existing = (
        db.query(InspectionPlan)
        .filter(
            InspectionPlan.department_id == audit.department_id,
            InspectionPlan.planned_date == planned,
            InspectionPlan.plan_type == "followup",
            InspectionPlan.source_audit_id == audit.id,
            InspectionPlan.status == "pending",
        )
        .first()
    )
    if existing:
        return plan_to_dict(existing, db)

    plan = InspectionPlan(
        department_id=audit.department_id,
        planned_date=planned,
        plan_type="followup",
        notes=f"Opakovaná kontrola po auditu {audit_id[:8]}",
        source_audit_id=audit.id,
        followup_days=body.days,
        created_by_user_id=user.id,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan_to_dict(plan, db)


@app.post("/audits")
def create_audit_json(
    body: AuditIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    return _create_audit(body, db, user, [])


@app.post("/audits/submit")
async def submit_audit(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("inspector"))],
    department_id: str = Form(...),
    shift: str = Form(...),
    score: float = Form(...),
    status: str = Form(...),
    notes: str = Form(""),
    conclusion: str = Form(""),
    check_frequency: str = Form(""),
    answers_json: str = Form("[]"),
    photos: list[UploadFile] = File(default=[]),
):
    import json

    answers_data = json.loads(answers_json)
    body = AuditIn(
        department_id=department_id,
        inspector_name=user.full_name,
        shift=shift,
        score=score,
        status=status,
        notes=notes or None,
        conclusion=conclusion or None,
        check_frequency=check_frequency or None,
        answers=[AnswerIn(**a) for a in answers_data],
    )
    return _create_audit(body, db, user, photos)


def _create_audit(body: AuditIn, db: Session, user: User, photo_files: list) -> dict:
    dept = db.query(Department).filter(Department.id == body.department_id).first()
    if not dept:
        raise HTTPException(404, "Oddělení nenalezeno")

    audit = Audit(
        id=body.id or str(uuid.uuid4()),
        department_id=body.department_id,
        inspector_user_id=user.id,
        inspector_name=body.inspector_name,
        shift=body.shift,
        score=body.score,
        status=body.status,
        notes=body.notes,
        conclusion=body.conclusion,
        check_frequency=body.check_frequency,
    )
    db.add(audit)
    db.flush()

    answer_rows = []
    for ans in body.answers:
        db.add(AuditAnswer(
            audit_id=audit.id,
            criterion_id=ans.criterion_id,
            value=ans.value,
            notes=ans.notes,
        ))
        crit = db.query(Criterion).filter(Criterion.id == ans.criterion_id).first()
        answer_rows.append({
            "code": crit.code if crit else ans.criterion_id[:8],
            "value": ans.value,
            "notes": ans.notes,
        })

    photo_paths: list[Path] = []
    for pf in photo_files:
        if pf.filename:
            path_str, orig = save_upload(pf, PHOTOS_DIR, "audit_")
            photo_paths.append(Path(path_str))
            db.add(AuditPhoto(audit_id=audit.id, file_path=path_str, original_name=orig))

    dept.audit_completed_today = True
    dept.last_score = body.score

    complete_inspection_plan(db, body.department_id, audit.id, body.check_frequency)

    db.flush()

    pdf = generate_audit_pdf(
        audit_id=audit.id,
        inspector_name=audit.inspector_name,
        department_name=dept.name,
        shift=audit.shift,
        score=audit.score,
        status=audit.status,
        conclusion=audit.conclusion,
        notes=audit.notes,
        answers=answer_rows,
        photo_paths=photo_paths,
    )
    audit.pdf_path = str(pdf)
    db.commit()
    db.refresh(audit)
    return audit_to_dict(audit, db)


@app.get("/reports/{audit_id}/pdf")
def download_report(
    audit_id: str,
    db: Annotated[Session, Depends(get_db)],
    download: bool = False,
):
    audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not audit or not audit.pdf_path or not Path(audit.pdf_path).exists():
        raise HTTPException(404, "PDF zpráva nenalezena")
    disposition = "attachment" if download else "inline"
    return FileResponse(
        audit.pdf_path,
        media_type="application/pdf",
        filename=f"zprava_{audit_id[:8]}.pdf",
        headers={"Content-Disposition": f'{disposition}; filename="zprava_{audit_id[:8]}.pdf"'},
    )


@app.get("/files/photos/{filename}")
def get_photo(filename: str):
    path = PHOTOS_DIR / filename
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(path)


@app.get("/files/criteria/{filename}")
def get_criterion_image(filename: str):
    path = CRITERIA_DIR / filename
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(path)


# ─── Inspection plans ──────────────────────────────────────────────────────


@app.get("/inspection-plans/today")
def inspector_today_plans(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("inspector"))],
):
    rollover_pending_plans(db)
    sync_satisfied_plans(db)
    today = date.today()
    plans = (
        db.query(InspectionPlan)
        .filter(
            InspectionPlan.planned_date == today,
            InspectionPlan.status.in_(["pending", "done"]),
        )
        .all()
    )
    plans.sort(key=lambda p: (0 if p.status == "pending" else 1, p.sort_order))
    return [plan_to_dict(p, db) for p in plans]


@app.get("/inspection-plans")
def list_inspection_plans(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("schedule", "inspector"))],
    from_date: date | None = None,
    to_date: date | None = None,
):
    rollover_pending_plans(db)
    start = from_date or date.today()
    end = to_date or (start + timedelta(days=6))
    plans = (
        db.query(InspectionPlan)
        .filter(InspectionPlan.planned_date >= start, InspectionPlan.planned_date <= end)
        .order_by(InspectionPlan.planned_date, InspectionPlan.sort_order)
        .all()
    )
    return [plan_to_dict(p, db) for p in plans]


@app.post("/inspection-plans")
def create_inspection_plan(
    body: InspectionPlanIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("schedule"))],
):
    dept = db.query(Department).filter(Department.id == body.department_id).first()
    if not dept:
        raise HTTPException(404, "Oddělení nenalezeno")

    plan = InspectionPlan(
        department_id=body.department_id,
        planned_date=body.planned_date,
        sort_order=body.sort_order,
        plan_type=body.plan_type,
        notes=body.notes,
        description=body.description,
        source_audit_id=body.source_audit_id,
        followup_days=body.followup_days,
        check_frequency=body.check_frequency,
        created_by_user_id=user.id,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan_to_dict(plan, db)


@app.delete("/inspection-plans/{plan_id}")
def delete_inspection_plan(
    plan_id: str,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission("schedule"))],
):
    plan = db.query(InspectionPlan).filter(InspectionPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(404, "Plán nenalezen")
    db.delete(plan)
    db.commit()
    return {"ok": True}


@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}
