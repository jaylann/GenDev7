from pydantic import Field, BaseModel


class RequestBody(BaseModel):
    """Hashable wrapper for the JSON payload."""
    strasse: str = Field(...)
    hausnummer: str = Field(...)
    postleitzahl: str = Field(...)
    stadt: str = Field(...)
    land: str = Field(...)

    class Config:
        frozen = True