import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def new_id() -> str:
    return str(uuid.uuid4())


class AppRole(Base):
    __tablename__ = "app_roles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(255))
    permissions: Mapped[str] = mapped_column(Text, default="[]")
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    password_note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    audits: Mapped[list["Audit"]] = relationship(back_populates="inspector")
    sessions: Mapped[list["UserSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    last_active: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship(back_populates="sessions")


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(255))
    qr_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    parent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("departments.id"), nullable=True)
    audit_completed_today: Mapped[bool] = mapped_column(Boolean, default=False)
    last_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    managers: Mapped[list["Manager"]] = relationship(back_populates="department", cascade="all, delete-orphan")
    criteria: Mapped[list["Criterion"]] = relationship(back_populates="department", cascade="all, delete-orphan")
    audits: Mapped[list["Audit"]] = relationship(back_populates="department")


class Manager(Base):
    __tablename__ = "managers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    department_id: Mapped[str] = mapped_column(String(36), ForeignKey("departments.id"))
    full_name: Mapped[str] = mapped_column(String(255))
    position: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    department: Mapped["Department"] = relationship(back_populates="managers")


class Criterion(Base):
    __tablename__ = "criteria"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    code: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(500))
    category: Mapped[str] = mapped_column(String(64))
    department_id: Mapped[str] = mapped_column(String(36), ForeignKey("departments.id"))
    frequency: Mapped[str] = mapped_column(String(32))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    department: Mapped["Department"] = relationship(back_populates="criteria")


class Audit(Base):
    __tablename__ = "audits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    department_id: Mapped[str] = mapped_column(String(36), ForeignKey("departments.id"))
    inspector_user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    inspector_name: Mapped[str] = mapped_column(String(255))
    shift: Mapped[str] = mapped_column(String(128))
    score: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    conclusion: Mapped[str | None] = mapped_column(Text, nullable=True)
    quality_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    quality_responder_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quality_response_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    pdf_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    check_frequency: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    department: Mapped["Department"] = relationship(back_populates="audits")
    inspector: Mapped["User | None"] = relationship(back_populates="audits")
    answers: Mapped[list["AuditAnswer"]] = relationship(back_populates="audit", cascade="all, delete-orphan")
    photos: Mapped[list["AuditPhoto"]] = relationship(back_populates="audit", cascade="all, delete-orphan")
    followup_plans: Mapped[list["InspectionPlan"]] = relationship(
        back_populates="source_audit",
        foreign_keys="InspectionPlan.source_audit_id",
    )


class InspectionPlan(Base):
    __tablename__ = "inspection_plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    department_id: Mapped[str] = mapped_column(String(36), ForeignKey("departments.id"))
    planned_date: Mapped[date] = mapped_column(Date)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    plan_type: Mapped[str] = mapped_column(String(20), default="regular")  # regular | extra | followup
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | done | cancelled
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_audit_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("audits.id"), nullable=True)
    followup_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completed_audit_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("audits.id"), nullable=True)
    check_frequency: Mapped[str | None] = mapped_column(String(32), nullable=True)  # Daily | Weekly | Monthly
    created_by_user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    department: Mapped["Department"] = relationship()
    source_audit: Mapped["Audit | None"] = relationship(
        back_populates="followup_plans",
        foreign_keys=[source_audit_id],
    )


class AuditAnswer(Base):
    __tablename__ = "audit_answers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    audit_id: Mapped[str] = mapped_column(String(36), ForeignKey("audits.id"))
    criterion_id: Mapped[str] = mapped_column(String(36))
    value: Mapped[str] = mapped_column(String(10))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    audit: Mapped["Audit"] = relationship(back_populates="answers")


class AuditPhoto(Base):
    __tablename__ = "audit_photos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    audit_id: Mapped[str] = mapped_column(String(36), ForeignKey("audits.id"))
    file_path: Mapped[str] = mapped_column(String(500))
    original_name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    audit: Mapped["Audit"] = relationship(back_populates="photos")
