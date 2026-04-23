import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import apiClient from '../api/client';
import UiSelect from '../components/common/UiSelect';
import AttendanceStatCards from '../components/attendance/AttendanceStatCards';
import AttendancePeriodNav, { formatNavLabel } from '../components/attendance/AttendancePeriodNav';
import AttendanceCalendarGrid from '../components/attendance/AttendanceCalendarGrid';
import {
  countWorkingDaysInGrid,
  getOpsCalendarCellMeta,
  sumMinutesWorkedForKeys,
} from '../utils/attendanceCalendar';
import { formatShiftRange } from '../utils/shiftTime';
import { normalizeWeeklyOffPolicy } from '../utils/weeklyOff';
import { useAttendanceRecordsForRange } from '../hooks/useAttendanceRecordsForRange';
import { buildCompanyHolidayByDay, holidaysApplicableToBranch } from '../utils/companyHolidays';
import { employeeSelectLabel } from '../utils/employeeSelectLabel';

function EmployeeAttendanceViewPage() {
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState('');
  const [anchorYmd, setAnchorYmd] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [viewMode, setViewMode] = useState('month');
  const [companyShifts, setCompanyShifts] = useState([]);
  const [weeklyOffPolicy, setWeeklyOffPolicy] = useState(() => normalizeWeeklyOffPolicy(null));
  const [companyHolidays, setCompanyHolidays] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const selectedUser = useMemo(
    () => users.find((u) => String(u._id) === String(userId)) || null,
    [users, userId],
  );

  const companyHolidayByDay = useMemo(() => {
    const list = holidaysApplicableToBranch(companyHolidays, selectedUser?.branchId);
    return buildCompanyHolidayByDay(list);
  }, [companyHolidays, selectedUser?.branchId]);

  const {
    calendarDays,
    attendanceByDay,
    loading: attLoading,
    error: attRangeError,
  } = useAttendanceRecordsForRange({
    userId,
    anchorYmd,
    viewMode,
    enabled: Boolean(userId),
    companyHolidayByDay,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setUsersLoading(true);
      try {
        const [{ data: usersData }, { data: companyData }] = await Promise.all([
          apiClient.get('/users'),
          apiClient.get('/company'),
        ]);
        if (!cancelled) {
          setUsers(Array.isArray(usersData?.items) ? usersData.items : []);
          setCompanyShifts(Array.isArray(companyData?.company?.orgSetup?.shifts) ? companyData.company.orgSetup.shifts : []);
          setWeeklyOffPolicy(normalizeWeeklyOffPolicy(companyData?.company?.orgSetup?.weeklyOff));
          setCompanyHolidays(Array.isArray(companyData?.company?.orgSetup?.holidays) ? companyData.company.orgSetup.holidays : []);
        }
      } catch {
        if (!cancelled) {
          setUsers([]);
          setCompanyShifts([]);
          setWeeklyOffPolicy(normalizeWeeklyOffPolicy(null));
          setCompanyHolidays([]);
        }
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (userId) return;
    if (!users.length) return;
    const sorted = [...users].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    setUserId(String(sorted[0]._id));
  }, [users, userId]);

  const userOptions = useMemo(
    () =>
      users.map((u) => ({
        value: String(u._id),
        label: employeeSelectLabel(u),
      })),
    [users],
  );

  const stats = useMemo(() => {
    const present = calendarDays.filter((d) => d.inRange && getOpsCalendarCellMeta(d, weeklyOffPolicy).tone === 'present').length;
    const absent = calendarDays.filter((d) => d.inRange && getOpsCalendarCellMeta(d, weeklyOffPolicy).tone === 'absent').length;
    const leave = calendarDays.filter((d) => {
      if (!d.inRange) return false;
      const t = getOpsCalendarCellMeta(d, weeklyOffPolicy).tone;
      return t === 'leave' || t === 'pending';
    }).length;
    const workingDays = countWorkingDaysInGrid(calendarDays, weeklyOffPolicy);
    const keysInRange = calendarDays.filter((d) => d.inRange).map((d) => d.key);
    const workedMinutes = sumMinutesWorkedForKeys(attendanceByDay, keysInRange);
    const expectedMinutes = workingDays * 8 * 60;
    return { present, absent, leave, workingDays, workedMinutes, expectedMinutes };
  }, [calendarDays, attendanceByDay, weeklyOffPolicy]);

  const onPrev = () => {
    setAnchorYmd((prev) => dayjs(prev).subtract(1, 'month').format('YYYY-MM-DD'));
  };

  const onNext = () => {
    setAnchorYmd((prev) => dayjs(prev).add(1, 'month').format('YYYY-MM-DD'));
  };

  const navLabel = formatNavLabel(anchorYmd, viewMode);
  const selectedShift = useMemo(() => {
    const sid = selectedUser?.shiftId ? String(selectedUser.shiftId) : '';
    if (!sid) return null;
    return companyShifts.find((s) => String(s._id) === sid) || null;
  }, [selectedUser, companyShifts]);
  const shiftChip = useMemo(() => {
    if (!selectedShift) return { assigned: false, letter: 'NA', timing: 'Not assigned' };
    const letter = String(selectedShift.name || 'S').trim().charAt(0).toUpperCase() || 'S';
    return {
      assigned: true,
      letter,
      timing: formatShiftRange(selectedShift.startTime, selectedShift.endTime),
    };
  }, [selectedShift]);

  return (
    <section className="space-y-4">
      <div className="flux-card space-y-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="form-field min-w-[min(100%,20rem)] max-w-md flex-1">
            <label className="form-label-muted" htmlFor="attendance-employee">
              Employee
            </label>
            <UiSelect
              id="attendance-employee"
              value={userId}
              onChange={setUserId}
              options={userOptions.length ? userOptions : [{ value: '', label: 'No employees' }]}
              searchable
              disabled={!userOptions.length}
            />
          </div>
        </div>

        <AttendancePeriodNav
          viewMode={viewMode}
          onViewMode={setViewMode}
          anchorYmd={anchorYmd}
          labelText={navLabel}
          onPrev={onPrev}
          onNext={onNext}
          disabled={usersLoading || attLoading || !userId}
          showWeekView={false}
        />

        {attRangeError ? <p className="text-sm font-medium text-rose-700">{attRangeError}</p> : null}

        <AttendanceStatCards
          present={stats.present}
          absent={stats.absent}
          leave={stats.leave}
          workingDays={stats.workingDays}
          workedMinutes={stats.workedMinutes}
          expectedMinutes={stats.expectedMinutes}
        />

        {usersLoading || attLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : !userId ? (
          <p className="text-sm text-slate-500">Select an employee to load the calendar.</p>
        ) : (
          <AttendanceCalendarGrid calendarDays={calendarDays} shiftChip={shiftChip} weeklyOffPolicy={weeklyOffPolicy} />
        )}
      </div>
    </section>
  );
}

export default EmployeeAttendanceViewPage;
