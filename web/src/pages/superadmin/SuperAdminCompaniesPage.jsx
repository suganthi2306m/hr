import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';

function PencilIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export default function SuperAdminCompaniesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/super/companies', { params: { q } });
      setItems(data.items || []);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load companies.');
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = items.filter((row) => {
    const active = row.subscription?.isActive !== false;
    if (tab === 'active') return active;
    if (tab === 'inactive') return !active;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mt-1 text-sm text-slate-600">{items.length} registered companies</p>
        </div>
        <button type="button" onClick={() => navigate('/super/companies/new')} className="btn-primary px-4 py-2.5 text-sm">
          + Add company
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex flex-wrap gap-1 rounded-full border border-neutral-200 bg-white p-0.5 shadow-sm">
          {[
            { id: 'all', label: `All (${items.length})` },
            { id: 'active', label: 'Active' },
            { id: 'inactive', label: 'Inactive' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={clsx(
                'rounded-full px-4 py-1.5 text-xs font-semibold transition',
                tab === t.id ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-neutral-50',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Search companies…"
          className="form-input max-w-full sm:max-w-xs"
        />
      </div>

      {error ? <p className="alert-error text-sm">{error}</p> : null}

      <div className="flux-card overflow-hidden shadow-panel">
        <table className="w-full min-w-[720px] text-left text-sm text-dark">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50/80">
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Created by</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Branches</th>
              <th className="px-4 py-3">Expires</th>
              <th className="w-[1%] whitespace-nowrap px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No companies match.
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const maxU = row.subscription?.maxUsers;
                const maxB = row.subscription?.maxBranches;
                const exp = row.subscription?.expiresAt ? String(row.subscription.expiresAt).slice(0, 10) : '—';
                const active = row.subscription?.isActive !== false;
                return (
                  <tr
                    key={row._id}
                    className="cursor-pointer hover:bg-neutral-50/80"
                    onClick={() => navigate(`/super/companies/${row._id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/super/companies/${row._id}`);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`View ${row.name}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/25 text-xs font-bold text-dark">
                          {String(row.name || '?')
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                        <div>
                          <p className="font-semibold text-dark">{row.name}</p>
                          <p className="text-xs text-slate-500">
                            {[row.city, row.state].filter(Boolean).join(', ') || row.address?.slice(0, 40)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {row.createdBy ? (
                        <div className="min-w-[170px]">
                          <p className="font-semibold text-slate-800">{row.createdBy.name || '—'}</p>
                          <p className="truncate">{row.createdBy.email || '—'}</p>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.subscription?.planName || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          'rounded-full px-2 py-0.5 text-xs font-semibold',
                          active ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-700',
                        )}
                      >
                        {active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.staffCount}
                      {maxU != null ? ` / ${maxU}` : ''}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.branchCount}
                      {maxB != null ? ` / ${maxB}` : ''}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{exp}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          to={`/super/companies/${row._id}`}
                          className="text-sm font-semibold text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View
                        </Link>
                        <Link
                          to={`/super/companies/${row._id}/edit`}
                          className="inline-flex items-center justify-center rounded-lg border border-neutral-200 bg-white p-2 text-dark shadow-sm hover:border-primary/40 hover:bg-primary/10"
                          title="Edit company"
                          aria-label="Edit company"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <PencilIcon />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
