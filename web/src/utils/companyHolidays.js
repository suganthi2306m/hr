import dayjs from 'dayjs';

/**
 * Holidays that apply to an employee branch: empty branchIds = all branches.
 * @param {object[]} holidays
 * @param {string} [userBranchId]
 */
export function holidaysApplicableToBranch(holidays, userBranchId) {
  const uid = userBranchId != null && String(userBranchId).trim() !== '' ? String(userBranchId).trim() : '';
  return (holidays || []).filter((h) => {
    const ids = Array.isArray(h.branchIds) ? h.branchIds.map((id) => String(id)) : [];
    if (!ids.length) return true;
    if (!uid) return false;
    return ids.includes(uid);
  });
}

/**
 * Map YYYY-MM-DD → { name } for calendar cells (first holiday wins on overlap).
 * @param {object[]} holidays normalized from API (startDate/endDate YYYY-MM-DD)
 * @returns {Map<string, { name: string, _id?: string }>}
 */
export function buildCompanyHolidayByDay(holidays) {
  const map = new Map();
  for (const h of holidays || []) {
    const name = String(h.name || '').trim();
    if (!name) continue;
    const sk = String(h.startDate || '').slice(0, 10);
    const ek = String(h.endDate != null ? h.endDate : h.startDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sk)) continue;
    const endKey = /^\d{4}-\d{2}-\d{2}$/.test(ek) ? ek : sk;
    let cur = dayjs(sk).startOf('day');
    const end = dayjs(endKey).startOf('day');
    if (!cur.isValid() || !end.isValid()) continue;
    while (cur.valueOf() <= end.valueOf()) {
      const k = cur.format('YYYY-MM-DD');
      if (!map.has(k)) map.set(k, { name, _id: h._id != null ? String(h._id) : '' });
      cur = cur.add(1, 'day');
    }
  }
  return map;
}

export function holidayOverlapsYear(h, year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return false;
  const sk = String(h?.startDate || '').slice(0, 10);
  const ek = String(h?.endDate != null ? h.endDate : h?.startDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sk)) return false;
  const endKey = /^\d{4}-\d{2}-\d{2}$/.test(ek) ? ek : sk;
  const yStart = `${y}-01-01`;
  const yEnd = `${y}-12-31`;
  return !(endKey < yStart || sk > yEnd);
}

export function inclusiveDayCount(startYmd, endYmd) {
  const a = dayjs(String(startYmd).slice(0, 10));
  const b = dayjs(String(endYmd).slice(0, 10));
  if (!a.isValid() || !b.isValid()) return 0;
  return Math.max(1, b.startOf('day').diff(a.startOf('day'), 'day') + 1);
}
