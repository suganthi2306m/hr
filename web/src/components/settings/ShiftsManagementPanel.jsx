import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import SlideOverPanel from '../common/SlideOverPanel';
import UiSelect from '../common/UiSelect';
import { formatShiftRange, normalizeHmInput } from '../../utils/shiftTime';

const SUB_TABS = [
  { id: 'manage', label: 'Shift management' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'notAssigned', label: 'Not assigned' },
];

function shiftLetter(s) {
  const L = String(s.letter || s.name || '?')
    .trim()
    .charAt(0)
    .toUpperCase();
  return L || '?';
}

function IconEdit({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Edit"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 text-dark hover:bg-neutral-100 disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}

function IconDelete({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Delete"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary bg-primary/10 text-dark hover:bg-primary/20 disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}

function ShiftsManagementPanel({ shifts, onPersist, saving }) {
  const [subTab, setSubTab] = useState('manage');
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [panel, setPanel] = useState(null);
  const [staffModalShift, setStaffModalShift] = useState(null);
  const [assignDraft, setAssignDraft] = useState({});
  const [assignSavingId, setAssignSavingId] = useState('');

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { data } = await apiClient.get('/users');
      setUsers(Array.isArray(data.items) ? data.items : []);
    } catch {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (subTab === 'assigned' || subTab === 'notAssigned') loadUsers();
  }, [subTab, shifts, loadUsers]);

  const staffByShiftId = useMemo(() => {
    const map = new Map();
    (shifts || []).forEach((s) => {
      if (s._id) map.set(String(s._id), []);
    });
    users.forEach((u) => {
      const sid = u.shiftId != null ? String(u.shiftId).trim() : '';
      if (sid && map.has(sid)) map.get(sid).push(u);
    });
    return map;
  }, [shifts, users]);

  const shiftIdSet = useMemo(
    () => new Set((shifts || []).map((s) => (s?._id != null ? String(s._id) : '')).filter(Boolean)),
    [shifts],
  );

  const assignedRows = useMemo(() => {
    return users.filter((u) => {
      const sid = u.shiftId != null ? String(u.shiftId).trim() : '';
      return sid && shiftIdSet.has(sid);
    });
  }, [users, shiftIdSet]);

  const notAssignedRows = useMemo(() => {
    return users.filter((u) => {
      const sid = u.shiftId != null ? String(u.shiftId).trim() : '';
      return !sid || !shiftIdSet.has(sid);
    });
  }, [users, shiftIdSet]);

  const shiftOptions = useMemo(
    () => [{ value: '', label: 'No shift' }, ...shifts.map((s) => ({ value: String(s._id), label: s.name }))],
    [shifts],
  );

  const persistShifts = async (next) => {
    await onPersist(next);
    await loadUsers();
    setAssignError('');
  };

  const openAdd = () => {
    setPanel({
      index: -1,
      draft: { name: '', letter: '', startTime: '09:00', endTime: '18:00' },
    });
  };

  const openEdit = (index) => {
    const s = shifts[index];
    setPanel({
      index,
      draft: {
        name: s.name || '',
        letter: s.letter || shiftLetter(s),
        startTime: normalizeHmInput(s.startTime),
        endTime: normalizeHmInput(s.endTime),
      },
    });
  };

  const savePanel = async () => {
    if (!panel) return;
    const d = panel.draft;
    if (!String(d.name || '').trim()) return;
    const letter = String(d.letter || d.name.charAt(0) || '?')
      .trim()
      .slice(0, 1)
      .toUpperCase();
    const startTime = normalizeHmInput(d.startTime);
    const endTime = normalizeHmInput(d.endTime);
    const next = [...shifts];
    if (panel.index >= 0) {
      const prev = shifts[panel.index];
      next[panel.index] = {
        ...prev,
        name: String(d.name).trim(),
        letter,
        startTime,
        endTime,
      };
    } else {
      next.push({ name: String(d.name).trim(), letter, startTime, endTime });
    }
    setPanel(null);
    await persistShifts(next);
  };

  const removeShift = async (index) => {
    if (!window.confirm('Delete this shift? Staff assigned to it will be unassigned.')) return;
    const next = shifts.filter((_, i) => i !== index);
    await persistShifts(next);
  };

  const assignUser = async (userId, shiftId) => {
    setAssignSavingId(String(userId));
    setAssignError('');
    try {
      // Send only the shift field to avoid accidental validation failures on unrelated user fields.
      await apiClient.put(`/users/${userId}`, { shiftId: shiftId || '' });
      await loadUsers();
      setAssignDraft((d) => ({ ...d, [userId]: shiftId || '' }));
    } catch (e) {
      setAssignError(e.response?.data?.message || 'Unable to update shift assignment.');
    } finally {
      setAssignSavingId('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-neutral-200 pb-0.5">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={clsx(
              'rounded-t-lg px-4 py-2 text-sm font-bold transition',
              subTab === t.id ? 'border-b-2 border-primary text-primary' : 'text-slate-500 hover:text-dark',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'manage' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-base font-semibold text-dark">Manage shifts</h4>
            <button type="button" className="btn-primary gap-2" onClick={openAdd} disabled={saving}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add shift
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-neutral-100">
            <table className="min-w-[52rem] w-full text-sm">
              <thead>
                <tr className="bg-flux-panel text-left text-xs font-bold uppercase tracking-wide text-primary">
                  <th className="px-2 py-2">Sr</th>
                  <th className="px-2 py-2">Shift name</th>
                  <th className="px-2 py-2">Timing</th>
                  <th className="px-2 py-2">Staff</th>
                  <th className="px-2 py-2">Created</th>
                  <th className="px-2 py-2">Created by</th>
                  <th className="px-2 py-2">Updated by</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s, i) => {
                  const sid = s._id != null ? String(s._id) : '';
                  const staff = sid ? staffByShiftId.get(sid) || [] : [];
                  return (
                    <tr key={sid || `new-${i}`} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="flex items-center gap-2 text-left font-medium text-dark hover:text-primary"
                          onClick={() => setStaffModalShift({ shift: s, staff })}
                          title="View assigned staff"
                        >
                          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-black text-dark">
                            {shiftLetter(s)}
                          </span>
                          <span className="underline decoration-transparent hover:decoration-primary">{s.name}</span>
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-700">{formatShiftRange(s.startTime, s.endTime)}</td>
                      <td className="px-2 py-2 font-semibold text-dark">{staff.length}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-600">
                        {s.createdAt ? dayjs(s.createdAt).format('DD-MM-YYYY') : '—'}
                      </td>
                      <td className="px-2 py-2 text-slate-700">
                        <p className="font-medium">{s.createdByName || '—'}</p>
                        {s.createdAt ? <p className="text-xs text-slate-500">{dayjs(s.createdAt).format('DD MMM YYYY')}</p> : null}
                      </td>
                      <td className="px-2 py-2 text-slate-700">
                        {s.updatedByName ? (
                          <>
                            <p className="font-medium">{s.updatedByName}</p>
                            {s.updatedAt ? <p className="text-xs text-slate-500">{dayjs(s.updatedAt).format('DD MMM YYYY')}</p> : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
                          <IconEdit onClick={() => openEdit(i)} disabled={saving} />
                          <IconDelete onClick={() => removeShift(i)} disabled={saving} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!shifts.length && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      No shifts yet. Add a shift to assign staff in the other tabs.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'assigned' && (
        <div className="space-y-3">
          <h4 className="text-base font-semibold text-dark">Staff with a shift</h4>
          {assignError && <p className="alert-error">{assignError}</p>}
          {loadingUsers ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-100">
              <table className="min-w-[36rem] w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-2 py-2">Employee</th>
                    <th className="px-2 py-2">Email</th>
                    <th className="px-2 py-2">Shift</th>
                    <th className="px-2 py-2">Timing</th>
                    <th className="px-2 py-2">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedRows.map((u) => {
                    const sh = shifts.find((s) => String(s._id) === String(u.shiftId));
                    return (
                      <tr key={u._id} className="border-t border-slate-100">
                        <td className="px-2 py-2 font-medium text-dark">{u.name}</td>
                        <td className="px-2 py-2 text-slate-600">{u.email}</td>
                        <td className="px-2 py-2">{sh?.name || '—'}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-slate-600">
                          {sh ? formatShiftRange(sh.startTime, sh.endTime) : '—'}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <UiSelect
                              className="min-w-[10rem]"
                              value={assignDraft[u._id] != null ? assignDraft[u._id] : String(u.shiftId)}
                              onChange={(v) => setAssignDraft((d) => ({ ...d, [u._id]: v }))}
                              options={shiftOptions.filter((o) => o.value !== '')}
                            />
                            <button
                              type="button"
                              className="btn-secondary text-xs"
                              disabled={assignSavingId === String(u._id)}
                              onClick={() => assignUser(u._id, assignDraft[u._id] != null ? assignDraft[u._id] : String(u.shiftId))}
                            >
                              {assignSavingId === String(u._id) ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!assignedRows.length && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">
                        No employees have a shift yet. Use Not assigned or Shift management.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === 'notAssigned' && (
        <div className="space-y-3">
          <h4 className="text-base font-semibold text-dark">Employees without a shift</h4>
          {assignError && <p className="alert-error">{assignError}</p>}
          {loadingUsers ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-100">
              <table className="min-w-[32rem] w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-2 py-2">Employee</th>
                    <th className="px-2 py-2">Email</th>
                    <th className="px-2 py-2">Assign shift</th>
                  </tr>
                </thead>
                <tbody>
                  {notAssignedRows.map((u) => (
                    <tr key={u._id} className="border-t border-slate-100">
                      <td className="px-2 py-2 font-medium text-dark">{u.name}</td>
                      <td className="px-2 py-2 text-slate-600">{u.email}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <UiSelect
                            className="min-w-[10rem]"
                            value={assignDraft[u._id] ?? ''}
                            onChange={(v) => setAssignDraft((d) => ({ ...d, [u._id]: v }))}
                            options={shiftOptions}
                          />
                          <button
                            type="button"
                            className="btn-primary text-xs"
                            disabled={!assignDraft[u._id] || assignSavingId === String(u._id)}
                            onClick={() => assignUser(u._id, assignDraft[u._id])}
                          >
                            {assignSavingId === String(u._id) ? 'Saving…' : 'Assign'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!notAssignedRows.length && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-slate-500">
                        Everyone has a shift assigned.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <SlideOverPanel
        open={Boolean(panel)}
        onClose={() => setPanel(null)}
        title={panel && panel.index >= 0 ? 'Edit shift' : 'Add shift'}
        description="Shift name, shortcut letter, and working hours."
      >
        {panel && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              savePanel();
            }}
          >
            <div className="form-field">
              <label className="form-label-muted">Shift name</label>
              <input
                className="form-input"
                value={panel.draft.name}
                onChange={(e) => setPanel((p) => ({ ...p, draft: { ...p.draft, name: e.target.value } }))}
                required
              />
            </div>
            <div className="form-field">
              <label className="form-label-muted">Letter shortcut</label>
              <input
                className="form-input max-w-[6rem] uppercase"
                maxLength={1}
                value={panel.draft.letter}
                onChange={(e) =>
                  setPanel((p) => ({
                    ...p,
                    draft: { ...p.draft, letter: e.target.value.toUpperCase().slice(0, 1) },
                  }))
                }
                placeholder="G"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="form-field">
                <label className="form-label-muted">Start</label>
                <input
                  type="time"
                  className="form-input"
                  value={normalizeHmInput(panel.draft.startTime)}
                  onChange={(e) => setPanel((p) => ({ ...p, draft: { ...p.draft, startTime: e.target.value } }))}
                />
              </div>
              <div className="form-field">
                <label className="form-label-muted">End</label>
                <input
                  type="time"
                  className="form-input"
                  value={normalizeHmInput(panel.draft.endTime)}
                  onChange={(e) => setPanel((p) => ({ ...p, draft: { ...p.draft, endTime: e.target.value } }))}
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">Preview: {formatShiftRange(panel.draft.startTime, panel.draft.endTime)}</p>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" className="btn-secondary" onClick={() => setPanel(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </SlideOverPanel>

      {staffModalShift && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-panel-lg">
            <h3 className="text-lg font-bold text-dark">{staffModalShift.shift.name}</h3>
            <p className="mt-1 text-sm text-slate-500">{formatShiftRange(staffModalShift.shift.startTime, staffModalShift.shift.endTime)}</p>
            <p className="mt-3 text-xs font-semibold uppercase text-slate-500">Assigned staff ({staffModalShift.staff.length})</p>
            <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-sm">
              {staffModalShift.staff.map((u) => (
                <li key={u._id} className="rounded-lg border border-neutral-100 px-3 py-2">
                  <p className="font-medium text-dark">{u.name}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-primary mt-4 w-full" onClick={() => setStaffModalShift(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ShiftsManagementPanel;
