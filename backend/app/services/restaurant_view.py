"""식당 파생 필드 계산 (is_expiring, skip_suggestion 등). 상수는 환경변수로 노출하지 않는다."""

from datetime import datetime, timedelta

from app.models import RestaurantStatus
from app.repositories.restaurant_repo import RestaurantRow

WISHLIST_EXPIRY_DAYS = 30
SKIP_SUGGEST_THRESHOLD = 5


def expiring_cutoff(now: datetime | None = None) -> datetime:
    """created_at이 이 시각 이하이면 유통기한 경과."""
    return (now or datetime.now()) - timedelta(days=WISHLIST_EXPIRY_DAYS)


def derived_fields(row: RestaurantRow, cutoff: datetime) -> dict:
    r = row.restaurant
    return {
        "last_visited_on": row.last_visited_on,
        "is_expiring": (
            r.status == RestaurantStatus.WISHLIST and row.visit_count == 0 and r.created_at <= cutoff
        ),
        "consecutive_skips": row.consecutive_skips,
        "skip_suggestion": row.suggestion_skips >= SKIP_SUGGEST_THRESHOLD,
    }
