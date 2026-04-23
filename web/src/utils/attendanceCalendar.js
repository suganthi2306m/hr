import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { hasWeeklyOffRules, isWeeklyOffDate } from './weeklyOff';
import {
  resolveAttendanceStatus,
  resolvePunchInRaw,
  resolvePunchOutRaw,
  resolveWorkedMinutes,
} from './attendancePunchFields';

dayjs.extend(isoWeek);

/** @param {import('dayjs').Dayjs} d */
export function toDayKey(d) {
  return d.format('YYYY-MM-DD');
}

/** Prefer server `attendanceDayKey`, else calendar day from punch. */
export function dayKeyForAttendanceRecord(r) {
  const k = r?.attendanceDayKey;
  if (k && /^\d{4}-\d{2}-\d{2}$/.test(String(k))) return String(k);
  return dayjs(resolvePunchInRaw(r) || r?.attendanceDate || r?.createdAt).format('YYYY-MM-DD');
}

export function buildAttendanceByDay(records) {
  const byDay = new Map();
  (records || []).forEach((r) => {
    const key = dayKeyForAttendanceRecord(r);
    const prev = byDay.get(key);
    if (!prev) {
      byDay.set(key, { ...r });
      return;
    }
    const prevIn = dayjs(resolvePunchInRaw(prev) || prev.createdAt).valueOf();
    const curIn = dayjs(resolvePunchInRaw(r) || r.createdAt).valueOf();
    const earliest = curIn < prevIn ? r : prev;
    const latestOut = [resolvePunchOutRaw(prev), resolvePunchOutRaw(r)]
      .filter(Boolean)
      .map((t) => dayjs(t))
      .sort((a, b) => a.valueOf() - b.valueOf())
      .at(-1);
    const mergedMinutes =
      (Number(resolveWorkedMinutes(prev)) || 0) + (Number(resolveWorkedMinutes(r)) || 0) ||
      resolveWorkedMinutes(earliest);
    byDay.set(key, {
      ...earliest,
      dayStatus: r.dayStatus || prev.dayStatus || r.status || prev.status,
      leaveKind: r.leaveKind ?? prev.leaveKind,
      checkOutAt: latestOut ? latestOut.toISOString() : resolvePunchOutRaw(earliest) || null,
      minutesWorked: mergedMinutes != null && Number.isFinite(Number(mergedMinutes)) ? mergedMinutes : null,
    });
  });
  return byDay;
}

/** Prefer approved leave over pending when multiple requests cover the same day. */
function leaveStatusRank(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'approved') return 3;
  if (s === 'pending') return 2;
  if (s === 'rejected') return 1;
  return 0;
}

export function buildLeaveByDay(items) {
  const out = new Map();
  (items || []).forEach((lv) => {
    let cur = dayjs(lv.startDate).startOf('day');
    const end = dayjs(lv.endDate).startOf('day');
    if (!cur.isValid() || !end.isValid()) return;
    while (cur.valueOf() <= end.valueOf()) {
      const k = cur.format('YYYY-MM-DD');
      const old = out.get(k);
      if (!old) out.set(k, lv);
      else if (leaveStatusRank(lv.status) > leaveStatusRank(old.status)) out.set(k, lv);
      cur = cur.add(1, 'day');
    }
  });
  return out;
}

/** Weekdays (Mon–Fri) with `inRange` in the visible grid. */
export function countWorkingDaysInGrid(calendarDays, weeklyOffPolicy) {
  const hasRules = hasWeeklyOffRules(weeklyOffPolicy);
  return calendarDays.filter((d) => {
    if (!d.inRange) return false;
    if (hasRules) return !isWeeklyOffDate(d.date, weeklyOffPolicy);
    return d.date.day() !== 0 && d.date.day() !== 6;
  }).length;
}

export function sumMinutesWorkedForKeys(attendanceByDay, keys) {
  let total = 0;
  for (const k of keys) {
    const r = attendanceByDay.get(k);
    const wm = resolveWorkedMinutes(r);
    if (wm != null && Number.isFinite(wm)) {
      total += wm;
    }
  }
  return total;
}

/**
 * @param {{ date: import('dayjs').Dayjs, inRange: boolean, att: object | null, leave: object | null }} row
 * @returns {{ key: string, label: string, tone: 'present'|'absent'|'leave'|'weekend'|'holiday'|'pending'|'empty' }}
 */
