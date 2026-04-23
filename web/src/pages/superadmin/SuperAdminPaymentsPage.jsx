import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import apiClient from '../../api/client';

function formatInrFromPaise(paise) {
  const rupees = (Number(paise) || 0) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rupees);
}

function StatCard({ label, value, icon }) {
  return (
    <div className="flux-card relative overflow-hidden border border-neutral-200/90 p-5 shadow-panel">
      <div className="absolute right-4 top-4 rounded-xl bg-primary/15 p-2 text-primary">{icon}</div>
      <p className="form-label !mb-1 !pr-14 !text-slate-500">{label}</p>
      <p className="text-2xl font-black tracking-tight text-dark sm:text-3xl">{value}</p>
    </div>
  );
}

function IconCard({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

function IconRefresh({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function IconReceipt({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2" />
      <path d="M8 10h8M8 14h8M8 6h2" />
    </svg>
  );
}

function IconSearch({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function statusTone(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'captured' || s === 'paid') return 'bg-emerald-100 text-emerald-900';
  if (s === 'failed' || s === 'declined') return 'bg-red-100 text-red-900';
  if (s === 'refunded' || s === 'partially_refunded') return 'bg-amber-100 text-amber-900';
  return 'bg-slate-200 text-slate-800';
}

function statusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'captured' || s === 'paid') return 'Paid';
  if (s === 'failed' || s === 'declined') return 'Failed';
  if (s === 'created' || s === 'pending') return 'Pending';
  if (s === 'refunded') return 'Refunded';
  if (s === 'partially_refunded') return 'Partially refunded';
  return s || 'Unknown';
}

export default function SuperAdminPaymentsPage() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stats, setStats] = useState({
    totalCapturedPaise: 0,
    refundedPaise: 0,
    paidCount: 0,
    failedCount: 0,
    pendingCount: 0,
    transactionCount: 0,
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async ({ syncPaysharp = false } = {}) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get('/super/payments', {
        params: { q: debouncedQ, status: statusFilter, ...(syncPaysharp ? { syncPaysharp: 1 } : {}) },
      });
      setStats(
        data.stats || {
          totalCapturedPaise: 0,
          refundedPaise: 0,
          paidCount: 0,
          failedCount: 0,
          pendingCount: 0,
          transactionCount: 0,
        },
      );
      setItems(data.items || []);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load payments.');
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const syncGatewayStatuses = async () => {
    setSyncing(true);
    try {
      await load({ syncPaysharp: true });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="mt-1 text-sm text-slate-600">Track payment transactions across companies.</p>
      </div>

      {error ? <p className="alert-error text-sm">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Total captured" value={formatInrFromPaise(stats.totalCapturedPaise)} icon={<IconCard />} />
        <StatCard label="Paid txns" value={String(stats.paidCount ?? 0)} icon={<IconReceipt />} />
        <StatCard label="Pending txns" value={String(stats.pendingCount ?? 0)} icon={<IconRefresh />} />
        <StatCard label="Failed txns" value={String(stats.failedCount ?? 0)} icon={<IconCard />} />
      </div>

      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <IconSearch />
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by company, email, plan, gateway, or payment ID…"
          className="form-input w-full pl-10"
          aria-label="Search payments"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex flex-wrap gap-1 rounded-full border border-neutral-200 bg-white p-0.5 shadow-sm">
          {[
            { id: 'all', label: 'All' },
            { id: 'paid', label: 'Paid' },
            { id: 'failed', label: 'Failed' },
            { id: 'pending', label: 'Pending' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={clsx(
                'rounded-full px-4 py-1.5 text-xs font-semibold transition',
                statusFilter === f.id ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-neutral-50',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn-secondary text-xs" onClick={() => void syncGatewayStatuses()} disabled={syncing}>
          {syncing ? 'Refreshing Paysharp statuses…' : 'Refresh Paysharp status'}
        </button>
      </div>

      <div className="flux-card overflow-hidden shadow-panel">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] text-left text-sm text-dark">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/80">
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Company</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Email</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Amount</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Plan</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Gateway</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Method</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Order ref</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Gateway ref</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Gateway status</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Paysharp ref</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Failure</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Paid at</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {loading ? (
                <tr>
                  <td colSpan={14} className="px-4 py-10 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-10 text-center text-slate-500">
                    No transactions yet. Payments recorded by your billing integration will show here.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row._id} className="hover:bg-neutral-50/80">
                    <td className="px-4 py-3 font-medium text-dark">{row.company}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-slate-700" title={row.email}>
                      {row.email}
                    </td>
                    <td className="px-4 py-3 font-semibold text-dark">{formatInrFromPaise(row.amountPaise)}</td>
                    <td className="px-4 py-3 text-slate-700">{row.plan}</td>
                    <td className="px-4 py-3 capitalize text-slate-700">{row.gateway}</td>
                    <td className="px-4 py-3 capitalize text-slate-700">{row.method}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('rounded-full px-2 py-0.5 text-xs font-semibold', statusTone(row.status))}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="max-w-[120px] truncate px-4 py-3 font-mono text-xs text-slate-600" title={row.gatewayOrderId}>
                      {row.gatewayOrderId}
                    </td>
                    <td className="max-w-[120px] truncate px-4 py-3 font-mono text-xs text-slate-600" title={row.gatewayPaymentId}>
                      {row.gatewayPaymentId}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">{row.gatewayStatus || '—'}</td>
                    <td className="max-w-[140px] truncate px-4 py-3 font-mono text-xs text-slate-600" title={row.paysharpReferenceNo}>
                      {row.paysharpReferenceNo || '—'}
                    </td>
                    <td className="max-w-[240px] whitespace-normal px-4 py-3 text-xs text-red-700" title={row.failureReason}>
                      {row.failureReason || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {row.paidAt ? new Date(row.paidAt).toLocaleString() : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
