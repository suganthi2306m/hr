import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import apiClient from '../../api/client';
import SlideOverPanel from '../common/SlideOverPanel';
import MapLocationPickerScreen from '../map/MapLocationPickerScreen';
import LocationLoadingIndicator from '../common/LocationLoadingIndicator';
import SelectionCountBadge from '../common/SelectionCountBadge';
import UiSelect from '../common/UiSelect';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { MAX_BRANCHES, branchMatchesSearch, isBranchOperationalActive } from '../../utils/branchWorkspace';

const PAGE_SIZE = 12;

const SUB_TABS = [
  { id: 'manage', label: 'Branch management' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'notAssigned', label: 'Not assigned' },
];

function emptyPanelForm() {
  return {
    name: '',
    code: '',
    phone: '',
    city: '',
    state: '',
    country: '',
    pincode: '',
    address: '',
    geoLat: '',
    geoLng: '',
    radiusM: 150,
    isHeadOffice: false,
    geofenceEnabled: true,
  };
}

function branchToPanelForm(b) {
  const g = b.geofence || {};
  return {
    name: b.name || '',
    code: b.code || '',
    phone: b.phone || '',
    city: b.city || '',
    state: b.state || '',
    country: b.country || '',
    pincode: b.pincode || '',
    address: b.address || '',
    geoLat: g.lat !== '' && g.lat != null && Number.isFinite(Number(g.lat)) ? String(g.lat) : '',
    geoLng: g.lng !== '' && g.lng != null && Number.isFinite(Number(g.lng)) ? String(g.lng) : '',
    radiusM: Math.max(10, Number(g.radiusM) || 150),
    isHeadOffice: Boolean(b.isHeadOffice),
    geofenceEnabled: g.enabled !== false,
  };
}

function panelFormToBranchRow(form, existingId) {
  const latN = form.geoLat !== '' ? Number(form.geoLat) : NaN;
  const lngN = form.geoLng !== '' ? Number(form.geoLng) : NaN;
  return {
    ...(existingId && /^[a-f\d]{24}$/i.test(existingId) ? { _id: existingId } : {}),
    name: String(form.name || '').trim(),
    code: String(form.code || '').trim(),
    phone: String(form.phone || '').trim(),
    city: String(form.city || '').trim(),
    state: String(form.state || '').trim(),
    country: String(form.country || '').trim(),
    pincode: String(form.pincode || '').trim(),
    address: String(form.address || '').trim(),
    isHeadOffice: Boolean(form.isHeadOffice),
    geofence: {
      lat: Number.isFinite(latN) ? latN : '',
      lng: Number.isFinite(lngN) ? lngN : '',
      radiusM: Math.max(10, Math.round(Number(form.radiusM) || 150)),
      address: String(form.address || '').trim(),
      enabled: Boolean(form.geofenceEnabled),
    },
  };
}

function asNonNegativeInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function previewGeneratedCode(cfg) {
  if (!cfg || cfg.enabled !== true) return '';
  const start = asNonNegativeInt(cfg.startNumber, 1);
  const next = Math.max(start, asNonNegativeInt(cfg.nextNumber, start));
  const padLength = asNonNegativeInt(cfg.padLength, 0);
  return `${String(cfg.prefix || '').trim()}${String(next).padStart(padLength, '0')}`;
}

/**
 * Customer-style branch list + slide-over create/edit (map picker, filters, no import/export).
 */
