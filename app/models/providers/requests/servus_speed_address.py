from pydantic import BaseModel, constr


class ServusSpeedAddress(BaseModel):
    strasse: constr(strip_whitespace=True, min_length=1)
    hausnummer: constr(strip_whitespace=True, min_length=1)
    postleitzahl: constr(strip_whitespace=True, min_length=1)
    stadt: constr(strip_whitespace=True, min_length=1)
    land: constr(strip_whitespace=True, min_length=1)