export function getOpsCalendarCellMeta(row, weeklyOffPolicy) {
  const { date, inRange, att, leave, companyHoliday } = row;
  if (!inRange) return { key: 'out', label: '', tone: 'empty' };

  const hasRules = hasWeeklyOffRules(weeklyOffPolicy);
  const isWeekend = hasRules ? isWeeklyOffDate(date, weeklyOffPolicy) : date.day() === 0 || date.day() === 6;
  const isPast = date.endOf('day').isBefore(dayjs());

  if (companyHoliday?.name) {
    const raw = String(companyHoliday.name).trim();
    const label = raw.length > 22 ? `${raw.slice(0, 22)}…` : raw;
    return { key: 'company-holiday', label, tone: 'holiday' };
  }

  const leaveSt = leave ? String(leave.status || '').toLowerCase() : '';
  if (leave && leaveSt === 'approved') {
    return { key: 'leave', label: 'Leave', tone: 'leave' };
  }
  if (leave && leaveSt === 'pending') {
    return { key: 'leave-pending', label: 'Leave (pending)', tone: 'pending' };
  }

  const attSt = resolveAttendanceStatus(att);
  if (attSt === 'HOLIDAY' || att?.dayStatus === 'HOLIDAY') {
    return { key: 'holiday', label: 'Holiday', tone: 'holiday' };
  }
  if (attSt === 'LEAVE' || att?.dayStatus === 'LEAVE') {
    const cap = att.leaveKind === 'paid' ? 'Paid leave' : att.leaveKind === 'unpaid' ? 'Unpaid leave' : 'Leave';
    return { key: 'leave', label: cap, tone: 'leave' };
  }
  if (attSt === 'ABSENT' || att?.dayStatus === 'ABSENT') {
    return { key: 'absent', label: 'Absent', tone: 'absent' };
  }
  if (attSt === 'PENDING') {
    return { key: 'pending', label: 'Pending', tone: 'pending' };
  }
  if (att && (attSt === 'PRESENT' || attSt === 'HALF_DAY' || resolvePunchInRaw(att))) {
    return { key: 'present', label: 'Present', tone: 'present' };
  }

  if (isWeekend && !att) {
    return { key: 'weekoff', label: 'Week Off', tone: 'weekend' };
  }
  if (isPast) {
    return { key: 'absent', label: 'Absent', tone: 'absent' };
  }
  return { key: 'future', label: '', tone: 'empty' };
}

export function buildCalendarDays(anchorYmd, viewMode, attendanceByDay, leaveByDay, companyHolidayByDay = null) {
  const anchor = dayjs(anchorYmd);
  let start;
  let end;
  if (viewMode === 'week') {
    start = anchor.startOf('isoWeek');
    end = anchor.endOf('isoWeek');
  } else {
    const first = anchor.startOf('month');
    const last = anchor.endOf('month');
    start = first.startOf('isoWeek');
    end = last.endOf('isoWeek');
  }
  const days = [];
  let cur = start;
  while (cur.valueOf() <= end.valueOf()) {
    const key = cur.format('YYYY-MM-DD');
    const inRange =
      viewMode === 'week'
        ? cur.isSame(anchor, 'isoWeek')
        : cur.month() === anchor.month() && cur.year() === anchor.year();
    days.push({
      date: cur,
      key,
      inRange,
      att: attendanceByDay.get(key) || null,
      leave: leaveByDay.get(key) || null,
      companyHoliday: companyHolidayByDay?.get(key) || null,
    });
    cur = cur.add(1, 'day');
  }
  return days;
}

export function countStatusInRange(calendarDays, tone, weeklyOffPolicy) {
  return calendarDays.filter((d) => d.inRange && getOpsCalendarCellMeta(d, weeklyOffPolicy).tone === tone).length;
}

/** API `from` / `to` (YYYY-MM-DD) for the visible calendar range. */
export function fetchRangeForAnchor(anchorYmd, viewMode) {
  const a = dayjs(anchorYmd);
  if (viewMode === 'week') {
    const s = a.startOf('isoWeek');
    const e = a.endOf('isoWeek');
    return { from: s.format('YYYY-MM-DD'), to: e.format('YYYY-MM-DD') };
  }
  const s = a.startOf('month');
  const e = a.endOf('month');
  return { from: s.format('YYYY-MM-DD'), to: e.format('YYYY-MM-DD') };
}
