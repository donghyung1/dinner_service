from enum import StrEnum


class Category(StrEnum):
    KOREAN = "KOREAN"
    CHINESE = "CHINESE"
    JAPANESE = "JAPANESE"
    WESTERN = "WESTERN"
    SNACK = "SNACK"
    ETC = "ETC"


class RestaurantStatus(StrEnum):
    REGULAR = "REGULAR"
    WISHLIST = "WISHLIST"


class VisitSource(StrEnum):
    RECOMMENDATION = "RECOMMENDATION"
    MANUAL = "MANUAL"


class RestaurantSort(StrEnum):
    CREATED_DESC = "created_desc"
    NAME = "name"
    LAST_VISITED_DESC = "last_visited_desc"
