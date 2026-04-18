import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Autocomplete, Circle, GoogleMap } from '@react-google-maps/api';
import clsx from 'clsx';
import apiClient from '../api/client';
import UiSelect from '../components/common/UiSelect';
import { useGoogleMaps } from '../context/GoogleMapsContext';
import { parsePlaceResult } from '../utils/googleAddress';
import { getFluxMapOptions } from '../theme/fluxMap';

const defaultCenter = { lat: 12.9716, lng: 77.5946 };
const mapStyle = { width: '100%', height: 'min(55vh, 420px)', minHeight: '260px' };

function emptyForm() {
  return {
    branchId: '',
    name: '',
    lat: defaultCenter.lat,
    lng: defaultCenter.lng,
    radiusM: 200,
    alertOnEntry: true,
    alertOnExit: true,
    search: '',
  };
}

function GeofencesPage() {
  const { isLoaded } = useGoogleMaps();
  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const mapRef = useRef(null);
  const autocompleteRef = useRef(null);
  const circleListenersRef = useRef([]);

  const branchOptions = useMemo(
    () => [{ value: '', label: 'All branches' }, ...branches.map((b) => ({ value: String(b._id), label: b.name }))],
    [branches],
  );

  const branchSelectOptions = useMemo(
    () => branches.map((b) => ({ value: String(b._id), label: b.name })),
    [branches],
  );

  const load = useCallback(async () => {
    try {
      const q = branchFilter ? `?branchId=${encodeURIComponent(branchFilter)}` : '';
      const { data } = await apiClient.get(`/geofences${q}`);
      setItems(data.items || []);
      if (Array.isArray(data.branches)) setBranches(data.branches);
    } catch {
      setItems([]);
    }
  }, [branchFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId('');
    setForm(emptyForm());
    setErr('');
    setMsg('');
    setPanelOpen(true);
  };

  const openEdit = (g) => {
    setEditingId(String(g._id));
    setForm({
      branchId: g.branchId ? String(g.branchId) : '',
      name: g.name || '',
      lat: Number(g.lat),
      lng: Number(g.lng),
      radiusM: Number(g.radiusM) || 200,
      alertOnEntry: g.alertOnEntry !== false,
      alertOnExit: g.alertOnExit !== false,
      search: '',
    });
    setErr('');
    setMsg('');
    setPanelOpen(true);
  };

  const closePanel = () => {
    circleListenersRef.current.forEach((fn) => fn());
    circleListenersRef.current = [];
    setPanelOpen(false);
  };

  const onPlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();
    const parsed = parsePlaceResult(place);
    if (!parsed) return;
    setForm((o) => ({ ...o, lat: parsed.lat, lng: parsed.lng, search: parsed.address || '' }));
    if (mapRef.current) {
      mapRef.current.panTo({ lat: parsed.lat, lng: parsed.lng });
      mapRef.current.setZoom(16);
    }
  };

  const onMapClick = (e) => {
    const ll = e.latLng;
    if (!ll) return;
    setForm((o) => ({ ...o, lat: ll.lat(), lng: ll.lng() }));
  };

  const saveFence = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (!form.branchId) {
      setErr('Select a branch.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        branchId: form.branchId,
        name: form.name.trim(),
        lat: Number(form.lat),
        lng: Number(form.lng),
        radiusM: Math.max(10, Math.round(Number(form.radiusM) || 10)),
        alertOnEntry: form.alertOnEntry,
        alertOnExit: form.alertOnExit,
      };
      if (editingId) {
        await apiClient.put(`/geofences/${editingId}`, body);
        setMsg('Geofence updated.');
      } else {
        await apiClient.post('/geofences', body);
        setMsg('Geofence created.');
      }
      closePanel();
      load();
    } catch (e2) {
      setErr(e2.response?.data?.message || 'Unable to save.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this geofence?')) return;
    await apiClient.delete(`/geofences/${id}`);
    load();
  };

  const patchFence = async (id, patch) => {
    try {
      await apiClient.put(`/geofences/${id}`, patch);
      load();
    } catch {
      /* ignore */
    }
  };

  const center = useMemo(() => ({ lat: Number(form.lat) || defaultCenter.lat, lng: Number(form.lng) || defaultCenter.lng }), [form.lat, form.lng]);

  if (!isLoaded) {
    return <p className="text-sm text-slate-500">Loading maps…</p>;
  }

  return (
    <section className="min-w-0 max-w-full space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-dark">Geofences by branch</h1>
        <p className="mt-1 text-sm text-slate-500">
          Draw a zone on the map per branch. Field users only see fences for their assigned branch (or company-wide legacy
          zones without a branch).
        </p>
      </div>

      {msg && <p className="alert-success">{msg}</p>}
      {err && !panelOpen && <p className="alert-error">{err}</p>}

      <div className="flux-card min-w-0 space-y-4 p-4 shadow-panel-lg sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="form-field mb-0 max-w-md flex-1">
            <label className="form-label-muted" htmlFor="gf-branch-filter">
              Filter by branch
            </label>
            <UiSelect id="gf-branch-filter" value={branchFilter} onChange={setBranchFilter} options={branchOptions} />
          </div>
          <button type="button" className="btn-primary shrink-0" onClick={openCreate} disabled={!branches.length}>
            Add geofence
          </button>
        </div>
        {!branches.length ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Add at least one branch under <strong>Settings → Branches</strong> before creating geofences.
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="min-w-[640px] w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-3 py-2">Branch</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Center</th>
                <th className="px-3 py-2">Radius</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((g) => (
                <tr key={g._id} className="border-t border-neutral-100">
                  <td className="px-3 py-2 font-medium text-dark">{g.branchName || '—'}</td>
                  <td className="px-3 py-2">{g.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">
                    {Number(g.lat).toFixed(5)}, {Number(g.lng).toFixed(5)}
                  </td>
                  <td className="px-3 py-2">{g.radiusM} m</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => void patchFence(g._id, { isActive: !g.isActive })}
                      className={clsx(
                        'inline-flex h-5 w-9 items-center rounded-full border p-0.5 transition',
                        g.isActive !== false ? 'border-primary bg-primary' : 'border-primary/50 bg-primary/15',
                      )}
                      title={g.isActive !== false ? 'Deactivate' : 'Activate'}
                      aria-label="Toggle geofence active"
                    >
                      <span
                        className={clsx(
                          'h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform',
                          g.isActive !== false ? 'translate-x-4' : 'translate-x-0',
                        )}
                      />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(g)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 text-dark hover:bg-neutral-100"
                        title="Edit"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(g._id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary bg-primary/10 text-dark hover:bg-primary/20"
                        title="Delete"
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
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    No geofences yet for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div
            className="flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-neutral-200 bg-white shadow-panel-lg sm:rounded-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gf-panel-title"
          >
            <div className="flex items-start justify-between border-b border-neutral-200 px-4 py-3 sm:px-5">
              <div>
                <h2 id="gf-panel-title" className="text-lg font-black text-dark">
                  {editingId ? 'Edit geofence' : 'Add geofence'}
                </h2>
                <p className="text-xs text-slate-500">Choose branch, search address, then drag the circle.</p>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="rounded-full border border-neutral-200 px-2.5 py-1 text-lg leading-none text-slate-600 hover:bg-neutral-50"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form className="flex min-h-0 flex-1 flex-col overflow-y-auto" onSubmit={saveFence}>
              {err && <p className="mx-4 mt-3 shrink-0 text-sm text-red-600 sm:mx-5">{err}</p>}
              <div className="grid shrink-0 gap-4 p-4 sm:grid-cols-2 sm:p-5">
                <div className="form-field sm:col-span-2">
                  <label className="form-label-muted">Branch</label>
                  <UiSelect
                    value={form.branchId}
                    onChange={(v) => setForm((o) => ({ ...o, branchId: v }))}
                    options={[{ value: '', label: 'Select branch' }, ...branchSelectOptions]}
                  />
                </div>
                <div className="form-field sm:col-span-2">
                  <label className="form-label-muted">Zone name</label>
                  <input
                    className="form-input"
                    value={form.name}
                    onChange={(e) => setForm((o) => ({ ...o, name: e.target.value }))}
                    placeholder="e.g. Head office yard"
                    required
                  />
                </div>
                <div className="form-field sm:col-span-2">
                  <label className="form-label-muted">Search address</label>
                  <Autocomplete onLoad={(ac) => { autocompleteRef.current = ac; }} onPlaceChanged={onPlaceChanged}>
                    <input
                      className="form-input"
                      value={form.search}
                      onChange={(e) => setForm((o) => ({ ...o, search: e.target.value }))}
                      placeholder="Search to center the map"
                    />
                  </Autocomplete>
                </div>
                <div className="form-field">
                  <label className="form-label-muted">Radius (m)</label>
                  <input
                    type="number"
                    min={10}
                    className="form-input"
                    value={form.radiusM}
                    onChange={(e) => setForm((o) => ({ ...o, radiusM: Number(e.target.value) || 10 }))}
                  />
                </div>
                <div className="form-field flex flex-col justify-end gap-2 sm:flex-row sm:items-center">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.alertOnEntry}
                      onChange={(e) => setForm((o) => ({ ...o, alertOnEntry: e.target.checked }))}
                    />
                    Alert on entry
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.alertOnExit}
                      onChange={(e) => setForm((o) => ({ ...o, alertOnExit: e.target.checked }))}
                    />
                    Alert on exit
                  </label>
                </div>
              </div>

              <div className="min-h-0 flex-1 border-y border-neutral-200">
                <GoogleMap
                  key={editingId || 'new'}
                  mapContainerStyle={mapStyle}
                  center={center}
                  zoom={14}
                  options={getFluxMapOptions()}
                  onLoad={(m) => {
                    mapRef.current = m;
                  }}
                  onClick={onMapClick}
                >
                  <Circle
                    center={center}
                    radius={Math.max(10, Number(form.radiusM) || 10)}
                    options={{
                      strokeColor: '#dc2626',
                      strokeOpacity: 0.95,
                      strokeWeight: 2,
                      fillColor: '#dc2626',
                      fillOpacity: 0.2,
                      editable: true,
                      draggable: true,
                    }}
                    onLoad={(circle) => {
                      const onRad = () => {
                        setForm((o) => ({ ...o, radiusM: Math.max(10, Math.round(circle.getRadius())) }));
                      };
                      const onCenter = () => {
                        const c = circle.getCenter();
                        if (!c) return;
                        setForm((o) => ({ ...o, lat: c.lat(), lng: c.lng() }));
                      };
                      const h1 = circle.addListener('radius_changed', onRad);
                      const h2 = circle.addListener('center_changed', onCenter);
                      circleListenersRef.current = [
                        () => window.google.maps.event.removeListener(h1),
                        () => window.google.maps.event.removeListener(h2),
                      ];
                    }}
                  />
                </GoogleMap>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2 border-t border-neutral-200 bg-flux-panel px-4 py-3 sm:px-5">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="btn-secondary" onClick={closePanel}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default GeofencesPage;
