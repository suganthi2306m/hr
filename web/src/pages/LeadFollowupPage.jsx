import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import apiClient from '../api/client';
import TablePagination from '../components/common/TablePagination';
import UiSelect from '../components/common/UiSelect';
import { employeeSelectLabel } from '../utils/employeeSelectLabel';

const LEAD_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'won', label: 'Won' },
  { value: 'dropped', label: 'Dropped' },
];

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename, header, rows) {
  const body = [header.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
  const blob = new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function personCell(u) {
  if (!u) return '—';
  return u.name || u.email || '—';
}

function formatLeadStatus(status) {
  const s = String(status || '').trim();
  if (!s) return '—';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function LeadFollowupPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [to, setTo] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [filterCompany, setFilterCompany] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [formLeadId, setFormLeadId] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formType, setFormType] = useState('call');
  const [formNext, setFormNext] = useState('');
  const [formStatusAfter, setFormStatusAfter] = useState('');
  const [formAssignedTo, setFormAssignedTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = async (filterOverride) => {
    setLoading(true);
    setError('');
    const effectiveSearch = filterOverride && 'search' in filterOverride ? filterOverride.search : query;
    const effectiveStatus = filterOverride && 'status' in filterOverride ? filterOverride.status : status;
    const effectiveCompany = filterOverride && 'companyName' in filterOverride ? filterOverride.companyName : filterCompany;
    const effectiveUserId = filterOverride && 'userId' in filterOverride ? filterOverride.userId : filterUserId;
    const effectiveFrom = filterOverride && 'from' in filterOverride ? filterOverride.from : from;
    const effectiveTo = filterOverride && 'to' in filterOverride ? filterOverride.to : to;
    try {
      const { data } = await apiClient.get('/leads/followups', {
        params: {
          search: String(effectiveSearch || '').trim() || undefined,
          status: effectiveStatus || undefined,
          companyName: effectiveCompany || undefined,
          userId: effectiveUserId || undefined,
          from: effectiveFrom || undefined,
          to: effectiveTo || undefined,
        },
      });
      setItems(Array.isArray(data?.items) ? data.items : []);
      setPage(1);
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
    void loadLeads();
    void loadUsers();
  }, []);

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (showAdd) {
      void loadLeads();
      void loadUsers();
    }
  }, [showAdd]);

  const companySelectOptions = useMemo(() => {
    const names = new Set();
    leads.forEach((l) => {
      const n = String(l.companyName || '').trim();
      if (n) names.add(n);
    });
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    return [{ value: '', label: 'All companies' }, ...sorted.map((n) => ({ value: n, label: n }))];
  }, [leads]);

  const userSelectOptions = useMemo(() => {
    const sorted = [...users].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return [
      { value: '', label: 'All employees' },
      ...sorted.map((u) => ({ value: String(u._id), label: employeeSelectLabel(u) })),
    ];
  }, [users]);

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [items.length, pageSize, page]);

  const exportCsv = () => {
    const header = [
      'Lead',
      'Company',
      'Status',
      'Type',
      'Next follow-up',
      'Notes',
      'Created by',
      'Assigned to',
      'Created date',
    ];
    const rows = items.map((row) => [
      row.leadName || '',
      row.companyName || '',
      formatLeadStatus(row.status),
      row.followUpType || '',
      row.nextFollowUpDate ? dayjs(row.nextFollowUpDate).format('YYYY-MM-DD HH:mm') : '',
      row.notes || '',
      personCell(row.createdBy),
      personCell(row.assignedTo),
      row.createdAt ? dayjs(row.createdAt).format('YYYY-MM-DD HH:mm') : '',
    ]);
    downloadCsv(`lead-followups-${dayjs().format('YYYY-MM-DD')}.csv`, header, rows);
  };

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

  const labelCls =
    'mb-1 block text-[10px] font-semibold uppercase leading-tight tracking-wide text-primary sm:text-[11px]';

  return (
    <section className="space-y-4">
      {error && <p className="alert-error">{error}</p>}
      <div className="flux-card space-y-3 p-4 shadow-panel-lg">
        <div className="flex flex-col flex-wrap gap-3 xl:flex-row xl:items-end">
          <div className="form-field w-full min-w-0 shrink-0 xl:w-[min(200px,20%)] xl:max-w-[240px]">
            <label className={labelCls}>Company</label>
            <UiSelect value={filterCompany} onChange={setFilterCompany} options={companySelectOptions} searchable />
          </div>
          <div className="form-field w-full min-w-0 shrink-0 xl:w-[min(200px,20%)] xl:max-w-[240px]">
            <label className={labelCls}>Employee</label>
            <UiSelect value={filterUserId} onChange={setFilterUserId} options={userSelectOptions} searchable />
          </div>
          <div className="form-field w-full shrink-0 xl:w-[min(150px,14%)] xl:max-w-[170px]">
            <label className={labelCls}>Status</label>
            <UiSelect value={status} onChange={setStatus} options={LEAD_STATUS_OPTIONS} />
          </div>
          <div className="form-field w-full shrink-0 sm:w-[150px] xl:w-[150px]">
            <label className={labelCls}>Next follow-up from</label>
            <input type="date" className="form-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="form-field w-full shrink-0 sm:w-[150px] xl:w-[150px]">
            <label className={labelCls}>Next follow-up to</label>
            <input type="date" className="form-input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-neutral-100 pt-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
          <div className="min-w-0 w-full self-end lg:max-w-md lg:flex-1">
            <label htmlFor="lead-fu-search" className="sr-only">
              Search lead or company
            </label>
            <input
              id="lead-fu-search"
              className="form-input"
              placeholder="Lead or company…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-end gap-2 lg:justify-center">
            <button
              type="button"
              className="btn-secondary inline-flex h-10 w-10 shrink-0 items-center justify-center p-0"
              title="Reset filters to today and reload"
              aria-label="Reset filters to today and reload"
              onClick={() => {
                const t = dayjs().format('YYYY-MM-DD');
                setQuery('');
                setStatus('');
                setFilterCompany('');
                setFilterUserId('');
                setFrom(t);
                setTo(t);
                void load({ search: '', status: '', companyName: '', userId: '', from: t, to: t });
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 3v6h-6" />
              </svg>
            </button>
            <button type="button" className="btn-primary" onClick={() => void load()}>
              Apply
            </button>
            <button type="button" className="btn-primary" onClick={() => openAddForRow(null)}>
              Add follow-up
            </button>
            <button type="button" className="btn-primary" disabled={!items.length} onClick={exportCsv}>
              Export CSV
            </button>
          </div>
          <div className="flex w-full shrink-0 justify-start lg:w-auto lg:justify-end">
            <TablePagination
              page={page}
              pageSize={pageSize}
              totalCount={items.length}
              onPageChange={(nextPage) => setPage(Math.max(1, nextPage))}
              onPageSizeChange={(nextSize) => {
                setPageSize(nextSize);
                setPage(1);
              }}
              pageSizeOptions={[10, 25, 50]}
            />
          </div>
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
                pagedItems.map((row) => (
                  <tr
                    key={row.followUpId}
                    className="cursor-pointer border-t border-neutral-100 hover:bg-primary/5"
                    onClick={() => setSelected(row)}
                  >
                    <td className="px-3 py-2 font-semibold text-dark">{row.leadName}</td>
                    <td className="px-3 py-2">{row.companyName}</td>
                    <td className="px-3 py-2 capitalize">{formatLeadStatus(row.status)}</td>
                    <td className="px-3 py-2 capitalize">{row.followUpType || '-'}</td>
                    <td className="px-3 py-2">{row.nextFollowUpDate ? new Date(row.nextFollowUpDate).toLocaleString() : '-'}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{row.notesPreview || '-'}</td>
                    <td className="px-3 py-2">{personCell(row.createdBy)}</td>
                    <td className="px-3 py-2">{personCell(row.assignedTo)}</td>
                    <td className="px-3 py-2">{row.createdAt ? new Date(row.createdAt).toLocaleString() : '-'}</td>
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
            Lead: {selected.leadName} · {selected.companyName}
          </p>
          <p className="text-sm text-slate-700">
            Status: {formatLeadStatus(selected.status)} · Type: {selected.followUpType || '-'}
          </p>
          <p className="text-sm text-slate-700">
            Next: {selected.nextFollowUpDate ? new Date(selected.nextFollowUpDate).toLocaleString() : '-'}
          </p>
          <p className="text-sm text-slate-700">Created by: {personCell(selected.createdBy)}</p>
          <p className="text-sm text-slate-700">Assigned to: {personCell(selected.assignedTo)}</p>
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
                  {['', 'new', 'in_progress', 'follow_up', 'won', 'dropped'].map((s) => (
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
