import os
from datetime import datetime, timedelta
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import PyJWTError
from sqlalchemy.orm import Session

from database import get_db
from models import User, UserSession

SECRET_KEY = os.getenv("JWT_SECRET", "qrm-mejzlik-dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, role: str, session_id: str | None = None) -> str:
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload: dict = {"sub": user_id, "role": role, "exp": expire}
    if session_id:
        payload["jti"] = session_id
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Chybí autorizace")
    try:
        payload = decode_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Neplatný token")
    except PyJWTError:
        raise HTTPException(status_code=401, detail="Neplatný token")

    jti = payload.get("jti")
    if jti:
        session = (
            db.query(UserSession)
            .filter(UserSession.id == jti, UserSession.revoked.is_(False))
            .first()
        )
        if not session:
            raise HTTPException(status_code=401, detail="Relace ukončena")
        session.last_active = datetime.utcnow()
        db.commit()

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Uživatel nenalezen")
    return user


def require_superadmin():
    return require_role("superadmin")


def require_any_admin():
    return require_role("admin", "superadmin")


def require_role(*roles: str):
    def checker(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Nedostatečná oprávnění")
        return user

    return checker
