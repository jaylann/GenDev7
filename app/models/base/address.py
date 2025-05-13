import re
from typing import Literal

from pydantic import BaseModel, field_validator, Field


class Address(BaseModel):
    street: str = Field(..., description="Street name", examples=["Main Street"])
    house_number: str = Field(..., description="House number", examples=["123A"])
    city: str = Field(..., description="City", examples=["Berlin"])
    plz: str = Field(..., pattern=r"^\d{5}$", description="Postal code", examples=["10115"])
    country_code: Literal["DE"] = Field(..., description="Country code (ISO 3166-1 alpha-2)", examples=["DE"])

    @field_validator("street", mode="before")
    @classmethod
    def strip_street(cls, v):
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("plz")
    @classmethod
    def validate_plz(cls, v):
        if not re.fullmatch(r"^\d{5}$", v):
            raise ValueError("plz must be exactly five digits")
        return v
