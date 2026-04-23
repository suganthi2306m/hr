import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';

export default function LeadFollowupPage() {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get('/leads/followups', {
        params: {
          search: query || undefined,
          status: status || undefined,
          from: from || undefined,
          to: to || undefined,
        },
      });
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setError(e?.response?.data?.message || 'Unable to load follow-ups.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

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

  return (
    <section className="space-y-4">
      <div className="flux-card p-4 shadow-panel-lg">
        <h2 className="text-lg font-bold text-dark">Follow-up Management</h2>
        <p className="mt-1 text-sm text-slate-500">All lead follow-ups with search, filters, and full details.</p>
      </div>
      <div className="flux-card p-4 shadow-panel-lg">
        <div className="grid gap-2 md:grid-cols-5">
          <input className="form-input md:col-span-2" placeholder="Search lead / company" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All status</option>
            <option value="new">New</option>
            <option value="in_progress">In progress</option>
            <option value="follow_up">Follow-up</option>
            <option value="won">Won</option>
            <option value="dropped">Dropped</option>
          </select>
          <input type="date" className="form-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="form-input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            title="Refresh today follow-ups"
            onClick={() => {
              setQuery('');
              setStatus('');
              setFrom(today);
              setTo(today);
              void load();
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
          <button type="button" className="btn-primary" onClick={() => void load()}>
            Apply
          </button>
        </div>
      </div>
      {error && <p className="alert-error">{error}</p>}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="flux-card p-3 shadow-panel-lg">
          <p className="text-xs text-slate-500">Pending vs completed</p>
          <p className="text-sm font-semibold text-dark">Pending: {analytics.pending} · Completed: {analytics.completed}</p>
        </div>
        <div className="flux-card p-3 shadow-panel-lg">
          <p className="text-xs text-slate-500">Follow-ups per user</p>
          <p className="text-sm text-dark">{analytics.perUser.slice(0, 2).map(([u, c]) => `${u}: ${c}`).join(' · ') || '-'}</p>
        </div>
        <div className="flux-card p-3 shadow-panel-lg">
          <p className="text-xs text-slate-500">By status</p>
          <p className="text-sm text-dark">{analytics.byStatus.slice(0, 3).map(([s, c]) => `${String(s).replace(/_/g, ' ')}: ${c}`).join(' · ') || '-'}</p>
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
                  <tr key={row.followUpId} className="cursor-pointer border-t border-neutral-100 hover:bg-primary/5" onClick={() => setSelected(row)}>
                    <td className="px-3 py-2 font-semibold text-dark">{row.leadName}</td>
                    <td className="px-3 py-2">{row.companyName}</td>
                    <td className="px-3 py-2 capitalize">{String(row.status || '-').replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2 capitalize">{row.followUpType || '-'}</td>
                    <td className="px-3 py-2">{row.nextFollowUpDate ? new Date(row.nextFollowUpDate).toLocaleString() : '-'}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{row.notesPreview || '-'}</td>
                    <td className="px-3 py-2">{row.createdBy?.name || row.createdBy?.email || '-'}</td>
                    <td className="px-3 py-2">{row.createdAt ? new Date(row.createdAt).toLocaleString() : '-'}</td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => navigate(`/dashboard/track/leads/${row.leadId}`)}
                      >
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
            <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>Close</button>
          </div>
          <p className="text-sm text-slate-700">Lead: {selected.leadName} · {selected.companyName}</p>
          <p className="text-sm text-slate-700">Status: {String(selected.status || '-').replace(/_/g, ' ')} · Type: {selected.followUpType || '-'}</p>
          <p className="text-sm text-slate-700">Next: {selected.nextFollowUpDate ? new Date(selected.nextFollowUpDate).toLocaleString() : '-'}</p>
          <p className="text-sm text-slate-700">Created by: {selected.createdBy?.name || selected.createdBy?.email || '-'}</p>
          <p className="text-sm text-slate-700">Notes: {selected.notes || '-'}</p>
          <div className="pt-2">
            <button type="button" className="btn-primary" onClick={() => navigate(`/dashboard/track/leads/${selected.leadId}`)}>
              Open linked lead
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
