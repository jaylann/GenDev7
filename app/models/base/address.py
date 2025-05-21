from typing import Literal

import re
from pydantic import BaseModel, field_validator, Field, constr


class Address(BaseModel):
    street: constr(strip_whitespace=True, min_length=1, max_length=100) = Field(
        ...,
        description="Street name",
        examples=["Main Street"],
    )
    house_number: constr(strip_whitespace=True, min_length=1, max_length=10) = Field(
        ...,
        description="House number",
        examples=["123A"],
    )
    city: constr(strip_whitespace=True, min_length=1, max_length=50) = Field(
        ...,
        description="City",
        examples=["Berlin"],
    )
    plz: constr(strip_whitespace=True, min_length=5, max_length=5) = Field(
        ...,
        description="Postal code",
        examples=["10115"],
    )
    country_code: Literal["DE"] = Field(
        ..., description="Country code (ISO 3166-1 alpha-2)", examples=["DE"]
    )

    class Config:
        frozen = True


    @field_validator("country_code", mode="before")
    @classmethod
    def normalize_country_code(cls, v):
        if isinstance(v, str):
            return v.strip().upper()
        return v

    @field_validator("plz")
    @classmethod
    def validate_plz(cls, v):
        if not re.match(r"^\d{5}$", v):
            raise ValueError("Postal code must consist of exactly 5 digits")
        return v
