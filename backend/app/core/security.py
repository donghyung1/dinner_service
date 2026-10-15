"""비밀번호 해시와 세션 토큰.

비밀번호는 표준 라이브러리 hashlib.scrypt 를 쓴다(메모리 하드 KDF, 외부 의존성 없음).
저장 형식은 자기 서술형 'scrypt$N$r$p$salt_b64$hash_b64' 라서 이후 비용 인자를 올려도 기존 해시를 검증할 수 있다.
"""

import base64
import hashlib
import hmac
import secrets

_N, _R, _P = 2**15, 8, 1
_DKLEN = 32
_MAXMEM = 64 * 1024 * 1024
# 없는 사용자도 같은 비용의 검증을 수행해 응답 시간으로 계정 존재 여부가 드러나지 않게 한다.
_DUMMY_SALT = b"\x00" * 16


def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int, dklen: int) -> bytes:
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=dklen, maxmem=_MAXMEM)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = _scrypt(password, salt, _N, _R, _P, _DKLEN)
    return f"scrypt${_N}${_R}${_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = base64.b64decode(hash_b64)
        actual = _scrypt(password, base64.b64decode(salt_b64), int(n), int(r), int(p), len(expected))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def burn_password_check(password: str) -> None:
    """존재하지 않는 사용자 로그인 시 타이밍 차이를 줄이기 위한 더미 검증."""
    _scrypt(password, _DUMMY_SALT, _N, _R, _P, _DKLEN)


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
