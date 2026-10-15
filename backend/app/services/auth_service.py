from datetime import datetime, timedelta

from app.core.config import get_settings
from app.core.errors import ConflictError, ForbiddenError, UnauthorizedError
from app.core.security import burn_password_check, hash_password, hash_token, new_session_token, verify_password
from app.models import User
from app.repositories.user_repo import SessionRepository, UserRepository

LOGIN_FAILED = "아이디 또는 비밀번호가 올바르지 않습니다."


class AuthService:
    def __init__(self, users: UserRepository, sessions: SessionRepository):
        self.users = users
        self.sessions = sessions

    def signup(self, username: str, password: str) -> tuple[User, str, int]:
        """계정을 만들고 바로 로그인 세션을 발급한다. 반환은 login 과 같다."""
        if not get_settings().ALLOW_SIGNUP:
            raise ForbiddenError("지금은 회원가입을 받지 않아요.")
        user = self.create_user(username, password)
        if user is None:
            raise ConflictError("이미 사용 중인 아이디예요.")
        return user, *self._start_session(user)

    def login(self, username: str, password: str) -> tuple[User, str, int]:
        """성공하면 (user, 세션 토큰 원문, 유효 초). 실패 사유는 구분하지 않는다."""
        user = self.users.get_by_username(username)
        if user is None:
            burn_password_check(password)
            raise UnauthorizedError(LOGIN_FAILED)
        if not verify_password(password, user.password_hash):
            raise UnauthorizedError(LOGIN_FAILED)
        return user, *self._start_session(user)

    def _start_session(self, user: User) -> tuple[str, int]:
        now = datetime.now()
        self.sessions.delete_expired(now)  # 만료 세션은 로그인 때 기회적으로 정리한다
        ttl = timedelta(days=get_settings().SESSION_TTL_DAYS)
        token = new_session_token()
        self.sessions.create(hash_token(token), user.id, now + ttl)
        self.users.touch_login(user, now)
        return token, int(ttl.total_seconds())

    def logout(self, token: str | None) -> None:
        if token:
            self.sessions.delete_by_token_hash(hash_token(token))

    def user_for_token(self, token: str | None) -> User | None:
        if not token:
            return None
        return self.sessions.get_valid_user(hash_token(token), datetime.now())

    # CLI 용
    def create_user(self, username: str, password: str) -> User | None:
        return self.users.create(username, hash_password(password))

    def change_password(self, user: User, password: str) -> None:
        self.users.set_password_hash(user, hash_password(password))
