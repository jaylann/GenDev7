from enum import Enum


class VoucherKind(str, Enum):
    """Canonical voucher / incentive categories we support."""

    ABSOLUTE = "absolute"  # e.g. 10 € cash-back
    PERCENTAGE = "percentage"  # e.g. 10 % off
    CASHBACK = "cashback"  # provider pays X € back after activation
    DISCOUNT = "discount"  # generic discount that doesn’t fit the others
