"""로그인 계정 관리 CLI (PRD 5.14). 공개 회원가입이 없으므로 계정은 여기서만 만든다.

    cd backend
    uv run python -m app.scripts.manage_users create <username>        # 비밀번호는 프롬프트(getpass)로 입력
    uv run python -m app.scripts.manage_users passwd <username>        # 비밀번호 변경(기존 세션 모두 무효화)
    uv run python -m app.scripts.manage_users delete <username> [--yes]
    uv run python -m app.scripts.manage_users list

create/passwd 에 --password-stdin 을 주면 표준입력 첫 줄을 비밀번호로 쓴다(스크립트·점검용).
"""

import argparse
import getpass
import sys

from app.db.session import SessionLocal
from app.repositories.user_repo import SessionRepository, UserRepository
from app.services.auth_service import AuthService

MIN_PASSWORD_LEN = 8
MAX_USERNAME_LEN = 50


def read_password(args: argparse.Namespace) -> str | None:
    if args.password_stdin:
        pw = sys.stdin.readline().rstrip("\r\n")
    else:
        pw = getpass.getpass("비밀번호: ")
        if pw != getpass.getpass("비밀번호 확인: "):
            print("오류: 비밀번호가 일치하지 않습니다.", file=sys.stderr)
            return None
    if len(pw) < MIN_PASSWORD_LEN:
        print(f"오류: 비밀번호는 {MIN_PASSWORD_LEN}자 이상이어야 합니다.", file=sys.stderr)
        return None
    return pw


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="app.scripts.manage_users", description="로그인 계정 관리")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name, help_ in (("create", "계정 생성"), ("passwd", "비밀번호 변경")):
        sp = sub.add_parser(name, help=help_)
        sp.add_argument("username")
        sp.add_argument("--password-stdin", action="store_true", help="표준입력 첫 줄을 비밀번호로 사용")
    sp = sub.add_parser("delete", help="계정 삭제(세션 포함)")
    sp.add_argument("username")
    sp.add_argument("--yes", action="store_true", help="확인 질문 생략")
    sub.add_parser("list", help="계정 목록")
    return p.parse_args(argv)


def run(args: argparse.Namespace) -> int:
    with SessionLocal() as db:
        users = UserRepository(db)
        svc = AuthService(users, SessionRepository(db))

        if args.cmd == "list":
            rows = users.list_all()
            if not rows:
                print("계정이 없습니다.")
            for u in rows:
                last = u.last_login_at.strftime("%Y-%m-%d %H:%M") if u.last_login_at else "-"
                print(f"{u.id}\t{u.username}\t생성 {u.created_at:%Y-%m-%d}\t마지막 로그인 {last}")
            return 0

        username = args.username.strip()
        if args.cmd == "create":
            if not username or len(username) > MAX_USERNAME_LEN:
                print(f"오류: 아이디는 1~{MAX_USERNAME_LEN}자여야 합니다.", file=sys.stderr)
                return 1
            if users.get_by_username(username):
                print(f"오류: 이미 있는 아이디입니다: {username}", file=sys.stderr)
                return 1
            pw = read_password(args)
            if pw is None:
                return 1
            if svc.create_user(username, pw) is None:
                print(f"오류: 이미 있는 아이디입니다: {username}", file=sys.stderr)
                return 1
            print(f"계정을 만들었습니다: {username}")
            return 0

        user = users.get_by_username(username)
        if user is None:
            print(f"오류: 없는 아이디입니다: {username}", file=sys.stderr)
            return 1
        if args.cmd == "passwd":
            pw = read_password(args)
            if pw is None:
                return 1
            svc.change_password(user, pw)
            print(f"비밀번호를 변경했습니다(기존 로그인 세션은 모두 종료): {username}")
            return 0
        if args.cmd == "delete":
            if not args.yes and input(f"'{username}' 계정을 삭제할까요? [y/N] ").strip().lower() != "y":
                print("취소했습니다.")
                return 1
            users.delete(user)
            print(f"계정을 삭제했습니다: {username}")
            return 0
    return 1


def main(argv: list[str] | None = None) -> int:
    return run(parse_args(argv))


if __name__ == "__main__":
    sys.exit(main())
