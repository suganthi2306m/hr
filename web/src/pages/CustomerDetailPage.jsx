import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import clsx from 'clsx';
import apiClient from '../api/client';
import LocationLoadingIndicator from '../components/common/LocationLoadingIndicator';
import UiSelect from '../components/common/UiSelect';
import CustomerProfileSummary from '../components/customers/CustomerProfileSummary';

function formatDt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function formatDay(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function isLikelyObjectId(value) {
  return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
}

function durationLabel(row) {
  if (row.durationMinutes != null && Number.isFinite(Number(row.durationMinutes))) {
    return `${row.durationMinutes} min`;
  }
  if (row.checkOutTime && row.checkInTime) {
    const m = Math.round((new Date(row.checkOutTime) - new Date(row.checkInTime)) / 60000);
    return `${Math.max(0, m)} min`;
  }
  return row.status === 'open' ? 'In progress' : '—';
}

function visitedByLabel(row) {
  const u = row.userId;
  if (u && typeof u === 'object') {
    return [u.name, u.email].filter(Boolean).join(' · ') || String(u._id ?? '—');
  }
  return '—';
}

export default function CustomerDetailPage() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { setDashboardTrail } = useOutletContext() || {};

  const [tab, setTab] = useState('profile');
  const [customer, setCustomer] = useState(null);
  const [users, setUsers] = useState([]);
  const [visitUserId, setVisitUserId] = useState('');
  const [visitDateFrom, setVisitDateFrom] = useState('');
  const [visitDateTo, setVisitDateTo] = useState('');
  const [visits, setVisits] = useState([]);
  const [visitsTotal, setVisitsTotal] = useState(0);
  const [customerFollowUps, setCustomerFollowUps] = useState([]);
  const [followNote, setFollowNote] = useState('');
  const [followType, setFollowType] = useState('call');
  const [followDate, setFollowDate] = useState('');
  const [followAssignedTo, setFollowAssignedTo] = useState('');
  const [followQuery, setFollowQuery] = useState('');
  const [followFrom, setFollowFrom] = useState('');
  const [followTo, setFollowTo] = useState('');
  const [followSaving, setFollowSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [error, setError] = useState('');

  const title = useMemo(() => {
    const customerName = String(customer?.customerName || '').trim();
    const companyName = String(customer?.companyName || '').trim();
    if (customerName && !isLikelyObjectId(customerName)) return customerName;
    if (companyName && !isLikelyObjectId(companyName)) return companyName;
    if (customerName) return customerName;
    return 'Customer';
  }, [customer]);

  const userFilterOptions = useMemo(() => {
    const base = [{ value: '', label: 'All users' }];
    const sorted = [...users].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    for (const u of sorted) {
      base.push({
        value: String(u._id),
        label: [u.name, u.email].filter(Boolean).join(' · ') || String(u._id),
      });
    }
    return base;
  }, [users]);

  const loadCustomer = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get(`/customers/${customerId}`);
      setCustomer(data);
    } catch (e) {
      setCustomer(null);
      setError(e?.response?.data?.message || e.message || 'Could not load customer.');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  const loadCustomerFollowUps = useCallback(async () => {
    if (!customerId) return;
    try {
      const params = {};
      if (followQuery.trim()) params.search = followQuery.trim();
      if (followFrom) params.from = followFrom;
      if (followTo) params.to = followTo;
      const { data } = await apiClient.get(`/customers/${customerId}/followups`, { params });
      setCustomerFollowUps(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setCustomerFollowUps([]);
    }
  }, [customerId, followFrom, followQuery, followTo]);

  const loadVisits = useCallback(async () => {
    if (!customerId) return;
    setVisitsLoading(true);
    try {
      const params = {
        customerId,
        page: 1,
        limit: 100,
      };
      if (visitUserId) params.userId = visitUserId;
      if (visitDateFrom) params.dateFrom = visitDateFrom;
      if (visitDateTo) params.dateTo = visitDateTo;
      if (visitDateFrom || visitDateTo) {
        params.filterTimeZoneOffsetMinutes = -new Date().getTimezoneOffset();
      }

      const { data } = await apiClient.get('/ops/company-visits', { params });
      if (data?.success && Array.isArray(data.items)) {
        setVisits(data.items);
        setVisitsTotal(Number(data.total) || data.items.length);
      } else {
        setVisits([]);
        setVisitsTotal(0);
      }
    } catch {
      setVisits([]);
      setVisitsTotal(0);
    } finally {
      setVisitsLoading(false);
    }
  }, [customerId, visitUserId, visitDateFrom, visitDateTo]);

  useEffect(() => {
    if (!customerId || !customer) return undefined;
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
  }, [customerId, customer]);

  useEffect(() => {
    void loadCustomer();
  }, [loadCustomer]);

  useEffect(() => {
    if (tab === 'followup') void loadCustomerFollowUps();
  }, [loadCustomerFollowUps, tab]);

  useEffect(() => {
    if (tab === 'visits') void loadVisits();
  }, [tab, loadVisits]);

  useEffect(() => {
    if (!setDashboardTrail) return undefined;
    setDashboardTrail(
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Link
          to="/dashboard/track/customers"
          className="shrink-0 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-neutral-50"
        >
          ← Customers
        </Link>
        <span className="truncate text-lg font-bold tracking-tight text-dark">{title}</span>
      </div>,
    );
    return () => setDashboardTrail(null);
  }, [setDashboardTrail, title]);

  const addCustomerFollowUp = async () => {
    const note = String(followNote || '').trim();
    if (!note) {
      setError('Customer follow-up note is required.');
      return;
    }
    setFollowSaving(true);
    setError('');
    try {
      await apiClient.post(`/customers/${customerId}/followups`, {
        note,
        actionType: followType,
        nextFollowUpAt: followDate || null,
        assignedToUserId: followAssignedTo || null,
      });
      setFollowNote('');
      setFollowDate('');
      setFollowAssignedTo('');
      await loadCustomerFollowUps();
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not add customer follow-up.');
    } finally {
      setFollowSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="px-1 py-4">
        <LocationLoadingIndicator label="Loading customer…" />
      </section>
    );
  }

  if (error || !customer) {
    return (
      <section className="space-y-4 px-1 py-4 text-dark">
        <div className="alert-error">{error || 'Customer not found.'}</div>
        <button type="button" className="btn-secondary" onClick={() => navigate('/dashboard/track/customers')}>
          Back to customers
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4 text-dark">
      <div className="inline-flex rounded-full border border-neutral-200 bg-white p-0.5 shadow-sm">
        <button
          type="button"
          onClick={() => setTab('profile')}
          className={clsx(
            'rounded-full px-4 py-2 text-sm font-semibold transition',
            tab === 'profile' ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-neutral-100',
          )}
        >
          Profile
        </button>
        <button
          type="button"
          onClick={() => setTab('visits')}
          className={clsx(
            'rounded-full px-4 py-2 text-sm font-semibold transition',
            tab === 'visits' ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-neutral-100',
          )}
        >
          Visits
        </button>
        <button
          type="button"
          onClick={() => setTab('followup')}
          className={clsx(
            'rounded-full px-4 py-2 text-sm font-semibold transition',
            tab === 'followup' ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-neutral-100',
          )}
        >
          Follow-up
        </button>
      </div>

      {tab === 'visits' && (
        <div className="flux-card space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-panel-lg">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Visits — user and date</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="form-field">
              <label className="form-label-muted" htmlFor="cust-detail-visit-user">
                User
              </label>
              <UiSelect
                id="cust-detail-visit-user"
                value={visitUserId}
                onChange={setVisitUserId}
                options={userFilterOptions}
                searchable
              />
            </div>
            <div className="form-field">
              <label className="form-label-muted" htmlFor="cust-detail-visit-from">
                From date
              </label>
              <input
                id="cust-detail-visit-from"
                type="date"
                className="form-input"
                value={visitDateFrom}
                onChange={(e) => setVisitDateFrom(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="form-label-muted" htmlFor="cust-detail-visit-to">
                To date
              </label>
              <input
                id="cust-detail-visit-to"
                type="date"
                className="form-input"
                value={visitDateTo}
                onChange={(e) => setVisitDateTo(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {tab === 'followup' && (
        <div className="flux-card space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-panel-lg">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Follow-up filters</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="form-field sm:col-span-2 lg:col-span-1">
              <label className="form-label-muted" htmlFor="cust-detail-follow-search">
                Search note
              </label>
              <input
                id="cust-detail-follow-search"
                type="text"
                className="form-input"
                placeholder="Search follow-up notes"
                value={followQuery}
                onChange={(e) => setFollowQuery(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="form-label-muted" htmlFor="cust-detail-follow-from">
                From date
              </label>
              <input
                id="cust-detail-follow-from"
                type="date"
                className="form-input"
                value={followFrom}
                onChange={(e) => setFollowFrom(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="form-label-muted" htmlFor="cust-detail-follow-to">
                To date
              </label>
              <input
                id="cust-detail-follow-to"
                type="date"
                className="form-input"
                value={followTo}
                onChange={(e) => setFollowTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setFollowQuery('');
                setFollowFrom('');
                setFollowTo('');
              }}
            >
              Clear
            </button>
            <button type="button" className="btn-primary" onClick={() => void loadCustomerFollowUps()}>
              Apply
            </button>
          </div>
        </div>
      )}

      {tab === 'profile' && (
        <div className="space-y-4">
          <div className="flux-card rounded-2xl border border-neutral-200 bg-white p-5 shadow-panel-lg">
            <h2 className="mb-4 text-base font-bold text-dark">Company details</h2>
            <CustomerProfileSummary c={customer} />
          </div>

        </div>
      )}

      {tab === 'followup' && (
        <div className="flux-card rounded-2xl border border-neutral-200 bg-white p-5 shadow-panel-lg">
          <h2 className="mb-3 text-base font-bold text-dark">Customer follow-up</h2>
          <div className="grid gap-2 sm:grid-cols-5">
            <textarea
              rows={2}
              className="form-textarea sm:col-span-2"
              placeholder="Add follow-up note"
              value={followNote}
              onChange={(e) => setFollowNote(e.target.value)}
            />
            <select className="form-select" value={followType} onChange={(e) => setFollowType(e.target.value)}>
              <option value="call">Call</option>
              <option value="visit">Visit</option>
              <option value="message">Message</option>
              <option value="other">Other</option>
            </select>
            <input type="datetime-local" className="form-input" value={followDate} onChange={(e) => setFollowDate(e.target.value)} />
            <select className="form-select" value={followAssignedTo} onChange={(e) => setFollowAssignedTo(e.target.value)}>
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name || u.email || 'User'}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex justify-end">
            <button type="button" className="btn-primary" disabled={followSaving} onClick={() => void addCustomerFollowUp()}>
              {followSaving ? 'Saving...' : 'Add follow-up'}
            </button>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-100">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Next follow-up</th>
                  <th className="px-3 py-2">Assigned to</th>
                  <th className="px-3 py-2">Created by</th>
                  <th className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {customerFollowUps.length ? (
                  customerFollowUps.map((f) => (
                    <tr key={f._id} className="border-t border-neutral-100">
                      <td className="px-3 py-2">{formatDt(f.createdAt)}</td>
                      <td className="px-3 py-2 capitalize">{f.actionType || '-'}</td>
                      <td className="px-3 py-2">{formatDt(f.nextFollowUpAt)}</td>
                      <td className="px-3 py-2">{f.assignedToUserId?.name || f.assignedToUserId?.email || '-'}</td>
                      <td className="px-3 py-2">
                        {f.createdByUserId?.name ||
                          f.createdByUserId?.email ||
                          f.createdByAdminId?.name ||
                          f.createdByAdminId?.email ||
                          '-'}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700">{f.note || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      No customer follow-up history.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'visits' && (
        <div className="flux-card overflow-auto p-4 shadow-panel-lg">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-dark">Visits to this company</h2>
            {visitsLoading && <span className="text-xs text-slate-500">Loading…</span>}
          </div>
          {!visitsLoading && visits.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-600">No visits match the current filters.</p>
          )}
          {visits.length > 0 && (
            <>
              <p className="mb-2 text-xs text-slate-500">
                Showing {visits.length}
                {visitsTotal > visits.length ? ` of ${visitsTotal}` : ''}
                {visitUserId || visitDateFrom || visitDateTo ? ' (filtered)' : ''}
              </p>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600">
                    <th className="py-2 pr-2">Visited by</th>
                    <th className="py-2 pr-2">Visit day</th>
                    <th className="py-2 pr-2">Check-in</th>
                    <th className="py-2 pr-2">Check-out</th>
                    <th className="py-2 pr-2">Duration</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.map((row) => (
                    <tr key={row._id} className="border-t border-neutral-200">
                      <td className="max-w-[14rem] py-2 pr-2 font-medium text-dark">
                        <span className="line-clamp-2">{visitedByLabel(row)}</span>
                      </td>
                      <td className="py-2 pr-2">{formatDay(row.visitDate || row.checkInTime)}</td>
                      <td className="py-2 pr-2">{formatDt(row.checkInTime)}</td>
                      <td className="py-2 pr-2">{row.checkOutTime ? formatDt(row.checkOutTime) : '—'}</td>
                      <td className="py-2 pr-2">{durationLabel(row)}</td>
                      <td className="py-2">
                        <span
                          className={clsx(
                            'rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
                            row.status === 'open' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800',
                          )}
                        >
                          {row.status || '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </section>
  );
}
