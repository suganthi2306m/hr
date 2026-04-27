import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import apiClient from '../api/client';

/** Admin status updates on details page (matches web_backend lifecycle). */
const STATUS_SAVE_OPTIONS = [
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const LEGACY_STATUS_TO_SELECT = {
  progress: 'in_progress',
  arrived: 'in_progress',
  resumed: 'in_progress',
  hold: 'in_progress',
  exited: 'in_progress',
};

function formatCustomerAddress(cust) {
  if (!cust) return null;
  const parts = [cust.address, cust.city, cust.pincode].map((s) => String(s || '').trim()).filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function formatStatusLabel(s) {
  return String(s || '—')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function InfoRow({ label, children }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
      <div className="mt-1.5 text-sm font-semibold text-slate-900">{children}</div>
    </div>
  );
}

export default function FieldTaskDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('completed');
  const [adminNote, setAdminNote] = useState('');
  const [banner, setBanner] = useState({ type: '', text: '' });
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignList, setReassignList] = useState({ users: [], tasks: [], loading: false });
  const [reassignBusy, setReassignBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setBanner({ type: '', text: '' });
    try {
      const { data } = await apiClient.get(`/fieldtasks/${id}/details`);
      setDetails(data);
      const t = data.taskDetails || {};
      let s = String(t.status || 'assigned').toLowerCase().trim().replace(/\s+/g, '_');
      s = LEGACY_STATUS_TO_SELECT[s] || s;
      const allowed = new Set(STATUS_SAVE_OPTIONS.map((o) => o.value));
      setStatus(allowed.has(s) ? s : 'completed');
      setAdminNote(t.note != null ? String(t.note) : '');
    } catch {
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!reassignOpen) return;
    let cancelled = false;
    (async () => {
      setReassignList((prev) => ({ ...prev, loading: true }));
      try {
        const [u, t] = await Promise.all([apiClient.get('/users'), apiClient.get('/fieldtasks')]);
        if (cancelled) return;
        setReassignList({
          users: Array.isArray(u.data?.items) ? u.data.items : [],
          tasks: Array.isArray(t.data?.items) ? t.data.items : [],
          loading: false,
        });
      } catch {
        if (!cancelled) setReassignList({ users: [], tasks: [], loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reassignOpen]);

  const taskCountsByUser = useMemo(() => {
    const m = new Map();
    for (const tk of reassignList.tasks) {
      const uid = tk.assignedUser?._id;
      if (!uid) continue;
      const k = String(uid);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [reassignList.tasks]);

  const save = async () => {
    setSaving(true);
    setBanner({ type: '', text: '' });
    try {
      await apiClient.put(`/fieldtasks/${id}`, { status, note: adminNote });
      setBanner({ type: 'ok', text: 'Task updated.' });
      await load();
    } catch (e) {
      setBanner({
        type: 'err',
        text: e.response?.data?.message || e.message || 'Update failed',
      });
    } finally {
      setSaving(false);
    }
  };

  const reassignTo = async (userId) => {
    setReassignBusy(true);
    setBanner({ type: '', text: '' });
    try {
      const { data } = await apiClient.post(`/fieldtasks/${id}/reassign-clone`, { assignedTo: userId });
      setReassignOpen(false);
      const newId = data?.copy?._id;
      if (newId) navigate(`/dashboard/track/fieldtasks/${newId}`);
      else await load();
    } catch (e) {
      setBanner({
        type: 'err',
        text: e.response?.data?.message || e.message || 'Reassign failed',
      });
    } finally {
      setReassignBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm font-medium text-slate-500">Loading task…</p>
      </div>
    );
  }

  if (!details?.taskDetails) {
    return (
      <section className="space-y-4 px-4">
        <p className="text-sm text-red-600">Task not found or you do not have access.</p>
        <button type="button" className="btn-secondary text-sm" onClick={() => navigate('/dashboard/track/fieldtasks')}>
          Back to tasks
        </button>
      </section>
    );
  }

  const task = details.taskDetails;
  const cust = task.customer;
  const addr = formatCustomerAddress(cust);
  const currentAssigneeId = String(task.assignedTo?._id || '');
  const reassignCandidates = [...reassignList.users]
    .filter((u) => String(u._id) !== currentAssigneeId)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  return (
    <section className="w-full max-w-none space-y-6 px-4 pb-12 pt-1 sm:px-5 md:px-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Field task</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-dark sm:text-4xl">{task.taskName || 'Task'}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Review details, set status to <strong>Completed</strong> or <strong>Cancelled</strong>, or reassign a copy to
            another team member.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setReassignOpen(true)}
            className="rounded-xl border-2 border-slate-900/10 bg-white px-4 py-2.5 text-sm font-bold text-dark shadow-sm transition hover:border-primary hover:bg-primary/10"
          >
            Reassign…
          </button>
          <button type="button" onClick={() => navigate('/dashboard/track/fieldtasks')} className="btn-secondary text-sm font-bold">
            ← All tasks
          </button>
        </div>
      </div>

      {banner.text && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            banner.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-white to-primary/5 shadow-panel-lg">
        <div className="border-b border-slate-100 bg-white/90 px-5 py-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Overview</h2>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <InfoRow label="Current status">
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-800">
              {formatStatusLabel(task.status)}
            </span>
          </InfoRow>
          <InfoRow label="Type / priority">
            <span className="capitalize">
              {task.taskType || '—'} · {task.priority || '—'}
            </span>
          </InfoRow>
          <InfoRow label="Assigned to">{task.assignedTo?.name || '—'}</InfoRow>
          <InfoRow label="Assigned date">
            {task.assignedDate && dayjs(task.assignedDate).isValid()
              ? dayjs(task.assignedDate).format('DD MMM YYYY, HH:mm')
              : '—'}
          </InfoRow>
          <InfoRow label="Target / completion">
            {task.completionDate && dayjs(task.completionDate).isValid()
              ? dayjs(task.completionDate).format('DD MMM YYYY, HH:mm')
              : '—'}
          </InfoRow>
          <InfoRow label="Last updated">
            {task.updatedAt && dayjs(task.updatedAt).isValid()
              ? dayjs(task.updatedAt).format('DD MMM YYYY, HH:mm')
              : '—'}
          </InfoRow>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-panel-lg sm:p-6">
        <h2 className="text-base font-bold text-dark">Customer</h2>
        {cust ? (
          <div className="mt-4 space-y-2 text-sm">
            <p className="text-lg font-bold text-dark">{cust.customerName || '—'}</p>
            {cust.companyName ? <p className="text-slate-600">{cust.companyName}</p> : null}
            {addr ? (
              <p className="leading-relaxed text-slate-800">
                <span className="font-bold text-slate-500">Address · </span>
                {addr}
              </p>
            ) : (
              <p className="text-slate-500">No address on file.</p>
            )}
            {(cust.customerNumber || cust.emailId) && (
              <p className="text-slate-600">{[cust.customerNumber, cust.emailId].filter(Boolean).join(' · ')}</p>
            )}
            {task.customerId ? (
              <Link
                to={`/dashboard/track/customers/${task.customerId}`}
                className="mt-2 inline-block text-sm font-bold text-primary underline-offset-2 hover:underline"
              >
                Open customer record
              </Link>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No customer linked to this task.</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-panel-lg sm:p-6">
        <h2 className="text-base font-bold text-dark">Description</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
          {task.description?.trim() ? task.description : '—'}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-slate-900/[0.03] p-5 shadow-inner sm:p-6">
        <h2 className="text-base font-bold text-dark">Admin · status & note</h2>
        <p className="mt-1 text-xs text-slate-500">Set lifecycle to completed or cancelled. Optional note is stored on the task.</p>

        <div className="mt-6">
          <label htmlFor="task-status" className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
            New status
          </label>
          <div className="relative max-w-md">
            <select
              id="task-status"
              className="block w-full appearance-none rounded-2xl border-2 border-slate-200 bg-white py-3.5 pl-4 pr-12 text-base font-bold text-dark shadow-sm transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 disabled:opacity-50"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={saving}
            >
              {STATUS_SAVE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </div>
        </div>

        <div className="mt-5">
          <label htmlFor="task-note" className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
            Note (optional)
          </label>
          <textarea
            id="task-note"
            className="form-textarea min-h-[120px] max-w-3xl rounded-2xl border-2 border-slate-200 text-sm font-medium shadow-sm focus:border-primary focus:ring-primary/20"
            placeholder="Internal note…"
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            disabled={saving}
            maxLength={8000}
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-2xl bg-primary px-8 py-3 text-sm font-black text-dark shadow-md transition hover:brightness-95 disabled:opacity-50"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {reassignOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reassign-title"
          onClick={() => !reassignBusy && setReassignOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 id="reassign-title" className="text-lg font-black text-dark">
                Reassign task
              </h2>
              <button
                type="button"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => !reassignBusy && setReassignOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="border-b border-slate-50 px-5 py-3 text-sm text-slate-600">
              Creates a <strong>new identical task</strong> for the selected user. This task is marked{' '}
              <strong>Reassigned</strong>. Open tasks count per user includes field tasks only.
            </p>
            <div className="max-h-[min(60vh,420px)] overflow-y-auto px-3 py-3">
              {reassignList.loading ? (
                <p className="py-8 text-center text-sm text-slate-500">Loading team…</p>
              ) : (
                <ul className="space-y-2">
                  {reassignCandidates.map((u) => {
                    const n = taskCountsByUser.get(String(u._id)) || 0;
                    return (
                      <li key={u._id}>
                        <button
                          type="button"
                          disabled={reassignBusy}
                          onClick={() => void reassignTo(String(u._id))}
                          className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-left transition hover:border-primary hover:bg-primary/10 disabled:opacity-50"
                        >
                          <span className="font-bold text-dark">{u.name || 'User'}</span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600 shadow-sm">
                            {n} task{n === 1 ? '' : 's'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {!reassignCandidates.length && (
                    <li className="py-6 text-center text-sm text-slate-500">No other users in your company.</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
