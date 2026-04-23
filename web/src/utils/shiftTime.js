import dayjs from 'dayjs';

/** "09:30" / "9:30" → normalized "09:30" */
export function normalizeHmInput(v) {
  const m = String(v || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '09:00';
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** "09:30" → "9:30 AM" (locale) */
export function formatHmTo12h(hm) {
  const s = normalizeHmInput(hm);
  const [hh, mm] = s.split(':').map((x) => parseInt(x, 10));
  const d = dayjs().hour(hh).minute(mm).second(0);
  return d.format('hh:mm A');
}

export function formatShiftRange(startHm, endHm) {
  return `${formatHmTo12h(startHm)} – ${formatHmTo12h(endHm)}`;
}
