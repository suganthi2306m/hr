/**
 * Shared attendance time helpers (web_backend / ops API).
 *
 * Aligns with the web dashboard: day bounds from `dayStartISO`/`dayEndISO` or
 * `date` + `timeZoneOffsetMinutes`, plus punch parsing from body ms/ISO or wall clock.
 */

function normalizeDateOnly(input) {
  const d = input ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(start) {
  const e = new Date(start);
  e.setHours(23, 59, 59, 999);
  return e;
}

function parseTimeForDate(baseDate, hh = '', mm = '', meridiem = 'AM') {
  if (hh === '' || mm === '') return null;
  const hNum = Number(hh);
  const mNum = Number(mm);
  if (!Number.isFinite(hNum) || !Number.isFinite(mNum)) return null;
  let h24 = hNum % 12;
  if (String(meridiem || 'AM').toUpperCase() === 'PM') h24 += 12;
  const d = new Date(baseDate);
  d.setHours(h24, mNum, 0, 0);
  return d;
}

/** Wall-clock time after `dayStartUtc` (local midnight as UTC instant from client). */
function parseTimeFromDayStartUtc(dayStartUtc, hh = '', mm = '', meridiem = 'AM') {
  if (!dayStartUtc || Number.isNaN(dayStartUtc.getTime())) return null;
  if (hh === '' || mm === '') return null;
  const hNum = Number(hh);
  const mNum = Number(mm);
  if (!Number.isFinite(hNum) || !Number.isFinite(mNum)) return null;
  let h24 = hNum % 12;
  if (String(meridiem || 'AM').toUpperCase() === 'PM') h24 += 12;
  const ms = (h24 * 60 + mNum) * 60 * 1000;
  return new Date(dayStartUtc.getTime() + ms);
}

function parseClientIso(s) {
  if (s == null) return null;
  if (s instanceof Date && !Number.isNaN(s.getTime())) return s;
  if (typeof s === 'number' && Number.isFinite(s)) return new Date(s);
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Prefer epoch ms from the browser; then ISO string on `isoField`. */
function instantFromEpochMsOrIso(body, msField, isoField) {
  const raw = body[msField];
  if (raw !== undefined && raw !== null && raw !== '') {
    const n =
      typeof raw === 'bigint'
        ? Number(raw)
        : typeof raw === 'number' && Number.isFinite(raw)
          ? raw
          : Number(raw);
    if (Number.isFinite(n) && n > 1e12) {
      const d = new Date(n);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return parseClientIso(body[isoField]);
}

function isReasonableTzOffset(tzo) {
  const n = Number(tzo);
  return Number.isFinite(n) && n >= -840 && n <= 840;
}

/**
 * `timeZoneOffsetMinutes` = `Date.getTimezoneOffset()` from the browser (UTC − local; IST ⇒ −330).
 */
function dayRangeFromDayKeyAndTzOffset(dayKey, tzo) {
  const dk = normalizeDayKey(dayKey);
  if (!dk || !isReasonableTzOffset(tzo)) return null;
  const [y, month, d] = dk.split('-').map(Number);
  const startMs = Date.UTC(y, month - 1, d, 0, 0, 0, 0) + Number(tzo) * 60 * 1000;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return { start: new Date(startMs), end: new Date(endMs) };
}

/** Daily range: explicit ISO pair, else YYYY-MM-DD + timeZoneOffsetMinutes. */
function resolveDayRangeFromRequest({ query = {}, body = {} }) {
  const startRaw = query.dayStart || body.dayStartISO;
  const endRaw = query.dayEnd || body.dayEndISO;
  const start = parseClientIso(startRaw);
  const end = parseClientIso(endRaw);
  if (start && end) return { start, end };

  const dayKey =
    normalizeDayKey(body.date ?? body.attendanceDate) ?? normalizeDayKey(query.date);
  const tzoRaw = body.timeZoneOffsetMinutes ?? query.timeZoneOffsetMinutes;
  if (dayKey && tzoRaw !== undefined && tzoRaw !== null && isReasonableTzOffset(tzoRaw)) {
    return dayRangeFromDayKeyAndTzOffset(dayKey, Number(tzoRaw));
  }
  return null;
}

/** Supervisor calendar date (YYYY-MM-DD) — canonical `attendanceDayKey`. */
function normalizeDayKey(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!Number.isFinite(y) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(y, m - 1, d);
  if (t.getFullYear() !== y || t.getMonth() !== m - 1 || t.getDate() !== d) return null;
  return s;
}

/** Server-local calendar Y-M-D string (e.g. check-in “today” key). */
function formatLocalYmdFromDate(d) {
  if (!d || Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

module.exports = {
  normalizeDateOnly,
  endOfDay,
  parseTimeForDate,
  parseTimeFromDayStartUtc,
  parseClientIso,
  instantFromEpochMsOrIso,
  isReasonableTzOffset,
  dayRangeFromDayKeyAndTzOffset,
  resolveDayRangeFromRequest,
  normalizeDayKey,
  formatLocalYmdFromDate,
};
