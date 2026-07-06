import json
from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import AppRole, User

ALL_PERMISSIONS = [
    "stats",
    "reports",
    "criteria",
    "structure",
    "users",
    "sessions",
    "roles",
    "schedule",
    "inspector",
]

PERMISSION_LABELS = {
    "stats": "Statistika",
    "reports": "Zprávy inspektorů",
    "criteria": "Kontrolní body",
    "structure": "Struktura firmy",
    "users": "Správa účtů",
    "sessions": "Aktivní relace",
    "roles": "Správa rolí",
    "schedule": "Plán kontrol",
    "inspector": "Mobilní terminál inspektora",
}

LEGACY_DEFAULTS: dict[str, list[str]] = {
    "superadmin": ALL_PERMISSIONS,
    "admin": ["stats", "reports", "criteria", "schedule"],
    "inspector": ["inspector"],
}

DEFAULT_ROLES = [
    {
        "code": "superadmin",
        "label": "Superadmin",
        "permissions": ALL_PERMISSIONS,
        "is_system": True,
    },
    {
        "code": "admin",
        "label": "Oddělení kvality",
        "permissions": ["stats", "reports", "criteria", "schedule"],
        "is_system": True,
    },
    {
        "code": "inspector",
        "label": "Inspektor",
        "permissions": ["inspector"],
        "is_system": True,
    },
]


def get_permissions(db: Session, role_code: str) -> list[str]:
    if role_code == "superadmin":
        return list(ALL_PERMISSIONS)
    row = db.query(AppRole).filter(AppRole.code == role_code).first()
    if row:
        try:
            perms = json.loads(row.permissions)
            return [p for p in perms if p in ALL_PERMISSIONS]
        except (json.JSONDecodeError, TypeError):
            pass
    return list(LEGACY_DEFAULTS.get(role_code, []))


def has_permission(db: Session, role_code: str, *needed: str) -> bool:
    perms = set(get_permissions(db, role_code))
    return any(p in perms for p in needed)


def require_permission(*needed: str):
    from auth import get_current_user

    def dep(
        user: Annotated[User, Depends(get_current_user)],
        db: Annotated[Session, Depends(get_db)],
    ) -> User:
        if not has_permission(db, user.role, *needed):
            raise HTTPException(status_code=403, detail="Nedostatečná oprávnění")
        return user

    return dep


def role_exists(db: Session, code: str) -> bool:
    if code == "superadmin":
        return True
    return db.query(AppRole).filter(AppRole.code == code).first() is not None


def assert_assignable_role(db: Session, code: str) -> None:
    if code == "superadmin":
        raise HTTPException(400, "Roli superadmin nelze přiřadit ručně")
    if not role_exists(db, code):
        raise HTTPException(400, f"Neznámá role: {code}")
