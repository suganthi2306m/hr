import { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '../api/client';
import {
  dayContextForApi,
  formatAttendanceClock,
  localWallClockToEpochMs,
  wallClockPartsFromStoredUtc,
} from '../utils/attendanceTime';

const STATUS = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LEAVE: 'Leave',
  HOLIDAY: 'Holiday',
};

function markButtonClass(isActive, variant) {
  const base =
    'inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60';
  if (!isActive) {
    return `${base} border-neutral-200 bg-white text-slate-700 hover:border-neutral-300 hover:bg-neutral-50 focus-visible:ring-neutral-300/60`;
  }
  if (variant === 'PRESENT') {
    return `${base} border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 focus-visible:ring-emerald-400/60`;
  }
  if (variant === 'ABSENT') {
    return `${base} border-red-300 bg-red-100 text-red-800 hover:bg-red-200 focus-visible:ring-red-400/60`;
  }
  return `${base} border-primary/40 bg-primary/30 text-dark hover:bg-primary/45 focus-visible:ring-primary/50`;
}

function statusLineLabel(row) {
  const s = row.status;
  if (!s) return 'No status';
  if (s === 'LEAVE' && row.attendance?.leaveKind) {
    const cap = row.attendance.leaveKind === 'paid' ? 'Paid' : 'Unpaid';
    return `Leave (${cap})`;
  }
  return STATUS[s] || s;
}

