import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import SlideOverPanel from '../components/common/SlideOverPanel';
import TablePagination from '../components/common/TablePagination';
import UiSelect from '../components/common/UiSelect';
import MapLocationPickerScreen from '../components/map/MapLocationPickerScreen';
import { useGoogleMaps } from '../context/GoogleMapsContext';

const STATUS_OPTIONS = [
  { value: '', label: 'All status' },
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'won', label: 'Won' },
  { value: 'dropped', label: 'Dropped' },
];

const ACTION_TYPES = [
  { value: 'call', label: 'Call' },
  { value: 'visit', label: 'Visit' },
  { value: 'message', label: 'Message' },
];

function emptyForm() {
  return {
    leadName: '',
    companyName: '',
    emailId: '',
    phoneNumber: '',
    source: '',
    status: 'new',
    assignedTo: '',
    addressText: '',
    lat: '',
    lng: '',
    convertToCustomer: false,
  };
}

export default function LeadsOverviewPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(() => emptyForm());
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState(null);
  const [editingId, setEditingId] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [lastMapPin, setLastMapPin] = useState(null);
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(10);
  const { isLoaded } = useGoogleMaps();

  const load = async (filterOverride) => {
    setListPage(1);
    setLoading(true);
    setError('');
    const effectiveSearch = filterOverride && 'search' in filterOverride ? filterOverride.search : query;
    const effectiveStatus = filterOverride && 'status' in filterOverride ? filterOverride.status : statusFilter;
    try {
      const [{ data }, { data: u }] = await Promise.all([
        apiClient.get('/leads', {
          params: {
            search: effectiveSearch,
            status: effectiveStatus,
          },
        }),
        apiClient.get('/users'),
      ]);
      setItems(Array.isArray(data?.items) ? data.items : []);
      setUsers(Array.isArray(u?.items) ? u.items : []);
      try {
        const rep = await apiClient.get('/leads/report');
        setReport(rep?.data || null);
      } catch {
        setReport(null);
      }
    } catch (e) {
      setError(e?.response?.data?.message || 'Unable to load leads.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    // Keep selection valid after reload/filter.
    setSelectedLeadIds((old) => old.filter((id) => items.some((x) => String(x._id) === id)));
  }, [items]);

  const pagedItems = useMemo(() => {
    const start = (listPage - 1) * listPageSize;
    return items.slice(start, start + listPageSize);
  }, [items, listPage, listPageSize]);

  const listTotalPages = Math.max(1, Math.ceil(items.length / listPageSize));

  useEffect(() => {
    if (listPage > listTotalPages) setListPage(listTotalPages);
  }, [listPage, listTotalPages]);

  const allPageRowsSelected =
    pagedItems.length > 0 && pagedItems.every((x) => selectedLeadIds.includes(String(x._id)));
  const selectedVisibleLeads = useMemo(
    () => items.filter((r) => selectedLeadIds.includes(String(r._id))),
    [items, selectedLeadIds],
  );

  const toggleSelectAll = () => {
    const pageIds = pagedItems.map((x) => String(x._id));
    if (!pageIds.length) return;
    if (allPageRowsSelected) {
      setSelectedLeadIds((old) => old.filter((id) => !pageIds.includes(id)));
      return;
    }
    setSelectedLeadIds((old) => [...new Set([...old, ...pageIds])]);
  };

  const toggleSelectLead = (id) => {
    setSelectedLeadIds((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]));
  };

  const resetLeadFiltersAndReload = () => {
    setQuery('');
    setStatusFilter('');
    setSelectedLeadIds([]);
    void load({ search: '', status: '' });
  };

  const userOptions = useMemo(
    () =>
      users
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        .map((u) => ({ value: String(u._id), label: u.name || u.email || 'User' })),
    [users],
  );

  const createLead = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    setSubmitError('');
    try {
      const payload = {
        leadName: form.leadName.trim(),
        companyName: form.companyName.trim(),
        emailId: form.emailId.trim(),
        phoneNumber: form.phoneNumber.trim(),
        source: form.source.trim(),
        status: form.status || 'new',
        assignedTo: form.assignedTo || null,
        address: {
          text: form.addressText.trim(),
          lat: form.lat !== '' ? Number(form.lat) : null,
          lng: form.lng !== '' ? Number(form.lng) : null,
        },
      };
      if (!payload.emailId && !payload.phoneNumber) {
        setSubmitError('Provide at least one contact: email or phone.');
        setSaving(false);
        return;
      }
      if (editingId) {
        await apiClient.put(`/leads/${editingId}`, payload);
        if (form.convertToCustomer) {
          await apiClient.post(`/leads/${editingId}/convert`);
        }
        setMessage('Lead updated successfully.');
      } else {
        const { data } = await apiClient.post('/leads', payload);
        const created = data?.item;
        if (created && form.convertToCustomer) {
          await apiClient.post(`/leads/${created._id}/convert`);
        }
        setMessage('Lead created successfully.');
      }
      setForm(emptyForm());
      setEditingId('');
      setIsPanelOpen(false);
      setLastMapPin(null);
      await load();
    } catch (e2) {
      const msg = e2?.response?.data?.message || 'Unable to save lead.';
      setSubmitError(msg);
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setForm(emptyForm());
    setEditingId('');
    setSubmitError('');
    setLastMapPin(null);
    setIsPanelOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(String(row._id));
    setForm({
      leadName: row.leadName || '',
      companyName: row.companyName || '',
      emailId: row.emailId || '',
      phoneNumber: row.phoneNumber || '',
      source: row.source || '',
      status: row.status || 'new',
      assignedTo: row.assignedTo?._id ? String(row.assignedTo._id) : '',
      addressText: row.address?.text || '',
      lat: row.address?.lat != null ? String(row.address.lat) : '',
      lng: row.address?.lng != null ? String(row.address.lng) : '',
      convertToCustomer: row.convertedToCustomer === true,
    });
    setSubmitError('');
    setLastMapPin(null);
    setIsPanelOpen(true);
  };

  const closePanel = () => {
    setIsPanelOpen(false);
    setEditingId('');
    setForm(emptyForm());
    setSubmitError('');
    setMapPickerOpen(false);
    setLastMapPin(null);
  };

  const onMapLocationConfirm = (data) => {
    setForm((prev) => ({
      ...prev,
      addressText: (data.address || prev.addressText || '').trim(),
      lat: data.lat != null ? String(data.lat) : prev.lat,
      lng: data.lng != null ? String(data.lng) : prev.lng,
    }));
    setLastMapPin({ lat: data.lat, lng: data.lng });
    setMapPickerOpen(false);
  };

  const importCsv = async (file) => {
    if (!file) return;
    setImporting(true);
    setError('');
    setMessage('');
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        setError('CSV is empty.');
        setImporting(false);
        return;
      }
      const head = lines[0].split(',').map((x) => x.trim().toLowerCase());
      const idx = {
        leadName: head.indexOf('lead name'),
        companyName: head.indexOf('company name'),
        emailId: head.indexOf('email'),
        phoneNumber: head.indexOf('phone'),
        source: head.indexOf('source'),
        status: head.indexOf('status'),
      };
      let ok = 0;
      for (let i = 1; i < lines.length; i += 1) {
        const cols = lines[i].split(',').map((x) => x.replace(/^"|"$/g, '').trim());
        const payload = {
          leadName: idx.leadName >= 0 ? cols[idx.leadName] : '',
          companyName: idx.companyName >= 0 ? cols[idx.companyName] : '',
          emailId: idx.emailId >= 0 ? cols[idx.emailId] : '',
          phoneNumber: idx.phoneNumber >= 0 ? cols[idx.phoneNumber] : '',
          source: idx.source >= 0 ? cols[idx.source] : '',
          status: idx.status >= 0 ? cols[idx.status] : 'new',
        };
        if (!payload.leadName || !payload.companyName) continue;
        if (!payload.emailId && !payload.phoneNumber) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          await apiClient.post('/leads', payload);
          ok += 1;
        } catch {
          /* skip bad row */
        }
      }
      setMessage(`Imported ${ok} lead(s).`);
      await load();
    } catch (e) {
      setError(e?.message || 'Unable to import CSV.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="space-y-5">
      {report && (
        <div className="flux-card p-3 shadow-panel-lg">
          <div className="flex flex-wrap items-start gap-2.5">
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-xl border border-neutral-200/80 bg-white px-3 py-2">
                <p className="text-[11px] text-slate-500">Total leads</p>
                <p className="text-xl font-black text-dark">{report?.metrics?.totalLeads ?? 0}</p>
              </div>
              <div className="rounded-xl border border-neutral-200/80 bg-white px-3 py-2">
                <p className="text-[11px] text-slate-500">Won leads</p>
                <p className="text-xl font-black text-dark">{report?.metrics?.wonLeads ?? 0}</p>
              </div>
              <div className="rounded-xl border border-neutral-200/80 bg-white px-3 py-2">
                <p className="text-[11px] text-slate-500">Dropped leads</p>
                <p className="text-xl font-black text-dark">{report?.metrics?.droppedLeads ?? 0}</p>
              </div>
              <div className="rounded-xl border border-neutral-200/80 bg-white px-3 py-2">
                <p className="text-[11px] text-slate-500">Conversion rate</p>
                <p className="text-xl font-black text-dark">{report?.insights?.conversionRate ?? 0}%</p>
              </div>
              <div className="rounded-xl border border-neutral-200/80 bg-white px-3 py-2">
                <p className="text-[11px] text-slate-500">Follow-up effectiveness</p>
                <p className="text-xl font-black text-dark">{report?.insights?.followUpEffectiveness ?? 0}%</p>
              </div>
            </div>
            <div className="ml-auto flex shrink-0 flex-wrap gap-2">
              <label className="btn-primary cursor-pointer whitespace-nowrap">
                {importing ? 'Importing...' : 'Import'}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  disabled={importing}
                  onChange={(e) => {
                    const f = e.target.files && e.target.files.length ? e.target.files[0] : null;
                    if (f) void importCsv(f);
                    e.target.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                disabled={!selectedVisibleLeads.length && !items.length}
                className="btn-primary whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  const sourceRows = selectedVisibleLeads.length ? selectedVisibleLeads : items;
                  const rows = sourceRows.map((r) => [r.leadName, r.companyName, r.phoneNumber || '', r.emailId || '', r.source || '', r.status, r.assignedTo?.name || '']);
                  const csv = ['Lead Name,Company Name,Phone,Email,Source,Status,Assigned To', ...rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(','))].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'leads_export.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                title={selectedVisibleLeads.length ? 'Export selected leads' : 'Export all filtered leads'}
              >
                Export
              </button>
              <button type="button" className="btn-primary inline-flex items-center gap-2 whitespace-nowrap" onClick={openCreate}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add lead
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="alert-error">{error}</p>}
      {message && <p className="alert-success">{message}</p>}

      <div className="flux-card overflow-hidden p-4 shadow-panel-lg">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[13rem] flex-1">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-primary">Search</label>
            <input className="form-input w-full py-2.5" placeholder="Search company / phone / email" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="min-w-[10rem] flex-1 sm:flex-none sm:w-[12rem]">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-primary">Status</label>
            <UiSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
              className="py-2.5"
            />
          </div>
          <button
            type="button"
            className="btn-secondary inline-flex h-10 w-10 shrink-0 items-center justify-center p-0"
            title="Reset filters and reload"
            aria-label="Reset filters and reload"
            onClick={() => resetLeadFiltersAndReload()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
          <button type="button" className="btn-secondary" onClick={() => void load()}>
            Apply
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-neutral-100">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allPageRowsSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all leads on this page"
                    />
                  </th>
                  <th className="px-3 py-2">Lead</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Assigned</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-500" colSpan={8}>
                      Loading leads...
                    </td>
                  </tr>
                ) : items.length ? (
                  pagedItems.map((row) => (
                    <tr key={row._id} className="cursor-pointer border-t border-neutral-100 hover:bg-primary/5" onClick={() => navigate(`/dashboard/track/leads/${row._id}`)}>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.includes(String(row._id))}
                          onChange={() => toggleSelectLead(String(row._id))}
                          aria-label={`Select ${row.leadName || 'lead'}`}
                        />
                      </td>
                      <td className="px-3 py-2 font-semibold text-dark">{row.leadName}</td>
                      <td className="px-3 py-2">{row.companyName}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{row.phoneNumber || row.emailId || '-'}</td>
                      <td className="px-3 py-2 capitalize">{String(row.status || '').replace(/_/g, ' ')}</td>
                      <td className="px-3 py-2">{row.assignedTo?.name || '-'}</td>
                      <td className="px-3 py-2">{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '-'}</td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 text-dark hover:bg-neutral-100"
                          title="Edit lead"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-500" colSpan={8}>
                      No leads found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        {!loading && (
          <div className="mt-4">
            <TablePagination
              page={listPage}
              pageSize={listPageSize}
              totalCount={items.length}
              onPageChange={(next) => setListPage(Math.max(1, next))}
              onPageSizeChange={(nextSize) => {
                setListPageSize(nextSize);
                setListPage(1);
              }}
              pageSizeOptions={[10, 25, 50]}
            />
          </div>
        )}
      </div>

      <SlideOverPanel
        open={isPanelOpen}
        onClose={closePanel}
        title={editingId ? 'Edit lead' : 'Add New Lead'}
        description="Lead details and assignment."
      >
        <form className="grid gap-5" onSubmit={createLead}>
          <div className="form-field">
            <label htmlFor="lead-name" className="form-label-muted">
              Lead name <span className="text-red-600">*</span>
            </label>
            <input
              id="lead-name"
              className="form-input"
              value={form.leadName}
              onChange={(e) => setForm((o) => ({ ...o, leadName: e.target.value }))}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="lead-company" className="form-label-muted">
              Company name <span className="text-red-600">*</span>
            </label>
            <input
              id="lead-company"
              className="form-input"
              value={form.companyName}
              onChange={(e) => setForm((o) => ({ ...o, companyName: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="form-field">
              <label htmlFor="lead-email" className="form-label-muted">
                Email ID
              </label>
              <input
                id="lead-email"
                type="email"
                className="form-input"
                value={form.emailId}
                onChange={(e) => setForm((o) => ({ ...o, emailId: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label htmlFor="lead-phone" className="form-label-muted">
                Phone number
              </label>
              <input
                id="lead-phone"
                className="form-input"
                value={form.phoneNumber}
                onChange={(e) => setForm((o) => ({ ...o, phoneNumber: e.target.value }))}
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">At least one contact is required: email or phone.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="form-field">
              <label htmlFor="lead-source" className="form-label-muted">
                Source
              </label>
              <input
                id="lead-source"
                className="form-input"
                value={form.source}
                onChange={(e) => setForm((o) => ({ ...o, source: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label htmlFor="lead-status" className="form-label-muted">
                Status
              </label>
              <UiSelect
                id="lead-status"
                value={form.status}
                onChange={(next) => setForm((o) => ({ ...o, status: next }))}
                options={STATUS_OPTIONS.filter((s) => s.value).map((s) => ({ value: s.value, label: s.label }))}
              />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="lead-assigned" className="form-label-muted">
              Assign to
            </label>
            <UiSelect
              id="lead-assigned"
              value={form.assignedTo}
              onChange={(next) => setForm((o) => ({ ...o, assignedTo: next }))}
              options={[{ value: '', label: 'Unassigned' }, ...userOptions]}
              searchable
            />
          </div>

          <div className="rounded-xl border border-neutral-200/90 bg-gradient-to-br from-flux-panel via-white to-primary/10 p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address from map</p>
                <p className="mt-1 text-sm text-slate-600">Pick map location to fill address and coordinates.</p>
              </div>
              <button
                type="button"
                disabled={!isLoaded || !import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                onClick={() => setMapPickerOpen(true)}
                className="btn-primary inline-flex shrink-0 items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M12 21s7-4.35 7-10a7 7 0 1 0-14 0c0 5.65 7 10 7 10z" />
                  <circle cx="12" cy="11" r="2.5" />
                </svg>
                Select on map
              </button>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="lead-address" className="form-label-muted">
              Address
            </label>
            <textarea
              id="lead-address"
              rows={3}
              className="form-textarea"
              value={form.addressText}
              onChange={(e) => setForm((o) => ({ ...o, addressText: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="form-field">
              <label htmlFor="lead-lat" className="form-label-muted">
                Latitude
              </label>
              <input
                id="lead-lat"
                className="form-input"
                value={form.lat}
                onChange={(e) => setForm((o) => ({ ...o, lat: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label htmlFor="lead-lng" className="form-label-muted">
                Longitude
              </label>
              <input
                id="lead-lng"
                className="form-input"
                value={form.lng}
                onChange={(e) => setForm((o) => ({ ...o, lng: e.target.value }))}
              />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.convertToCustomer}
              onChange={(e) => setForm((o) => ({ ...o, convertToCustomer: e.target.checked }))}
            />
            Convert to customer after save
          </label>
          {submitError && <p className="alert-error">{submitError}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={closePanel} className="btn-secondary">
              Cancel
            </button>
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update lead' : 'Add lead'}
            </button>
          </div>
        </form>
      </SlideOverPanel>

      <MapLocationPickerScreen
        open={mapPickerOpen}
        onClose={() => setMapPickerOpen(false)}
        isLoaded={isLoaded}
        initialSearch={form.addressText}
        initialPin={lastMapPin}
        onConfirm={onMapLocationConfirm}
      />
    </section>
  );
}
