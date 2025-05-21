import math
from typing import Any, Optional, Annotated

from pydantic import BeforeValidator, AfterValidator, Field


# Helper functions


def _blank_to_none(v: Any) -> Any:
    """
    Convert blank, whitespace-only, or NaN values to None.

    Args:
        v: The input value to normalize, which can be None, str, float, or any type.

    Returns:
        None if v is None, a NaN float, or an empty/whitespace string; otherwise the original value.
    """
    # Treat None, empty/whitespace-only strings, and NaN floats as missing
    if (
        v is None
        or (isinstance(v, float) and math.isnan(v))
        or (isinstance(v, str) and not v.strip())
    ):
        return None
    return v


def _must_not_be_blank(v: str) -> str:
    """
    Ensure a string contains at least one non-whitespace character.

    Args:
        v: The input string to validate.

    Returns:
        The stripped string if it contains non-whitespace characters.

    Raises:
        ValueError: If the stripped string is empty.
    """
    s: str = v.strip()
    if not s:
        raise ValueError("must contain at least one non-whitespace character")
    return s


def _positive_int_or_none(v: Any) -> Optional[int]:
    """
    Normalize input to a positive integer or None.

    Args:
        v: The input value, which may be numeric, string, or blank.

    Returns:
        The original int if positive, a rounded int if convertible to float >= 1,
        or None for blank, non-numeric, or values < 1.
    """
    v = _blank_to_none(v)
    if v is None:
        return None
    # Preserve exact ints (avoid float precision drift)
    if isinstance(v, int) and not isinstance(v, bool):
        return v if v > 0 else None
    try:
        f: float = float(v)
    except (TypeError, ValueError):
        return None
    # drop any values less than 1 (per raw-speed threshold)
    if f < 1:
        return None
    # conventional round half up
    iv: int = int(f + 0.5)
    return iv


def _percent_or_none(v: Any) -> Optional[float]:
    """
    Normalize input to a percentage between 0 and 100 inclusive, or None.

    Args:
        v: The input value, which may be numeric, string, or blank.

    Returns:
        A float between 0 and 100 if valid; otherwise None.
    """
    v = _blank_to_none(v)
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if 0 <= f <= 100 else None


# Ready-made Pydantic Annotated type aliases

NonBlankStr = Annotated[
    str,
    Field(
        ...,
        description="Non-empty string; must contain at least one non-whitespace character",
    ),
    AfterValidator(_must_not_be_blank),
]

OptStrClean = Annotated[
    Optional[str],
    BeforeValidator(_blank_to_none),
    Field(
        default=None,
        description="Optional string; blank or whitespace-only values converted to None",
    ),
]

OptPosInt = Annotated[
    Optional[int],
    BeforeValidator(_positive_int_or_none),
    Field(
        default=None,
        description="Optional positive integer; blank, non-numeric, or non-positive values converted to None",
    ),
]

OptPercent = Annotated[
    Optional[float],
    BeforeValidator(_percent_or_none),
    Field(
        default=None,
        description="Optional percentage (0–100); blank or invalid values converted to None",
    ),
]

PosInt = Annotated[
    int,
    BeforeValidator(_positive_int_or_none),
    Field(gt=0, description="Positive integer greater than zero"),
]  # raw ints stay ints
