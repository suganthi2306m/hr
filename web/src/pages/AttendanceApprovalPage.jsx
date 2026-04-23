import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import apiClient from '../api/client';
import UiSelect from '../components/common/UiSelect';
import SlideOverPanel from '../components/common/SlideOverPanel';
import SelectionCountBadge from '../components/common/SelectionCountBadge';
import AttendanceStatCards from '../components/attendance/AttendanceStatCards';
import AttendanceCalendarGrid from '../components/attendance/AttendanceCalendarGrid';
import {
  buildAttendanceByDay,
  buildCalendarDays,
  buildLeaveByDay,
  countWorkingDaysInGrid,
  getOpsCalendarCellMeta,
  sumMinutesWorkedForKeys,
} from '../utils/attendanceCalendar';
import {
  dayContextForApi,
  formatAttendanceClock,
  formatAttendanceTimeShort,
  wallClockPartsFromStoredUtc,
} from '../utils/attendanceTime';
import { formatShiftRange, normalizeHmInput } from '../utils/shiftTime';
import { isWeeklyOffDate, normalizeWeeklyOffPolicy } from '../utils/weeklyOff';
import TablePagination from '../components/common/TablePagination';
import { buildCompanyHolidayByDay, holidaysApplicableToBranch } from '../utils/companyHolidays';
import { employeeCodeOnly, employeeSelectLabel } from '../utils/employeeSelectLabel';
import {
  resolveAttendanceStatus,
  resolvePunchInAddressDisplay,
  resolvePunchOutAddressDisplay,
  resolvePunchInRaw,
  resolvePunchOutRaw,
  resolveWorkedMinutes,
} from '../utils/attendancePunchFields';

const STATUS_OPTIONS = ['PRESENT', 'PENDING', 'ABSENT', 'LEAVE', 'HOLIDAY'];
const DAY_VIEW_STATUS_OPTIONS = ['PENDING', 'APPROVED', 'NOT_CHECKED_IN'];

function toHm(totalMinutes) {
  const mins = Number(totalMinutes);
  if (!Number.isFinite(mins) || mins < 0) return '--';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')} : ${String(m).padStart(2, '0')}`;
}

function statusBadgeClass(status) {
  if (status === 'PRESENT') return 'bg-emerald-100 text-emerald-800';
  if (status === 'ABSENT') return 'bg-rose-100 text-rose-800';
  if (status === 'LEAVE') return 'bg-sky-100 text-sky-800';
  if (status === 'HOLIDAY') return 'bg-violet-100 text-violet-800';
  if (status === 'PENDING') return 'bg-amber-100 text-amber-900';
  if (status === 'HALF_DAY') return 'bg-yellow-100 text-yellow-900';
  if (status === 'NOT_CHECKED_IN') return 'bg-slate-100 text-slate-700';
  return 'bg-slate-100 text-slate-600';
}

function normalizeTimeParts(parts, fallbackMeridiem = 'AM') {
  const raw = String(parts?.meridiem || '').trim().toUpperCase();
  const meridiem = raw === 'PM' ? 'PM' : raw === 'AM' ? 'AM' : fallbackMeridiem;
  return {
    hh: String(parts?.hh || '').slice(0, 2),
    mm: String(parts?.mm || '').slice(0, 2),
    meridiem,
  };
}

function parseTimePartsToMinutes(parts) {
  const hh = Number(parts?.hh || '');
  const mm = Number(parts?.mm || '');
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;
  let h24 = hh % 12;
  if (String(parts?.meridiem || '').trim().toUpperCase() === 'PM') h24 += 12;
  return h24 * 60 + mm;
}

/** Send wall times with `/ops/attendance/mark` so the server can resolve `checkInAt` / `checkOutAt` (required for save). */
function buildMarkPunchTimesPayload(row, editorTimes = null) {
  const out = {};
  const inRaw = resolvePunchInRaw(row?.item);
  const hasEditorIn =
    editorTimes?.loginTime &&
    String(editorTimes.loginTime.hh || '').trim() !== '' &&
    String(editorTimes.loginTime.mm || '').trim() !== '';
  const loginParts = hasEditorIn
    ? normalizeTimeParts(editorTimes.loginTime)
    : inRaw
      ? normalizeTimeParts(wallClockPartsFromStoredUtc(inRaw), 'AM')
      : null;
  if (
    loginParts &&
    String(loginParts.hh || '').trim() !== '' &&
    String(loginParts.mm || '').trim() !== ''
  ) {
    out.loginTime = loginParts;
  }
  const outRaw = resolvePunchOutRaw(row?.item);
  const hasEditorOut =
    editorTimes?.logoutTime &&
    String(editorTimes.logoutTime.hh || '').trim() !== '' &&
    String(editorTimes.logoutTime.mm || '').trim() !== '';
  const logoutParts = hasEditorOut
    ? normalizeTimeParts(editorTimes.logoutTime, 'PM')
    : outRaw
      ? normalizeTimeParts(wallClockPartsFromStoredUtc(outRaw), 'PM')
      : null;
  if (
    logoutParts &&
    String(logoutParts.hh || '').trim() !== '' &&
    String(logoutParts.mm || '').trim() !== ''
  ) {
    const inM = loginParts ? parseTimePartsToMinutes(loginParts) : null;
    const outM = parseTimePartsToMinutes(logoutParts);
    if (outM != null && (inM == null || outM > inM)) {
      out.logoutTime = logoutParts;
    }
  }
  return out;
}

/** Replace or append so list stays one row per user per calendar day. */
function mergeAttendanceItem(items, nextItem, dayKeyFallback) {
  if (!nextItem?._id) return items;
  const rid = String(nextItem._id);
  const uid = String(nextItem.userId || '');
  const dk = String(nextItem.attendanceDayKey || dayKeyFallback || '');
  const filtered = items.filter((x) => {
    if (String(x._id) === rid) return false;
    const xUid = String(x.userId);
    const xDk = String(x.attendanceDayKey || '');
    if (uid && dk && xUid === uid && xDk === dk) return false;
    return true;
  });
  return [...filtered, { ...nextItem, attendanceDayKey: nextItem.attendanceDayKey || dayKeyFallback }];
}

function rowHasCheckInAndOut(row) {
  const it = row?.item;
  return Boolean(resolvePunchInRaw(it) && resolvePunchOutRaw(it));
}

function normalizeDayStatusForApi(value, fallback = 'PRESENT') {
  const u = String(value || '').toUpperCase().trim();
  return ['PRESENT', 'ABSENT', 'LEAVE', 'HOLIDAY'].includes(u) ? u : fallback;
}

