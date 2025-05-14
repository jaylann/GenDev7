from typing import Literal

from pydantic import BaseModel, field_validator, Field


class Address(BaseModel):
    street: str = Field(
        ...,
        description="Street name",
        examples=["Main Street"],
        min_length=1,
        max_length=100,
    )
    house_number: str = Field(
        ...,
        description="House number",
        examples=["123A"],
        min_length=1,
        max_length=10,
    )
    city: str = Field(
        ...,
        description="City",
        examples=["Berlin"],
        min_length=1,
        max_length=50,
    )
    plz: str = Field(
        ...,
        pattern=r"^\d{5}$",
        description="Postal code",
        examples=["10115"],
        min_length=5,
        max_length=5,
    )
    country_code: Literal["DE"] = Field(..., description="Country code (ISO 3166-1 alpha-2)", examples=["DE"])

    @field_validator("*", mode="before")
    @classmethod
    def strip_whitespace(cls, v):
        if isinstance(v, str):
            return v.strip()
        return v


    @field_validator("country_code", mode="before")
    @classmethod
    def normalize_country_code(cls, v):
        if isinstance(v, str):
            return v.strip().upper()
        return v