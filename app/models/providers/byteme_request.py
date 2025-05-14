from pydantic import BaseModel


class ByteMeRequest(BaseModel):
    street: str
    houseNumber: str
    city: str
    plz: str