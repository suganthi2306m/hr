import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import clsx from 'clsx';
import apiClient from '../api/client';

const STATUS_OPTIONS = ['new', 'in_progress', 'follow_up', 'won', 'dropped'];

export default function LeadDetailPage() {
  const { id } = useParams();
  const [tab, setTab] = useState('details');
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [followNote, setFollowNote] = useState('');
  const [followType, setFollowType] = useState('call');
  const [followDate, setFollowDate] = useState('');
  const [followStatus, setFollowStatus] = useState('');
  const [followAssignedTo, setFollowAssignedTo] = useState('');
  const [users, setUsers] = useState([]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get(`/leads/${id}`);
      setItem(data?.item || null);
    } catch (e) {
      setError(e?.response?.data?.message || 'Unable to load lead details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get('/users');
        if (!cancelled) setUsers(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (!cancelled) setUsers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const assignmentLogs = useMemo(() => (Array.isArray(item?.assignmentLogs) ? item.assignmentLogs : []), [item]);
  const followUps = useMemo(() => (Array.isArray(item?.followUps) ? item.followUps : []), [item]);

  const updateStatus = async (nextStatus) => {
    setMessage('');
    setError('');
    try {
      await apiClient.put(`/leads/${id}`, { status: nextStatus });
      setMessage('Status updated.');
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || 'Unable to update status.');
    }
  };

  const addFollowup = async () => {
    if (!followNote.trim()) {
      setError('Follow-up note is required.');
      return;
    }
    setMessage('');
    setError('');
    try {
      await apiClient.post(`/leads/${id}/followups`, {
        note: followNote.trim(),
        actionType: followType,
        nextFollowUpAt: followDate || null,
        statusAfter: followStatus || null,
        assignedToUserId: followAssignedTo || null,
      });
      setFollowNote('');
      setFollowDate('');
      setFollowStatus('');
      setFollowAssignedTo('');
      setMessage('Follow-up added.');
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || 'Unable to add follow-up.');
    }
  };

  const convertToCustomer = async () => {
    setMessage('');
    setError('');
    try {
      await apiClient.post(`/leads/${id}/convert`);
      setMessage('Lead converted to customer.');
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || 'Unable to convert lead.');
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading lead details...</p>;
  if (!item) return <p className="alert-error">{error || 'Lead not found.'}</p>;

  return (
    <section className="space-y-4">
      {error && <p className="alert-error">{error}</p>}
      {message && <p className="alert-success">{message}</p>}
      <div className="flux-card p-4 shadow-panel-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-dark">{item.leadName}</h2>
            <p className="text-sm text-slate-500">{item.companyName}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-flux-panel px-3 py-1 text-xs font-semibold capitalize text-dark">{String(item.status || '').replace(/_/g, ' ')}</span>
            <button type="button" className="btn-secondary" disabled={item.convertedToCustomer} onClick={convertToCustomer}>
              {item.convertedToCustomer ? 'Converted' : 'Convert to customer'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 rounded-xl border border-neutral-200 bg-white p-1">
        {[
          { id: 'details', label: 'Lead details' },
          { id: 'followups', label: 'Follow-up details' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={clsx('rounded-lg px-3 py-2 text-sm font-semibold transition', tab === t.id ? 'bg-primary text-dark' : 'text-slate-600 hover:bg-flux-panel')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <div className="flux-card space-y-4 p-4 shadow-panel-lg">
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="text-sm text-slate-700">Email: {item.emailId || '-'}</p>
            <p className="text-sm text-slate-700">Phone: {item.phoneNumber || '-'}</p>
            <p className="text-sm text-slate-700">Source: {item.source || '-'}</p>
            <p className="text-sm text-slate-700">Assigned: {item.assignedTo?.name || '-'}</p>
            <p className="text-sm text-slate-700 sm:col-span-2">Address: {item.address?.text || '-'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className={clsx('rounded-full border px-3 py-1 text-xs font-semibold capitalize', item.status === s ? 'border-primary bg-primary/20 text-dark' : 'border-neutral-200 text-slate-600')}
                onClick={() => updateStatus(s)}
                disabled={item.isLocked}
              >
                {s.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-neutral-100 p-3">
            <h3 className="text-sm font-bold text-dark">Assignment logs</h3>
            <div className="mt-2 space-y-2">
              {assignmentLogs.length ? (
                assignmentLogs.map((a, idx) => (
                  <p key={idx} className="text-xs text-slate-600">
                    {(a.fromUserId?.name || 'Unassigned')} -&gt; {(a.toUserId?.name || 'Unassigned')} at{' '}
                    {a.changedAt ? new Date(a.changedAt).toLocaleString() : '-'}
                  </p>
                ))
              ) : (
                <p className="text-xs text-slate-500">No assignment logs yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'followups' && (
        <div className="flux-card space-y-4 p-4 shadow-panel-lg">
          {item.convertedToCustomer ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-slate-700">
              <p className="font-semibold text-dark">This lead was converted to a customer.</p>
              <p className="mt-1">Add new follow-ups from the Customers section (linked to the customer record).</p>
              {item.convertedCustomerId ? (
                <Link
                  to={`/dashboard/track/customers/${item.convertedCustomerId}`}
                  className="mt-3 inline-flex text-sm font-semibold text-primary underline"
                >
                  Open customer profile
                </Link>
              ) : null}
            </div>
          ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <textarea className="form-textarea sm:col-span-2" rows={3} placeholder="Follow-up note" value={followNote} onChange={(e) => setFollowNote(e.target.value)} />
            <select className="form-select" value={followType} onChange={(e) => setFollowType(e.target.value)}>
              <option value="call">Call</option>
              <option value="visit">Visit</option>
              <option value="message">Message</option>
              <option value="other">Other</option>
            </select>
            <input type="datetime-local" className="form-input" value={followDate} onChange={(e) => setFollowDate(e.target.value)} />
            <select className="form-select" value={followStatus} onChange={(e) => setFollowStatus(e.target.value)}>
              <option value="">No status change</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <select className="form-select" value={followAssignedTo} onChange={(e) => setFollowAssignedTo(e.target.value)}>
              <option value="">Auto assign (lead owner)</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name || u.email || 'User'}
                </option>
              ))}
            </select>
            <button type="button" className="btn-primary" onClick={addFollowup} disabled={item.isLocked}>
              Add follow-up
            </button>
          </div>
          )}
          <div className="rounded-xl border border-neutral-100">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Assigned to</th>
                  <th className="px-3 py-2">Note</th>
                  <th className="px-3 py-2">Status update</th>
                </tr>
              </thead>
              <tbody>
                {followUps.length ? (
                  followUps
                    .slice()
                    .reverse()
                    .map((f) => (
                      <tr key={f._id} className="border-t border-neutral-100">
                        <td className="px-3 py-2">{f.createdAt ? new Date(f.createdAt).toLocaleString() : '-'}</td>
                        <td className="px-3 py-2 capitalize">{f.actionType || '-'}</td>
                        <td className="px-3 py-2">{f.assignedToUserId?.name || f.assignedToUserId?.email || item.assignedTo?.name || '-'}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{f.note || '-'}</td>
                        <td className="px-3 py-2 capitalize">{String(f.statusAfter || '-').replace(/_/g, ' ')}</td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-500" colSpan={5}>
                      No follow-up history.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
