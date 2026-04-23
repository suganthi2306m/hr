import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import apiClient from '../api/client';
import LocationLoadingIndicator from '../components/common/LocationLoadingIndicator';
import UiSelect from '../components/common/UiSelect';
import { formatDt, durationLabel } from '../utils/visitFormatters';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'completed', label: 'Completed' },
];

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeListResponse(data) {
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data)) return data;
  return [];
}

function VisitsPage() {
  const navigate = useNavigate();
  const { setDashboardTrail, globalSearch } = useOutletContext() || {};
  const [items, setItems] = useState([]);
  const [selectedVisitIds, setSelectedVisitIds] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);

  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [userId, setUserId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState(() => todayIso());
  const [dateTo, setDateTo] = useState(() => todayIso());

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(String(globalSearch || '').trim()), 400);
    return () => window.clearTimeout(t);
  }, [globalSearch]);

  useEffect(() => {
    setPage(1);
  }, [userId, customerId, status, dateFrom, dateTo, debouncedSearch]);

  const userOptions = useMemo(() => {
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

  const customerOptions = useMemo(() => {
    const base = [{ value: '', label: 'All sites / companies' }];
    const sorted = [...customers].sort((a, b) =>
      String(a.companyName || a.customerName || '').localeCompare(String(b.companyName || b.customerName || '')),
    );
    for (const c of sorted) {
      const label = [c.companyName, c.customerName].filter(Boolean).join(' — ') || String(c._id);
      base.push({ value: String(c._id), label });
    }
    return base;
  }, [customers]);

  const loadDirectory = useCallback(async () => {
    try {
      const [usersRes, custRes] = await Promise.all([apiClient.get('/users'), apiClient.get('/customers')]);
      setUsers(normalizeListResponse(usersRes.data));
      setCustomers(normalizeListResponse(custRes.data));
    } catch {
      setUsers([]);
      setCustomers([]);
    }
  }, []);

  const loadVisits = useCallback(
    async (pageOverride, filterOverrides) => {
      const effectivePage = pageOverride != null ? pageOverride : page;
      const from = filterOverrides?.dateFrom ?? dateFrom;
      const to = filterOverrides?.dateTo ?? dateTo;
      setLoading(true);
      setError('');
      try {
        const params = {
          page: effectivePage,
          limit: PAGE_SIZE,
        };
        if (debouncedSearch) params.search = debouncedSearch;
        if (userId) params.userId = userId;
        if (customerId) params.customerId = customerId;
        if (status) params.status = status;
        if (from) params.dateFrom = from;
        if (to) params.dateTo = to;
        if (from || to) {
          params.filterTimeZoneOffsetMinutes = -new Date().getTimezoneOffset();
        }

        const { data } = await apiClient.get('/company-visits/company', { params });
        if (!data?.success) {
          setError(data?.message || 'Unable to load visits.');
          setItems([]);
          setTotal(0);
          setTotalPages(0);
          return;
        }
        setItems(Array.isArray(data.items) ? data.items : []);
        setTotal(Number(data.total) || 0);
        setTotalPages(Number(data.totalPages) || 0);
      } catch (e) {
        setError(e?.response?.data?.message || e.message || 'Unable to load visits.');
        setItems([]);
        setTotal(0);
        setTotalPages(0);
      } finally {
        setLoading(false);
      }
    },
    [page, debouncedSearch, userId, customerId, status, dateFrom, dateTo],
  );

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    loadVisits();
  }, [loadVisits]);

  useEffect(() => {
    setSelectedVisitIds([]);
  }, [debouncedSearch, userId, customerId, status, dateFrom, dateTo]);

  useEffect(() => {
    if (!setDashboardTrail) return undefined;
    setDashboardTrail(null);
    return () => setDashboardTrail(null);
  }, [setDashboardTrail]);

  const handleRefresh = useCallback(async () => {
    const t = todayIso();
    setError('');
    try {
      await loadDirectory();
    } catch {
      /* ignore */
    }
    setDateFrom(t);
    setDateTo(t);
    setPage(1);
    await loadVisits(1, { dateFrom: t, dateTo: t });
  }, [loadDirectory, loadVisits]);

  const canGoNext = !loading && (totalPages <= 0 || page < totalPages);
  const allSelected = items.length > 0 && items.every((row) => selectedVisitIds.includes(String(row._id)));
  const pageWindow = useMemo(() => {
    if (totalPages <= 0) return [1];
    const start = Math.max(1, page - 1);
    const end = Math.min(totalPages, start + 2);
    const normalizedStart = Math.max(1, end - 2);
    const arr = [];
    for (let p = normalizedStart; p <= end; p += 1) arr.push(p);
    return arr;
  }, [page, totalPages]);

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedVisitIds([]);
      return;
    }
    setSelectedVisitIds(items.map((row) => String(row._id)));
  };

  const toggleSelectVisit = (id) => {
    setSelectedVisitIds((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]));
  };

  const fetchAllFilteredVisits = useCallback(async () => {
    const buildParams = (targetPage) => {
      const params = { page: targetPage, limit: PAGE_SIZE };
      if (debouncedSearch) params.search = debouncedSearch;
      if (userId) params.userId = userId;
      if (customerId) params.customerId = customerId;
      if (status) params.status = status;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (dateFrom || dateTo) params.filterTimeZoneOffsetMinutes = -new Date().getTimezoneOffset();
      return params;
    };

    const first = await apiClient.get('/company-visits/company', { params: buildParams(1) });
    if (!first.data?.success) return [];
    const firstItems = Array.isArray(first.data.items) ? first.data.items : [];
    const pages = Math.max(1, Number(first.data.totalPages) || 1);
    if (pages === 1) return firstItems;

    const reqs = [];
    for (let p = 2; p <= pages; p += 1) {
      reqs.push(apiClient.get('/company-visits/company', { params: buildParams(p) }));
    }
    const rest = await Promise.all(reqs);
    const all = [...firstItems];
    rest.forEach((res) => {
      if (res.data?.success && Array.isArray(res.data.items)) all.push(...res.data.items);
    });
    return all;
  }, [debouncedSearch, userId, customerId, status, dateFrom, dateTo]);

  const exportVisitRows = (sourceRows) => {
    const rows = sourceRows.map((row) => {
      const u = row.userId;
      const userLabel = u && typeof u === 'object' ? [u.name, u.email].filter(Boolean).join(' · ') : '';
      return [
        userLabel,
        row.companyName || '',
        row.customerName || '',
        formatDt(row.checkInTime),
        formatDt(row.checkOutTime),
        durationLabel(row),
        row.status || '',
      ];
    });
    const csv = [
      'User,Company,Customer,Check-in,Check-out,Duration,Status',
      ...rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'visits_export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSelectedVisits = async () => {
    try {
      const allFiltered = await fetchAllFilteredVisits();
      const sourceRows = selectedVisitIds.length
        ? allFiltered.filter((row) => selectedVisitIds.includes(String(row._id)))
        : allFiltered;
      if (!sourceRows.length) return;
      exportVisitRows(sourceRows);
    } catch {
      setError('Unable to export visits.');
    }
  };

  return (
    <>
      <section className="space-y-6">
        <div className="flux-card p-3 shadow-panel-lg sm:p-4">
          <div className="flex flex-col gap-2.5 sm:gap-2 xl:flex-row xl:flex-wrap xl:items-end xl:gap-x-2 xl:gap-y-2">
            <div className="form-field min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:basis-[min(100%,14rem)] xl:min-w-[12rem] xl:max-w-[20rem] xl:flex-[1.15] xl:basis-auto">
              <label
                className="mb-1 block text-[10px] font-semibold uppercase leading-tight tracking-wide text-primary sm:text-[11px]"
                htmlFor="visits-user"
              >
                User
              </label>
              <UiSelect
                id="visits-user"
                value={userId}
                onChange={setUserId}
                options={userOptions}
                searchable
                className="py-1.5 pl-2 pr-9 text-[10px] leading-tight sm:text-[11px]"
                menuClassName="[&_li]:py-2 [&_li]:text-[10px] sm:[&_li]:text-[11px] [&_input]:py-1.5 [&_input]:text-xs"
              />
            </div>
            <div className="form-field min-w-0 flex-1 basis-full sm:basis-[min(100%,20rem)] xl:min-w-[16rem] xl:max-w-[28rem] xl:flex-[2]">
              <label
                className="mb-1 block text-[10px] font-semibold uppercase leading-tight tracking-wide text-primary sm:text-[11px]"
                htmlFor="visits-customer"
              >
                Site / company
              </label>
              <UiSelect
                id="visits-customer"
                value={customerId}
                onChange={setCustomerId}
                options={customerOptions}
                menuClassName="max-h-72 [&_li]:py-2 [&_li]:text-[10px] sm:[&_li]:text-[11px] [&_input]:py-1.5 [&_input]:text-xs"
                searchable
                className="py-1.5 pl-2 pr-9 text-[10px] leading-tight sm:text-[11px]"
              />
            </div>
            <div className="form-field min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:basis-[8.5rem] xl:basis-0 xl:min-w-[7.5rem] xl:max-w-[9rem]">
              <label
                className="mb-1 block text-[10px] font-semibold uppercase leading-tight tracking-wide text-primary sm:text-[11px]"
                htmlFor="visits-status"
              >
                Status
              </label>
              <UiSelect
                id="visits-status"
                value={status}
                onChange={setStatus}
                options={STATUS_OPTIONS}
                searchable
                className="py-1.5 pl-2 pr-9 text-[10px] leading-tight sm:text-[11px]"
                menuClassName="[&_li]:py-2 [&_li]:text-[10px] sm:[&_li]:text-[11px] [&_input]:py-1.5 [&_input]:text-xs"
              />
            </div>
            <div className="form-field w-full max-w-[7.5rem] shrink-0 basis-auto sm:max-w-[7.25rem]">
              <label
                className="mb-1 block text-[10px] font-semibold uppercase leading-tight tracking-wide text-primary sm:text-[11px]"
                htmlFor="visits-from"
              >
                From
              </label>
              <input
                id="visits-from"
                type="date"
                className="form-input max-w-full py-1 px-1.5 text-[10px] sm:text-[11px]"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="form-field w-full max-w-[7.5rem] shrink-0 basis-auto sm:max-w-[7.25rem]">
              <label
                className="mb-1 block text-[10px] font-semibold uppercase leading-tight tracking-wide text-primary sm:text-[11px]"
                htmlFor="visits-to"
              >
                To
              </label>
              <input
                id="visits-to"
                type="date"
                className="form-input max-w-full py-1 px-1.5 text-[10px] sm:text-[11px]"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="flex shrink-0 items-end pb-0.5 sm:pb-0 xl:ml-auto">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-primary shadow-sm transition hover:border-primary/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 xl:h-[2.125rem] xl:w-[2.125rem]"
                onClick={handleRefresh}
                title="Refresh — reset dates to today and reload"
                aria-label="Refresh visits and set date range to today"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 21h5v-5" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

        <div className="flux-card overflow-hidden shadow-panel-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-600">
              {loading ? 'Loading…' : `${total} visit${total === 1 ? '' : 's'} found`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!selectedVisitIds.length && !total}
                onClick={() => void exportSelectedVisits()}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                title={selectedVisitIds.length ? 'Export selected visits' : 'Export all filtered visits'}
              >
                Export
              </button>
              <p className="text-sm text-slate-600">
                Page {page}
                {totalPages > 0 ? ` of ${totalPages}` : ''}
              </p>
            </div>
          </div>

          {loading && !items.length ? (
            <div className="flex justify-center py-16">
              <LocationLoadingIndicator label="Loading visits…" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50/80 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <th className="w-10 whitespace-nowrap px-4 py-3">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Select all visits" />
                    </th>
                    <th className="min-w-[13rem] whitespace-nowrap px-4 py-3">User</th>
                    <th className="min-w-[16rem] whitespace-nowrap px-4 py-3">Site / company</th>
                    <th className="whitespace-nowrap px-4 py-3">Check-in</th>
                    <th className="whitespace-nowrap px-4 py-3">Check-out</th>
                    <th className="whitespace-nowrap px-4 py-3">Duration</th>
                    <th className="whitespace-nowrap px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => {
                    const u = row.userId;
                    const userLabel =
                      u && typeof u === 'object' ? [u.name, u.email].filter(Boolean).join(' · ') : '—';
                    return (
                      <tr
                        key={row._id}
                        role="link"
                        tabIndex={0}
                        onClick={() => navigate(row._id, { relative: 'path' })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(row._id, { relative: 'path' });
                          }
                        }}
                        className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-primary/5"
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedVisitIds.includes(String(row._id))}
                            onChange={() => toggleSelectVisit(String(row._id))}
                            aria-label={`Select visit ${row._id}`}
                          />
                        </td>
                        <td className="min-w-[13rem] max-w-[22rem] px-4 py-3 font-medium text-dark">
                          <span className="line-clamp-2">{userLabel}</span>
                        </td>
                        <td className="min-w-[16rem] max-w-[26rem] px-4 py-3 text-slate-700">
                          <div className="font-semibold text-dark">{row.companyName || '—'}</div>
                          {row.customerName && (
                            <div className="text-xs text-slate-500">{row.customerName}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDt(row.checkInTime)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDt(row.checkOutTime)}</td>
                        <td className="whitespace-nowrap px-4 py-3">{durationLabel(row)}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={
                              row.status === 'completed'
                                ? 'rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800'
                                : 'rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800'
                            }
                          >
                            {row.status || '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !items.length && (
            <p className="px-4 py-10 text-center text-sm text-slate-500">No visits match the current filters.</p>
          )}

          <div className="flex justify-end border-t border-neutral-100 bg-white px-4 py-3">
            <nav className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 bg-flux-panel px-1.5 py-1 shadow-sm">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-white disabled:opacity-40"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              {pageWindow.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    p === page ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-white'
                  }`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-white disabled:opacity-40"
                disabled={!canGoNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </nav>
          </div>
        </div>

      </section>
    </>
  );
}

export default VisitsPage;
