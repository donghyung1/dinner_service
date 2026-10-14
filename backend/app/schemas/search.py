from typing import Annotated, Literal

from pydantic import Field

from app.schemas.place import PlaceOut
from app.schemas.restaurant import RestaurantOut
from pydantic import BaseModel


class MineItem(RestaurantOut):
    kind: Literal["mine"] = "mine"


class PlaceItem(PlaceOut):
    kind: Literal["place"] = "place"


SearchItem = Annotated[MineItem | PlaceItem, Field(discriminator="kind")]


class RestaurantSearchOut(BaseModel):
    items: list[SearchItem]
    total: int
    mine_total: int
    place_total: int
    limit: int
    offset: int
