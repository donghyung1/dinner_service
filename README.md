# 오늘 뭐 먹지?

저장해 둔 식당 중에서 조건에 맞는 곳을 무작위로 추천해 주는 웹앱. 3티어(Vanilla JS + Vite / FastAPI / MariaDB), 직접 실행(Docker·systemd 미사용). 상세는 `docs/PRD.md`, 규칙은 `CLAUDE.md`.

```
frontend/  Vanilla JS + Vite (Vite)   backend/  FastAPI (uv)   db/  스키마·시드·초기화 SQL
```

## 1. 데이터 계층 (MariaDB 10.6+)

```bash
sudo apt install mariadb-server && sudo systemctl enable --now mariadb   # 127.0.0.1:3306

# DB와 최소 권한 계정(dinner_app@localhost / 127.0.0.1) 생성. 비밀번호는 직접 생성해 주입
PW=$(python3 -c "import secrets;print(secrets.token_urlsafe(24))")
(echo "SET @pw='$PW';"; cat db/init_db.sql) | sudo mariadb

sudo mariadb dinner_service < db/schema.sql     # 재실행 안전 (IF NOT EXISTS)
sudo mariadb dinner_service < db/seed.sql       # 샘플 데이터 (테이블이 비어 있을 때만 삽입)
echo "$PW"   # backend/.env 의 DB_PASSWORD 에 기입
```

`dinner_app` 은 `dinner_service.*` 에 대한 SELECT/INSERT/UPDATE/DELETE 권한만 가진다. 스키마 변경(DDL)은 root로 적용한다.

## 2. 애플리케이션 계층 (FastAPI, uv)

```bash
cd backend
cp .env.example .env        # DB_PASSWORD 등 수정 (.env 는 커밋 금지)
uv sync
uv run uvicorn app.main:app --reload --port 8000          # 개발
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000    # 실행
curl http://localhost:8000/api/v1/health                  # {"status":"ok","app":"ok","db":"ok"}
```

의존성은 `uv add <pkg>` 로만 관리한다 (pip, requirements.txt 사용 금지).
API 문서: `http://localhost:8000/docs` (APP_ENV=dev 일 때).

## 3. 프레젠테이션 계층 (Vanilla JS + Vite)

React 등 UI 프레임워크 없이 ES 모듈 + Vite만 사용한다. 백엔드 API로만 통신한다. 브라우저는 같은 origin의 `/api/v1`로 요청하고 Vite 서버가 `API_PROXY_TARGET`(기본 `http://127.0.0.1:8000`)으로 프록시한다. 그래서 브라우저에서는 5173 포트만 열려 있으면 된다(WSL·VS Code 포트 포워딩 환경 포함).

```bash
cd frontend
cp .env.example .env        # VITE_API_BASE_URL=/api/v1, API_PROXY_TARGET=http://127.0.0.1:8000
npm install
npm run dev                 # 개발 서버 :5173 (/api 는 백엔드로 프록시)
npm run build && npm run preview   # dist/ 빌드 후 :4173 에서 서빙 (CORS 에 해당 Origin 추가 필요)
```

해시 라우팅: `#/`(추천) `#/restaurants` `#/restaurants/new` `#/restaurants/:id` `#/restaurants/:id/edit` `#/visits`.
구조: `src/{main.js, router.js, api/client.js, views/, components/, styles/}`.

## 환경변수

| 위치 | 변수 |
|------|------|
| backend/.env | `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` `CORS_ALLOW_ORIGINS` `APP_ENV` `APP_PORT` |
| frontend/.env | `VITE_API_BASE_URL` `API_PROXY_TARGET` |

## API 요약 (M2)

Base: `/api/v1`. 오류 형식: `{"error": {"code", "message"}}` (422는 `details` 포함).

- `GET/POST /restaurants`, `GET/PUT/DELETE /restaurants/{id}`, `PATCH /restaurants/{id}/favorite`
  - 목록 query: `q`, `category`(반복), `price_level`(반복), `status`, `is_favorite`, `sort`(`created_desc|name|last_visited_desc`), `limit`, `offset`
- `POST/GET /visits`, `DELETE /visits/{id}` (GET query: `restaurant_id`, `from`, `to`, `limit`, `offset`)
  - 방문 응답(`VisitOut`)에는 `restaurant_name`이 포함된다(별도 식당 조회 불필요).
- `GET /recommendations/random` (`category`, `price_level`, `status`, `is_favorite`, `exclude_recent_days`=7, `exclude_id`). 후보 없음 시 404 `NO_CANDIDATES`
