from calendar import monthrange
from collections import Counter
from datetime import date, datetime, time

from app.core.errors import UnprocessableError
from app.models import Category, VisitSource
from app.repositories.skip_repo import SkipRepository
from app.repositories.stats_repo import StatsRepository
from app.schemas.stats import (
    CategoryCount,
    CategoryGapItem,
    CategoryGapOut,
    CategoryStreak,
    MonthlyStatsOut,
    RecommendationStat,
    TopRestaurant,
)

CATEGORY_GAP_MIN_DAYS = 7
_ORDER = {c: i for i, c in enumerate(Category)}


def _month_range(month: str | None, today: date) -> tuple[str, date, date]:
    if month is None:
        y, m = today.year, today.month
    else:
        try:
            y, m = int(month[:4]), int(month[5:7])
            if len(month) != 7 or month[4] != "-" or not 1 <= m <= 12:
                raise ValueError
        except ValueError:
            raise UnprocessableError("month는 YYYY-MM 형식이어야 합니다.") from None
    if (y, m) > (today.year, today.month):
        raise UnprocessableError("미래의 달은 조회할 수 없습니다.")
    start = date(y, m, 1)
    end = date(y + (m == 12), m % 12 + 1, 1)
    return f"{y:04d}-{m:02d}", start, end


class StatsService:
    def __init__(self, stats: StatsRepository, skips: SkipRepository):
        self.stats = stats
        self.skips = skips

    def category_gap(self) -> CategoryGapOut:
        today = date.today()
        items = [
            CategoryGapItem(
                category=c,
                restaurant_count=n,
                last_visited_on=last,
                days_since=(today - last).days if last else None,
            )
            for c, n, last in sorted(self.stats.category_summary(), key=lambda t: _ORDER[t[0]])
        ]
        gap = None
        if self.stats.total_visits() > 0:
            targets = [i for i in items if i.category != Category.ETC]
            never = [i for i in targets if i.days_since is None]
            if never:
                gap = never[0]
            elif targets:
                best = max(targets, key=lambda i: i.days_since)  # 동률이면 enum 순서상 앞
                if best.days_since >= CATEGORY_GAP_MIN_DAYS:
                    gap = best
        return CategoryGapOut(gap=gap, categories=items)

    def monthly(self, month: str | None) -> MonthlyStatsOut:
        key, start, end = _month_range(month, date.today())
        visits = self.stats.visits_between(start, end)  # (id, visited_on, source, rid, name, category)
        total = len(visits)
        skip_count = self.skips.count_between(datetime.combine(start, time.min), datetime.combine(end, time.min))

        by_cat = Counter(v[5] for v in visits)
        distribution = [
            CategoryCount(category=c, count=n, ratio=round(n / total, 3))
            for c, n in sorted(by_cat.items(), key=lambda t: (-t[1], _ORDER[t[0]]))
        ]

        per_rest: dict[int, list] = {}
        for _id, visited_on, _src, rid, name, _cat in visits:
            e = per_rest.setdefault(rid, [0, visited_on, name])
            e[0] += 1
            e[1] = max(e[1], visited_on)
        top = sorted(per_rest.items(), key=lambda t: (-t[1][0], -t[1][1].toordinal(), t[1][2]))[:3]

        streak = None
        run_start = 0
        for i in range(1, total + 1):
            if i == total or visits[i][5] != visits[run_start][5]:
                length = i - run_start
                if streak is None or length > streak.length:
                    streak = CategoryStreak(
                        category=visits[run_start][5],
                        length=length,
                        from_=visits[run_start][1],
                        to=visits[i - 1][1],
                    )
                run_start = i

        accepted = sum(1 for v in visits if v[2] == VisitSource.RECOMMENDATION)
        return MonthlyStatsOut(
            month=key,
            total_visits=total,
            category_distribution=distribution,
            top_restaurants=[TopRestaurant(restaurant_id=rid, name=e[2], count=e[0]) for rid, e in top],
            longest_category_streak=streak,
            recommendation=RecommendationStat(
                accepted_count=accepted, accept_ratio=round(accepted / total, 3) if total else None
            ),
            skip_count=skip_count,
        )
