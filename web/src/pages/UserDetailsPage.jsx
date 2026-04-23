import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import apiClient from '../api/client';
import UiSelect from '../components/common/UiSelect';
import { USER_ROLES } from '../constants/rbac';
import { formatShiftRange } from '../utils/shiftTime';
import { EMPLOYEE_PROFILE_SECTIONS, mergeEmployeeProfile } from '../constants/employeeProfile';
import CustomFieldDisplay from '../components/customFields/CustomFieldDisplay';
import { normalizeWeeklyOffPolicy } from '../utils/weeklyOff';
import {
  buildAttendanceByDay,
  buildCalendarDays,
  buildLeaveByDay,
  countWorkingDaysInGrid,
  fetchRangeForAnchor,
  getOpsCalendarCellMeta,
  sumMinutesWorkedForKeys,
} from '../utils/attendanceCalendar';
import { buildCompanyHolidayByDay, holidaysApplicableToBranch } from '../utils/companyHolidays';
import AttendanceStatCards from '../components/attendance/AttendanceStatCards';
import AttendanceCalendarGrid from '../components/attendance/AttendanceCalendarGrid';

function statusChip(status) {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-800';
  if (status === 'rejected') return 'bg-rose-100 text-rose-800';
  return 'bg-amber-100 text-amber-800';
}

const USER_DETAIL_TABS = [
  { id: 'personalInfo', label: 'Personal Info' },
  { id: 'generalInfo', label: 'General Info' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'leave', label: 'Leave' },
  { id: 'visits', label: 'Visits' },
];

