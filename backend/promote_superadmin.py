"""Promote an existing user to superadmin. Usage: python promote_superadmin.py email@firma.cz"""
import sys

from database import SessionLocal
from models import User


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python promote_superadmin.py <email>")
        sys.exit(1)
    email = sys.argv[1].strip().lower()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"User not found: {email}")
            sys.exit(1)
        user.role = "superadmin"
        db.commit()
        print(f"OK: {email} is now superadmin")
    finally:
        db.close()


if __name__ == "__main__":
    main()
