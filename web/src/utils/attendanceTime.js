/**
 * Shared attendance time utilities (web dashboard).
 *
 * Wall clock for marks uses **Asia/Kolkata** by default (IST, no DST).
 * Set `VITE_ATTENDANCE_TIMEZONE=local` (or `browser`) for machine-local calendar.
 * Any other value is an IANA zone (e.g. `America/New_York`).
 *
 * Import from `src/utils/attendanceTime.js` everywhere you format or build
 * attendance punch times so behaviour stays consistent.
 */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

function pad2(n) {
  return `${Number(n)}`.padStart(2, '0');
}

/** @returns {string | null} IANA zone, or null = use browser local calendar */
export function getAttendanceIanaTimezone() {
  const raw = String(import.meta.env.VITE_ATTENDANCE_TIMEZONE ?? '').trim();
  if (!raw) return 'Asia/Kolkata';
  const lower = raw.toLowerCase();
  if (lower === 'local' || lower === 'browser') return null;
  return raw;
}

/**
 * @param {string} dateStr YYYY-MM-DD from <input type="date">
 * @returns {{ dayStartISO: string, dayEndISO: string } | null}
 */
export function localCalendarDayRangeISO(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const tz = getAttendanceIanaTimezone();
  if (!tz) {
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d, 23, 59, 59, 999);
    return { dayStartISO: start.toISOString(), dayEndISO: end.toISOString() };
  }
  const start = dayjs.tz(dateStr, 'YYYY-MM-DD', tz).startOf('day');
  const end = dayjs.tz(dateStr, 'YYYY-MM-DD', tz).endOf('day');
  if (!start.isValid() || !end.isValid()) return null;
  return { dayStartISO: start.toISOString(), dayEndISO: end.toISOString() };
}

/**
 * ECMA `getTimezoneOffset`-style minutes for `dateStr`'s midnight in the attendance zone
 * (must match web_backend `dayRangeFromDayKeyAndTzOffset` contract).
 */
function offsetMinutesForApiDate(dateStr) {
  const tz = getAttendanceIanaTimezone();
  if (!tz) return new Date().getTimezoneOffset();
  const [y, mo, d] = dateStr.split('-').map(Number);
  const naiveUtcMs = Date.UTC(y, mo - 1, d, 0, 0, 0, 0);
  const zStart = dayjs.tz(dateStr, 'YYYY-MM-DD', tz).startOf('day');
  if (!zStart.isValid()) return new Date().getTimezoneOffset();
  return (zStart.valueOf() - naiveUtcMs) / 60000;
}

/**
 * Wall clock on the attendance-zone calendar day → UTC epoch ms.
 * @param {string} dateStr YYYY-MM-DD
 * @param {{ hh: string, mm: string, meridiem?: string }} t
 * @returns {number | null}
 */
export function localWallClockToEpochMs(dateStr, t) {
  if (!dateStr || !t) return null;
  const { hh, mm, meridiem = 'AM' } = t;
  if (hh === '' || mm === '') return null;
  const h12 = Number(hh);
  const mNum = Number(mm);
  if (!Number.isFinite(h12) || !Number.isFinite(mNum)) return null;
  let h24 = h12 % 12;
  if (String(meridiem).toUpperCase() === 'PM') h24 += 12;
  const tz = getAttendanceIanaTimezone();
  const wall = `${dateStr} ${pad2(h24)}:${pad2(mNum)}:00`;
  if (!tz) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, mo - 1, d, h24, mNum, 0, 0);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.getTime();
  }
  const parsed = dayjs.tz(wall, 'YYYY-MM-DD HH:mm:ss', tz);
  if (!parsed.isValid()) return null;
  return parsed.valueOf();
}

/**
 * @param {string} dateStr YYYY-MM-DD
 * @param {{ hh: string, mm: string, meridiem?: string }} t
 * @returns {string | null}
 */
export function localWallClockToISO(dateStr, t) {
  const ms = localWallClockToEpochMs(dateStr, t);
  if (ms == null) return null;
  return new Date(ms).toISOString();
}

/** Payload fields for `/ops/attendance/*` so the API can rebuild the day window. */
export function dayContextForApi(dateStr) {
  const range = localCalendarDayRangeISO(dateStr);
  const timeZoneOffsetMinutes = offsetMinutesForApiDate(dateStr);
  if (!range) return { timeZoneOffsetMinutes };
  return { ...range, timeZoneOffsetMinutes };
}

/** Stored UTC instant → clock string in attendance zone (with seconds). */
export function formatAttendanceClock(isoOrDate) {
  if (!isoOrDate) return '';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  const tz = getAttendanceIanaTimezone();
  if (!tz) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  }
  return d.toLocaleTimeString('en-IN', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/** Stored UTC instant → short clock (e.g. lists), same zone rules as {@link formatAttendanceClock}. */
export function formatAttendanceTimeShort(isoOrDate) {
  if (!isoOrDate) return '';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  const tz = getAttendanceIanaTimezone();
  if (!tz) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return d.toLocaleTimeString('en-IN', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Date + time in the attendance zone (live maps, point detail). */
export function formatAttendanceDateTime(isoOrDate) {
  if (!isoOrDate) return '';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  const tz = getAttendanceIanaTimezone();
  if (!tz) {
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  return d.toLocaleString('en-IN', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/** Modal defaults: stored UTC → 12h parts in attendance zone. */
export function wallClockPartsFromStoredUtc(isoOrDate) {
  const empty = { hh: '', mm: '', meridiem: 'AM' };
  if (!isoOrDate) return empty;
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return empty;
  const tz = getAttendanceIanaTimezone();
  if (!tz) {
    let hh = d.getHours();
    const meridiem = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12 || 12;
    return { hh: pad2(hh), mm: pad2(d.getMinutes()), meridiem };
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);
  let hour = 12;
  let minute = 0;
  let meridiem = 'AM';
  for (const p of parts) {
    if (p.type === 'hour') hour = Number(p.value);
    if (p.type === 'minute') minute = Number(p.value);
    if (p.type === 'dayPeriod') meridiem = String(p.value).toUpperCase().startsWith('P') ? 'PM' : 'AM';
  }
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return empty;
  return { hh: pad2(hour), mm: pad2(minute), meridiem };
}
