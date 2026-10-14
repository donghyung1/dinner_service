#!/usr/bin/env bash
# 개발 서버 한 번에 실행: 백엔드(:8000) + 프론트엔드(:5173). Ctrl+C 로 둘 다 종료한다.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

if (echo >/dev/tcp/127.0.0.1/8000) 2>/dev/null; then
  echo "포트 8000이 이미 사용 중입니다. 다른 프로세스(예: flow-task)를 확인하세요." >&2
  exit 1
fi

# 한쪽이 죽거나 Ctrl+C 를 누르면 같은 프로세스 그룹(두 서버)을 함께 종료한다.
trap 'exit 130' INT TERM
trap 'trap "" TERM; kill 0 2>/dev/null' EXIT

(cd "$ROOT/backend" && uv run uvicorn app.main:app --reload --port 8000) &
(cd "$ROOT/frontend" && npm run dev) &

for _ in $(seq 1 60); do
  (echo >/dev/tcp/127.0.0.1/8000) 2>/dev/null && break
  sleep 0.5
done
echo "▶ http://localhost:5173  (종료: Ctrl+C)"
wait -n
