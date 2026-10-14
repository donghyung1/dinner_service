"""공공데이터 상가(상권)정보 -> 앱 카테고리 매핑 (PRD 5.11.2). 매핑 보정은 이 파일만 고친다.

분류 코드가 아닌 분류명 문자열의 부분 일치로 판정한다(개편 전후 표기 차이 흡수).
판정 순서: 중분류(제외 -> 카테고리) -> 소분류(제외 -> 카테고리) -> 기본값 ETC.
"""

from app.models import Category

# 대분류명이 이 값으로 시작하는 행만 적재한다.
FOOD_LARGE_PREFIXES = ("음식",)

# 적재 제외(술집·카페·제과류) 키워드. 부분 일치.
EXCLUDE_KEYWORDS = (
    "유흥", "주점", "호프", "맥주", "소주", "칵테일", "와인", "포차", "요리주점",
    "커피", "카페", "음료", "비알코올", "제과", "제빵", "케익", "케이크",
    "아이스크림", "빙수", "디저트", "베이커리", "도넛", "주스", "차류", "찻집", "다방",
)
# "바"는 부분 일치하면 오탐이 많아 분류명 전체가 일치할 때만 제외한다.
EXCLUDE_EXACT = ("바", "bar")

# (키워드, 카테고리) - 위에서부터 먼저 맞는 규칙이 이긴다.
CATEGORY_RULES: tuple[tuple[str, Category], ...] = (
    ("분식", Category.SNACK),
    ("한식", Category.KOREAN),
    ("중식", Category.CHINESE),
    ("중국", Category.CHINESE),
    ("일식", Category.JAPANESE),
    ("일본", Category.JAPANESE),
    ("횟집", Category.JAPANESE),
    ("서양식", Category.WESTERN),
    ("양식", Category.WESTERN),
    ("닭", Category.KOREAN),      # 닭/오리요리
    ("오리", Category.KOREAN),
    ("치킨", Category.KOREAN),
    ("패스트푸드", Category.WESTERN),
    ("햄버거", Category.WESTERN),
    ("피자", Category.WESTERN),
)
DEFAULT_CATEGORY = Category.ETC


def _norm(s: str | None) -> str:
    return (s or "").replace(" ", "").lower()


def _excluded(s: str) -> bool:
    return s in EXCLUDE_EXACT or any(k in s for k in EXCLUDE_KEYWORDS)


def _match(s: str) -> Category | None:
    for kw, cat in CATEGORY_RULES:
        if kw in s:
            return cat
    return None


def map_category(mid: str | None, small: str | None) -> tuple[Category | None, bool]:
    """(카테고리, 매핑됨 여부). 카테고리가 None이면 적재 제외. 매핑 안 되면 (ETC, False)."""
    m, s = _norm(mid), _norm(small)
    if m and _excluded(m):
        return None, True
    if m and (cat := _match(m)):
        return cat, True
    if s and _excluded(s):
        return None, True
    if s and (cat := _match(s)):
        return cat, True
    return DEFAULT_CATEGORY, False
