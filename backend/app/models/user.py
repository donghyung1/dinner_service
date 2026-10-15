from __future__ import annotations

from datetime import datetime

from sqlalchemy import CHAR, DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BigIntId


class User(Base):
    """로그인 계정. 식당 데이터는 모든 계정이 공유하므로 다른 테이블과 FK 관계가 없다."""

    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("username", name="uq_users_username"),)

    id: Mapped[int] = mapped_column(BigIntId, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class UserSession(Base):
    """서버 세션. 토큰 원문은 쿠키에만 있고 DB에는 SHA-256 해시만 저장한다."""

    __tablename__ = "sessions"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_sessions_token_hash"),
        Index("idx_sessions_user", "user_id"),
        Index("idx_sessions_expires_at", "expires_at"),
    )

    id: Mapped[int] = mapped_column(BigIntId, primary_key=True, autoincrement=True)
    token_hash: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    user_id: Mapped[int] = mapped_column(
        BigIntId, ForeignKey("users.id", ondelete="CASCADE", name="fk_sessions_user"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
