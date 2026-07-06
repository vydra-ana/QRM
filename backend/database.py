import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
PHOTOS_DIR = UPLOAD_DIR / "photos"
REPORTS_DIR = UPLOAD_DIR / "reports"
CRITERIA_DIR = UPLOAD_DIR / "criteria"

for folder in (UPLOAD_DIR, PHOTOS_DIR, REPORTS_DIR, CRITERIA_DIR):
    folder.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'qrm.db'}")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
