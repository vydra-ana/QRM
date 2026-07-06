import json

from sqlalchemy import inspect, text

from database import engine
from permissions import DEFAULT_ROLES


def run_migrations() -> None:
    insp = inspect(engine)
    tables = insp.get_table_names()

    if "users" in tables:
        cols = {c["name"] for c in insp.get_columns("users")}
        if "password_note" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN password_note VARCHAR(255)"))

    if "user_sessions" not in tables:
        from models import UserSession  # noqa: F401

        UserSession.__table__.create(bind=engine, checkfirst=True)

    if "audits" in tables:
        cols = {c["name"] for c in insp.get_columns("audits")}
        with engine.begin() as conn:
            if "quality_response" not in cols:
                conn.execute(text("ALTER TABLE audits ADD COLUMN quality_response TEXT"))
            if "quality_responder_name" not in cols:
                conn.execute(text("ALTER TABLE audits ADD COLUMN quality_responder_name VARCHAR(255)"))
            if "quality_response_at" not in cols:
                conn.execute(text("ALTER TABLE audits ADD COLUMN quality_response_at DATETIME"))
            if "check_frequency" not in cols:
                conn.execute(text("ALTER TABLE audits ADD COLUMN check_frequency VARCHAR(32)"))

    from models import AppRole  # noqa: F401

    AppRole.__table__.create(bind=engine, checkfirst=True)

    from models import InspectionPlan  # noqa: F401

    InspectionPlan.__table__.create(bind=engine, checkfirst=True)

    insp = inspect(engine)
    if "inspection_plans" in insp.get_table_names():
        plan_cols = {c["name"] for c in insp.get_columns("inspection_plans")}
        if "check_frequency" not in plan_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE inspection_plans ADD COLUMN check_frequency VARCHAR(32)"))
        if "description" not in plan_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE inspection_plans ADD COLUMN description TEXT"))

    from sqlalchemy.orm import Session

    from database import SessionLocal

    db = SessionLocal()
    try:
        for role in DEFAULT_ROLES:
            existing = db.query(AppRole).filter(AppRole.code == role["code"]).first()
            if not existing:
                db.add(
                    AppRole(
                        code=role["code"],
                        label=role["label"],
                        permissions=json.dumps(role["permissions"]),
                        is_system=role["is_system"],
                    )
                )
            elif role["code"] == "admin":
                existing.permissions = json.dumps(role["permissions"])
        db.commit()
    finally:
        db.close()
