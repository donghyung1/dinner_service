from typing import Annotated

from pydantic import Field

PriceLevelList = list[Annotated[int, Field(ge=1, le=4)]]
