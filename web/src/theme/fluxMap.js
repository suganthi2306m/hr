/** Light “silver” map style + UI controls — matches flux-style dashboards */
export const FLUX_MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#f4f4f4' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f4f4f4' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#e0e0e0' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dbeafe' }] },
];

export function getFluxMapOptions(overrides = {}) {
  return {
    styles: FLUX_MAP_STYLES,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    zoomControl: true,
    gestureHandling: 'greedy',
    backgroundColor: '#f4f4f4',
    ...overrides,
  };
}

/** Matches Tailwind `primary` — buttons, badges, active map pins */
export const FLUX_PRIMARY = '#f2d04a';

/** Black / accent circular pins like reference UI */
export function fluxCircleMarkerIcon(google, { fill = '#111111', stroke = '#ffffff', scale = 10 } = {}) {
  if (!google?.maps?.SymbolPath) return undefined;
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale,
    fillColor: fill,
    fillOpacity: 1,
    strokeColor: stroke,
    strokeWeight: 2,
  };
}

/** Stable saturated colours for live staff pins (one colour per user id). */
const STAFF_TRACKING_PIN_PALETTE = [
  '#2563eb',
  '#dc2626',
  '#059669',
  '#7c3aed',
  '#ea580c',
  '#0891b2',
  '#b45309',
  '#db2777',
  '#4338ca',
  '#0f766e',
  '#be123c',
  '#1d4ed8',
];

export function staffPinColorForUserId(userId) {
  const s = String(userId ?? '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % STAFF_TRACKING_PIN_PALETTE.length;
  return STAFF_TRACKING_PIN_PALETTE[idx];
}

/**
 * Teardrop location pin (data-URL) for live tracking — not a circle.
 * @param {boolean} [active=true] — inactive pins render slightly faded.
 */
export function getStaffLocationPinIcon(google, { fill = '#2563eb', active = true } = {}) {
  if (!google?.maps?.Size || !google?.maps?.Point) return undefined;
  const w = 36;
  const h = 48;
  const opacity = active ? '1' : '0.55';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 36 48">
    <path fill="${fill}" fill-opacity="${opacity}" stroke="#ffffff" stroke-width="1.25" d="M18 2C10.3 2 4 8.1 4 15.5c0 7.2 14 28.5 14 28.5S32 22.7 32 15.5C32 8.1 25.7 2 18 2z"/>
    <circle cx="18" cy="16" r="4.2" fill="#ffffff" fill-opacity="${opacity}"/>
  </svg>`;
  const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  return {
    url,
    scaledSize: new google.maps.Size(w, h),
    anchor: new google.maps.Point(18, 48),
  };
}

/** Teardrop map pin (PNG data-URL) — Customers / Locations markers */
export function getCustomerMapPinIcon(google, { active = true } = {}) {
  if (!google?.maps?.Size || !google?.maps?.Point) return undefined;
  const ring = active ? FLUX_PRIMARY : '#9ca3af';
  const body = '#111111';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 40 52"><path fill="${body}" stroke="#ffffff" stroke-width="1.2" d="M20 3C11.9 3 5.5 9.1 5.5 16.8 5.5 28 20 49 20 49S34.5 28 34.5 16.8C34.5 9.1 28.1 3 20 3z"/><circle cx="20" cy="17" r="5.2" fill="${ring}"/></svg>`;
  const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  return {
    url,
    scaledSize: new google.maps.Size(40, 52),
    anchor: new google.maps.Point(20, 52),
  };
}

export const FLUX_ROUTE_GOLD = '#e4d442';
export const FLUX_ROUTE_LIME = '#e8c43a';
