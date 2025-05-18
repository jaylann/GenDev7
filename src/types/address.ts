/**
 * Address model representing standardized postal address fields.
 */
export interface Address {
    /** Street name and type, e.g., "Main St" */
    street: string;
    /** Numeric or alphanumeric house/building number */
    house_number: string;
    /** City or locality name */
    city: string;
    /** ISO 3166-1 alpha-2 country code */
    country_code: string;
    /** Postal code (PLZ) for the address */
    plz: string;
}
