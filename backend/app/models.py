from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Target(Base):
    __tablename__ = "targets"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    ra: Mapped[float] = mapped_column(Float)
    dec: Mapped[float] = mapped_column(Float)


class FrameCache(Base):
    """Cached IRSA SIA product list per position query."""
    __tablename__ = "frame_cache"
    key: Mapped[str] = mapped_column(String, primary_key=True)
    products: Mapped[list] = mapped_column(JSON)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Render(Base):
    """Cached rendered PNG per downloaded FITS."""
    __tablename__ = "renders"
    key: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String)


class LoginSession(Base):
    __tablename__ = "login_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Discovery(Base):
    __tablename__ = "discoveries"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    ra: Mapped[float] = mapped_column(Float)
    dec: Mapped[float] = mapped_column(Float)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
