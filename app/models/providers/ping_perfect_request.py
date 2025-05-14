from pydantic import BaseModel, Field


class PingPerfectRequest(BaseModel):
    """
    Typed model for the Ping Perfect API request payload.
    """

    street: str
    houseNumber: str = Field()
    plz: str
    city: str
    wantsFiber: bool = Field(default=False)

    # allow initialization with either snake_case or the JSON-style alias
    class Config:
        populate_by_name = True