/** Company shift "HH:mm" (24h) → 12h parts for the time editor. */
function hm24ToEditorParts(hm) {
  const s = normalizeHmInput(hm || '09:00');
  const parts = s.split(':');
  const hs = parseInt(parts[0], 10);
  const ms = parseInt(parts[1], 10);
  const h24 = (Number.isFinite(hs) ? hs : 9) % 24;
  const mm = Number.isFinite(ms) ? Math.min(59, Math.max(0, ms)) : 0;
  const meridiem = h24 >= 12 ? 'PM' : 'AM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return normalizeTimeParts(
    {
      hh: String(h12).padStart(2, '0'),
      mm: String(mm).padStart(2, '0'),
      meridiem,
    },
    meridiem,
  );
}

function statusLabelForDrawer(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'NOT_CHECKED_IN') return 'Not checked in';
  if (s === 'PENDING') return 'Pending';
  if (s === 'HALF_DAY') return 'Half day';
  return s || '—';
}

/** Single-line shift for compact drawer header (letter + formatted range). */
function drawerShiftSummaryLine(row) {
  if (!row?.shift?.assigned) return 'Not assigned';
  const st = row.shiftTimes;
  if (st?.startTime && st?.endTime) {
    const range = formatShiftRange(st.startTime, st.endTime);
    const letter = row.shift?.letter ? `${String(row.shift.letter).trim()} ` : '';
    return `${letter}${range}`.trim();
  }
  return String(row.shift?.timing || '—').replace(/\s+/g, ' ').trim();
}

/** Shift start/end "HH:mm" → expected slot length (handles same-day and overnight). */
function shiftSlotDurationLabel(startHm, endHm) {
  const toM = (hm) => {
    const s = normalizeHmInput(hm || '09:00');
    const [hs, ms] = s.split(':').map((x) => parseInt(x, 10));
    if (!Number.isFinite(hs) || !Number.isFinite(ms)) return null;
    return (hs % 24) * 60 + (ms % 60);
  };
  const a = toM(startHm);
  const b = toM(endHm);
  if (a == null || b == null) return null;
  let delta = b - a;
  if (delta <= 0) delta += 24 * 60;
  const hh = Math.floor(delta / 60);
  const mm = delta % 60;
  return `${hh}h ${mm}m`;
}

/** Renders clock string with a smaller AM/PM suffix for dense rows. */
function AttendanceClockSmallMeridiem({ iso }) {
  if (!iso) return '—';
  const s = formatAttendanceClock(iso);
  const m = s.match(/^(.+?)\s*([ap]m)$/i);
  if (!m) return s;
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span>{m[1].trim()}</span>
      <span className="text-[9px] font-semibold uppercase leading-none text-slate-500">{m[2]}</span>
    </span>
  );
}

function approvalDrawerStatusBadgeClass(row) {
  const disp = String(row?.displayStatus || '').trim().toUpperCase();
  if (disp === 'WEEK OFF') {
    return 'bg-slate-100 text-slate-800 ring-1 ring-inset ring-slate-200';
  }
  const ns = String(row?.newStatus || '').toUpperCase();
  switch (ns) {
    case 'PRESENT':
      return 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200';
    case 'ABSENT':
      return 'bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200';
    case 'LEAVE':
      return 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200';
    case 'HOLIDAY':
      return 'bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-200';
    case 'PENDING':
      return 'bg-sky-50 text-sky-900 ring-1 ring-inset ring-sky-200';
    case 'HALF_DAY':
      return 'bg-orange-50 text-orange-900 ring-1 ring-inset ring-orange-200';
    case 'NOT_CHECKED_IN':
      return 'bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200';
    default:
      return 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200';
  }
}

