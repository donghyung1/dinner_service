from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import User, UserSession


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_username(self, username: str) -> User | None:
        return self.db.scalar(select(User).where(User.username == username))

    def list_all(self) -> list[User]:
        return list(self.db.scalars(select(User).order_by(User.id)))

    def create(self, username: str, password_hash: str) -> User | None:
        """이미 있는 username 이면 None."""
        user = User(username=username, password_hash=password_hash)
        self.db.add(user)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            return None
        self.db.refresh(user)
        return user

    def set_password_hash(self, user: User, password_hash: str) -> None:
        user.password_hash = password_hash
        # 비밀번호를 바꾸면 기존 세션을 모두 무효화한다.
        self.db.execute(delete(UserSession).where(UserSession.user_id == user.id))
        self.db.commit()

    def delete(self, user: User) -> None:
        self.db.delete(user)  # sessions 는 FK ON DELETE CASCADE
        self.db.commit()

    def touch_login(self, user: User, now: datetime) -> None:
        user.last_login_at = now
        self.db.commit()


class SessionRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, token_hash: str, user_id: int, expires_at: datetime) -> UserSession:
        s = UserSession(token_hash=token_hash, user_id=user_id, expires_at=expires_at)
        self.db.add(s)
        self.db.commit()
        return s

    def get_valid_user(self, token_hash: str, now: datetime) -> User | None:
        stmt = (
            select(User)
            .join(UserSession, UserSession.user_id == User.id)
            .where(UserSession.token_hash == token_hash, UserSession.expires_at > now)
        )
        return self.db.scalar(stmt)

    def delete_by_token_hash(self, token_hash: str) -> None:
        self.db.execute(delete(UserSession).where(UserSession.token_hash == token_hash))
        self.db.commit()

    def delete_expired(self, now: datetime) -> None:
        self.db.execute(delete(UserSession).where(UserSession.expires_at <= now))
        self.db.commit()
