# 오늘 뭐 먹지?

저장해 둔 식당 중에서 조건에 맞는 곳을 무작위로 추천해 주는 웹앱. 3티어(Vanilla JS + Vite / FastAPI / MariaDB), 직접 실행(Docker·systemd 미사용). 상세는 `docs/PRD.md`, 규칙은 `CLAUDE.md`.

```
frontend/  Vanilla JS + Vite (Vite)   backend/  FastAPI (uv)   db/  스키마·시드·초기화 SQL
```

## 빠른 실행

최초 설정(아래 1~3절의 `.env`, `uv sync`, `npm install`)을 마친 뒤에는 한 줄로 백엔드와 프론트엔드를 함께 띄운다.

```bash
./dev.sh        # 백엔드 :8000 + 프론트엔드 :5173 → http://localhost:5173, Ctrl+C 로 둘 다 종료
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

**기존 DB를 v0.5(M5)로 올리기** (추가형, 데이터 삭제 없음, 재실행 안전): `recommendation_skips` 테이블과 `restaurants.skip_dismissed_at` 컬럼을 추가한다.

```bash
sudo mariadb dinner_service < db/migrations/005_m5.sql   # 신규 설치는 schema.sql 에 이미 포함
```

**기존 DB를 v0.6(M6)으로 올리기** (추가형, 재실행 안전): `places` 테이블과 `restaurants.place_no` 컬럼/인덱스를 추가한다.

```bash
sudo mariadb dinner_service < db/migrations/006_places.sql   # 신규 설치는 schema.sql 에 이미 포함
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

### 공공데이터 식당 카탈로그 임포트 (선택, M6)

식당 추가 화면의 "공공데이터에서 찾기"는 공공데이터포털 「소상공인시장진흥공단_상가(상권)정보」 CSV를 `places` 테이블에 적재해 두어야 동작한다. 임포트하지 않아도 수동 입력은 정상 동작한다.

1. [공공데이터포털](https://www.data.go.kr)에서 「소상공인시장진흥공단_상가(상권)정보」 파일 데이터(CSV, 시도별)를 내려받는다. 이용허락 조건(공공누리 유형)과 출처 문구는 데이터셋 페이지에서 확인하고, 필요하면 `frontend/src/constants.js` 의 `DATA_SOURCE_NOTICE` 를 고친다.
2. `backend/data/` 에 둔다 (`.gitignore` 등록됨, 커밋 금지).
3. 임포트. 시도 전체는 수십만 건이므로 생활권(시군구·행정동) 단위 필터를 권장한다.

```bash
cd backend
uv run python -m app.scripts.import_places data/<파일>.csv --sido 서울특별시 --sigungu 강남구 [--dong 역삼1동] [--dry-run]
```

- 대분류 '음식'만 적재하고 술집·카페·제과류는 제외한다. UTF-8(BOM 포함)/CP949 자동 판별, 컬럼은 헤더 이름으로 찾는다(개편 전후 표기 허용). 상가업소번호 기준 upsert라 재실행해도 행이 늘지 않는다.
- 먼저 `--dry-run` 으로 요약을 보고, 출력되는 "매핑되지 않아 ETC로 적재된 중분류명"으로 `backend/app/scripts/place_mapping.py` 를 보정한 뒤 재실행한다.
- 검색 API: `GET /api/v1/places?q=역삼 김밥&category=SNACK&limit=20` (`q` 2자 이상, 공백 토큰 AND, `limit` 최대 50).

### 동네 식당 둘러보기 (M7)

`#/restaurants/explore`(식당 > 동네에서 찾기) 화면에서 임포트한 `places`를 시군구/동/카테고리/키워드로 둘러보고, 조건 내 무작위 추천을 받고, 바로 "가보고 싶음"으로 등록한다. 추가 마이그레이션은 없다.

- `GET /api/v1/places/regions?sigungu=` : 시군구(없으면)·동 목록과 건수
- `GET /api/v1/places/browse?sigungu&dong&category&q&offset&limit` : `items` + `total` (이름순, `limit` 최대 50)
- `GET /api/v1/places/random?sigungu&dong&category&q&exclude_registered=true` : 1건, 없으면 404

## 3. 프레젠테이션 계층 (Vanilla JS + Vite)

React 등 UI 프레임워크 없이 ES 모듈 + Vite만 사용한다. 백엔드 API로만 통신한다. 브라우저는 같은 origin의 `/api/v1`로 요청하고 Vite 서버가 `API_PROXY_TARGET`(기본 `http://127.0.0.1:8000`)으로 프록시한다. 그래서 브라우저에서는 5173 포트만 열려 있으면 된다(WSL·VS Code 포트 포워딩 환경 포함).

```bash
cd frontend
cp .env.example .env        # VITE_API_BASE_URL=/api/v1, API_PROXY_TARGET=http://127.0.0.1:8000
npm install
npm run dev                 # 개발 서버 :5173 (/api 는 백엔드로 프록시)
npm run build && npm run preview   # dist/ 빌드 후 :4173 에서 서빙 (CORS 에 해당 Origin 추가 필요)
```

해시 라우팅: `#/`(추천) `#/restaurants` `#/restaurants/new` `#/restaurants/:id` `#/restaurants/:id/edit` `#/visits` (기록 > 월간 회고는 `#/visits/stats`; 예전 `#/stats`는 여기로 리다이렉트) (식당 > 동네에서 찾기는 `#/restaurants/explore`, 필터는 `?sigungu=&dong=&category=&q=`; 예전 `#/explore`는 여기로 리다이렉트).
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
