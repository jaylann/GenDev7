from pydantic import BaseModel


class ServusSpeedAddress(BaseModel):
    strasse: str
    hausnummer: str
    postleitzahl: str
    stadt: str
    land: str
