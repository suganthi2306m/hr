import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';

const STATUS_OPTIONS = ['', 'new', 'in_progress', 'follow_up', 'won', 'dropped'];

export default function LeadFollowupPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [formLeadId, setFormLeadId] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formType, setFormType] = useState('call');
  const [formNext, setFormNext] = useState('');
  const [formStatusAfter, setFormStatusAfter] = useState('');
  const [formAssignedTo, setFormAssignedTo] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get('/leads/followups', {
        params: {
          search: query || undefined,
          status: status || undefined,
          ...(from && to ? { from, to } : from ? { from } : to ? { to } : {}),
        },
      });
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setError(e?.response?.data?.message || 'Unable to load follow-ups.');
    } finally {
      setLoading(false);
    }
  };

  const loadLeads = async () => {
    try {
      const { data } = await apiClient.get('/leads');
      setLeads(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setLeads([]);
    }
  };

  const loadUsers = async () => {
    try {
      const { data } = await apiClient.get('/users');
      setUsers(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setUsers([]);
    }
  };

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount load only
  }, []);

  useEffect(() => {
    if (showAdd) {
      void loadLeads();
      void loadUsers();
    }
  }, [showAdd]);

  const analytics = useMemo(() => {
    const perUser = new Map();
    const byStatus = new Map();
    let pending = 0;
    let completed = 0;
    items.forEach((x) => {
      const user = x.createdBy?.name || x.createdBy?.email || 'Unknown';
      perUser.set(user, (perUser.get(user) || 0) + 1);
      byStatus.set(x.status || 'unknown', (byStatus.get(x.status || 'unknown') || 0) + 1);
      if (x.nextFollowUpDate && new Date(x.nextFollowUpDate).getTime() > Date.now()) pending += 1;
      else completed += 1;
    });
    return { perUser: [...perUser.entries()], byStatus: [...byStatus.entries()], pending, completed };
  }, [items]);

  const openAddForRow = (row) => {
    setFormLeadId(row?.leadId ? String(row.leadId) : '');
    setFormNote('');
    setFormType('call');
    setFormNext('');
    setFormStatusAfter('');
    setFormAssignedTo('');
    setShowAdd(true);
  };

  const submitAdd = async () => {
    if (!formLeadId) {
      setError('Select a lead.');
      return;
    }
    if (!formNote.trim()) {
      setError('Note is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/leads/followups', {
        leadId: formLeadId,
        note: formNote.trim(),
        actionType: formType,
        nextFollowUpAt: formNext || null,
        statusAfter: formStatusAfter || null,
        assignedToUserId: formAssignedTo || null,
      });
      setShowAdd(false);
      setFormLeadId('');
      setFormNote('');
      setFormType('call');
      setFormNext('');
      setFormStatusAfter('');
      setFormAssignedTo('');
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || 'Unable to save follow-up.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flux-card p-4 shadow-panel-lg">
        <h2 className="text-lg font-bold text-dark">Follow-up management</h2>
        <p className="mt-1 text-sm text-slate-500">Each entry is linked to a lead. Converted leads only appear under Customers.</p>
      </div>
      <div className="flux-card p-4 shadow-panel-lg">
        <div className="grid gap-2 md:grid-cols-5">
          <input
            className="form-input md:col-span-2"
            placeholder="Search lead / company"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All status</option>
            <option value="new">New</option>
            <option value="in_progress">In progress</option>
            <option value="follow_up">Follow-up</option>
            <option value="won">Won</option>
            <option value="dropped">Dropped</option>
          </select>
          <input type="date" className="form-input" value={from} onChange={(e) => setFrom(e.target.value)} title="Filter by next follow-up from" />
          <input type="date" className="form-input" value={to} onChange={(e) => setTo(e.target.value)} title="Filter by next follow-up to" />
        </div>
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            title="Reset filters and reload all"
            onClick={async () => {
              setQuery('');
              setStatus('');
              setFrom('');
              setTo('');
              setLoading(true);
              setError('');
              try {
                const { data } = await apiClient.get('/leads/followups', { params: {} });
                setItems(Array.isArray(data?.items) ? data.items : []);
              } catch (e) {
                setError(e?.response?.data?.message || 'Unable to load follow-ups.');
              } finally {
                setLoading(false);
              }
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            Reset
          </button>
          <button type="button" className="btn-primary" onClick={() => void load()}>
            Apply
          </button>
          <button type="button" className="btn-primary" onClick={() => openAddForRow(null)}>
            Add follow-up
          </button>
        </div>
      </div>
      {error && <p className="alert-error">{error}</p>}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="flux-card p-3 shadow-panel-lg">
          <p className="text-xs text-slate-500">Pending vs completed</p>
          <p className="text-sm font-semibold text-dark">
            Pending: {analytics.pending} · Completed: {analytics.completed}
          </p>
        </div>
        <div className="flux-card p-3 shadow-panel-lg">
          <p className="text-xs text-slate-500">Follow-ups per user</p>
          <p className="text-sm text-dark">{analytics.perUser.slice(0, 2).map(([u, c]) => `${u}: ${c}`).join(' · ') || '-'}</p>
        </div>
        <div className="flux-card p-3 shadow-panel-lg">
          <p className="text-xs text-slate-500">By status</p>
          <p className="text-sm text-dark">
            {analytics.byStatus.slice(0, 3).map(([s, c]) => `${String(s).replace(/_/g, ' ')}: ${c}`).join(' · ') || '-'}
          </p>
        </div>
      </div>
      <div className="flux-card overflow-hidden p-4 shadow-panel-lg">
        <div className="overflow-x-auto rounded-lg border border-neutral-100">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Lead</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Next follow-up</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2">Created by</th>
                <th className="px-3 py-2">Assigned to</th>
                <th className="px-3 py-2">Created date</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-500" colSpan={10}>
                    Loading follow-ups...
                  </td>
                </tr>
              ) : items.length ? (
                items.map((row) => (
                  <tr
                    key={row.followUpId}
                    className="cursor-pointer border-t border-neutral-100 hover:bg-primary/5"
                    onClick={() => setSelected(row)}
                  >
                    <td className="px-3 py-2 font-semibold text-dark">{row.leadName}</td>
                    <td className="px-3 py-2">{row.companyName}</td>
                    <td className="px-3 py-2 capitalize">{String(row.status || '-').replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2 capitalize">{row.followUpType || '-'}</td>
                    <td className="px-3 py-2">{row.nextFollowUpDate ? new Date(row.nextFollowUpDate).toLocaleString() : '-'}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{row.notesPreview || '-'}</td>
                    <td className="px-3 py-2">{row.createdBy?.name || row.createdBy?.email || '-'}</td>
                    <td className="px-3 py-2">{row.assignedTo?.name || row.assignedTo?.email || '-'}</td>
                    <td className="px-3 py-2">{row.createdAt ? new Date(row.createdAt).toLocaleString() : '-'}</td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn-secondary text-xs" onClick={() => openAddForRow(row)}>
                        Add follow-up
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-500" colSpan={10}>
                    No follow-ups found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {selected ? (
        <div className="flux-card space-y-2 p-4 shadow-panel-lg">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-dark">Follow-up details</h3>
            <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <p className="text-sm text-slate-700">
            Lead: {selected.leadName} · {selected.companyName}
          </p>
          <p className="text-sm text-slate-700">
            Status: {String(selected.status || '-').replace(/_/g, ' ')} · Type: {selected.followUpType || '-'}
          </p>
          <p className="text-sm text-slate-700">
            Next: {selected.nextFollowUpDate ? new Date(selected.nextFollowUpDate).toLocaleString() : '-'}
          </p>
          <p className="text-sm text-slate-700">Created by: {selected.createdBy?.name || selected.createdBy?.email || '-'}</p>
          <p className="text-sm text-slate-700">Assigned to: {selected.assignedTo?.name || selected.assignedTo?.email || '-'}</p>
          <p className="text-sm text-slate-700">Notes: {selected.notes || '-'}</p>
          <div className="pt-2">
            <button type="button" className="btn-primary" onClick={() => navigate(`/dashboard/track/leads/${selected.leadId}`)}>
              Open linked lead
            </button>
          </div>
        </div>
      ) : null}

      {showAdd ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="flux-card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5 shadow-panel-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-dark">Add lead follow-up</h3>
              <button type="button" className="btn-secondary text-sm" onClick={() => setShowAdd(false)}>
                Close
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Lead</label>
                <select className="form-select w-full" value={formLeadId} onChange={(e) => setFormLeadId(e.target.value)}>
                  <option value="">Select lead…</option>
                  {leads.map((l) => (
                    <option key={l._id} value={l._id}>
                      {l.leadName} · {l.companyName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Note</label>
                <textarea className="form-textarea w-full" rows={3} value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="What was discussed?" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Type</label>
                  <select className="form-select w-full" value={formType} onChange={(e) => setFormType(e.target.value)}>
                    <option value="call">Call</option>
                    <option value="visit">Visit</option>
                    <option value="message">Message</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Next follow-up</label>
                  <input type="datetime-local" className="form-input w-full" value={formNext} onChange={(e) => setFormNext(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Update lead status (optional)</label>
                <select className="form-select w-full" value={formStatusAfter} onChange={(e) => setFormStatusAfter(e.target.value)}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s === '' ? '__none' : s} value={s}>
                      {s === '' ? 'No change' : s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Assign to user</label>
                <select className="form-select w-full" value={formAssignedTo} onChange={(e) => setFormAssignedTo(e.target.value)}>
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name || u.email || 'User'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)} disabled={saving}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={() => void submitAdd()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
