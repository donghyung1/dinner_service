#!/usr/bin/env bash
# 서버 한 번에 실행. Ctrl+C 로 함께 종료한다.
#   ./dev.sh          개발: 백엔드(:8000) + 프론트엔드 dev(:5173)
#   ./dev.sh --ngrok  외부 공개: 백엔드(:8000) + 프론트 빌드 후 preview(:4173) + ngrok 터널
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

MODE=dev
case "${1:-}" in
  "") ;;
  --ngrok) MODE=ngrok ;;
  *) echo "사용법: $0 [--ngrok]" >&2; exit 2 ;;
esac

port_busy() { (echo >"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

if port_busy 8000; then
  echo "포트 8000이 이미 사용 중입니다. 다른 프로세스(예: flow-task)를 확인하세요." >&2
  exit 1
fi
if [[ $MODE == ngrok ]]; then
  command -v ngrok >/dev/null || { echo "ngrok 이 설치되어 있지 않습니다." >&2; exit 1; }
  port_busy 4173 && { echo "포트 4173이 이미 사용 중입니다." >&2; exit 1; }
  port_busy 4040 && { echo "ngrok 이 이미 실행 중입니다(포트 4040). 먼저 종료하세요." >&2; exit 1; }
  # 빌드 실패 시 서버를 띄우지 않는다.
  (cd "$ROOT/frontend" && npm run build)
fi

# 한쪽이 죽거나 Ctrl+C 를 누르면 같은 프로세스 그룹(모든 서버)을 함께 종료한다.
trap 'exit 130' INT TERM
trap 'trap "" TERM; kill 0 2>/dev/null' EXIT

if [[ $MODE == ngrok ]]; then
  # https 로 공개되므로 세션 쿠키에 Secure 를 붙인다(.env 값보다 환경변수가 우선).
  (cd "$ROOT/backend" && SESSION_COOKIE_SECURE=true uv run uvicorn app.main:app --port 8000) &
  (cd "$ROOT/frontend" && npm run preview) &
  ngrok http 4173 --log /dev/null >/dev/null &
else
  (cd "$ROOT/backend" && uv run uvicorn app.main:app --reload --port 8000) &
  (cd "$ROOT/frontend" && npm run dev) &
fi

for _ in $(seq 1 60); do
  port_busy 8000 && break
  sleep 0.5
done

if [[ $MODE == ngrok ]]; then
  URL=""
  for _ in $(seq 1 40); do
    URL="$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
      | python3 -c 'import json,sys; t=json.load(sys.stdin)["tunnels"]; print(next((x["public_url"] for x in t if x["public_url"].startswith("https")), ""))' 2>/dev/null || true)"
    [[ -n $URL ]] && break
    sleep 0.5
  done
  echo "▶ 로컬 http://localhost:4173"
  echo "▶ 공개 ${URL:-(ngrok 주소 확인 실패: http://127.0.0.1:4040 참고)}  (종료: Ctrl+C)"
else
  echo "▶ http://localhost:5173  (종료: Ctrl+C)"
fi
wait -n
