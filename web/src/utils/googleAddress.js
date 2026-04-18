export function findLongName(comps, ...typeSets) {
  if (!comps) return '';
  for (const types of typeSets) {
    const c = comps.find((x) => types.every((t) => x.types.includes(t)));
    if (c) return c.long_name;
  }
  return '';
}

export function cityFromGoogleComponents(comps) {
  return (
    findLongName(comps, ['locality']) ||
    findLongName(comps, ['postal_town']) ||
    findLongName(comps, ['administrative_area_level_3']) ||
    findLongName(comps, ['sublocality', 'sublocality_level_1']) ||
    findLongName(comps, ['administrative_area_level_2']) ||
    ''
  );
}

export function pincodeFromGoogleComponents(comps) {
  return findLongName(comps, ['postal_code']) || '';
}

/** State / region (e.g. Tamil Nadu) */
export function stateFromGoogleComponents(comps) {
  return findLongName(comps, ['administrative_area_level_1']) || '';
}

/** Country long name (e.g. India) */
export function countryFromGoogleComponents(comps) {
  return findLongName(comps, ['country']) || '';
}

export function parseGeocodeResult(result) {
  const formatted = result?.formatted_address || '';
  const comps = result?.address_components;
  const loc = result?.geometry?.location;
  const lat = typeof loc?.lat === 'function' ? loc.lat() : loc?.lat;
  const lng = typeof loc?.lng === 'function' ? loc.lng() : loc?.lng;
  return {
    address: formatted,
    city: cityFromGoogleComponents(comps),
    pincode: pincodeFromGoogleComponents(comps),
    state: stateFromGoogleComponents(comps),
    country: countryFromGoogleComponents(comps),
    lat: lat != null ? Number(lat) : null,
    lng: lng != null ? Number(lng) : null,
  };
}

/** From Places Autocomplete `place` object */
export function parsePlaceResult(place) {
  const geometry = place?.geometry?.location;
  if (!geometry) {
    return null;
  }
  const lat = geometry.lat();
  const lng = geometry.lng();
  const comps = place.address_components;
  return {
    address: place.formatted_address || place.name || '',
    city: cityFromGoogleComponents(comps),
    pincode: pincodeFromGoogleComponents(comps),
    state: stateFromGoogleComponents(comps),
    country: countryFromGoogleComponents(comps),
    lat,
    lng,
  };
}
