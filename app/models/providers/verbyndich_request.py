from pydantic import BaseModel


class VerbynDichRequest(BaseModel):
    street: str
    house_number: str
    city: str
    plz: str

    def to_body(self) -> str:
        return f"{self.street};{self.house_number};{self.city};{self.plz}"
