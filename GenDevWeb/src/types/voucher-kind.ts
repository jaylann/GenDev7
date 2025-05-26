/**
 * VoucherKind Module
 *
 * Provides an enumeration of voucher/incentive types and a helper for obtaining user-friendly labels.
 * Keeps frontend in sync with the backend Pydantic VoucherKind model.
 */
/**
 * VoucherKindEnum defines all supported categories of vouchers and incentives.
 *
 * Each enum member corresponds to a promotional mechanism:
 *  - ABSOLUTE: fixed cash discount
 *  - PERCENTAGE: percentage-based discount
 *  - CASHBACK: provider reimburses a fixed amount after activation
 *  - DISCOUNT: generic discount type for other promotions
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
 * getVoucherKindDisplayName
 *
 * Maps a VoucherKind enum value to a human-readable display string.
 *
 * @param voucherKind - The voucher kind enum value.
 * @returns A user-friendly label for the voucher kind.
 */
export const getVoucherKindDisplayName = (voucherKind: VoucherKind): string => {
    // Determine the display label based on voucher kind
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
            // Enforce exhaustive handling: this branch should be unreachable if all cases are covered
            return voucherKind;
    }
};