function resolveSelfieUrl(item, kind = 'in') {
  if (!item || typeof item !== 'object') return '';
  const keys =
    kind === 'out'
      ? ['checkOutSelfieUrl', 'checkOutSelfie', 'checkOutImageUrl', 'checkOutImage', 'checkOutPhotoUrl', 'checkOutPhoto']
      : ['checkInSelfieUrl', 'checkInSelfie', 'checkInImageUrl', 'checkInImage', 'checkInPhotoUrl', 'checkInPhoto'];
  for (const key of keys) {
    const value = String(item[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function AttendanceApprovalPage() {
  const [users, setUsers] = useState([]);
  const [companyShifts, setCompanyShifts] = useState([]);
  const [weeklyOffPolicy, setWeeklyOffPolicy] = useState(() => normalizeWeeklyOffPolicy(null));
  const [companyHolidays, setCompanyHolidays] = useState([]);
  const [items, setItems] = useState([]);
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('month');
  const [anchorDay, setAnchorDay] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [dateFilter, setDateFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [activeRequest, setActiveRequest] = useState(null);
  const [editLoginTime, setEditLoginTime] = useState(() => normalizeTimeParts({}));
  const [editLogoutTime, setEditLogoutTime] = useState(() => normalizeTimeParts({}, 'PM'));
  const [editReason, setEditReason] = useState('');
  const [applyShiftTime, setApplyShiftTime] = useState(false);
  const [drawerInitialTimes, setDrawerInitialTimes] = useState({
    login: normalizeTimeParts({}),
    logout: normalizeTimeParts({}, 'PM'),
  });
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [calendarLeaves, setCalendarLeaves] = useState([]);
  const [imagePreview, setImagePreview] = useState({ open: false, url: '', label: '' });

  const range = useMemo(() => {
    const base = dayjs(anchorDay);
    if (viewMode === 'day') {
      const day = base.format('YYYY-MM-DD');
      return {
        from: day,
        to: day,
        label: base.format('DD MMM YYYY'),
      };
    }
    return {
      from: base.startOf('month').format('YYYY-MM-DD'),
      to: base.endOf('month').format('YYYY-MM-DD'),
      label: base.format('MMM YYYY'),
    };
  }, [anchorDay, viewMode]);

  /** Top banner (e.g. “Marked absent.”) should not linger; clear after 2s. */
  useEffect(() => {
    if (!msg) return undefined;
    const id = window.setTimeout(() => setMsg(''), 2000);
    return () => window.clearTimeout(id);
  }, [msg]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMsg('');
      try {
        const [{ data: u }, { data: att }, { data: companyData }] = await Promise.all([
          apiClient.get('/users'),
          apiClient.get('/ops/attendance', {
            params: {
              from: range.from,
              to: range.to,
            },
          }),
          apiClient.get('/company'),
        ]);
        if (cancelled) return;
        setUsers(Array.isArray(u?.items) ? u.items : []);
        setItems(Array.isArray(att?.items) ? att.items : []);
        setCompanyShifts(Array.isArray(companyData?.company?.orgSetup?.shifts) ? companyData.company.orgSetup.shifts : []);
        setWeeklyOffPolicy(normalizeWeeklyOffPolicy(companyData?.company?.orgSetup?.weeklyOff));
        setCompanyHolidays(Array.isArray(companyData?.company?.orgSetup?.holidays) ? companyData.company.orgSetup.holidays : []);
      } catch (e) {
        if (!cancelled) {
          setUsers([]);
          setItems([]);
          setCompanyShifts([]);
          setWeeklyOffPolicy(normalizeWeeklyOffPolicy(null));
          setCompanyHolidays([]);
          setMsg(e?.response?.data?.message || 'Failed to load approval rows.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  useEffect(() => {
    if (employeeFilter === 'all' || viewMode !== 'month') {
      setCalendarLeaves([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get('/ops/leaves', {
          params: { userId: employeeFilter, from: range.from, to: range.to },
        });
        if (!cancelled) setCalendarLeaves(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (!cancelled) setCalendarLeaves([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeFilter, viewMode, range.from, range.to]);

  const usersById = useMemo(() => {
    const out = new Map();
    users.forEach((u) => out.set(String(u._id), u));
    return out;
  }, [users]);

  const employeeOptions = useMemo(
    () =>
      users
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        .map((u) => ({
          value: String(u._id),
          label: employeeSelectLabel(u),
        })),
    [users],
  );
  const employeeSelectOptions = useMemo(
    () => [{ value: 'all', label: 'All employees' }, ...employeeOptions],
    [employeeOptions],
  );
  const statusSelectOptions = useMemo(
    () => [
      { value: 'all', label: 'Status' },
      ...(viewMode === 'day' ? DAY_VIEW_STATUS_OPTIONS : STATUS_OPTIONS).map((s) => ({
        value: s,
        label: s === 'NOT_CHECKED_IN' ? 'Not checked in' : s,
      })),
    ],
    [viewMode],
  );

  const rows = useMemo(() => {
    const baseRows = items
      .map((item) => {
        const user = usersById.get(String(item.userId));
        if (!user) return null;
        const dayKey = item.attendanceDayKey || dayjs(item.attendanceDate || item.createdAt).format('YYYY-MM-DD');
        const newStatus = resolveAttendanceStatus(item);
        const oldStatus = item?.dayStatus === 'PRESENT' ? 'ABSENT' : newStatus;
        const isWeekOff = newStatus === 'HOLIDAY' && isWeeklyOffDate(dayjs(dayKey), weeklyOffPolicy);
        const displayStatus = isWeekOff ? 'WEEK OFF' : newStatus;
        const approvalStatus = String(item.approval?.status || '').toLowerCase();
        const approvalBucket = approvalStatus === 'approved' ? 'APPROVED' : approvalStatus === 'pending' ? 'PENDING' : 'PENDING';
        const shiftId = user?.shiftId ? String(user.shiftId) : '';
        const shift = shiftId ? companyShifts.find((s) => String(s._id) === shiftId) || null : null;
        const shiftLetter = String(shift?.name || 'S').trim().charAt(0).toUpperCase() || 'S';
        const shiftTiming = shift ? formatShiftRange(shift.startTime, shift.endTime) : '';
        return {
          key: `${String(item._id)}:${dayKey}`,
          item,
          user,
          dayKey,
          oldStatus,
          newStatus,
          displayStatus,
          newCheckIn: resolvePunchInRaw(item)
            ? formatAttendanceTimeShort(resolvePunchInRaw(item))
            : '--',
          newCheckOut: resolvePunchOutRaw(item)
            ? formatAttendanceTimeShort(resolvePunchOutRaw(item))
            : '--',
          oldHours: '00 : 00',
          newHours: toHm(resolveWorkedMinutes(item)),
          reason: item.note || (item.leaveKind ? `${item.leaveKind} leave` : ''),
          approval: item.approval || null,
          approvalBucket,
          shift: shift
            ? {
                assigned: true,
                letter: shiftLetter,
                timing: shiftTiming,
              }
            : { assigned: false, letter: 'NA', timing: 'Not assigned' },
          shiftTimes: shift
            ? { startTime: normalizeHmInput(shift.startTime), endTime: normalizeHmInput(shift.endTime) }
            : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => dayjs(b.dayKey).valueOf() - dayjs(a.dayKey).valueOf());

    const mapped =
      viewMode === 'day'
        ? users
            .slice()
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
            .map((user) => {
              const userRow = baseRows.find((r) => String(r.user._id) === String(user._id) && r.dayKey === range.from);
              if (userRow) return userRow;
              const shiftId = user?.shiftId ? String(user.shiftId) : '';
              const shift = shiftId ? companyShifts.find((s) => String(s._id) === shiftId) || null : null;
              const shiftLetter = String(shift?.name || 'S').trim().charAt(0).toUpperCase() || 'S';
              const shiftTiming = shift ? formatShiftRange(shift.startTime, shift.endTime) : '';
              return {
                key: `missing:${String(user._id)}:${range.from}`,
                item: null,
                user,
                dayKey: range.from,
                oldStatus: 'NOT_CHECKED_IN',
                newStatus: 'NOT_CHECKED_IN',
                displayStatus: 'NOT CHECKED IN',
                newCheckIn: '--',
                newCheckOut: '--',
                oldHours: '--',
                newHours: '--',
                reason: '--',
                approval: null,
                approvalBucket: 'NOT_CHECKED_IN',
                shift: shift
                  ? {
                      assigned: true,
                      letter: shiftLetter,
                      timing: shiftTiming,
                    }
                  : { assigned: false, letter: 'NA', timing: 'Not assigned' },
                shiftTimes: shift
                  ? { startTime: normalizeHmInput(shift.startTime), endTime: normalizeHmInput(shift.endTime) }
                  : null,
              };
            })
        : baseRows;

    return mapped
      .filter((r) => (employeeFilter === 'all' ? true : String(r.user._id) === employeeFilter))
      .filter((r) => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'NOT_CHECKED_IN') return r.newStatus === 'NOT_CHECKED_IN';
        if (statusFilter === 'PENDING' || statusFilter === 'APPROVED') return r.approvalBucket === statusFilter;
        return r.newStatus === statusFilter;
      })
      .filter((r) => (dateFilter ? r.dayKey === dateFilter : true));
  }, [items, usersById, employeeFilter, statusFilter, companyShifts, weeklyOffPolicy, dateFilter, viewMode, users, range.from]);

  const approvalMonthPreview = useMemo(() => {
    if (employeeFilter === 'all' || viewMode !== 'month') return null;
    const user = usersById.get(employeeFilter);
    if (!user) return null;
    const userItems = items.filter((i) => String(i.userId) === employeeFilter);
    const byDay = buildAttendanceByDay(userItems);
    const leaveByDay = buildLeaveByDay(calendarLeaves);
    const holidayList = holidaysApplicableToBranch(companyHolidays, user?.branchId);
    const holidayByDay = buildCompanyHolidayByDay(holidayList);
    const calendarDays = buildCalendarDays(anchorDay, 'month', byDay, leaveByDay, holidayByDay);
    const shiftId = user?.shiftId ? String(user.shiftId) : '';
    const shift = shiftId ? companyShifts.find((s) => String(s._id) === shiftId) : null;
    const shiftChip = shift
      ? {
          assigned: true,
          letter: String(shift.name || 'S').trim().charAt(0).toUpperCase() || 'S',
          timing: formatShiftRange(shift.startTime, shift.endTime),
        }
      : { assigned: false, letter: 'NA', timing: 'Not assigned' };
    const present = calendarDays.filter((d) => d.inRange && getOpsCalendarCellMeta(d, weeklyOffPolicy).tone === 'present').length;
    const absent = calendarDays.filter((d) => d.inRange && getOpsCalendarCellMeta(d, weeklyOffPolicy).tone === 'absent').length;
    const leave = calendarDays.filter((d) => {
      if (!d.inRange) return false;
      const t = getOpsCalendarCellMeta(d, weeklyOffPolicy).tone;
      return t === 'leave' || t === 'pending';
    }).length;
    const workingDays = countWorkingDaysInGrid(calendarDays, weeklyOffPolicy);
    const keysInRange = calendarDays.filter((d) => d.inRange).map((d) => d.key);
    const workedMinutes = sumMinutesWorkedForKeys(byDay, keysInRange);
    const expectedMinutes = workingDays * 8 * 60;
    return {
      calendarDays,
      shiftChip,
      stats: { present, absent, leave, workingDays, workedMinutes, expectedMinutes },
    };
  }, [employeeFilter, viewMode, items, calendarLeaves, anchorDay, usersById, companyShifts, weeklyOffPolicy, companyHolidays]);

  const closeApprovalDrawer = () => {
    setActiveRequest(null);
    setApplyShiftTime(false);
    setEditReason('');
    setEditLoginTime(normalizeTimeParts({}));
    setEditLogoutTime(normalizeTimeParts({}, 'PM'));
    setDrawerInitialTimes({
      login: normalizeTimeParts({}),
      logout: normalizeTimeParts({}, 'PM'),
    });
  };
  const selectedSet = useMemo(() => new Set(selectedRowKeys), [selectedRowKeys]);
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);
  const allSelectableKeys = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            r.item?._id &&
            rowHasCheckInAndOut(r) &&
            (!r.approval?.status || r.approval.status === 'none' || r.approval.status === 'pending'),
        )
        .map((r) => r.key),
    [rows],
  );
  const allSelected = allSelectableKeys.length > 0 && allSelectableKeys.every((k) => selectedSet.has(k));

  useEffect(() => {
    setStatusFilter('all');
  }, [viewMode]);

  useEffect(() => {
    setPage(1);
  }, [viewMode, employeeFilter, statusFilter, dateFilter, pageSize]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [rows.length, pageSize, page]);

  useEffect(() => {
    setSelectedRowKeys((old) => old.filter((k) => rows.some((r) => r.key === k)));
  }, [rows]);

  const activeDrawerCanApprove = useMemo(() => {
    if (!activeRequest) return false;
    if (rowHasCheckInAndOut(activeRequest)) return true;
    const inM = parseTimePartsToMinutes(editLoginTime);
    const outM = parseTimePartsToMinutes(editLogoutTime);
    return inM != null && outM != null && outM > inM;
  }, [activeRequest, editLoginTime, editLogoutTime]);

  const performDecision = async (row, nextStatus, editorTimes = null) => {
    if (!row?.user?._id) return;
    setSaving(true);
    setMsg('');
    try {
      const statusNorm = normalizeDayStatusForApi(nextStatus, 'PRESENT');
      const payload = {
        userId: row.user._id,
        status: statusNorm,
        date: row.dayKey,
        approvalAction: statusNorm === 'ABSENT' ? 'rejected' : 'approved',
        ...dayContextForApi(row.dayKey),
        ...buildMarkPunchTimesPayload(row, editorTimes),
      };
      if (statusNorm === 'LEAVE' && row.item?.leaveKind) {
        payload.leaveKind = row.item.leaveKind;
      }
      const { data } = await apiClient.post('/ops/attendance/mark', payload);
      closeApprovalDrawer();
      setMsg(
        statusNorm === 'ABSENT'
          ? 'Marked absent.'
          : statusNorm === 'LEAVE'
            ? 'Leave recorded.'
            : 'Marked present.',
      );
      const it = data?.item;
      if (it) {
        setItems((old) => mergeAttendanceItem(old, { ...it, dayStatus: statusNorm, status: statusNorm }, row.dayKey));
      }
      setSelectedRowKeys((old) => old.filter((k) => k !== row.key));
    } catch (e) {
      setMsg(e?.response?.data?.message || 'Failed to update approval status.');
    } finally {
      setSaving(false);
    }
  };

  const openRequestDrawer = (row) => {
    const login = normalizeTimeParts(wallClockPartsFromStoredUtc(resolvePunchInRaw(row?.item)), 'AM');
    const logout = normalizeTimeParts(wallClockPartsFromStoredUtc(resolvePunchOutRaw(row?.item)), 'PM');
    setDrawerInitialTimes({ login, logout });
    setEditLoginTime(login);
    setEditLogoutTime(logout);
    setEditReason(String(row?.item?.note || row?.reason || '').trim() === '--' ? '' : String(row?.item?.note || row?.reason || ''));
    setApplyShiftTime(false);
    setActiveRequest(row);
  };

  const updateAttendanceDetails = async () => {
    if (!activeRequest?.user?._id) return;
    const loginMins = parseTimePartsToMinutes(editLoginTime);
    if (loginMins == null) {
      setMsg('Enter a valid check-in time.');
      return;
    }
    const logoutMins = parseTimePartsToMinutes(editLogoutTime);
    if (logoutMins != null && logoutMins <= loginMins) {
      setMsg('Check-out must be after check-in.');
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      const payload = {
        userId: activeRequest.user._id,
        timesOnly: true,
        date: activeRequest.dayKey,
        note: editReason.trim(),
        loginTime: editLoginTime,
        ...(logoutMins != null ? { logoutTime: editLogoutTime } : {}),
        ...dayContextForApi(activeRequest.dayKey),
      };
      const { data } = await apiClient.post('/ops/attendance/mark', payload);
      const it = data?.item;
      if (it) {
        setItems((old) => mergeAttendanceItem(old, it, activeRequest.dayKey));
      }
      setMsg('Attendance updated.');
      closeApprovalDrawer();
    } catch (e) {
      setMsg(e?.response?.data?.message || 'Failed to update attendance.');
    } finally {
      setSaving(false);
    }
  };

  const approveFromDrawer = async () => {
    if (!activeRequest?.user?._id) return;
    const stored = rowHasCheckInAndOut(activeRequest);
    const loginMins = parseTimePartsToMinutes(editLoginTime);
    const logoutMins = parseTimePartsToMinutes(editLogoutTime);
    const formOk = loginMins != null && logoutMins != null && logoutMins > loginMins;
    if (!stored && !formOk) {
      setMsg('Both check-in and check-out are required to approve.');
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      const isLeaveDay = normalizeDayStatusForApi(activeRequest.newStatus) === 'LEAVE';
      const payload = {
        userId: activeRequest.user._id,
        status: isLeaveDay ? 'LEAVE' : 'PRESENT',
        date: activeRequest.dayKey,
        approvalAction: 'approved',
        note: editReason.trim(),
        ...dayContextForApi(activeRequest.dayKey),
      };
      if (isLeaveDay && activeRequest.item?.leaveKind) {
        payload.leaveKind = activeRequest.item.leaveKind;
      }
      if (!stored || formOk) {
        payload.loginTime = editLoginTime;
        payload.logoutTime = editLogoutTime;
      }
      const { data } = await apiClient.post('/ops/attendance/mark', payload);
      const it = data?.item;
      if (it) {
        setItems((old) => mergeAttendanceItem(old, it, activeRequest.dayKey));
      }
      setMsg(isLeaveDay ? 'Leave recorded.' : 'Marked present.');
      closeApprovalDrawer();
    } catch (e) {
      setMsg(e?.response?.data?.message || 'Failed to approve.');
    } finally {
      setSaving(false);
    }
  };

  const toggleRowSelect = (rowKey) => {
    setSelectedRowKeys((old) => (old.includes(rowKey) ? old.filter((k) => k !== rowKey) : [...old, rowKey]));
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedRowKeys((old) => old.filter((k) => !allSelectableKeys.includes(k)));
      return;
    }
    setSelectedRowKeys((old) => {
      const next = new Set(old);
      allSelectableKeys.forEach((k) => next.add(k));
      return [...next];
    });
  };

  const bulkApproveSelected = async () => {
    const pendingRows = rows.filter((r) => selectedSet.has(r.key) && r.item?._id && rowHasCheckInAndOut(r));
    if (!pendingRows.length) return;
    setSaving(true);
    setMsg('');
    try {
      const results = await Promise.allSettled(
        pendingRows.map((row) => {
          const isLeaveDay = normalizeDayStatusForApi(row.newStatus) === 'LEAVE';
          const statusForApprove = isLeaveDay ? 'LEAVE' : 'PRESENT';
          return apiClient.post('/ops/attendance/mark', {
            userId: row.user._id,
            status: statusForApprove,
            date: row.dayKey,
            approvalAction: 'approved',
            ...(isLeaveDay && row.item?.leaveKind ? { leaveKind: row.item.leaveKind } : {}),
            ...dayContextForApi(row.dayKey),
          });
        }),
      );
      const successById = new Map();
      let successCount = 0;
      results.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          successCount += 1;
          const row = pendingRows[idx];
          const item = res.value?.data?.item;
          if (row?.item?._id && item) successById.set(String(row.item._id), item);
        }
      });
      if (successCount) {
        setItems((old) => old.map((x) => (successById.has(String(x._id)) ? { ...x, ...successById.get(String(x._id)) } : x)));
        setSelectedRowKeys((old) => old.filter((k) => !pendingRows.some((r) => r.key === k)));
      }
      if (successCount === pendingRows.length) {
        setMsg(`Approved ${successCount} request${successCount === 1 ? '' : 's'}.`);
      } else {
        setMsg(`Approved ${successCount}/${pendingRows.length}. Some rows could not be updated.`);
      }
    } catch (e) {
      setMsg(e?.response?.data?.message || 'Failed to approve selected requests.');
    } finally {
      setSaving(false);
    }
  };

  const shiftLabel = (row) => {
    if (!row?.shift?.assigned) return <span className="text-xs font-semibold text-rose-600">Not assigned</span>;
    const timing = String(row.shift.timing || '');
    const enParts = timing.split(/\s*–\s+/);
    const hyParts = timing.split(/\s+-\s+/);
    const parts = enParts.length >= 2 ? enParts : hyParts.length >= 2 ? hyParts : null;
    const startPart = parts ? parts[0].trim() : timing;
    const endPart = parts && parts.length >= 2 ? parts.slice(1).join(parts === enParts ? ' – ' : ' - ').trim() : '';
    const chip = (
      <span className="shrink-0 text-[10px] font-bold text-slate-500">{row.shift.letter}</span>
    );
    if (!endPart) {
      return (
        <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-dark leading-tight">
          {chip}
          <span className="whitespace-nowrap">{timing}</span>
        </div>
      );
    }
    return (
      <div className="inline-flex flex-col items-start gap-0.5 text-[11px] font-semibold text-dark leading-tight">
        <span className="flex items-center gap-1">
          {chip}
          <span className="whitespace-nowrap">{startPart}</span>
        </span>
        <span className="whitespace-nowrap pl-3.5 text-slate-700">{endPart}</span>
      </div>
    );
  };
  const punchTimesCell = (row) => (
    <div className="space-y-0.5 text-[11px] font-medium leading-snug text-dark">
      <p>In {row.newCheckIn}</p>
      <p>Out {row.newCheckOut}</p>
    </div>
  );

  const punchSelfiesCell = (row) => {
    const checkInSelfie = resolveSelfieUrl(row?.item, 'in');
    const checkOutSelfie = resolveSelfieUrl(row?.item, 'out');
    return (
      <div className="flex flex-col gap-2 text-[11px] leading-4 text-slate-700">
        <div className="flex items-center">
          {checkInSelfie ? (
            <button
              type="button"
              className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-neutral-300"
              title="Check-in selfie"
              onClick={() => setImagePreview({ open: true, url: checkInSelfie, label: 'Check-in selfie' })}
            >
              <img src={checkInSelfie} alt="Check-in selfie" className="h-full w-full object-cover" />
            </button>
          ) : (
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-neutral-300 text-[9px] text-slate-400">
              —
            </span>
          )}
        </div>
        <div className="flex items-center">
          {checkOutSelfie ? (
            <button
              type="button"
              className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-neutral-300"
              title="Check-out selfie"
              onClick={() => setImagePreview({ open: true, url: checkOutSelfie, label: 'Check-out selfie' })}
            >
              <img src={checkOutSelfie} alt="Check-out selfie" className="h-full w-full object-cover" />
            </button>
          ) : (
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-neutral-300 text-[9px] text-slate-400">
              —
            </span>
          )}
        </div>
      </div>
    );
  };

  const punchLocationsCell = (row) => {
    const inAddr = resolvePunchInAddressDisplay(row?.item) || '—';
    const outAddr = resolvePunchOutAddressDisplay(row?.item) || '—';
    return (
      <div className="max-w-[280px] space-y-1.5 text-[11px] leading-snug text-slate-600">
        <p className="break-words" title={inAddr !== '—' ? inAddr : undefined}>
          <span className="font-semibold text-slate-500">In:</span> {inAddr}
        </p>
        <p className="break-words" title={outAddr !== '—' ? outAddr : undefined}>
          <span className="font-semibold text-slate-500">Out:</span> {outAddr}
        </p>
      </div>
    );
  };
  const editAttendanceButton = (row, title = 'Edit attendance') => (
    <button
      type="button"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-slate-600 hover:bg-neutral-50"
      onClick={() => openRequestDrawer(row)}
      title={title}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );

  const approvalCell = (row) => {
    if (!row?.item?._id) {
      if (viewMode === 'day') {
        return (
          <div className="inline-flex flex-wrap items-center gap-2">
            {editAttendanceButton(row)}
            <span className="text-xs font-semibold text-slate-500">Not checked in</span>
          </div>
        );
      }
      return <span className="text-xs font-semibold text-slate-500">Not checked in</span>;
    }

    const status = row.approval?.status;
    const pendingLike = !status || status === 'none' || status === 'pending';
    const showInlineApprove = pendingLike && rowHasCheckInAndOut(row);

    if (status === 'approved') {
      return (
        <div className="inline-flex flex-wrap items-center gap-2">
          {editAttendanceButton(row)}
          <div
            className="inline-flex items-center text-emerald-700"
            title={
              row.approval?.decidedAt
                ? `Approved · ${dayjs(row.approval.decidedAt).format('DD MMM YYYY, h:mm a')}`
                : 'Approved'
            }
          >
            <span className="sr-only">Approved</span>
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="m8.5 12.2 2.2 2.2 4.8-4.8" />
            </svg>
          </div>
        </div>
      );
    }
    if (status === 'rejected') {
      return (
        <div className="inline-flex flex-wrap items-center gap-2">
          {editAttendanceButton(row)}
          <div
            className="inline-flex items-center text-rose-700"
            title={
              row.approval?.decidedAt
                ? `Rejected · ${dayjs(row.approval.decidedAt).format('DD MMM YYYY, h:mm a')}`
                : 'Rejected'
            }
          >
            <span className="sr-only">Rejected</span>
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="m9 9 6 6M15 9l-6 6" />
            </svg>
          </div>
        </div>
      );
    }
    return (
      <div className="inline-flex flex-nowrap items-center gap-2">
        {pendingLike ? (
          showInlineApprove ? (
            <button
              type="button"
              className="shrink-0 rounded-full border border-primary bg-primary px-3 py-1 text-xs font-semibold text-dark hover:brightness-95 disabled:opacity-50"
              disabled={saving}
              onClick={() => {
                const isLeaveDay = normalizeDayStatusForApi(row.newStatus) === 'LEAVE';
                void performDecision(row, isLeaveDay ? 'LEAVE' : 'PRESENT');
              }}
            >
              Approve
            </button>
          ) : (
            <button
              type="button"
              className="shrink-0 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              disabled={saving}
              title="Open the panel to enter check-in and check-out, then use Update and Approve at the bottom."
              onClick={() => openRequestDrawer(row)}
            >
              Set times
            </button>
          )
        ) : null}
        {editAttendanceButton(row)}
      </div>
    );
  };

  return (
    <section className="space-y-4">
      <div className="flux-card space-y-3 p-4">
        {msg ? <p className="text-sm font-medium text-amber-700">{msg}</p> : null}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
            <div className="form-field min-w-[220px] flex-1 md:flex-none">
              <label className="sr-only" htmlFor="approval-employee-filter">
                Employee filter
              </label>
              <UiSelect
                id="approval-employee-filter"
                value={employeeFilter}
                onChange={setEmployeeFilter}
                options={employeeSelectOptions}
                searchable
                className="py-2.5"
                menuClassName="text-sm"
              />
            </div>
            <div className="form-field min-w-[160px] flex-1 md:flex-none">
              <label className="sr-only" htmlFor="approval-status-filter">
                Status filter
              </label>
              <UiSelect
                id="approval-status-filter"
                value={statusFilter}
                onChange={setStatusFilter}
                options={statusSelectOptions}
                className="py-2.5"
                menuClassName="text-sm"
              />
            </div>
            <div className="form-field min-w-[170px] flex-1 md:flex-none">
              <label className="sr-only" htmlFor="approval-date-filter">
                Date filter
              </label>
              <input
                id="approval-date-filter"
                type="date"
                value={dateFilter}
                onChange={(e) => {
                  const next = e.target.value;
                  setDateFilter(next);
                  if (viewMode === 'day' && next) setAnchorDay(next);
                }}
                className="input-base py-2.5 text-sm"
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-end justify-end gap-2 sm:items-center">
            <SelectionCountBadge selectedCount={selectedRowKeys.length} totalCount={rows.length} />
            <TablePagination
              page={page}
              pageSize={pageSize}
              totalCount={rows.length}
              onPageChange={(nextPage) => setPage(Math.max(1, nextPage))}
              onPageSizeChange={(nextSize) => {
                setPageSize(nextSize);
                setPage(1);
              }}
              pageSizeOptions={[10, 25, 50]}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white"
              onClick={() =>
                setAnchorDay((old) =>
                  (viewMode === 'day' ? dayjs(old).subtract(1, 'day') : dayjs(old).subtract(1, 'month')).format('YYYY-MM-DD'),
                )
              }
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m14 6-6 6 6 6" />
              </svg>
            </button>
            <p className="min-w-[120px] text-center text-sm font-semibold text-dark">{range.label}</p>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white"
              onClick={() =>
                setAnchorDay((old) =>
                  (viewMode === 'day' ? dayjs(old).add(1, 'day') : dayjs(old).add(1, 'month')).format('YYYY-MM-DD'),
                )
              }
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m10 6 6 6-6 6" />
              </svg>
            </button>
            </div>
            <div className="flex rounded-full border border-neutral-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setViewMode('day')}
                className={clsx(
                  'rounded-full px-3 py-1 text-xs font-semibold',
                  viewMode === 'day' ? 'bg-primary text-dark' : 'text-slate-600',
                )}
              >
                Day View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('month')}
                className={clsx(
                  'rounded-full px-3 py-1 text-xs font-semibold',
                  viewMode === 'month' ? 'bg-primary text-dark' : 'text-slate-600',
                )}
              >
                Month View
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <SelectionCountBadge selectedCount={selectedRowKeys.length} totalCount={rows.length} />
            <button
              type="button"
              disabled={saving || !selectedRowKeys.length}
              onClick={bulkApproveSelected}
              className="rounded-md border border-primary/70 bg-primary/10 px-3 py-2 text-xs font-semibold text-dark transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Approve selected
            </button>
          </div>
        </div>

        {approvalMonthPreview ? (
          <div className="space-y-3 rounded-xl border border-neutral-200 bg-flux-panel p-4">
            <p className="text-sm font-semibold text-dark">Month calendar — filtered employee</p>
            <p className="text-xs text-slate-500">
              Same rules as Attendance View: week off from organization policy, company holidays, approved / pending leave,
              shift chip, and attendance rows in this month.
            </p>
            <AttendanceStatCards
              present={approvalMonthPreview.stats.present}
              absent={approvalMonthPreview.stats.absent}
              leave={approvalMonthPreview.stats.leave}
              workingDays={approvalMonthPreview.stats.workingDays}
              workedMinutes={approvalMonthPreview.stats.workedMinutes}
              expectedMinutes={approvalMonthPreview.stats.expectedMinutes}
            />
            <AttendanceCalendarGrid
              calendarDays={approvalMonthPreview.calendarDays}
              shiftChip={approvalMonthPreview.shiftChip}
              weeklyOffPolicy={weeklyOffPolicy}
            />
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="min-w-[1040px] w-full text-xs">
            <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-8 px-1 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    disabled={!allSelectableKeys.length}
                    aria-label="Select all rows for approval"
                  />
                </th>
                <th className="w-9 shrink-0 px-0.5 py-2 text-center tabular-nums">SR No.</th>
                <th className="px-2 py-2 text-left">Employee</th>
                <th className="w-[88px] px-2 py-2 text-left">Date</th>
                <th className="px-2 py-2 text-left">Punch details</th>
                <th className="px-2 py-2 text-left">Shift</th>
                <th className="px-2 py-2 text-left">Selfies</th>
                <th className="max-w-[280px] px-2 py-2 text-left">Punch locations</th>
                <th className="w-14 px-2 py-2 text-left">Hour(s)</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-left">Reason</th>
                <th className="px-2 py-2 text-left">Approval status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-2 py-8 text-center text-slate-500">
                    Loading approvals...
                  </td>
                </tr>
              ) : pagedRows.length ? (
                pagedRows.map((row, idx) => (
                  <tr key={row.key} className="border-t border-neutral-100 align-top">
                    <td className="w-8 px-1 py-2">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(row.key)}
                        onChange={() => toggleRowSelect(row.key)}
                        disabled={Boolean(
                          row.approval?.status === 'approved' ||
                            row.approval?.status === 'rejected' ||
                            !row.item?._id ||
                            !rowHasCheckInAndOut(row),
                        )}
                        aria-label={`Select row ${idx + 1}`}
                      />
                    </td>
                    <td className="w-9 shrink-0 px-0.5 py-2 text-center tabular-nums">{(page - 1) * pageSize + idx + 1}</td>
                    <td className="px-2 py-2">
                      <p className="text-xs font-semibold text-dark">{row.user.name || 'Employee'}</p>
                      {(() => {
                        const code = employeeCodeOnly(row.user);
                        return code ? <p className="text-[10px] text-slate-500">{code}</p> : null;
                      })()}
                    </td>
                    <td className="w-[88px] px-2 py-2 whitespace-nowrap">{dayjs(row.dayKey).format('DD MMM YYYY')}</td>
                    <td className="px-2 py-2">{punchTimesCell(row)}</td>
                    <td className="px-2 py-2">{shiftLabel(row)}</td>
                    <td className="px-2 py-2 align-top">{punchSelfiesCell(row)}</td>
                    <td className="max-w-[280px] px-2 py-2 align-top">{punchLocationsCell(row)}</td>
                    <td className="w-14 px-2 py-2">{row.newHours}</td>
                    <td className="px-2 py-2">
                      <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-semibold', statusBadgeClass(row.newStatus))}>
                        {row.displayStatus || row.newStatus}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-[11px] text-slate-600">{row.reason || '--'}</td>
                    <td className="px-2 py-2">{approvalCell(row)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={12} className="px-2 py-8 text-center text-slate-500">
                    No approval rows in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SlideOverPanel
        open={Boolean(activeRequest)}
        onClose={closeApprovalDrawer}
        title="Attendance approval"
        widthClass="sm:max-w-xl"
        footer={
          activeRequest ? (
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={closeApprovalDrawer}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-secondary border-rose-200 text-rose-700 hover:bg-rose-50"
                disabled={saving}
                onClick={() =>
                  void performDecision(activeRequest, 'ABSENT', {
                    loginTime: editLoginTime,
                    logoutTime: editLogoutTime,
                  })
                }
              >
                Absent
              </button>
              <button type="submit" form="attendance-approval-drawer-form" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Update'}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={saving || !activeDrawerCanApprove}
                onClick={() => void approveFromDrawer()}
              >
                Approve
              </button>
            </div>
          ) : null
        }
      >
        {activeRequest ? (
          <form
            id="attendance-approval-drawer-form"
            className="grid gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void updateAttendanceDetails();
            }}
          >
            <div className="rounded-lg border border-neutral-200 bg-flux-panel px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Employee and day</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div className="min-w-0 flex-1">
                  <span className="form-label-muted text-[11px]">Employee</span>
                  <p className="text-sm font-semibold leading-tight text-dark">{activeRequest.user?.name || '—'}</p>
                  {(() => {
                    const codeLine = employeeCodeOnly(activeRequest.user);
                    return codeLine ? <p className="mt-0.5 text-xs text-slate-500">{codeLine}</p> : null;
                  })()}
                </div>
                <div className="min-w-0 text-sm font-semibold leading-snug text-dark sm:max-w-[55%] sm:text-right">
                  <span>{dayjs(activeRequest.dayKey).format('DD MMM YYYY')}</span>
                  <span className="mx-1.5 text-slate-300" aria-hidden>
                    ·
                  </span>
                  {activeRequest.shift?.assigned ? (
                    <span className="font-semibold text-slate-700">{drawerShiftSummaryLine(activeRequest)}</span>
                  ) : (
                    <span className="font-semibold text-rose-600">{drawerShiftSummaryLine(activeRequest)}</span>
                  )}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-neutral-100 pt-2">
                <span className="form-label-muted text-[11px]">Status</span>
                <span
                  className={`inline-flex max-w-[min(100%,14rem)] items-center justify-end truncate rounded-full px-2.5 py-0.5 text-xs font-semibold ${approvalDrawerStatusBadgeClass(activeRequest)}`}
                >
                  {statusLabelForDrawer(activeRequest.displayStatus || activeRequest.newStatus)}
                </span>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="approval-reason" className="form-label-muted">
                Reason
              </label>
              <textarea
                id="approval-reason"
                rows={3}
                className="form-textarea"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Optional note for this attendance"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="form-field min-w-0">
                <span className="form-label-muted">Check-in</span>
                <TimeEditor idPrefix="approval-checkin" value={editLoginTime} onChange={setEditLoginTime} />
              </div>
              <div className="form-field min-w-0">
                <span className="form-label-muted">Check-out</span>
                <TimeEditor
                  idPrefix="approval-checkout"
                  value={editLogoutTime}
                  onChange={setEditLogoutTime}
                  defaultMeridiem="PM"
                />
                <p className="mt-1.5 text-xs text-slate-500">Optional for Update. Leave empty to keep only check-in (clears an existing check-out).</p>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
              <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-dark focus:ring-primary"
                  checked={applyShiftTime}
                  disabled={!activeRequest.shiftTimes}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setApplyShiftTime(checked);
                    if (checked && activeRequest.shiftTimes) {
                      setEditLoginTime(hm24ToEditorParts(activeRequest.shiftTimes.startTime));
                      setEditLogoutTime(hm24ToEditorParts(activeRequest.shiftTimes.endTime));
                    } else {
                      setEditLoginTime(drawerInitialTimes.login);
                      setEditLogoutTime(drawerInitialTimes.logout);
                    }
                  }}
                />
                <span>
                  <span className="font-semibold text-dark">Apply shift time</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                    {activeRequest.shiftTimes
                      ? `Sets check-in and check-out from this employee’s shift (${formatShiftRange(
                          activeRequest.shiftTimes.startTime,
                          activeRequest.shiftTimes.endTime,
                        )}). Uncheck to restore the times shown when you opened this form.`
                      : 'No shift is assigned to this employee. Assign a shift in user details or organization setup to use this shortcut.'}
                  </span>
                </span>
              </label>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-slate-50/90 px-4 py-3 text-xs text-slate-600">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5 text-sm text-slate-800">
                <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Shift</span>
                  {activeRequest.shift?.assigned && activeRequest.shiftTimes?.startTime && activeRequest.shiftTimes?.endTime ? (
                    <span className="font-medium text-dark">
                      {drawerShiftSummaryLine(activeRequest)}
                      {(() => {
                        const d = shiftSlotDurationLabel(activeRequest.shiftTimes.startTime, activeRequest.shiftTimes.endTime);
                        return d ? <span className="font-semibold text-slate-600"> ({d})</span> : null;
                      })()}
                    </span>
                  ) : (
                    <span className="font-medium text-slate-700">{drawerShiftSummaryLine(activeRequest)}</span>
                  )}
                </span>
                <span className="text-slate-300" aria-hidden>
                  ·
                </span>
                <span className="inline-flex items-baseline gap-x-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Work hours</span>
                  <span className="font-semibold text-dark">
                    {(() => {
                      const inM = parseTimePartsToMinutes(editLoginTime);
                      const outM = parseTimePartsToMinutes(editLogoutTime);
                      if (inM == null || outM == null || outM <= inM) return '—';
                      const delta = outM - inM;
                      const hh = Math.floor(delta / 60);
                      const mm = delta % 60;
                      return `${hh}h ${mm}m`;
                    })()}
                  </span>
                </span>
                {resolvePunchInRaw(activeRequest.item) || resolvePunchOutRaw(activeRequest.item) ? (
                  <>
                    <span className="text-slate-300" aria-hidden>
                      ·
                    </span>
                    <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Original</span>
                      <span className="text-slate-700">
                        <span className="text-slate-500">In </span>
                        {resolvePunchInRaw(activeRequest.item) ? (
                          <AttendanceClockSmallMeridiem iso={resolvePunchInRaw(activeRequest.item)} />
                        ) : (
                          '—'
                        )}
                        {resolvePunchOutRaw(activeRequest.item) ? (
                          <>
                            <span className="text-slate-300"> · </span>
                            <span className="text-slate-500">Out </span>
                            <AttendanceClockSmallMeridiem iso={resolvePunchOutRaw(activeRequest.item)} />
                          </>
                        ) : null}
                      </span>
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </form>
        ) : null}
      </SlideOverPanel>
      {imagePreview.open ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setImagePreview({ open: false, url: '', label: '' })}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <button
              type="button"
              className="absolute -right-2 -top-2 rounded-full bg-white px-2 py-1 text-xs font-semibold text-dark shadow"
              onClick={() => setImagePreview({ open: false, url: '', label: '' })}
            >
              Close
            </button>
            <img
              src={imagePreview.url}
              alt={imagePreview.label || 'Selfie preview'}
              className="max-h-[90vh] max-w-[90vw] rounded-lg bg-white object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default AttendanceApprovalPage;

function TimeEditor({ value, onChange, defaultMeridiem = 'AM', idPrefix = 'time' }) {
  const base = idPrefix || 'time';
  return (
    <div className="flex flex-nowrap items-center gap-1">
      <input
        id={`${base}-hh`}
        className="form-input w-12 shrink-0 px-1.5 py-1.5 text-center text-sm tabular-nums"
        placeholder="HH"
        inputMode="numeric"
        autoComplete="off"
        value={value.hh}
        onChange={(e) => onChange({ ...value, hh: e.target.value.replace(/\D/g, '').slice(0, 2) })}
      />
      <span className="shrink-0 text-slate-400">:</span>
      <input
        id={`${base}-mm`}
        className="form-input w-12 shrink-0 px-1.5 py-1.5 text-center text-sm tabular-nums"
        placeholder="MM"
        inputMode="numeric"
        autoComplete="off"
        value={value.mm}
        onChange={(e) => onChange({ ...value, mm: e.target.value.replace(/\D/g, '').slice(0, 2) })}
      />
      <select
        id={`${base}-ampm`}
        className="form-select h-9 w-[3.65rem] max-w-[3.65rem] shrink-0 py-1.5 pl-1.5 pr-8 text-center text-xs font-semibold tabular-nums"
        value={value.meridiem || defaultMeridiem}
        onChange={(e) => onChange({ ...value, meridiem: e.target.value })}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
