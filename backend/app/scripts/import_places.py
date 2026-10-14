"""공공데이터 「소상공인시장진흥공단_상가(상권)정보」 CSV -> places 테이블 임포트 (PRD 5.11.3).

    cd backend
    uv run python -m app.scripts.import_places <csv> [--sido 서울특별시] [--sigungu 강남구] [--dong 역삼1동] [--dry-run]
"""

import argparse
import codecs
import csv
import sys
import time
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path

from app.scripts.place_mapping import FOOD_LARGE_PREFIXES, map_category

BATCH_SIZE = 1000

# 내부 키 -> 허용 헤더명(공백 제거 후 비교). 개편 전/후 표기를 모두 받는다.
HEADER_ALIASES: dict[str, tuple[str, ...]] = {
    "place_no": ("상가업소번호",),
    "name": ("상호명", "사업장명"),
    "branch": ("지점명",),
    "large": ("상권업종대분류명", "상권업종대분류", "업종대분류명"),
    "mid": ("상권업종중분류명", "상권업종중분류", "업종중분류명"),
    "small": ("상권업종소분류명", "상권업종소분류", "업종소분류명"),
    "sido": ("시도명", "시도"),
    "sigungu": ("시군구명", "시군구"),
    "dong_admin": ("행정동명", "행정동"),
    "dong_legal": ("법정동명", "법정동"),
    "road": ("도로명주소", "도로명"),
    "jibun": ("지번주소", "지번"),
    "lon": ("경도", "x좌표"),
    "lat": ("위도", "y좌표"),
}
REQUIRED = ("place_no", "name", "large", "mid", "sido", "sigungu")
LABELS = {
    "place_no": "상가업소번호", "name": "상호명", "large": "상권업종대분류명",
    "mid": "상권업종중분류명", "sido": "시도명", "sigungu": "시군구명",
}


def _hnorm(h: str) -> str:
    return h.replace("﻿", "").replace(" ", "").strip().lower()


def detect_encoding(path: Path) -> str:
    """utf-8-sig로 끝까지 디코딩해 보고 실패하면 cp949. 파일 전체를 메모리에 올리지 않는다."""
    dec = codecs.getincrementaldecoder("utf-8-sig")()
    try:
        with path.open("rb") as f:
            while chunk := f.read(8 << 20):
                dec.decode(chunk)
            dec.decode(b"", final=True)
        return "utf-8-sig"
    except UnicodeDecodeError:
        return "cp949"


def resolve_columns(header: list[str]) -> tuple[dict[str, int], list[str]]:
    """헤더 -> {내부키: 열 인덱스}, 누락된 필수 컬럼 이름 목록."""
    index: dict[str, int] = {}
    for i, h in enumerate(header):
        index.setdefault(_hnorm(h), i)
    cols: dict[str, int] = {}
    for key, aliases in HEADER_ALIASES.items():
        for a in aliases:
            if _hnorm(a) in index:
                cols[key] = index[_hnorm(a)]
                break
    missing = [LABELS[k] for k in REQUIRED if k not in cols]
    return cols, missing


def _cut(v: str | None, n: int) -> str | None:
    v = (v or "").strip()
    return v[:n] if v else None


def _coord(v: str | None, lo: float, hi: float) -> Decimal | None:
    v = (v or "").strip()
    if not v:
        return None
    try:
        d = Decimal(v)
    except InvalidOperation:
        return None
    if not d.is_finite() or not (lo <= float(d) <= hi):
        return None
    return d.quantize(Decimal("0.0000001"))


def _prefix_ok(value: str, wanted: str | None) -> bool:
    return not wanted or value.startswith(wanted)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="app.scripts.import_places", description="상가(상권)정보 CSV를 places에 적재")
    p.add_argument("csv", type=Path, help="CSV 파일 경로")
    p.add_argument("--sido", help="시도명 (완전/접두 일치)")
    p.add_argument("--sigungu", help="시군구명 (완전/접두 일치)")
    p.add_argument("--dong", help="행정동명 (완전/접두 일치)")
    p.add_argument("--dry-run", action="store_true", help="DB에 쓰지 않고 요약만 출력")
    return p.parse_args(argv)


def _flush(conn, batch: dict[str, dict], stats: Counter) -> None:
    """batch(place_no -> row)를 upsert. 신규/갱신은 적재 전 존재 여부 조회로 센다."""
    from sqlalchemy import func, select
    from sqlalchemy.dialects.mysql import insert

    from app.models import Place

    if not batch:
        return
    rows = list(batch.values())
    existing = set(conn.scalars(select(Place.place_no).where(Place.place_no.in_(list(batch)))))
    stmt = insert(Place)
    update_cols = {c: stmt.inserted[c] for c in rows[0] if c != "place_no"}
    update_cols["imported_at"] = func.now()
    conn.execute(stmt.on_duplicate_key_update(**update_cols), rows)
    stats["updated"] += len(existing)
    stats["inserted"] += len(batch) - len(existing)
    batch.clear()


