import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import apiClient from '../../api/client';

function StatCard({ label, value, hint, icon }) {
  return (
    <div className="flux-card relative overflow-hidden border border-neutral-200/90 p-5 shadow-panel">
      <div className="absolute right-4 top-4 rounded-xl bg-primary/15 p-2 text-primary">{icon}</div>
      <p className="form-label !mb-1 !pr-14 !text-slate-500">{label}</p>
      <p className="text-3xl font-black tracking-tight text-dark">{value ?? '—'}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function IconBuilding() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
      <path d="M4 21V8l8-4 8 4v13" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

function IconKey() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
      <circle cx="8" cy="15" r="4" />
      <path d="M12 11l8-8M16 7l4 4" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c1.6-3.5 4.2-5 6-5 2.2 0 4.8 1.5 6.4 5" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}

export default function SuperAdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get('/super/dashboard');
        if (!cancelled) setStats(data);
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.message || 'Could not load dashboard.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const health = [
    { label: 'Active', value: stats?.licensesActive, tone: 'border-emerald-200 bg-emerald-50/80 text-emerald-900' },
    { label: 'Expired', value: stats?.licensesExpired, tone: 'border-red-200 bg-red-50/80 text-red-900' },
    { label: 'Suspended', value: stats?.licensesSuspended, tone: 'border-amber-200 bg-amber-50/80 text-amber-900' },
    { label: 'Unassigned', value: stats?.licensesUnassigned, tone: 'border-slate-200 bg-slate-50 text-slate-800' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="mt-1 text-sm text-slate-600">Overview of your LiveTrack platform.</p>
      </div>
      {error ? <p className="alert-error text-sm">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Companies"
          value={stats?.companies}
          hint={stats ? `${stats.companiesActive || 0} active subscription(s)` : null}
          icon={<IconBuilding />}
        />
        <StatCard
          label="Licenses"
          value={stats?.licenses}
          hint={stats ? `${stats.licensesActive || 0} in good standing` : null}
          icon={<IconKey />}
        />
        <StatCard label="Plans (active)" value={stats?.plans} hint="Tiers available for assignment" icon={<IconLayers />} />
        <StatCard
          label="Staff (all tenants)"
          value={stats?.staffTotal}
          hint={`${stats?.tenantAdmins ?? '—'} tenant admin accounts`}
          icon={<IconUsers />}
        />
      </div>

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">License health</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {health.map((h) => (
            <div key={h.label} className={clsx('rounded-2xl border px-4 py-3 shadow-sm', h.tone)}>
              <p className="text-xs font-semibold uppercase opacity-80">{h.label}</p>
              <p className="mt-1 text-2xl font-black">{h.value ?? '—'}</p>
            </div>
          ))}
        </div>
        {stats?.licensesRevoked ? (
          <p className="mt-2 text-xs text-slate-500">{stats.licensesRevoked} revoked (excluded from counts above)</p>
        ) : null}
      </div>

      <div className="flux-card border border-neutral-200/90 p-5 shadow-panel">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-dark">Recent companies</h3>
          <Link to="/super/companies" className="text-xs font-semibold text-primary hover:underline">
            View all
          </Link>
        </div>
        {!stats?.recentCompanies?.length ? (
          <p className="text-sm text-slate-500">No companies yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {stats.recentCompanies.map((c) => (
              <li key={c._id}>
                <Link
                  to={`/super/companies/${c._id}`}
                  className="flex items-center justify-between gap-3 py-3 transition hover:bg-neutral-50/80"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-dark">
                      {String(c.name || '?')
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-dark">{c.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {c.staffCount} staff · {c.planName || 'No plan'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={clsx(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                      c.active ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-700',
                    )}
                  >
                    {c.active ? 'active' : 'inactive'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
