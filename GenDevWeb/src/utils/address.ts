import { Address } from "@/types/address";

/**
 * Extracts a specific address component from Google Geocoder results.
 *
 * @param comps - List of GeocoderAddressComponent objects to search.
 * @param type - The address component type to extract (e.g., "country", "route").
 * @param short - Whether to return the 'short_name' (true) or 'long_name' (false). Defaults to false.
 * @returns The matching component name, or undefined if not found.
 */
export const extractAddressComponent = (
    comps: google.maps.GeocoderAddressComponent[],
    type: string,
    short = false,
): string | undefined =>
    comps.find((c) => c.types.includes(type))?.[
        short ? "short_name" : "long_name"
    ];

/**
 * Parses raw Google Maps GeocoderResult into a strongly typed Address object.
 *
 * Filters out non-German results and ensures all required fields are present.
 *
 * @param results - Array of GeocoderResult objects returned by the Google Maps API.
 * @returns An Address object with street, house_number, city, plz, and country_code, or null if parsing fails.
 */
export const parseGeocodeResult = (
    results: google.maps.GeocoderResult[],
): Address | null => {
    // No geocoding results available
    if (!results.length) return null;

    const [r] = results;
    const c = r.address_components ?? [];

    // Only support addresses within Germany ("DE")
    const country = extractAddressComponent(c, "country", true);

    if (country !== "DE") return null;

    // Extract street name and house number components
    const street = extractAddressComponent(c, "route");
    const house = extractAddressComponent(c, "street_number");

    // Determine city: prefer locality, fallback to postal town, admin area, or sublocality
    const city =
        extractAddressComponent(c, "locality") ??
        extractAddressComponent(c, "postal_town") ??
        extractAddressComponent(c, "administrative_area_level_3") ??
        extractAddressComponent(c, "sublocality_level_1");

    // Extract postal code (PLZ)
    const plz = extractAddressComponent(c, "postal_code");

    // Validate that all components exist and postal code matches five digits
    if (!street || !house || !city || !plz || !/^\d{5}$/.test(plz)) return null;

    // Explicitly create Address object to ensure type safety
    const address: Address = {
        street,
        house_number: house,
        city,
        plz,
        country_code: "DE",
    };

    return address;
};