export default function BranchesDirectoryPanel({
  branches,
  onPersist,
  saving,
  loading = false,
  idGenerationBranch = null,
  maxBranchLimit = null,
}) {
  const [branchQuery, setBranchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [directoryPage, setDirectoryPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState([]);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(-1);
  const [form, setForm] = useState(emptyPanelForm);
  const [submitError, setSubmitError] = useState('');
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [lastMapPin, setLastMapPin] = useState(null);
  const branchCodeAutoEnabled = Boolean(idGenerationBranch?.enabled);

  const { isLoaded, loadError: mapsLoadError } = useGoogleMaps();

  const [subTab, setSubTab] = useState('manage');
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [assignDraft, setAssignDraft] = useState({});
  const [assignSavingId, setAssignSavingId] = useState('');
  const effectiveBranchLimit = Number.isFinite(Number(maxBranchLimit)) && Number(maxBranchLimit) > 0
    ? Math.floor(Number(maxBranchLimit))
    : MAX_BRANCHES;

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { data } = await apiClient.get('/users');
      setUsers(Array.isArray(data.items) ? data.items : []);
    } catch {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (subTab === 'assigned' || subTab === 'notAssigned') loadUsers();
  }, [subTab, loadUsers]);

  const branchIdSet = useMemo(
    () => new Set((branches || []).filter((b) => b?._id).map((b) => String(b._id))),
    [branches],
  );

  const staffByBranchId = useMemo(() => {
    const map = new Map();
    (branches || []).forEach((b) => {
      if (b._id) map.set(String(b._id), []);
    });
    users.forEach((u) => {
      const bid = u.branchId != null ? String(u.branchId).trim() : '';
      if (bid && map.has(bid)) map.get(bid).push(u);
    });
    return map;
  }, [branches, users]);

  const assignedRows = useMemo(() => {
    return users.filter((u) => {
      const bid = u.branchId != null ? String(u.branchId).trim() : '';
      return bid && branchIdSet.has(bid);
    });
  }, [users, branchIdSet]);

  const notAssignedRows = useMemo(() => {
    return users.filter((u) => {
      const bid = u.branchId != null ? String(u.branchId).trim() : '';
      return !bid || !branchIdSet.has(bid);
    });
  }, [users, branchIdSet]);

  const branchSelectOptions = useMemo(
    () => [
      { value: '', label: 'No branch' },
      ...branches
        .filter((b) => b._id)
        .map((b) => ({
          value: String(b._id),
          label: b.code ? `${b.name} (${b.code})` : b.name,
        })),
    ],
    [branches],
  );

  const assignBranch = async (userId, nextBranchId) => {
    setAssignSavingId(String(userId));
    setAssignError('');
    try {
      await apiClient.put(`/users/${userId}`, { branchId: nextBranchId || '' });
      await loadUsers();
      setAssignDraft((d) => ({ ...d, [userId]: nextBranchId || '' }));
    } catch (e) {
      setAssignError(e.response?.data?.message || 'Unable to update branch assignment.');
    } finally {
      setAssignSavingId('');
    }
  };

  const filtered = useMemo(() => {
    return branches.filter((b) => {
      if (statusFilter === 'active' && !isBranchOperationalActive(b)) return false;
      if (statusFilter === 'inactive' && isBranchOperationalActive(b)) return false;
      if (!branchMatchesSearch(b, branchQuery)) return false;
      return true;
    });
  }, [branches, branchQuery, statusFilter]);

  const directoryTotalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const start = (directoryPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, directoryPage]);

  useEffect(() => {
    setDirectoryPage(1);
  }, [branchQuery, statusFilter]);

  useEffect(() => {
    if (directoryPage > directoryTotalPages) setDirectoryPage(directoryTotalPages);
  }, [directoryPage, directoryTotalPages]);

  const allPageSelected =
    paged.length > 0 && paged.every((b) => selectedIds.includes(String(b._id || `idx-${branches.indexOf(b)}`)));

  const rowKey = (b) => (b._id ? String(b._id) : `tmp-${branches.indexOf(b)}`);

  const toggleSelectAllPage = () => {
    if (allPageSelected) {
      setSelectedIds((old) => old.filter((id) => !paged.some((b) => rowKey(b) === id)));
      return;
    }
    setSelectedIds((old) => {
      const next = new Set(old);
      paged.forEach((b) => next.add(rowKey(b)));
      return [...next];
    });
  };

  const toggleSelectOne = (b) => {
    const id = rowKey(b);
    setSelectedIds((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]));
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingIndex(-1);
    setForm(emptyPanelForm());
    setSubmitError('');
    setMapPickerOpen(false);
    setLastMapPin(null);
  };

  const startCreate = () => {
    if (branches.length >= effectiveBranchLimit) {
      window.alert('You have reached the limit. Kindly upgrade plan.');
      return;
    }
    setEditingIndex(-1);
    setForm({
      ...emptyPanelForm(),
      isHeadOffice: branches.length === 0,
    });
    setSubmitError('');
    setLastMapPin(null);
    setPanelOpen(true);
  };

  const startEdit = (index) => {
    const b = branches[index];
    if (!b) return;
    setEditingIndex(index);
    setForm(branchToPanelForm(b));
    setSubmitError('');
    setLastMapPin(null);
    setPanelOpen(true);
  };

  const applyPersist = async (nextBranches) => {
    await onPersist(nextBranches);
    await loadUsers();
  };

  const handlePanelSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    if (!String(form.name || '').trim()) {
      setSubmitError('Branch name is required.');
      return;
    }
    const needsManualCode = editingIndex >= 0 || !branchCodeAutoEnabled;
    if (needsManualCode && !String(form.code || '').trim()) {
      setSubmitError('Branch ID is required.');
      return;
    }
    if (!String(form.city || '').trim() || !String(form.pincode || '').trim() || !String(form.address || '').trim()) {
      setSubmitError('City, pincode, and address are required.');
      return;
    }
    if (form.geofenceEnabled) {
      const latN = form.geoLat !== '' ? Number(form.geoLat) : NaN;
      const lngN = form.geoLng !== '' ? Number(form.geoLng) : NaN;
      if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
        setSubmitError('Active attendance zone needs a map pin (use Select on map).');
        return;
      }
    }

    const existingId = editingIndex >= 0 ? branches[editingIndex]?._id : '';
    const row = panelFormToBranchRow(form, existingId);

    let next;
    if (editingIndex < 0) {
      next = [...branches, row].slice(0, effectiveBranchLimit);
    } else {
      next = branches.map((b, i) => (i === editingIndex ? row : b));
    }
    if (row.isHeadOffice) {
      next = next.map((b) => ({ ...b, isHeadOffice: false })).map((b, i) => {
        const idx = editingIndex < 0 ? next.length - 1 : editingIndex;
        return i === idx ? { ...b, isHeadOffice: true } : b;
      });
    } else if (!next.some((b) => b.isHeadOffice) && next.length) {
      next = next.map((b, i) => ({ ...b, isHeadOffice: i === 0 }));
    }

    try {
      await applyPersist(next);
      closePanel();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message;
      if (msg) setSubmitError(String(msg));
    }
  };

  const deleteAt = async (index) => {
    if (!window.confirm('Remove this branch from your organization?')) return;
    const next = branches.filter((_, i) => i !== index);
    if (next.length && !next.some((b) => b.isHeadOffice)) {
      next[0] = { ...next[0], isHeadOffice: true };
    }
    try {
      await applyPersist(next);
    } catch {
      /* parent surfaced error */
    }
  };

  const updateRowEnabled = async (index, enabled) => {
    const next = branches.map((b, i) => {
      if (i !== index) return b;
      return {
        ...b,
        geofence: { ...(b.geofence || {}), enabled },
      };
    });
    try {
      await applyPersist(next);
    } catch {
      /* parent surfaced error */
    }
  };

  const bulkSetEnabled = async (enabled) => {
    const sel = branches.filter((b) => selectedIds.includes(rowKey(b)));
    if (!sel.length) {
      window.alert('Select branches first.');
      return;
    }
    const next = branches.map((b) =>
      selectedIds.includes(rowKey(b)) ? { ...b, geofence: { ...(b.geofence || {}), enabled } } : b,
    );
    try {
      await applyPersist(next);
      setSelectedIds([]);
    } catch {
      /* parent surfaced error */
    }
  };

  const bulkDelete = async () => {
    const sel = branches.filter((b) => selectedIds.includes(rowKey(b)));
    if (!sel.length) {
      window.alert('Select branches first.');
      return;
    }
    if (!window.confirm(`Delete ${sel.length} selected branch(es)?`)) return;
    const next = branches.filter((b) => !selectedIds.includes(rowKey(b)));
    if (next.length && !next.some((b) => b.isHeadOffice)) {
      next[0] = { ...next[0], isHeadOffice: true };
    }
    try {
      await applyPersist(next);
      setSelectedIds([]);
    } catch {
      /* parent surfaced error */
    }
  };

  const onMapLocationConfirm = useCallback((data) => {
    setForm((prev) => ({
      ...prev,
      address: (data.address || prev.address || '').trim(),
      city: (data.city || prev.city || '').trim(),
      pincode: (data.pincode || prev.pincode || '').trim(),
      state: (data.state || prev.state || '').trim(),
      country: (data.country || prev.country || '').trim(),
      geoLat: data.lat != null ? String(data.lat) : prev.geoLat,
      geoLng: data.lng != null ? String(data.lng) : prev.geoLng,
    }));
    setLastMapPin({ lat: data.lat, lng: data.lng });
    setMapPickerOpen(false);
  }, []);

  return (
    <div className="space-y-4">
      {mapsLoadError && (
        <p className="alert-error text-sm">
          Maps failed to load. {String(mapsLoadError.message || mapsLoadError)}
        </p>
      )}

      <div className="flex flex-wrap gap-1 border-b border-neutral-200 pb-0.5">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={clsx(
              'rounded-t-lg px-4 py-2 text-sm font-bold transition',
              subTab === t.id ? 'border-b-2 border-primary text-primary' : 'text-slate-500 hover:text-dark',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'manage' && (
        <>
      <div className="flux-card p-4 shadow-panel-lg">
        <div className="flex w-full flex-row flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 basis-[min(100%,220px)]">
            <label htmlFor="branch-directory-search" className="sr-only">
              Search branches
            </label>
            <input
              id="branch-directory-search"
              className="form-input w-full py-2.5"
              value={branchQuery}
              onChange={(e) => setBranchQuery(e.target.value)}
              placeholder="Search: name, code, phone, address, city, pincode…"
            />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
            <div className="inline-flex rounded-full border border-neutral-200 bg-flux-panel p-0.5">
              {[
                { id: 'all', label: 'All' },
                { id: 'active', label: 'Active' },
                { id: 'inactive', label: 'Inactive' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStatusFilter(opt.id)}
                  className={clsx(
                    'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                    statusFilter === opt.id ? 'bg-white text-dark shadow-sm' : 'text-slate-600 hover:text-dark',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="whitespace-nowrap text-sm text-slate-500">
              {filtered.length} of {branches.length} shown
            </span>
          </div>
          <button
            type="button"
            onClick={startCreate}
            disabled={branches.length >= effectiveBranchLimit || saving}
            className="btn-primary inline-flex shrink-0 items-center gap-2 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create branch
          </button>
        </div>
      </div>

      <div className="flux-card overflow-auto p-4 shadow-panel-lg">
        <div className="mb-3">
          <h4 className="text-base font-semibold text-dark">Branch list</h4>
        </div>

        {loading && <LocationLoadingIndicator label="Loading branches…" className="mb-3" />}

        {!!selectedIds.length && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-flux-panel px-3 py-2">
            <SelectionCountBadge selectedCount={selectedIds.length} totalCount={filtered.length} />
            <button type="button" className="btn-secondary text-xs" onClick={() => void bulkSetEnabled(true)}>
              Set Active
            </button>
            <button type="button" className="btn-secondary text-xs" onClick={() => void bulkSetEnabled(false)}>
              Set Inactive
            </button>
            <button
              type="button"
              className="inline-flex items-center rounded-lg border border-primary bg-primary/10 px-3 py-2 text-xs font-semibold text-dark hover:bg-primary/20"
              onClick={() => void bulkDelete()}
            >
              Delete selected
            </button>
          </div>
        )}

        <table className="min-w-full text-dark">
          <thead>
            <tr className="text-left text-primary">
              <th className="w-10 px-2 py-2">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectAllPage}
                  aria-label="Select all branches on page"
                />
              </th>
              <th className="px-2 py-2">Branch</th>
              <th className="px-2 py-2">Branch ID</th>
              <th className="px-2 py-2">Staff</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Zone</th>
              <th className="px-2 py-2">Phone</th>
              <th className="min-w-[12rem] max-w-xs px-2 py-2">Address</th>
              <th className="w-[1%] whitespace-nowrap px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((b) => {
              const globalIndex = branches.indexOf(b);
              const id = rowKey(b);
              const bid = b._id != null ? String(b._id) : '';
              const staffCount = bid ? (staffByBranchId.get(bid) || []).length : 0;
              return (
                <tr
                  key={id}
                  className="cursor-pointer border-t border-neutral-200 transition hover:bg-neutral-50/80"
                  onClick={() => startEdit(globalIndex)}
                >
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(id)}
                      onChange={() => toggleSelectOne(b)}
                      aria-label={`Select ${b.name || 'branch'}`}
                    />
                  </td>
                  <td className="px-2 py-2 font-medium">{b.name || '—'}</td>
                  <td className="px-2 py-2 font-mono text-sm text-slate-800">{b.code || '—'}</td>
                  <td className="px-2 py-2 font-semibold text-dark">{staffCount}</td>
                  <td className="px-2 py-2">
                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-dark">
                      {b.isHeadOffice ? 'Head office' : 'Branch'}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={clsx(
                        'rounded-full px-2 py-0.5 text-xs font-semibold',
                        isBranchOperationalActive(b) ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-700',
                      )}
                    >
                      {isBranchOperationalActive(b) ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-slate-800">{b.phone || '—'}</td>
                  <td className="max-w-xs px-2 py-2 align-top text-slate-800">
                    <span className="line-clamp-2 whitespace-normal break-words" title={b.address}>
                      {[b.address, b.city, b.pincode].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </td>
                  <td className="px-2 py-2 align-middle">
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => void updateRowEnabled(globalIndex, !isBranchOperationalActive(b))}
                        className={clsx(
                          'inline-flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition',
                          isBranchOperationalActive(b) ? 'border-primary bg-primary' : 'border-primary/50 bg-primary/15',
                        )}
                        title={isBranchOperationalActive(b) ? 'Active zone — click to deactivate' : 'Inactive — click to activate'}
                        aria-label="Toggle attendance zone"
                      >
                        <span
                          className={clsx(
                            'h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform',
                            isBranchOperationalActive(b) ? 'translate-x-4' : 'translate-x-0',
                          )}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(globalIndex)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 text-dark hover:bg-neutral-100"
                        title="Edit branch"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteAt(globalIndex)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary bg-primary/10 text-dark hover:bg-primary/20"
                        title="Delete branch"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!paged.length && !loading && (
              <tr>
                <td className="py-8 text-center text-slate-600" colSpan={9}>
                  {branches.length ? 'No branches match your filters.' : 'No branches yet — create one to get started.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filtered.length > PAGE_SIZE && (
          <div className="mt-4 flex justify-end">
            <nav className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 bg-flux-panel px-1.5 py-1 shadow-sm">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-white disabled:opacity-40"
                disabled={directoryPage <= 1}
                onClick={() => setDirectoryPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <span className="px-2 text-sm text-slate-600">
                {directoryPage} / {directoryTotalPages}
              </span>
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-white disabled:opacity-40"
                disabled={directoryPage >= directoryTotalPages}
                onClick={() => setDirectoryPage((p) => Math.min(directoryTotalPages, p + 1))}
              >
                Next
              </button>
            </nav>
          </div>
        )}
      </div>
        </>
      )}

      {subTab === 'assigned' && (
        <div className="flux-card space-y-3 p-4 shadow-panel-lg">
          <h4 className="text-base font-semibold text-dark">Employees assigned to a branch</h4>
          {assignError && <p className="alert-error">{assignError}</p>}
          {loadingUsers ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-100">
              <table className="min-w-[40rem] w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-2 py-2">Employee</th>
                    <th className="px-2 py-2">Email</th>
                    <th className="px-2 py-2">Branch</th>
                    <th className="px-2 py-2">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedRows.map((u) => {
                    const br = branches.find((b) => String(b._id) === String(u.branchId));
                    return (
                      <tr key={u._id} className="border-t border-slate-100">
                        <td className="px-2 py-2 font-medium text-dark">{u.name}</td>
                        <td className="px-2 py-2 text-slate-600">{u.email}</td>
                        <td className="px-2 py-2">{br ? (br.code ? `${br.name} (${br.code})` : br.name) : '—'}</td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <UiSelect
                              id={`branch-assigned-change-${u._id}`}
                              className="min-w-[10rem]"
                              value={assignDraft[u._id] != null ? assignDraft[u._id] : String(u.branchId)}
                              onChange={(v) => setAssignDraft((d) => ({ ...d, [u._id]: v }))}
                              options={branchSelectOptions.filter((o) => o.value !== '')}
                            />
                            <button
                              type="button"
                              className="btn-secondary text-xs"
                              disabled={assignSavingId === String(u._id)}
                              onClick={() =>
                                assignBranch(u._id, assignDraft[u._id] != null ? assignDraft[u._id] : String(u.branchId))
                              }
                            >
                              {assignSavingId === String(u._id) ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!assignedRows.length && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-500">
                        No employees are assigned to these branches yet. Use Not assigned or Branch management.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === 'notAssigned' && (
        <div className="flux-card space-y-3 p-4 shadow-panel-lg">
          <h4 className="text-base font-semibold text-dark">Employees without a branch</h4>
          {assignError && <p className="alert-error">{assignError}</p>}
          {loadingUsers ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-100">
              <table className="min-w-[32rem] w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-2 py-2">Employee</th>
                    <th className="px-2 py-2">Email</th>
                    <th className="px-2 py-2">Assign branch</th>
                  </tr>
                </thead>
                <tbody>
                  {notAssignedRows.map((u) => (
                    <tr key={u._id} className="border-t border-slate-100">
                      <td className="px-2 py-2 font-medium text-dark">{u.name}</td>
                      <td className="px-2 py-2 text-slate-600">{u.email}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <UiSelect
                            id={`branch-not-assigned-${u._id}`}
                            className="min-w-[10rem]"
                            value={assignDraft[u._id] ?? ''}
                            onChange={(v) => setAssignDraft((d) => ({ ...d, [u._id]: v }))}
                            options={branchSelectOptions}
                          />
                          <button
                            type="button"
                            className="btn-primary text-xs"
                            disabled={!assignDraft[u._id] || assignSavingId === String(u._id)}
                            onClick={() => assignBranch(u._id, assignDraft[u._id])}
                          >
                            {assignSavingId === String(u._id) ? 'Saving…' : 'Assign'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!notAssignedRows.length && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-slate-500">
                        Everyone is assigned to a branch.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <SlideOverPanel
        open={panelOpen}
        onClose={closePanel}
        title={editingIndex >= 0 ? 'Edit branch' : 'Add New Branch'}
        description="Branch sites and attendance zones match your mobile check-in rules."
      >
        <form className="grid gap-5" onSubmit={handlePanelSubmit}>
          {editingIndex < 0 && branches.length > 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Saving sends <strong>every</strong> branch in the list. Any other site that is <strong>Active</strong> must
              already have a map pin — otherwise fix that row first (edit it and use Select on map), or set its zone to{' '}
              <strong>Inactive</strong>.
            </p>
          ) : null}
          <div className="rounded-xl border border-neutral-200 bg-flux-panel p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attendance zone</p>
            <div className="mt-3 inline-flex rounded-full border border-neutral-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setForm((o) => ({ ...o, geofenceEnabled: true }))}
                className={clsx(
                  'rounded-full px-4 py-2 text-sm font-semibold transition',
                  form.geofenceEnabled ? 'bg-primary text-dark shadow-sm' : 'text-slate-600',
                )}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setForm((o) => ({ ...o, geofenceEnabled: false }))}
                className={clsx(
                  'rounded-full px-4 py-2 text-sm font-semibold transition',
                  !form.geofenceEnabled ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-600',
                )}
              >
                Inactive
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Inactive keeps the branch on file but skips syncing an attendance circle.</p>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-flux-panel p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Head office</p>
            <div className="mt-3 inline-flex rounded-full border border-neutral-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setForm((o) => ({ ...o, isHeadOffice: true }))}
                className={clsx(
                  'rounded-full px-4 py-2 text-sm font-semibold transition',
                  form.isHeadOffice ? 'bg-primary text-dark shadow-sm' : 'text-slate-600',
                )}
              >
                This site is head office
              </button>
              <button
                type="button"
                onClick={() => setForm((o) => ({ ...o, isHeadOffice: false }))}
                className={clsx(
                  'rounded-full px-4 py-2 text-sm font-semibold transition',
                  !form.isHeadOffice ? 'bg-primary text-dark shadow-sm' : 'text-slate-600',
                )}
              >
                Branch site
              </button>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="br-name" className="form-label-muted">
              Branch name <span className="text-red-600">*</span>
            </label>
            <input
              id="br-name"
              className="form-input"
              value={form.name}
              onChange={(e) => setForm((o) => ({ ...o, name: e.target.value }))}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="br-code" className="form-label-muted">
              Branch ID {(editingIndex >= 0 || !branchCodeAutoEnabled) ? <span className="text-red-600">*</span> : null}
            </label>
            <input
              id="br-code"
              className={`form-input${editingIndex < 0 && branchCodeAutoEnabled ? ' cursor-default bg-flux-panel text-slate-700' : ''}`}
              value={
                editingIndex < 0 && branchCodeAutoEnabled
                  ? String(form.code || '').trim() || previewGeneratedCode(idGenerationBranch) || ''
                  : form.code
              }
              onChange={(e) => {
                if (editingIndex < 0 && branchCodeAutoEnabled) return;
                setForm((o) => ({ ...o, code: e.target.value }));
              }}
              readOnly={Boolean(editingIndex < 0 && branchCodeAutoEnabled)}
              autoComplete={editingIndex < 0 && branchCodeAutoEnabled ? 'off' : undefined}
              placeholder={
                editingIndex < 0 && branchCodeAutoEnabled
                  ? 'Assigned on save from ID settings'
                  : 'e.g. BLR-HO'
              }
              required={editingIndex >= 0 || !branchCodeAutoEnabled}
              title={
                editingIndex < 0 && branchCodeAutoEnabled
                  ? 'Branch ID is auto-generated from Settings → Employee ID & Branch ID'
                  : undefined
              }
            />
            {editingIndex < 0 && branchCodeAutoEnabled ? (
              <p className="mt-1 text-xs text-slate-500">
                Auto-generated from company settings (next: {previewGeneratedCode(idGenerationBranch) || '—'}).
              </p>
            ) : null}
          </div>

          <div className="form-field">
            <label htmlFor="br-phone" className="form-label-muted">
              Branch phone
            </label>
            <input
              id="br-phone"
              type="tel"
              className="form-input"
              value={form.phone}
              onChange={(e) => setForm((o) => ({ ...o, phone: e.target.value }))}
            />
          </div>

          <div className="rounded-xl border border-neutral-200/90 bg-gradient-to-br from-flux-panel via-white to-primary/10 p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address from map</p>
                <p className="mt-1 text-sm text-slate-600">
                  Search or drop a pin: we fill address fields and capture latitude and longitude. Radius below applies to
                  attendance check-in and check-out.
                </p>
              </div>
              <button
                type="button"
                disabled={!isLoaded || !import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                onClick={() => setMapPickerOpen(true)}
                className="btn-primary inline-flex shrink-0 items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
                  <path d="M12 21s7-4.35 7-10a7 7 0 1 0-14 0c0 5.65 7 10 7 10z" />
                  <circle cx="12" cy="11" r="2.5" />
                </svg>
                Select on map
              </button>
            </div>
            {!import.meta.env.VITE_GOOGLE_MAPS_API_KEY && (
              <p className="mt-2 text-sm text-amber-700">Add VITE_GOOGLE_MAPS_API_KEY to enable map selection.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-field">
              <label htmlFor="br-city" className="form-label-muted">
                City <span className="text-red-600">*</span>
              </label>
              <input
                id="br-city"
                className="form-input"
                value={form.city}
                onChange={(e) => setForm((o) => ({ ...o, city: e.target.value }))}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="br-pin" className="form-label-muted">
                Pincode <span className="text-red-600">*</span>
              </label>
              <input
                id="br-pin"
                className="form-input"
                value={form.pincode}
                onChange={(e) => setForm((o) => ({ ...o, pincode: e.target.value }))}
                placeholder="Digits only"
                inputMode="numeric"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-field">
              <label htmlFor="br-state" className="form-label-muted">
                State / region
              </label>
              <input
                id="br-state"
                className="form-input"
                value={form.state}
                onChange={(e) => setForm((o) => ({ ...o, state: e.target.value }))}
                placeholder="e.g. Tamil Nadu"
              />
            </div>
            <div className="form-field">
              <label htmlFor="br-country" className="form-label-muted">
                Country
              </label>
              <input
                id="br-country"
                className="form-input"
                value={form.country}
                onChange={(e) => setForm((o) => ({ ...o, country: e.target.value }))}
                placeholder="e.g. India"
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="br-address" className="form-label-muted">
              Address <span className="text-red-600">*</span>
            </label>
            <textarea
              id="br-address"
              className="form-textarea"
              rows={4}
              value={form.address}
              onChange={(e) => setForm((o) => ({ ...o, address: e.target.value }))}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="br-radius" className="form-label-muted">
              Attendance radius (meters)
            </label>
            <input
              id="br-radius"
              type="number"
              min={10}
              className="form-input"
              value={form.radiusM}
              onChange={(e) => setForm((o) => ({ ...o, radiusM: Math.max(10, Number(e.target.value) || 10) }))}
            />
          </div>

          {(form.geoLat !== '' || form.geoLng !== '') && (
            <p className="text-xs text-slate-500">
              Map coordinates: {form.geoLat}, {form.geoLng}
            </p>
          )}

          {submitError && <p className="alert-error">{submitError}</p>}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={closePanel} className="btn-secondary">
              Cancel
            </button>
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : editingIndex >= 0 ? 'Update branch' : 'Add branch'}
            </button>
          </div>
        </form>
      </SlideOverPanel>

      <MapLocationPickerScreen
        open={mapPickerOpen}
        onClose={() => setMapPickerOpen(false)}
        isLoaded={isLoaded}
        initialSearch={form.address}
        initialPin={lastMapPin}
        onConfirm={onMapLocationConfirm}
      />
    </div>
  );
}