function UserDetailsPage() {
  const navigate = useNavigate();
  const { setGlobalSearch } = useOutletContext() || {};
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('personalInfo');
  const [allUsers, setAllUsers] = useState([]);
  const [company, setCompany] = useState(null);
  const [user, setUser] = useState(null);
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'field_agent', shiftId: '', isActive: true });
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [visits, setVisits] = useState([]);
  const [visitStatus, setVisitStatus] = useState('');
  const [visitDateFrom, setVisitDateFrom] = useState('');
  const [visitDateTo, setVisitDateTo] = useState('');
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: usersData }, { data: companyData }, , { data: leavesData }, { data: visitsData }] = await Promise.all([
          apiClient.get('/users'),
          apiClient.get('/company'),
          apiClient.get(`/ops/attendance?userId=${encodeURIComponent(id)}`),
          apiClient.get(`/ops/leaves?userId=${encodeURIComponent(id)}`),
          apiClient.get('/company-visits/company', {
            params: {
              userId: id,
              limit: 100,
            },
          }),
        ]);
      const users = Array.isArray(usersData?.items) ? usersData.items : [];
      setAllUsers(users);
      setCompany(companyData?.company || null);
      const found = users.find((u) => String(u._id) === String(id)) || null;
      setUser(found);
      if (found) {
        setForm({
          name: found.name || '',
          email: found.email || '',
          phone: found.phone || '',
          role: found.role || 'field_agent',
          shiftId: found.shiftId ? String(found.shiftId) : '',
          isActive: Boolean(found.isActive),
        });
      }
      setLeaves(Array.isArray(leavesData?.items) ? leavesData.items : []);
      setVisits(Array.isArray(visitsData?.items) ? visitsData.items : []);
    } catch (e) {
      setError(e.response?.data?.message || 'Unable to load employee details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    (async () => {
      const { from, to } = fetchRangeForAnchor(selectedDate, 'month');
      try {
        const { data } = await apiClient.get('/ops/attendance', { params: { userId: id, from, to } });
        if (!cancelled) setAttendance(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (!cancelled) setAttendance([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, selectedDate]);

  useEffect(() => {
    if (typeof setGlobalSearch !== 'function') return undefined;
    setGlobalSearch('');
    return () => setGlobalSearch('');
  }, [setGlobalSearch]);

  const weeklyOffPolicy = useMemo(() => normalizeWeeklyOffPolicy(company?.orgSetup?.weeklyOff), [company]);

  const companyHolidayByDay = useMemo(() => {
    const list = holidaysApplicableToBranch(company?.orgSetup?.holidays, user?.branchId);
    return buildCompanyHolidayByDay(list);
  }, [company?.orgSetup?.holidays, user?.branchId]);

  const attendanceByDay = useMemo(() => buildAttendanceByDay(attendance), [attendance]);
  const leaveByDay = useMemo(() => buildLeaveByDay(leaves), [leaves]);
  const calendarDays = useMemo(
    () => buildCalendarDays(selectedDate, 'month', attendanceByDay, leaveByDay, companyHolidayByDay),
    [selectedDate, attendanceByDay, leaveByDay, companyHolidayByDay],
  );
  const attendanceStats = useMemo(() => {
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
  const filteredVisits = useMemo(() => {
    return visits
      .filter((v) => !visitStatus || String(v.status || '').toLowerCase() === visitStatus)
      .filter((v) => {
        if (!visitDateFrom) return true;
        const checkIn = v.checkInTime ? dayjs(v.checkInTime) : null;
        return checkIn ? !checkIn.isBefore(dayjs(visitDateFrom).startOf('day')) : false;
      })
      .filter((v) => {
        if (!visitDateTo) return true;
        const checkIn = v.checkInTime ? dayjs(v.checkInTime) : null;
        return checkIn ? !checkIn.isAfter(dayjs(visitDateTo).endOf('day')) : false;
      });
  }, [visits, visitStatus, visitDateFrom, visitDateTo]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiClient.put(`/users/${id}`, {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        role: form.role,
        shiftId: form.shiftId || '',
        isActive: form.isActive,
      });
      setMessage('Details saved.');
      setIsProfileEditing(false);
      await loadAll();
    } catch (e2) {
      setError(e2.response?.data?.message || 'Unable to update employee.');
    } finally {
      setSaving(false);
    }
  };

  const employeeProfile = useMemo(() => mergeEmployeeProfile(user?.employeeProfile), [user]);

  const shiftOptions = useMemo(
    () => [{ value: '', label: 'No shift' }, ...(company?.orgSetup?.shifts || []).map((s) => ({ value: String(s._id), label: s.name }))],
    [company],
  );

  const userShift = useMemo(() => {
    const sid = user?.shiftId != null ? String(user.shiftId).trim() : '';
    if (!sid || !company?.orgSetup?.shifts?.length) return null;
    return company.orgSetup.shifts.find((s) => String(s._id) === sid) || null;
  }, [user, company]);

  const shiftChip = useMemo(() => {
    if (!userShift) return { assigned: false, letter: 'NA', timing: 'Not assigned' };
    const letter = String(userShift.name || 'S').trim().charAt(0).toUpperCase() || 'S';
    return {
      assigned: true,
      letter,
      timing: formatShiftRange(userShift.startTime, userShift.endTime),
    };
  }, [userShift]);

  const attendanceBranchLabel = useMemo(() => {
    const bid = user?.branchId ? String(user.branchId) : '';
    const list = Array.isArray(company?.branches) ? company.branches : [];
    const b = list.find((x) => String(x._id) === bid);
    if (!b) return '—';
    return b.code ? `${b.name} (${b.code})` : String(b.name || '—');
  }, [user, company]);

  const managerName = (userId) => {
    if (!userId) return '—';
    const m = allUsers.find((u) => String(u._id) === String(userId));
    return m ? m.name || m.email : String(userId);
  };

  if (loading) return <p className="text-sm text-slate-500">Loading employee details...</p>;
  if (!user) return <p className="alert-error">Employee not found.</p>;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-slate-600 transition hover:bg-neutral-50"
            onClick={() => navigate('/dashboard/users')}
            title="Back to employees"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <div>
            <p className="text-lg font-bold text-dark">{user.name}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
            {user.employeeCode ? <p className="text-xs text-slate-500">Employee code: {user.employeeCode}</p> : null}
          </div>
        </div>
        <div>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
              user.isActive ? 'border-emerald-200 bg-emerald-100 text-emerald-800' : 'border-slate-300 bg-slate-100 text-slate-700'
            }`}
          >
            {user.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      <div className="inline-flex rounded-full border border-neutral-200 bg-white p-1 shadow-sm">
        {USER_DETAIL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              activeTab === tab.id ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-neutral-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="alert-error">{error}</p>}
      {message && <p className="alert-success">{message}</p>}

      {activeTab === 'personalInfo' && (
        <div className="space-y-4">
          <form className="flux-card grid gap-4 p-5 shadow-panel-lg md:grid-cols-2" onSubmit={saveProfile}>
            <div className="md:col-span-2 flex justify-end">
              {!isProfileEditing ? (
                <button type="button" className="btn-secondary" onClick={() => setIsProfileEditing(true)}>
                  Edit
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setIsProfileEditing(false);
                    setForm({
                    name: user.name || '',
                    email: user.email || '',
                    phone: user.phone || '',
                    role: user.role || 'field_agent',
                    shiftId: user.shiftId ? String(user.shiftId) : '',
                    isActive: Boolean(user.isActive),
                  });
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
            <div className="form-field">
              <label className="form-label-muted">Name</label>
              <input
                className="form-input"
                value={form.name}
                onChange={(e) => setForm((o) => ({ ...o, name: e.target.value }))}
                required
                disabled={!isProfileEditing}
              />
            </div>
            <div className="form-field">
              <label className="form-label-muted">Email</label>
              <input
                type="email"
                className="form-input"
                value={form.email}
                onChange={(e) => setForm((o) => ({ ...o, email: e.target.value }))}
                required
                disabled={!isProfileEditing}
              />
            </div>
            <div className="form-field">
              <label className="form-label-muted">Phone</label>
              <input
                className="form-input"
                value={form.phone}
                onChange={(e) => setForm((o) => ({ ...o, phone: e.target.value }))}
                disabled={!isProfileEditing}
              />
            </div>
            <div className="form-field">
            <label className="form-label-muted">Role</label>
            <UiSelect value={form.role} onChange={(value) => setForm((o) => ({ ...o, role: value }))} options={USER_ROLES} disabled={!isProfileEditing} />
          </div>
          <div className="form-field md:col-span-2">
            <label className="form-label-muted">Work shift</label>
            <UiSelect
              value={form.shiftId}
              onChange={(value) => setForm((o) => ({ ...o, shiftId: value }))}
              options={shiftOptions}
              disabled={!isProfileEditing}
            />
            <p className="mt-1 text-xs text-slate-500">Shown on the Attendance calendar as expected working hours.</p>
          </div>
          <label className="md:col-span-2 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="form-checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((o) => ({ ...o, isActive: e.target.checked }))}
                disabled={!isProfileEditing}
              />
              Active
            </label>
            {isProfileEditing && (
              <div className="md:col-span-2 flex justify-end">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save details'}
                </button>
              </div>
            )}
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">HR and onboarding fields stored on this employee.</p>
            <button type="button" className="btn-primary text-sm" onClick={() => navigate(`/dashboard/users/${id}/employee`)}>
              Edit full record
            </button>
          </div>
          {EMPLOYEE_PROFILE_SECTIONS.map((section) => (
            <div key={section.title} className="flux-card p-5 shadow-panel-lg">
              <h3 className="text-sm font-bold uppercase tracking-wide text-primary">{section.title}</h3>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                {section.fields.map(([key, label]) => {
                  let val = employeeProfile[key];
                  if (key === 'reportingManagerId' || key === 'secondaryReportingManagerId') {
                    val = managerName(val);
                  } else if (val == null || val === '') {
                    val = '—';
                  } else if (typeof val === 'object') {
                    val = JSON.stringify(val);
                  } else {
                    val = String(val);
                  }
                  return (
                    <div key={key} className="min-w-0">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-dark">{val}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
          {(company?.employeeCustomFieldDefs || []).length > 0 && (
            <div className="flux-card p-5 shadow-panel-lg">
              <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Custom fields</h3>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                {(company.employeeCustomFieldDefs || [])
                  .filter((d) => d.isActive !== false)
                  .map((d) => (
                  <div key={d.key} className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{d.label}</dt>
                    <dd className="mt-1 text-sm text-dark">
                      <CustomFieldDisplay def={d} value={employeeProfile.custom?.[d.key]} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <div className="flux-card overflow-auto p-5 shadow-panel-lg">
            <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Work experience</h3>
            {!employeeProfile.workExperience?.length ? (
              <p className="mt-3 text-sm text-slate-500">No entries.</p>
            ) : (
              <table className="mt-4 min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2 pr-2">Company</th>
                    <th className="py-2 pr-2">Role</th>
                    <th className="py-2 pr-2">From</th>
                    <th className="py-2 pr-2">To</th>
                    <th className="py-2">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeProfile.workExperience.map((row, i) => (
                    <tr key={`we-${i}`} className="border-b border-neutral-100">
                      <td className="py-2 pr-2">{row.company || '—'}</td>
                      <td className="py-2 pr-2">{row.role || '—'}</td>
                      <td className="py-2 pr-2">{row.from || '—'}</td>
                      <td className="py-2 pr-2">{row.to || '—'}</td>
                      <td className="py-2 whitespace-pre-wrap">{row.summary || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flux-card overflow-auto p-5 shadow-panel-lg">
            <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Education</h3>
            {!employeeProfile.education?.length ? (
              <p className="mt-3 text-sm text-slate-500">No entries.</p>
            ) : (
              <table className="mt-4 min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2 pr-2">Institute</th>
                    <th className="py-2 pr-2">Specialization</th>
                    <th className="py-2 pr-2">Degree</th>
                    <th className="py-2">Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeProfile.education.map((row, i) => (
                    <tr key={`ed-${i}`} className="border-b border-neutral-100">
                      <td className="py-2 pr-2">{row.instituteName || '—'}</td>
                      <td className="py-2 pr-2">{row.specialization || '—'}</td>
                      <td className="py-2 pr-2">{row.degree || '—'}</td>
                      <td className="py-2">{row.dateOfCompletion || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'generalInfo' && (
        <div className="flux-card space-y-4 p-5 shadow-panel-lg">
          <h3 className="text-sm font-bold uppercase tracking-wide text-primary">General Info</h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Employee code</dt>
              <dd className="mt-1 text-sm text-dark">{user.employeeCode || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Branch</dt>
              <dd className="mt-1 text-sm text-dark">{attendanceBranchLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shift assigned</dt>
              <dd className="mt-1 text-sm text-dark">
                {userShift ? (
                  <>
                    <p className="font-semibold">{userShift.name}</p>
                    <p className="text-slate-600">{formatShiftRange(userShift.startTime, userShift.endTime)}</p>
                  </>
                ) : (
                  'No shift assigned'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Joined date</dt>
              <dd className="mt-1 text-sm text-dark">
                {employeeProfile.dateOfJoining && dayjs(employeeProfile.dateOfJoining).isValid()
                  ? dayjs(employeeProfile.dateOfJoining).format('DD MMM YYYY')
                  : '—'}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="flux-card space-y-4 p-4 shadow-panel-lg">
          {userShift ? (
            <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
              <p className="font-bold text-dark">Assigned shift: {userShift.name}</p>
              <p className="mt-0.5 text-slate-700">{formatShiftRange(userShift.startTime, userShift.endTime)}</p>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-neutral-200 bg-flux-panel px-4 py-3 text-sm text-slate-600">
              No work shift assigned. Set one under Personal Info → Work shift or in Organization setup → Shifts.
            </p>
          )}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="form-field max-w-[260px]">
              <label className="form-label-muted">Month</label>
              <div className="relative">
                <input
                  type="date"
                  className="form-input pr-10"
                  value={selectedDate}
                  max={dayjs().format('YYYY-MM-DD')}
                  onChange={(e) => setSelectedDate(e.target.value || dayjs().format('YYYY-MM-DD'))}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-slate-500" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <rect x="3" y="4.5" width="18" height="16" rx="2" />
                    <path d="M8 3v3M16 3v3M3 9.5h18" />
                  </svg>
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Calendar grid for {dayjs(selectedDate).format('MMMM YYYY')} (Mon–Sun)</p>
            </div>
            <p className="text-sm text-slate-500">
              Days with check-in: <strong className="text-dark">{attendanceByDay.size}</strong>
            </p>
          </div>
          <AttendanceStatCards
            present={attendanceStats.present}
            absent={attendanceStats.absent}
            leave={attendanceStats.leave}
            workingDays={attendanceStats.workingDays}
            workedMinutes={attendanceStats.workedMinutes}
            expectedMinutes={attendanceStats.expectedMinutes}
          />
          <AttendanceCalendarGrid calendarDays={calendarDays} shiftChip={shiftChip} weeklyOffPolicy={weeklyOffPolicy} />
        </div>
      )}

      {activeTab === 'leave' && (
        <div className="flux-card overflow-auto p-4 shadow-panel-lg">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">From</th>
                <th>To</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {leaves.map((lv) => (
                <tr key={lv._id} className="border-t border-neutral-100">
                  <td className="py-2">{dayjs(lv.startDate).format('DD MMM YYYY')}</td>
                  <td>{dayjs(lv.endDate).format('DD MMM YYYY')}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusChip(lv.status)}`}>{lv.status}</span>
                  </td>
                  <td>{lv.reason || '-'}</td>
                </tr>
              ))}
              {!leaves.length && (
                <tr>
                  <td colSpan={4} className="py-4 text-slate-500">
                    No leave records yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'visits' && (
        <div className="flux-card overflow-auto p-4 shadow-panel-lg">
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <div className="form-field">
              <label className="mb-1 block text-[10px] font-semibold uppercase leading-tight tracking-wide text-primary sm:text-[11px]">
                Status
              </label>
              <UiSelect
                value={visitStatus}
                onChange={setVisitStatus}
                options={[
                  { value: '', label: 'All statuses' },
                  { value: 'open', label: 'Open' },
                  { value: 'completed', label: 'Completed' },
                ]}
              />
            </div>
            <div className="form-field">
              <label className="mb-1 block text-[10px] font-semibold uppercase leading-tight tracking-wide text-primary sm:text-[11px]">
                From
              </label>
              <input type="date" className="form-input" value={visitDateFrom} onChange={(e) => setVisitDateFrom(e.target.value)} />
            </div>
            <div className="form-field">
              <label className="mb-1 block text-[10px] font-semibold uppercase leading-tight tracking-wide text-primary sm:text-[11px]">
                To
              </label>
              <input type="date" className="form-input" value={visitDateTo} onChange={(e) => setVisitDateTo(e.target.value)} />
            </div>
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Company</th>
                <th>Customer</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredVisits.map((v) => (
                  <tr
                    key={v._id}
                    className="cursor-pointer border-t border-neutral-100 hover:bg-slate-50"
                    onClick={() => navigate(`/dashboard/track/visits/${v._id}`)}
                    title="Open visit details"
                  >
                    <td className="py-2">{v.companyName || '-'}</td>
                    <td>{v.customerName || '-'}</td>
                    <td>{v.checkInTime ? dayjs(v.checkInTime).format('DD MMM YYYY hh:mm A') : '-'}</td>
                    <td>{v.checkOutTime ? dayjs(v.checkOutTime).format('DD MMM YYYY hh:mm A') : '-'}</td>
                    <td>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                          String(v.status || '').toLowerCase() === 'completed'
                            ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                            : 'border-sky-300 bg-sky-100 text-sky-800'
                        }`}
                      >
                        {v.status || '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              {!filteredVisits.length && (
                <tr>
                  <td colSpan={5} className="py-4 text-slate-500">
                    No visits found for selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default UserDetailsPage;
