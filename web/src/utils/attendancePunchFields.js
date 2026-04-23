/**
 * Track/mobile attendance documents use `checkInTime` / `checkOutTime` / `duration`
 * and nested `checkInLocation`. Web ops HRMS uses `checkInAt` / `checkOutAt` / `minutesWorked`
 * and flat `checkInLat` / `checkInLng`. Normalize reads here.
 */

export function resolvePunchInRaw(item) {
  if (!item || typeof item !== 'object') return null;
  return item.checkInAt ?? item.checkInTime ?? item.punchIn ?? null;
}

export function resolvePunchOutRaw(item) {
  if (!item || typeof item !== 'object') return null;
  return item.checkOutAt ?? item.checkOutTime ?? item.punchOut ?? null;
}

export function resolveWorkedMinutes(item) {
  if (!item || typeof item !== 'object') return null;
  const mw = Number(item.minutesWorked);
  if (Number.isFinite(mw) && mw >= 0) return Math.round(mw);
  const dur = Number(item.duration);
  if (Number.isFinite(dur) && dur >= 0) return Math.round(dur);
  const a = resolvePunchInRaw(item);
  const b = resolvePunchOutRaw(item);
  if (a != null && b != null) {
    const t0 = new Date(a).getTime();
    const t1 = new Date(b).getTime();
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) return Math.round((t1 - t0) / 60000);
  }
  return null;
}

export function resolveCheckInLatLng(item) {
  if (!item || typeof item !== 'object') return { lat: null, lng: null };
  const la = Number(item.checkInLat);
  const ln = Number(item.checkInLng);
  if (Number.isFinite(la) && Number.isFinite(ln)) return { lat: la, lng: ln };
  const loc = item.checkInLocation;
  if (loc && typeof loc === 'object') {
    const lat = Number(loc.lat ?? loc.latitude);
    const lng = Number(loc.lng ?? loc.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return { lat: null, lng: null };
}

export function resolveCheckOutLatLng(item) {
  if (!item || typeof item !== 'object') return { lat: null, lng: null };
  const la = Number(item.checkOutLat);
  const ln = Number(item.checkOutLng);
  if (Number.isFinite(la) && Number.isFinite(ln)) return { lat: la, lng: ln };
  const loc = item.checkOutLocation;
  if (loc && typeof loc === 'object') {
    const lat = Number(loc.lat ?? loc.latitude);
    const lng = Number(loc.lng ?? loc.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return { lat: null, lng: null };
}

/** Human-readable punch address (mobile nested `check*Location.address`, web flat `check*Address`). */
export function resolvePunchInAddressDisplay(item) {
  if (!item || typeof item !== 'object') return '';
  const flat = String(item.checkInAddress || '').trim();
  if (flat) return flat;
  const loc = item.checkInLocation;
  if (loc && typeof loc === 'object') {
    const a = String(loc.address || '').trim();
    if (a) return a;
  }
  return '';
}

export function resolvePunchOutAddressDisplay(item) {
  if (!item || typeof item !== 'object') return '';
  const flat = String(item.checkOutAddress || '').trim();
  if (flat) return flat;
  const loc = item.checkOutLocation;
  if (loc && typeof loc === 'object') {
    const a = String(loc.address || '').trim();
    if (a) return a;
  }
  return '';
}

const CANONICAL_ATTENDANCE_STATUS = ['PRESENT', 'ABSENT', 'LEAVE', 'HOLIDAY', 'PENDING', 'HALF_DAY'];

function dayStatusCanon(item) {
  const d = String(item?.dayStatus || '').toUpperCase().trim();
  if (CANONICAL_ATTENDANCE_STATUS.includes(d)) return d;
  return d || '';
}

/**
 * Calendar / approval row status.
 * Uses `approval` + `dayStatus` when a decision was recorded so UI matches ops mark (reject → absent).
 * Otherwise prefers workflow `status` (e.g. mobile PENDING), then `dayStatus`.
 */
export function resolveAttendanceStatus(item) {
  if (!item || typeof item !== 'object') return 'ABSENT';
  const appr = String(item.approval?.status || '').toLowerCase().trim();
  const dCanon = dayStatusCanon(item);

  if (appr === 'rejected') {
    if (CANONICAL_ATTENDANCE_STATUS.includes(dCanon)) return dCanon;
    return 'ABSENT';
  }
  if (appr === 'approved') {
    if (CANONICAL_ATTENDANCE_STATUS.includes(dCanon)) return dCanon;
  }

  const s = String(item.status || '').toUpperCase().trim();
  if (CANONICAL_ATTENDANCE_STATUS.includes(s)) return s;
  if (CANONICAL_ATTENDANCE_STATUS.includes(dCanon)) return dCanon;
  if (dCanon) return dCanon;
  if (resolvePunchInRaw(item) || resolvePunchOutRaw(item)) return 'PENDING';
  return 'ABSENT';
}
