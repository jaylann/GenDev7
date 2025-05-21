import pytest
from pydantic import ValidationError

from app.models import Address


def test_valid_address_trimming_and_normalization():
    data = {
        "street": "  Main Street  ",
        "house_number": " 123A ",
        "city": " Berlin ",
        "plz": " 10115 ",
        "country_code": " de ",
    }
    addr = Address(**data)
    # Whitespace should be stripped
    assert addr.street == "Main Street"
    assert addr.house_number == "123A"
    assert addr.city == "Berlin"
    assert addr.plz == "10115"
    # Country code normalized to uppercase
    assert addr.country_code == "DE"


@pytest.mark.parametrize(
    "field, value",
    [
        ("street", ""),
        ("street", "A" * 101),
        ("house_number", ""),
        ("house_number", "A" * 11),
        ("city", ""),
        ("city", "A" * 51),
        ("plz", "1234"),
        ("plz", "123456"),
        ("country_code", "US"),
    ],
)
def test_invalid_fields(field, value):
    valid = {"street": "Main Street", "house_number": "123A", "city": "Berlin", "plz": "10115", "country_code": "DE",
             field: value}
    with pytest.raises(ValidationError) as exc_info:
        Address(**valid)
    errors = exc_info.value.errors()
    # There should be at least one error for the invalid field
    assert any(error["loc"][0] == field for error in errors)


def test_strip_whitespace_non_str_types():
    # Numeric types passed to string fields should result in type errors
    data = {
        "street": 123,
        "house_number": 456,
        "city": 789,
        "plz": 10115,
        "country_code": None,
    }
    with pytest.raises(ValidationError) as exc_info:
        Address(**data)
    errors = exc_info.value.errors()
    # Expect at least one type error on non-str fields
    assert len(errors) >= 1


def test_country_code_normalization_and_literal():
    # Normalization should allow lowercase with whitespace
    addr = Address(
        street="Main", house_number="1", city="City", plz="12345", country_code=" dE "
    )
    assert addr.country_code == "DE"

    # Truly invalid country code should fail
    with pytest.raises(ValidationError) as exc_info:
        Address(
            street="Main", house_number="1", city="City", plz="12345", country_code="FR"
        )
    errors = exc_info.value.errors()
    assert any(error["loc"][0] == "country_code" for error in errors)