def run(args: argparse.Namespace) -> int:
    path: Path = args.csv
    if not path.is_file():
        print(f"오류: 파일을 찾을 수 없습니다: {path}", file=sys.stderr)
        return 1
    started = time.monotonic()
    enc = detect_encoding(path)
    print(f"파일: {path}  인코딩: {enc}")

    stats: Counter = Counter()
    etc_unmapped: Counter = Counter()
    excluded_mid: Counter = Counter()
    by_category: Counter = Counter()

    with path.open("r", encoding=enc, newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            print("오류: 빈 파일입니다.", file=sys.stderr)
            return 1
        cols, missing = resolve_columns(header)
        if missing:
            print(f"오류: 필수 컬럼이 없습니다: {', '.join(missing)}", file=sys.stderr)
            print(f"파일의 헤더({len(header)}개): {[h.replace(chr(0xfeff), '') for h in header]}", file=sys.stderr)
            return 1
        dong_key = "dong_admin" if "dong_admin" in cols else ("dong_legal" if "dong_legal" in cols else None)
        if args.dong and dong_key is None:
            print("오류: --dong 을 쓰려면 행정동명(또는 법정동명) 컬럼이 필요합니다.", file=sys.stderr)
            return 1
        optional_missing = [k for k in ("branch", "small", "road", "jibun", "lon", "lat") if k not in cols]
        if dong_key is None:
            optional_missing.append("dong")
        if optional_missing:
            print(f"참고: 없는 선택 컬럼(NULL 처리): {', '.join(optional_missing)}")

        def get(row: list[str], key: str) -> str:
            i = cols.get(key)
            return row[i].strip() if i is not None and i < len(row) else ""

        conn = None
        batch: dict[str, dict] = {}
        if not args.dry_run:
            from app.db.session import engine

            conn = engine.connect()
        try:
            for row in reader:
                if not any(c.strip() for c in row):
                    continue
                stats["read"] += 1
                if not get(row, "large").startswith(FOOD_LARGE_PREFIXES):
                    stats["not_food"] += 1
                    continue
                sido, sigungu = get(row, "sido"), get(row, "sigungu")
                dong = get(row, dong_key) if dong_key else ""
                if not (
                    _prefix_ok(sido, args.sido) and _prefix_ok(sigungu, args.sigungu) and _prefix_ok(dong, args.dong)
                ):
                    stats["region_filtered"] += 1
                    continue
                place_no, name = get(row, "place_no"), get(row, "name")
                if not place_no or not name or len(place_no) > 30:
                    stats["invalid"] += 1
                    continue
                mid, small = get(row, "mid"), get(row, "small")
                category, mapped = map_category(mid, small)
                if category is None:
                    stats["excluded_category"] += 1
                    excluded_mid[mid or "(빈 값)"] += 1
                    continue
                if not mapped:
                    stats["etc_unmapped"] += 1
                    etc_unmapped[mid or "(빈 값)"] += 1
                if place_no in batch:
                    stats["dup_in_file"] += 1
                by_category[category.value] += 1
                stats["loadable"] += 1
                batch[place_no] = {
                    "place_no": place_no,
                    "name": name[:100],
                    "branch_name": _cut(get(row, "branch"), 100),
                    "industry_mid": (mid or "(없음)")[:50],
                    "industry_small": _cut(small, 80),
                    "category": category.value,
                    "sido": sido[:30],
                    "sigungu": sigungu[:30],
                    "dong": _cut(dong, 30),
                    "road_address": _cut(get(row, "road"), 255),
                    "jibun_address": _cut(get(row, "jibun"), 255),
                    "lon": _coord(get(row, "lon"), 124.0, 132.0),
                    "lat": _coord(get(row, "lat"), 33.0, 39.0),
                }
                if len(batch) >= BATCH_SIZE:
                    if conn is not None:
                        _flush(conn, batch, stats)
                        conn.commit()
                    else:
                        batch.clear()
                    print(f"  ... 읽음 {stats['read']:,} / 적재 대상 {stats['loadable']:,}", end="\r", flush=True)
            if conn is not None:
                _flush(conn, batch, stats)
                conn.commit()
            else:
                batch.clear()
        except Exception:
            if conn is not None:
                conn.rollback()
            raise
        finally:
            if conn is not None:
                conn.close()

    mode = "[DRY-RUN: DB에 쓰지 않음] " if args.dry_run else ""
    print(f"\n{mode}임포트 요약 ({time.monotonic() - started:.1f}초)")
    print(f"  읽은 행:                {stats['read']:>10,}")
    print(f"  음식 업종 아님:         {stats['not_food']:>10,}")
    print(f"  지역 필터 제외:         {stats['region_filtered']:>10,}")
    print(f"  상호/업소번호 오류:     {stats['invalid']:>10,}")
    print(f"  매핑 제외(술집·카페 등): {stats['excluded_category']:>9,}")
    print(f"  적재 대상:              {stats['loadable']:>10,}  (파일 내 중복 {stats['dup_in_file']:,}건 포함)")
    print(f"    ETC(매핑 불가):       {stats['etc_unmapped']:>10,}")
    if not args.dry_run:
        print(f"  신규 추가:              {stats['inserted']:>10,}")
        print(f"  갱신:                   {stats['updated']:>10,}")
    if by_category:
        print("  카테고리별: " + ", ".join(f"{k} {v:,}" for k, v in sorted(by_category.items())))
    if excluded_mid:
        print("제외된 중분류명: " + ", ".join(f"{k}({v:,})" for k, v in excluded_mid.most_common()))
    if etc_unmapped:
        print("매핑되지 않아 ETC로 적재된 중분류명(매핑 보정용 app/scripts/place_mapping.py):")
        for k, v in etc_unmapped.most_common():
            print(f"  - {k}: {v:,}")
    return 0


def main(argv: list[str] | None = None) -> int:
    return run(parse_args(argv))


if __name__ == "__main__":
    sys.exit(main())
