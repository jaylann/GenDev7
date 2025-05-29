/**
 * @module Validators
 *
 * Provides utility functions for validating address components, such as German house numbers,
 * and performing structural validation on Address objects.
 */

import type { Address } from "@/types/address";

/**
 * Determines whether a given house number string conforms to the German addressing format.
 *
 * The supported formats include:
 * - Single number: "12"
 * - Number with suffix letter: "12a" or "12A"
 * - Range: "12-14" or with letters: "1a-2B"
 * - Fraction: "12/1" or with letters: "10a/12b"
 *
 * @param houseNumber - The house number string to validate.
 * @returns True if the house number string matches the expected pattern; otherwise, false.
 *
 * @remarks
 * Leading and trailing whitespace is trimmed before validation.
 * An empty or non-string input returns false.
 */
export const validateHouseNumberFormat = (houseNumber: string): boolean => {
    if (typeof houseNumber !== "string" || houseNumber.trim() === "") {
        return false;
    }
    // Regex breakdown:
    // ^ : Start of the string
    // \d+ : One or more digits (e.g., "12")
    // [a-zA-Z]? : An optional single letter, case-insensitive (e.g., "a", "B")
    // (?: ... )? : An optional non-capturing group for range or fraction suffixes
    //   [/-] : A literal slash "/" or hyphen "-"
    //   \d+ : One or more digits for the second part of the range/suffix
    //   [a-zA-Z]? : An optional single letter for the second part
    // $ : End of the string
    const HOUSE_NUMBER_REGEX = /^\d+[a-zA-Z]?(?:[/-]\d+[a-zA-Z]?)?$/;
    return HOUSE_NUMBER_REGEX.test(houseNumber.trim());
};

/**
 * Validates the structure of an Address object.
 *
 * Ensures the Address object is non-null and that its house_number component
 * adheres to the German house number format.
 *
 * @param address - The Address object to validate, or null if lookup failed.
 * @returns True if the Address is non-null and structurally valid; otherwise, false.
 *
 * @remarks
 * Additional structural checks (e.g., postal code format, country code) may be
 * added as needed.
 */
export const isAddressStructurallyValid = (
    address: Address | null,
): boolean => {
    if (!address) {
        return false; // API did not find a match or failed basic parsing
    }
    if (!validateHouseNumberFormat(address.house_number)) {
        return false; // House number format is invalid
    }
    // For now, parselGeocodeResult handles country, PLZ regex, and presence of key components.
    return true;
};
