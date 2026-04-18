import { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/client';
import { LiveTrackWordmark } from '../components/brand/LiveTrackWordmark';

const empty = { name: '', lat: '', lng: '', radiusM: '200', alertOnEntry: true, alertOnExit: true };

function GeofencesPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(empty);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/geofences');
      setItems(data.items || []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await apiClient.post('/geofences', {
        name: form.name,
        lat: Number(form.lat),
        lng: Number(form.lng),
        radiusM: Number(form.radiusM),
        alertOnEntry: form.alertOnEntry,
        alertOnExit: form.alertOnExit,
      });
      setForm(empty);
      setMsg('Geo-fence saved.');
      load();
    } catch (e2) {
      setErr(e2.response?.data?.message || 'Unable to save.');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this geo-fence?')) return;
    await apiClient.delete(`/geofences/${id}`);
    load();
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-dark">Geo-fences</h1>
        <p className="mt-1 text-sm text-slate-500">
          Entry / exit awareness for <LiveTrackWordmark className="inline" /> agents (shown on live map).
        </p>
      </div>

      <div className="flux-card p-5 shadow-panel-lg">
        <h2 className="text-base font-bold text-dark">Create zone</h2>
        {msg && <p className="alert-success mt-3">{msg}</p>}
        {err && <p className="alert-error mt-3">{err}</p>}
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={create}>
          <div className="form-field sm:col-span-2">
            <label className="form-label-muted">Name</label>
            <input className="form-input" value={form.name} onChange={(e) => setForm((o) => ({ ...o, name: e.target.value }))} required />
          </div>
          <div className="form-field">
            <label className="form-label-muted">Latitude</label>
            <input className="form-input" value={form.lat} onChange={(e) => setForm((o) => ({ ...o, lat: e.target.value }))} required />
          </div>
          <div className="form-field">
            <label className="form-label-muted">Longitude</label>
            <input className="form-input" value={form.lng} onChange={(e) => setForm((o) => ({ ...o, lng: e.target.value }))} required />
          </div>
          <div className="form-field">
            <label className="form-label-muted">Radius (m)</label>
            <input className="form-input" type="number" min={10} value={form.radiusM} onChange={(e) => setForm((o) => ({ ...o, radiusM: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.alertOnEntry} onChange={(e) => setForm((o) => ({ ...o, alertOnEntry: e.target.checked }))} />
            Alert on entry
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.alertOnExit} onChange={(e) => setForm((o) => ({ ...o, alertOnExit: e.target.checked }))} />
            Alert on exit
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">
              Add geo-fence
            </button>
          </div>
        </form>
      </div>

      <div className="flux-card overflow-auto p-4 shadow-panel-lg">
        <h2 className="mb-3 text-base font-bold text-dark">Active zones</h2>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-2">Name</th>
              <th>Center</th>
              <th>Radius</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g._id} className="border-t border-neutral-100">
                <td className="py-2 font-medium">{g.name}</td>
                <td className="font-mono text-xs">
                  {g.lat?.toFixed(5)}, {g.lng?.toFixed(5)}
                </td>
                <td>{g.radiusM} m</td>
                <td>
                  <button type="button" className="text-xs font-semibold text-red-600" onClick={() => remove(g._id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={4} className="py-4 text-slate-500">
                  No geo-fences yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default GeofencesPage;
