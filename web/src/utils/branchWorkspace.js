/** Shared branch editor state and PUT /company payload helpers (max 3 branches). */

export const MAX_BRANCHES = 3;

/** Normalize API branch subdocuments for editor state (max branches, head office, geofence fields). */
export function normalizeBranchesFromApi(list) {
  if (!Array.isArray(list)) return [];
  let mapped = list.slice(0, MAX_BRANCHES).map((b) => ({
    _id: b._id != null ? String(b._id) : '',
    name: b.name || '',
    code: b.code || '',
    address: b.address || '',
    phone: b.phone || '',
    city: b.city || '',
    state: b.state || '',
    country: b.country || '',
    pincode: b.pincode || '',
    isHeadOffice: Boolean(b.isHeadOffice),
    geofence: {
      lat:
        b.geofence?.lat != null && Number.isFinite(Number(b.geofence.lat)) ? Number(b.geofence.lat) : '',
      lng:
        b.geofence?.lng != null && Number.isFinite(Number(b.geofence.lng)) ? Number(b.geofence.lng) : '',
      radiusM: b.geofence?.radiusM != null ? Math.max(10, Number(b.geofence.radiusM)) : 150,
      address: String(b.geofence?.address || b.address || '').trim(),
      enabled: b.geofence?.enabled !== false,
    },
  }));
  if (mapped.length && !mapped.some((b) => b.isHeadOffice)) {
    mapped = mapped.map((b, i) => (i === 0 ? { ...b, isHeadOffice: true } : { ...b, isHeadOffice: false }));
  }
  const hoCount = mapped.filter((b) => b.isHeadOffice).length;
  if (hoCount > 1) {
    const first = mapped.findIndex((b) => b.isHeadOffice);
    mapped = mapped.map((b, i) => ({ ...b, isHeadOffice: i === first }));
  }
  return mapped;
}

export function emptyBranchRow(isHeadOffice = false) {
  return {
    _id: '',
    name: '',
    code: '',
    address: '',
    phone: '',
    city: '',
    state: '',
    country: '',
    pincode: '',
    isHeadOffice,
    geofence: {
      lat: '',
      lng: '',
      radiusM: 150,
      address: '',
      enabled: true,
    },
  };
}

function toNum(v) {
  if (v === '' || v == null) return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'object' && v !== null) {
    if ('$numberDouble' in v) return toNum(v.$numberDouble);
    if ('$numberDecimal' in v) return toNum(v.$numberDecimal);
  }
  const n = Number.parseFloat(String(v).trim().replace(/,/g, '').replace(/\u2212/g, '-'));
  return Number.isFinite(n) ? n : NaN;
}

function baselineBranchByIdMap(baseline) {
  if (!Array.isArray(baseline)) return null;
  const m = new Map();
  for (const x of baseline) {
    if (!x || !x._id || !/^[a-f\d]{24}$/i.test(String(x._id))) continue;
    m.set(String(x._id), x);
  }
  return m.size ? m : null;
}

/** Prefer incoming geofence lat/lng; if missing, use same branch id from baseline (avoids false "no pin" after shallow merges). */
function mergedGeofenceLatLng(b, gf, baselineById) {
  let lat = toNum(gf.lat);
  let lng = toNum(gf.lng);
  const id = b._id && /^[a-f\d]{24}$/i.test(String(b._id)) ? String(b._id) : '';
  const prev = id && baselineById ? baselineById.get(id) : null;
  const pg = prev?.geofence && typeof prev.geofence === 'object' ? prev.geofence : null;
  if (pg) {
    if (!Number.isFinite(lat)) lat = toNum(pg.lat);
    if (!Number.isFinite(lng)) lng = toNum(pg.lng);
  }
  return { lat, lng };
}

/**
 * Build branch payloads for PUT /company.
 * @param {unknown[]} incoming - branches to save (often includes edits + unchanged rows).
 * @param {unknown[]|null} [baseline] - previous in-memory list (e.g. parent `branches` before this save); used to restore lat/lng when an existing _id omits them.
 * @returns {object[]}
 */
export function cleanBranchesForApi(incoming, baseline = null) {
  const baselineById = baselineBranchByIdMap(baseline);

  // Match backend: only a name is required here; empty codes are filled server-side when branch ID auto-generation is on.
  const rows = (Array.isArray(incoming) ? incoming : [])
    .filter((b) => b && String(b.name || '').trim())
    .slice(0, MAX_BRANCHES);

  return rows.map((b) => {
    const gf = b.geofence && typeof b.geofence === 'object' ? b.geofence : {};
    const enabled = gf.enabled !== false;
    const { lat, lng } = mergedGeofenceLatLng(b, gf, baselineById);
    const radiusM = Math.max(10, Math.round(Number(gf.radiusM) || 150));
    const addr = String(gf.address || b.address || '').trim();
    const row = {
      ...(b._id && /^[a-f\d]{24}$/i.test(String(b._id)) ? { _id: b._id } : {}),
      name: String(b.name).trim(),
      code: String(b.code || '').trim(),
      address: String(b.address || '').trim(),
      phone: String(b.phone || '').trim(),
      city: String(b.city || '').trim(),
      state: String(b.state || '').trim(),
      country: String(b.country || '').trim(),
      pincode: String(b.pincode || '').trim(),
      isHeadOffice: Boolean(b.isHeadOffice),
      geofence: {
        enabled,
        radiusM,
        address: addr,
      },
    };
    if (Number.isFinite(lat)) row.geofence.lat = lat;
    if (Number.isFinite(lng)) row.geofence.lng = lng;
    return row;
  });
}

export function branchMatchesSearch(b, rawQuery) {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return true;
  const digitQ = String(rawQuery || '').replace(/\D/g, '');
  const hay = [
    b.name,
    b.code,
    b.phone,
    b.address,
    b.city,
    b.state,
    b.country,
    b.pincode,
    b.geofence?.lat != null && b.geofence?.lat !== '' ? String(b.geofence.lat) : '',
    b.geofence?.lng != null && b.geofence?.lng !== '' ? String(b.geofence.lng) : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (hay.includes(q)) return true;
  if (digitQ.length >= 2 && String(b.phone || '').replace(/\D/g, '').includes(digitQ)) return true;
  return false;
}

export function isBranchOperationalActive(b) {
  return b?.geofence?.enabled !== false;
}
