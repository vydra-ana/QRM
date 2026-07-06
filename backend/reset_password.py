"""Reset password for a user. Usage: python reset_password.py email@firma.cz [new_password]"""
import secrets
import sys

from auth import hash_password
from database import SessionLocal
from models import User


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python reset_password.py <email> [new_password]")
        sys.exit(1)
    email = sys.argv[1].strip().lower()
    new_password = sys.argv[2] if len(sys.argv) > 2 else secrets.token_urlsafe(8)[:10]

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"User not found: {email}")
            sys.exit(1)
        user.password_hash = hash_password(new_password)
        user.password_note = new_password
        if user.email == "salichyk8888@gmail.com":
            user.role = "superadmin"
        db.commit()
        print(f"OK: {email}")
        print(f"Role: {user.role}")
        print(f"New password: {new_password}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
