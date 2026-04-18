import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import apiClient from '../api/client';
import UiSelect from '../components/common/UiSelect';
import { USER_ROLES } from '../constants/rbac';

function toDayKey(v) {
  return dayjs(v).format('YYYY-MM-DD');
}

function buildAttendanceByDay(records) {
  const byDay = new Map();
  (records || []).forEach((r) => {
    const k = toDayKey(r.checkInAt || r.createdAt);
    const prev = byDay.get(k);
    if (!prev) {
      byDay.set(k, { ...r });
      return;
    }
    const prevIn = dayjs(prev.checkInAt || prev.createdAt).valueOf();
    const curIn = dayjs(r.checkInAt || r.createdAt).valueOf();
    const earliest = curIn < prevIn ? r : prev;
    const latestOut = [prev.checkOutAt, r.checkOutAt]
      .filter(Boolean)
      .map((t) => dayjs(t))
      .sort((a, b) => a.valueOf() - b.valueOf())
      .at(-1);
    byDay.set(k, {
      ...earliest,
      checkOutAt: latestOut ? latestOut.toISOString() : earliest.checkOutAt || null,
      minutesWorked: Number(prev.minutesWorked || 0) + Number(r.minutesWorked || 0),
    });
  });
  return byDay;
}

function buildLeaveByDay(items) {
  const out = new Map();
  (items || []).forEach((lv) => {
    let cur = dayjs(lv.startDate).startOf('day');
    const end = dayjs(lv.endDate).startOf('day');
    if (!cur.isValid() || !end.isValid()) return;
    while (cur.valueOf() <= end.valueOf()) {
      const k = cur.format('YYYY-MM-DD');
      const old = out.get(k);
      if (!old || old.status === 'pending') out.set(k, lv);
      cur = cur.add(1, 'day');
    }
  });
  return out;
}

function statusChip(status) {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-800';
  if (status === 'rejected') return 'bg-rose-100 text-rose-800';
  return 'bg-amber-100 text-amber-800';
}

function getAttendanceDayMeta({ date, inMonth, att, leave }) {
  if (!inMonth) return { key: 'out', label: '', className: '' };
  if (date.day() === 0) {
    return { key: 'holiday', label: 'Holiday', className: 'bg-violet-100 text-violet-800' };
  }
  if (leave) {
    const leaveLabel = leave.status === 'approved' ? 'Leave' : `Leave (${leave.status})`;
    return { key: 'leave', label: leaveLabel, className: statusChip(leave.status) };
  }
  if (att) {
    return { key: 'present', label: 'Present', className: 'bg-emerald-100 text-emerald-800' };
  }
  if (date.endOf('day').isBefore(dayjs())) {
    return { key: 'absent', label: 'Absent', className: 'bg-rose-100 text-rose-800' };
  }
  return { key: 'future', label: '', className: '' };
}

function UserDetailsPage() {
  const navigate = useNavigate();
  const { setGlobalSearch } = useOutletContext() || {};
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('profile');
  const [user, setUser] = useState(null);
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'field_agent', isActive: true });
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
      const [{ data: usersData }, { data: attendanceData }, { data: leavesData }, { data: visitsData }] = await Promise.all([
        apiClient.get('/users'),
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
      const found = users.find((u) => String(u._id) === String(id)) || null;
      setUser(found);
      if (found) {
        setForm({
          name: found.name || '',
          email: found.email || '',
          phone: found.phone || '',
          role: found.role || 'field_agent',
          isActive: Boolean(found.isActive),
        });
      }
      setAttendance(Array.isArray(attendanceData?.items) ? attendanceData.items : []);
      setLeaves(Array.isArray(leavesData?.items) ? leavesData.items : []);
      setVisits(Array.isArray(visitsData?.items) ? visitsData.items : []);
    } catch (e) {
      setError(e.response?.data?.message || 'Unable to load user details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (typeof setGlobalSearch !== 'function') return undefined;
    setGlobalSearch('');
    return () => setGlobalSearch('');
  }, [setGlobalSearch]);

  const attendanceByDay = useMemo(() => buildAttendanceByDay(attendance), [attendance]);
  const leaveByDay = useMemo(() => buildLeaveByDay(leaves), [leaves]);
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

  const calendarDays = useMemo(() => {
    const first = dayjs(selectedDate).startOf('month');
    const start = first.startOf('week');
    const end = first.endOf('month').endOf('week');
    const days = [];
    let cur = start;
    while (cur.valueOf() <= end.valueOf()) {
      const key = cur.format('YYYY-MM-DD');
      days.push({
        date: cur,
        key,
        inMonth: cur.month() === first.month(),
        att: attendanceByDay.get(key) || null,
        leave: leaveByDay.get(key) || null,
      });
      cur = cur.add(1, 'day');
    }
    return days;
  }, [selectedDate, attendanceByDay, leaveByDay]);

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
        isActive: form.isActive,
      });
      setMessage('Profile updated.');
      setIsProfileEditing(false);
      await loadAll();
    } catch (e2) {
      setError(e2.response?.data?.message || 'Unable to update profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading user details...</p>;
  if (!user) return <p className="alert-error">User not found.</p>;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-slate-600 transition hover:bg-neutral-50"
            onClick={() => navigate('/dashboard/users')}
            title="Back to users"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <div>
            <p className="text-lg font-bold text-dark">{user.name}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
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
        {['profile', 'attendance', 'leave', 'visits'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              activeTab === tab ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-neutral-100'
            }`}
          >
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {error && <p className="alert-error">{error}</p>}
      {message && <p className="alert-success">{message}</p>}

      {activeTab === 'profile' && (
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
                {saving ? 'Saving...' : 'Save profile'}
              </button>
            </div>
          )}
        </form>
      )}

      {activeTab === 'attendance' && (
        <div className="flux-card space-y-3 p-4 shadow-panel-lg">
          <div className="flex items-end justify-between gap-3">
            <div className="form-field max-w-[260px]">
              <label className="form-label-muted">Filter date</label>
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
              <p className="mt-1 text-xs text-slate-500">Showing month of {dayjs(selectedDate).format('DD MMM YYYY')}</p>
            </div>
            <p className="text-sm text-slate-500">
              Checked-in days: <strong className="text-dark">{attendanceByDay.size}</strong>
            </p>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <p key={d}>{d}</p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((d) => {
              const leave = d.leave;
              const att = d.att;
              const meta = getAttendanceDayMeta(d);
              return (
                <div
                  key={d.key}
                  className={`min-h-[96px] rounded-lg border p-2 text-xs ${
                    d.inMonth ? 'border-neutral-200 bg-white' : 'border-neutral-100 bg-slate-50 text-slate-400'
                  }`}
                >
                  <p className="font-semibold">{d.date.date()}</p>
                  {meta.label ? (
                    <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}>
                      {meta.label}
                    </p>
                  ) : null}
                  {att ? (
                    <div className="mt-1 space-y-0.5 text-[11px] text-slate-700">
                      <p>In: {att.checkInAt ? dayjs(att.checkInAt).format('hh:mm A') : '-'}</p>
                      <p>Out: {att.checkOutAt ? dayjs(att.checkOutAt).format('hh:mm A') : '-'}</p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
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
