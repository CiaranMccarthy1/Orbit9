import hashlib
import hmac
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal
from app.models import LoginSession, User, utcnow

router = APIRouter()
bearer = HTTPBearer(auto_error=False)


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(min_length=8, max_length=128)


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1).hex()


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def current_session(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if credentials:
        with SessionLocal() as db:
            session = db.get(LoginSession, token_hash(credentials.credentials))
            if session:
                expires = session.expires_at
                if expires.tzinfo is None:
                    expires = expires.replace(tzinfo=utcnow().tzinfo)
                if expires > utcnow():
                    user = db.get(User, session.user_id)
                    if user:
                        return user.id, user.username, session.token_hash
    raise HTTPException(401, "Invalid or expired credentials", headers={"WWW-Authenticate": "Bearer"})


@router.post("/register", status_code=201)
def register(data: Credentials):
    salt = secrets.token_bytes(16)
    with SessionLocal() as db:
        db.add(User(username=data.username, password_hash=f"{salt.hex()}:{password_hash(data.password, salt)}"))
        try:
            db.commit()
        except IntegrityError:
            raise HTTPException(409, "Username already exists")
    return {"username": data.username}


@router.post("/login")
def login(data: Credentials):
    cleanup_sessions()
    with SessionLocal() as db:
        user = db.query(User).filter_by(username=data.username).first()
        salt, expected = user.password_hash.split(":") if user else ("00" * 16, "00" * 64)
        actual = password_hash(data.password, bytes.fromhex(salt))
        if not user or not hmac.compare_digest(actual, expected):
            raise HTTPException(401, "Invalid username or password")
        token = secrets.token_urlsafe(32)
        db.add(LoginSession(token_hash=token_hash(token), user_id=user.id, expires_at=utcnow() + timedelta(days=7)))
        db.commit()
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me")
def me(session=Depends(current_session)):
    return {"username": session[1]}


@router.post("/logout", status_code=204)
def logout(session=Depends(current_session)):
    with SessionLocal() as db:
        db.query(LoginSession).filter_by(token_hash=session[2]).delete()
        db.commit()


def cleanup_sessions():
    with SessionLocal() as db:
        db.query(LoginSession).filter(LoginSession.expires_at <= utcnow()).delete()
        db.commit()
