from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from typing import Dict, Tuple, Optional

import pgeocode  # type: ignore

from app.models.base.address import Address
from app.utils.logger import logger

# German postal code ranges for fallback when pgeocode lookup fails
POSTAL_CODE_REGIONS = {
    "Berlin": (10115, 14199),
    "München": (80331, 81929),
    "Hamburg": (20095, 22769),
    "Köln": (50667, 51149),
    "Frankfurt": (60306, 60599),
    "Stuttgart": (70173, 70619),
    "Düsseldorf": (40210, 40629),
    "Leipzig": (4003, 4357),  # covers 04003–04357
    "Dresden": (1067, 1328),  # covers 01067–01328
    "Hannover": (30159, 30659),
    "Nürnberg": (90402, 90491),
    "Bremen": (28195, 28779),
    "Essen": (45127, 45359),
    "Dortmund": (44135, 44388),
}


def _ascii_low(s: str) -> str:
    """Return a lower-cased ASCII-only version of *s* (useful for comparisons)."""
    return (
        unicodedata.normalize("NFKD", s or "")
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
        .strip()
    )


# Attempt offline initialization; fallback gracefully
try:
    _nom: Optional[pgeocode.Nominatim] = pgeocode.Nominatim("de")
except Exception as exc:  # pragma: no cover
    logger.warning(f"pgeocode initialization failed, using fallback only: {exc}")
    _nom = None


@lru_cache(maxsize=10_000)
def _lookup_postal_code(plz: str) -> Optional[pgeocode.pandas.Series]:
    """Return the postal-code record for *plz* or None if unavailable."""
    if not re.fullmatch(r"\d{5}", plz):
        return None
    if _nom is None:
        return None
    try:
        record = _nom.query_postal_code(plz)
        return record if record.place_name == record.place_name else None
    except Exception as excep:
        logger.warning(f"Postal-code lookup error: {excep}")
        return None


class AddressValidator:
    """Enhanced address validation for German addresses."""

    # House number patterns: 12, 12a, 12-14, 12/1
    _HOUSE_RE = re.compile(r"^\d+[a-zA-Z]?(?:[/-]\d+[a-zA-Z]?)?$")

    @staticmethod
    def validate_postal_code_city_match(address: Address) -> Tuple[bool, str]:
        """
        Validate that address.plz exists and matches address.city.
        Falls back to the region map if the offline database is unavailable.
        """
        city = address.city.strip()
        plz_str = str(address.plz).strip()

        record = _lookup_postal_code(plz_str)
        if record is not None:
            valid_names = {
                _ascii_low(part) for part in str(record.place_name).split(",")
            }
            if _ascii_low(city) in valid_names:
                return True, "Valid postal code for city"
            return False, f"Postal code {plz_str} is not valid for {city}"

        # Fallback: defined region ranges
        if city in POSTAL_CODE_REGIONS:
            try:
                plz_int = int(plz_str)
                low, high = POSTAL_CODE_REGIONS[city]
                if low <= plz_int <= high:
                    return True, "Valid postal code for city"
                return False, f"Postal code {plz_str} is not valid for {city}"
            except ValueError:
                return False, f"Postal code {plz_str} is not valid for {city}"

        # Unknown city -> assume valid
        return True, "City not in validation database"

    @classmethod
    def validate_house_number_format(cls, house_number: str) -> Tuple[bool, str]:
        """
        Validate that house_number follows common German formats.
        """
        if cls._HOUSE_RE.match(house_number.strip()):
            return True, "Valid house number format"
        return False, (
            "House number should be digits followed by optional letters or ranges "
            "(e.g. '12a', '12-14', '12/1')"
        )

    @classmethod
    def validate_address(cls, address: Address) -> Dict[str, str]:
        """Return a dict of problems; empty if valid."""
        issues: Dict[str, str] = {}

        ok, msg = cls.validate_postal_code_city_match(address)
        if not ok:
            issues["postal_code"] = msg

        ok, msg = cls.validate_house_number_format(address.house_number)
        if not ok:
            issues["house_number"] = msg

        return issues