function toDateInput(d) {
  const x = new Date(d);
  const yyyy = x.getFullYear();
  const mm = `${x.getMonth() + 1}`.padStart(2, '0');
  const dd = `${x.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function AttendancePage() {
  const [users, setUsers] = useState([]);
  const [daily, setDaily] = useState([]);
  const [query, setQuery] = useState('');
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [selected, setSelected] = useState([]);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [timingModal, setTimingModal] = useState(null);
  const [leaveModal, setLeaveModal] = useState(null);

  const load = useCallback(async () => {
    const dc = dayContextForApi(date);
    const dailyParams = {
      date,
      timeZoneOffsetMinutes: dc.timeZoneOffsetMinutes,
      ...(dc.dayStartISO ? { dayStart: dc.dayStartISO, dayEnd: dc.dayEndISO } : {}),
    };
    const [{ data: u }, { data: d }] = await Promise.all([
      apiClient.get('/users'),
      apiClient.get('/ops/attendance/daily', { params: dailyParams }),
    ]);
    setUsers(u.items || []);
    setDaily(d.items || []);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const byUser = useMemo(() => {
    const map = new Map();
    for (const x of daily) {
      if (!map.has(String(x.userId))) map.set(String(x.userId), x);
    }
    return map;
  }, [daily]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = users.map((u) => {
      const a = byUser.get(String(u._id));
      return {
        user: u,
        attendance: a || null,
        status: a?.dayStatus || null,
      };
    });
    if (!q) return base;
    return base.filter(({ user }) => {
      const id = String(user.employeeId || user.empId || user.code || '').toLowerCase();
      const name = String(user.name || '').toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [users, byUser, query]);

  const allSelected = rows.length > 0 && rows.every((x) => selected.includes(String(x.user._id)));

  const toggleSelect = (id) => {
    const key = String(id);
    setSelected((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected([]);
      return;
    }
    setSelected(rows.map((x) => String(x.user._id)));
  };

  const dayContext = () => dayContextForApi(date);

  const logAttendance = (label, payload, extra) => {
    // eslint-disable-next-line no-console
    console.info('[LiveTrack][Attendance][web]', label, payload, extra ?? '');
  };

  const applyBulk = async (status) => {
    if (!selected.length) return;
    if (status === 'LEAVE') {
      setLeaveModal({ bulk: true, userIds: [...selected] });
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      const payload = {
        userIds: selected,
        status,
        date,
        ...dayContext(),
      };
      logAttendance('POST /ops/attendance/mark-bulk', payload);
      const { data } = await apiClient.post('/ops/attendance/mark-bulk', payload);
      logAttendance('mark-bulk response', data);
      setMsg(`${STATUS[status]} applied for ${selected.length} staff.`);
      await load();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[LiveTrack][Attendance][web] mark-bulk error', e?.response?.data ?? e?.message);
      setMsg(e?.response?.data?.message || 'Failed to update attendance.');
    } finally {
      setSaving(false);
    }
  };

  const applySingle = async (userId, status) => {
    if (status === 'LEAVE') {
      setLeaveModal({ bulk: false, userIds: [String(userId)] });
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      const payload = {
        userId,
        status,
        date,
        ...dayContext(),
      };
      logAttendance('POST /ops/attendance/mark', payload);
      const { data } = await apiClient.post('/ops/attendance/mark', payload);
      logAttendance('mark response', data);
      setMsg(`${STATUS[status]} saved.`);
      await load();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[LiveTrack][Attendance][web] mark error', e?.response?.data ?? e?.message);
      setMsg(e?.response?.data?.message || 'Failed to update staff attendance.');
    } finally {
      setSaving(false);
    }
  };

  const confirmLeave = async (leaveKind) => {
    if (!leaveModal?.userIds?.length) return;
    setSaving(true);
    setMsg('');
    try {
      if (leaveModal.bulk) {
        await apiClient.post('/ops/attendance/mark-bulk', {
          userIds: leaveModal.userIds,
          status: 'LEAVE',
          date,
          leaveKind,
          ...dayContext(),
        });
        setMsg(`Leave (${leaveKind === 'paid' ? 'Paid' : 'Unpaid'}) applied for ${leaveModal.userIds.length} staff.`);
      } else {
        await apiClient.post('/ops/attendance/mark', {
          userId: leaveModal.userIds[0],
          status: 'LEAVE',
          date,
          leaveKind,
          ...dayContext(),
        });
        setMsg(`Leave (${leaveKind === 'paid' ? 'Paid' : 'Unpaid'}) saved.`);
      }
      setLeaveModal(null);
      await load();
    } catch (e) {
      setMsg(e?.response?.data?.message || 'Failed to save leave.');
    } finally {
      setSaving(false);
    }
  };

  const openTimingModal = (row) => {
    const a = row.attendance;
    setTimingModal({
      userId: String(row.user._id),
      name: row.user.name || 'Staff',
      loginTime: wallClockPartsFromStoredUtc(a?.checkInAt),
      logoutTime: wallClockPartsFromStoredUtc(a?.checkOutAt),
    });
  };

  const saveTiming = async () => {
    if (!timingModal) return;
    setSaving(true);
    setMsg('');
    try {
      const checkInAtMs = localWallClockToEpochMs(date, timingModal.loginTime);
      const checkOutAtMs = localWallClockToEpochMs(date, timingModal.logoutTime);
      const checkInAt = checkInAtMs != null ? new Date(checkInAtMs).toISOString() : null;
      const checkOutAt = checkOutAtMs != null ? new Date(checkOutAtMs).toISOString() : null;
      const payload = {
        userId: timingModal.userId,
        status: 'PRESENT',
        date,
        loginTime: timingModal.loginTime,
        logoutTime: timingModal.logoutTime,
        ...(checkInAtMs != null ? { checkInAtMs, checkInAt } : {}),
        ...(checkOutAtMs != null ? { checkOutAtMs, checkOutAt } : {}),
        ...dayContext(),
      };
      logAttendance('POST /ops/attendance/mark (timing modal)', payload, {
        localPreview: { checkInAt, checkOutAt, checkInAtMs, checkOutAtMs },
      });
      const { data } = await apiClient.post('/ops/attendance/mark', payload);
      logAttendance('mark timing response', data);
      setTimingModal(null);
      setMsg('Timing saved.');
      await load();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[LiveTrack][Attendance][web] mark timing error', e?.response?.data ?? e?.message);
      setMsg(e?.response?.data?.message || 'Failed to save timing.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-dark">Attendance Approval</h1>
        <p className="mt-1 text-sm text-slate-500">Mark Present / Absent / Leave / Holiday in bulk or per staff.</p>
      </div>

      <div className="flux-card space-y-3 p-4">
        {msg ? <p className="text-sm font-medium text-amber-700">{msg}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            className="input-base"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            type="text"
            className="input-base min-w-[320px]"
            placeholder="Search by employee name or ID (case-insensitive)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
            />
            Select All ({selected.length} selected)
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={saving || !selected.length} onClick={() => applyBulk('PRESENT')}>Present</button>
            <button type="button" className="btn-secondary" disabled={saving || !selected.length} onClick={() => applyBulk('ABSENT')}>Absent</button>
            <button type="button" className="btn-secondary" disabled={saving || !selected.length} onClick={() => applyBulk('LEAVE')}>Leave</button>
            <button type="button" className="btn-secondary" disabled={saving || !selected.length} onClick={() => applyBulk('HOLIDAY')}>Holiday</button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const user = row.user;
          const attendance = row.attendance;
          const selectedNow = selected.includes(String(user._id));
          const currentStatus = row.status || null;
          return (
            <article key={user._id} className="flux-card p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={selectedNow}
                    onChange={() => toggleSelect(user._id)}
                  />
                  <div className="h-10 w-10 rounded-full bg-slate-100 text-center leading-10 font-bold text-slate-700">
                    {String(user.name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-dark">{user.name || 'Unknown'}</div>
                    <div className="text-xs text-slate-500">
                      {user.employeeId || user.empId || user.code || '—'} &nbsp;·&nbsp; {user.role || 'Staff'}
                    </div>
                    <div className="text-xs text-slate-600">
                      {attendance?.checkInAt ? `In ${formatAttendanceClock(attendance.checkInAt)}` : 'No punch record'}
                      {attendance?.checkOutAt ? ` · Out ${formatAttendanceClock(attendance.checkOutAt)}` : ''}
                    </div>
                    <div className="text-xs font-semibold text-amber-700">
                      Status: {statusLineLabel(row)}
                    </div>
                  </div>
                </div>

                <div className="w-full max-w-xl rounded-xl border border-neutral-200 p-3">
                  <div className="mb-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <button
                      type="button"
                      className={markButtonClass(currentStatus === 'PRESENT', 'PRESENT')}
                      disabled={saving}
                      onClick={() => applySingle(user._id, 'PRESENT')}
                    >
                      Present
                    </button>
                    <button
                      type="button"
                      className={markButtonClass(currentStatus === 'ABSENT', 'ABSENT')}
                      disabled={saving}
                      onClick={() => applySingle(user._id, 'ABSENT')}
                    >
                      Absent
                    </button>
                    <button
                      type="button"
                      className={markButtonClass(currentStatus === 'LEAVE', 'LEAVE')}
                      disabled={saving}
                      onClick={() => applySingle(user._id, 'LEAVE')}
                    >
                      Leave
                    </button>
                    <button
                      type="button"
                      className={markButtonClass(currentStatus === 'HOLIDAY', 'HOLIDAY')}
                      disabled={saving}
                      onClick={() => applySingle(user._id, 'HOLIDAY')}
                    >
                      Holiday
                    </button>
                  </div>
                  <button type="button" className="btn-ghost w-full text-xs" disabled={saving} onClick={() => openTimingModal(row)}>
                    Add / Edit Timing
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {!rows.length ? <p className="text-sm text-slate-500">No employees found.</p> : null}
      </div>

      {leaveModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-black text-slate-900">Leave type</h3>
            <p className="mt-2 text-sm text-slate-600">
              {leaveModal.bulk
                ? `Mark ${leaveModal.userIds.length} selected staff as leave.`
                : 'Is this paid or unpaid leave?'}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" disabled={saving} onClick={() => setLeaveModal(null)}>
                Cancel
              </button>
              <button type="button" className="btn-secondary" disabled={saving} onClick={() => confirmLeave('unpaid')}>
                Unpaid leave
              </button>
              <button type="button" className="btn-primary" disabled={saving} onClick={() => confirmLeave('paid')}>
                Paid leave
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {timingModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-3xl font-black text-slate-900">Mark Present - {timingModal.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{new Date(date).toDateString()}</p>
              </div>
              <button
                type="button"
                className="text-2xl text-slate-400"
                onClick={() => setTimingModal(null)}
              >
                ×
              </button>
            </div>
            <div className="mt-6 grid gap-6">
              <TimeInput
                label="Login Time *"
                value={timingModal.loginTime}
                onChange={(value) => setTimingModal((prev) => ({ ...prev, loginTime: value }))}
              />
              <TimeInput
                label="Logout Time"
                value={timingModal.logoutTime}
                onChange={(value) => setTimingModal((prev) => ({ ...prev, logoutTime: value }))}
                defaultMeridiem="PM"
              />
            </div>
            <div className="mt-8 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setTimingModal(null)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={saving} onClick={saveTiming}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TimeInput({ label, value, onChange, defaultMeridiem = 'AM' }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-800">{label}</label>
      <div className="flex items-center gap-2">
        <input
          className="input-base w-20 text-center"
          placeholder="HH"
          value={value.hh}
          onChange={(e) => onChange({ ...value, hh: e.target.value.replace(/\D/g, '').slice(0, 2) })}
        />
        <span className="font-bold text-slate-600">:</span>
        <input
          className="input-base w-20 text-center"
          placeholder="MM"
          value={value.mm}
          onChange={(e) => onChange({ ...value, mm: e.target.value.replace(/\D/g, '').slice(0, 2) })}
        />
        <select
          className="input-base w-24"
          value={value.meridiem || defaultMeridiem}
          onChange={(e) => onChange({ ...value, meridiem: e.target.value })}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}

export default AttendancePage;
