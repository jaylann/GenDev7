/**
 * Pure helpers for Google-Maps geocoding results.
 * No React, no side-effects – easy to unit-test.
 */
import type { Address } from '@/types/address';

/** Extract one component (long or short name) from a geocoder component list. */
export const extractAddressComponent = (
    comps: google.maps.GeocoderAddressComponent[],
    type: string,
    short = false,
): string | undefined =>
    comps.find((c) => c.types.includes(type))?.[short ? 'short_name' : 'long_name'];

/** Convert raw Google geocode results into our strongly-typed `Address` model. */
export const parseGeocodeResult = (
    results: google.maps.GeocoderResult[],
): Address | null => {
    if (!results.length) return null;

    const [r] = results;
    const c = r.address_components ?? [];
    const country = extractAddressComponent(c, 'country', true);

    if (country !== 'DE') return null;

    const street = extractAddressComponent(c, 'route');
    const house = extractAddressComponent(c, 'street_number');
    const city =
        extractAddressComponent(c, 'locality') ??
        extractAddressComponent(c, 'postal_town') ??
        extractAddressComponent(c, 'administrative_area_level_3') ??
        extractAddressComponent(c, 'sublocality_level_1');
    const plz = extractAddressComponent(c, 'postal_code');

    if (!street || !house || !city || !plz || !/^\d{5}$/.test(plz)) return null;

    return { street, house_number: house, city, plz, country_code: 'DE' };
};
