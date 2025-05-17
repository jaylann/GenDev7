from pydantic import BaseModel, constr


class ByteMeRequest(BaseModel):
    street: constr(strip_whitespace=True, min_length=1)
    houseNumber: constr(strip_whitespace=True, min_length=1)
    city: constr(strip_whitespace=True, min_length=1)
    plz: constr(strip_whitespace=True, min_length=1)
