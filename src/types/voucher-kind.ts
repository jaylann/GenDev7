/**
 * Canonical voucher / incentive categories.
 * Aligns with the `VoucherKind` Enum in the Pydantic model.
 */
export enum VoucherKind {
    /** e.g. 10 € cash-back */
    ABSOLUTE = "absolute",
    /** e.g. 10 % off */
    PERCENTAGE = "percentage",
    /** provider pays X € back after activation */
    CASHBACK = "cashback",
    /** generic discount that doesn’t fit the others */
    DISCOUNT = "discount",
}

/**
 * Helper function to get a user-friendly display name for a voucher kind.
 * @param voucherKind - The kind of voucher.
 * @returns A human-readable string for the voucher kind.
 */
export const getVoucherKindDisplayName = (voucherKind: VoucherKind): string => {
    switch (voucherKind) {
        case VoucherKind.ABSOLUTE:
            return "Direct Discount";
        case VoucherKind.PERCENTAGE:
            return "Percentage Off";
        case VoucherKind.CASHBACK:
            return "Cashback";
        case VoucherKind.DISCOUNT:
            return "Special Discount";
        default:
            const exhaustiveCheck: never = voucherKind;
            return exhaustiveCheck;
    }
};