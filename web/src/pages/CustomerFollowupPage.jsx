import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';

export default function CustomerFollowupPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formType, setFormType] = useState('call');
  const [formNext, setFormNext] = useState('');
  const [formAssignedTo, setFormAssignedTo] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get('/customers/followups', {
        params: {
          search: query || undefined,
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

  const loadCustomers = async () => {
    try {
      const { data } = await apiClient.get('/customers');
      setCustomers(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setCustomers([]);
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
      void loadCustomers();
      void loadUsers();
    }
  }, [showAdd]);

  const analytics = useMemo(() => {
    const perUser = new Map();
    let pending = 0;
    let completed = 0;
    items.forEach((x) => {
      const user = x.createdBy?.name || x.createdBy?.email || 'Unknown';
      perUser.set(user, (perUser.get(user) || 0) + 1);
      if (x.nextFollowUpDate && new Date(x.nextFollowUpDate).getTime() > Date.now()) pending += 1;
      else completed += 1;
    });
    return { perUser: [...perUser.entries()], pending, completed };
  }, [items]);

  const submitAdd = async () => {
    if (!formCustomerId) {
      setError('Select a customer.');
      return;
    }
    if (!formNote.trim()) {
      setError('Note is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/customers/followups', {
        customerId: formCustomerId,
        note: formNote.trim(),
        actionType: formType,
        nextFollowUpAt: formNext || null,
        assignedToUserId: formAssignedTo || null,
      });
      setShowAdd(false);
      setFormCustomerId('');
      setFormNote('');
      setFormType('call');
      setFormNext('');
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
        <h2 className="text-lg font-bold text-dark">Customer follow-up</h2>
        <p className="mt-1 text-sm text-slate-500">Each entry is linked to a customer. Use optional date range to filter by next follow-up.</p>
      </div>
      <div className="flux-card p-4 shadow-panel-lg">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid flex-1 gap-2 md:grid-cols-4">
            <input
              className="form-input md:col-span-2"
              placeholder="Search customer / company"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <input type="date" className="form-input" value={from} onChange={(e) => setFrom(e.target.value)} title="From (optional)" />
            <input type="date" className="form-input" value={to} onChange={(e) => setTo(e.target.value)} title="To (optional)" />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              title="Clear dates — list all"
              onClick={async () => {
                setFrom('');
                setTo('');
                setLoading(true);
                setError('');
                try {
                  const { data } = await apiClient.get('/customers/followups', {
                    params: { search: query || undefined },
                  });
                  setItems(Array.isArray(data?.items) ? data.items : []);
                } catch (e) {
                  setError(e?.response?.data?.message || 'Unable to load follow-ups.');
                } finally {
                  setLoading(false);
                }
              }}
            >
              Clear dates
            </button>
            <button type="button" className="btn-primary" onClick={() => void load()}>
              Apply
            </button>
            <button type="button" className="btn-primary" onClick={() => setShowAdd(true)}>
              Add follow-up
            </button>
          </div>
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
      </div>
      <div className="flux-card overflow-hidden p-4 shadow-panel-lg">
        <div className="overflow-x-auto rounded-lg border border-neutral-100">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Company</th>
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
                  <td className="px-3 py-8 text-center text-slate-500" colSpan={9}>
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
                    <td className="px-3 py-2 font-semibold text-dark">{row.customerName}</td>
                    <td className="px-3 py-2">{row.companyName}</td>
                    <td className="px-3 py-2 capitalize">{row.followUpType || '-'}</td>
                    <td className="px-3 py-2">{row.nextFollowUpDate ? new Date(row.nextFollowUpDate).toLocaleString() : '-'}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{row.notesPreview || '-'}</td>
                    <td className="px-3 py-2">{row.createdBy?.name || row.createdBy?.email || '-'}</td>
                    <td className="px-3 py-2">{row.assignedTo?.name || row.assignedTo?.email || '-'}</td>
                    <td className="px-3 py-2">{row.createdAt ? new Date(row.createdAt).toLocaleString() : '-'}</td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => navigate(`/dashboard/track/customers/${row.customerId}`)}
                      >
                        Open customer
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-500" colSpan={9}>
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
            Customer: {selected.customerName} · {selected.companyName}
          </p>
          <p className="text-sm text-slate-700">Type: {selected.followUpType || '-'}</p>
          <p className="text-sm text-slate-700">
            Next: {selected.nextFollowUpDate ? new Date(selected.nextFollowUpDate).toLocaleString() : '-'}
          </p>
          <p className="text-sm text-slate-700">Created by: {selected.createdBy?.name || selected.createdBy?.email || '-'}</p>
          <p className="text-sm text-slate-700">Assigned to: {selected.assignedTo?.name || selected.assignedTo?.email || '-'}</p>
          <p className="text-sm text-slate-700">Notes: {selected.notes || '-'}</p>
          <div className="pt-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate(`/dashboard/track/customers/${selected.customerId}`)}
            >
              Open linked customer
            </button>
          </div>
        </div>
      ) : null}

      {showAdd ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="flux-card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5 shadow-panel-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-dark">Add customer follow-up</h3>
              <button type="button" className="btn-secondary text-sm" onClick={() => setShowAdd(false)}>
                Close
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Customer</label>
                <select className="form-select w-full" value={formCustomerId} onChange={(e) => setFormCustomerId(e.target.value)}>
                  <option value="">Select customer…</option>
                  {customers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.customerName}
                      {c.companyName ? ` · ${c.companyName}` : ''}
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
