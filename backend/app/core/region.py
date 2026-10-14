"""행정동 -> 동 그룹 묶음 규칙(PRD 5.13). 위치 선택과 추천 지역 필터가 이 한 곳의 규칙을 쓴다."""

import re


def dong_group(dong: str) -> str:
    """'역삼1동' -> '역삼동', '성수1가2동' -> '성수동', '종로1·2·3·4가동' -> '종로동'.
    어간이 2자 미만이면(예: '가동') 묶지 않고 원래 이름을 그대로 돌려준다."""
    s = re.sub(r"[\d.·]+가", "", dong)
    s = re.sub(r"[\d.·]+", "", s)
    if s and s[-1] in "동가":
        s = s[:-1]
    return f"{s}동" if len(s) >= 2 else dong


def dong_stem(group: str) -> str:
    """동 그룹의 어간('역삼동' -> '역삼'). places 에서 후보 행정동을 LIKE 로 좁힐 때 쓴다."""
    return group[:-1] if group.endswith("동") and len(group) > 2 else group
