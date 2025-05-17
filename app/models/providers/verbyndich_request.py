from pydantic import BaseModel, constr


class VerbynDichRequest(BaseModel):
    street: constr(strip_whitespace=True, min_length=1)
    house_number: constr(strip_whitespace=True, min_length=1)
    city: constr(strip_whitespace=True, min_length=1)
    plz: constr(strip_whitespace=True, min_length=1)

    def to_body(self) -> str:
        return f"{self.street};{self.house_number};{self.city};{self.plz}"
