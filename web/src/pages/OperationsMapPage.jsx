import { useCallback, useEffect, useMemo, useState } from 'react';
import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';
import apiClient from '../api/client';
import { FLUX_PRIMARY, FLUX_ROUTE_GOLD, fluxCircleMarkerIcon, getFluxMapOptions } from '../theme/fluxMap';

const container = { width: '100%', height: '72vh' };
const center = { lat: 20.5937, lng: 78.9629 };

function OperationsMapPage() {
  const [layers, setLayers] = useState({ agents: true, customers: true, tasks: true });
  const [tracking, setTracking] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [tasks, setTasks] = useState([]);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  });

  const load = useCallback(async () => {
    try {
      const [{ data: t }, { data: c }, { data: f }] = await Promise.all([
        apiClient.get('/tracking/latest'),
        apiClient.get('/customers'),
        apiClient.get('/fieldtasks'),
      ]);
      setTracking(t.items || []);
      setCustomers(c.items || []);
      setTasks(f.items || []);
    } catch {
      setTracking([]);
      setCustomers([]);
      setTasks([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const optimizePreview = async () => {
    const stops = tasks
      .map((x) => x.destinationLocation)
      .filter((d) => d && d.lat != null && d.lng != null)
      .slice(0, 12)
      .map((d, i) => ({ lat: d.lat, lng: d.lng, label: `T${i + 1}` }));
    if (stops.length < 2) {
      window.alert('Need at least two task pins.');
      return;
    }
    const { data } = await apiClient.post('/ops/route-optimize', { stops });
    window.alert(`Optimized ~${data.totalKm} km · ETA ~${data.etaMinutesApprox} min (25 km/h heuristic).\nSee console for order.`);
    console.log(data);
  };

  const taskLine = useMemo(() => {
    return tasks
      .map((x) => x.destinationLocation)
      .filter((d) => d && Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lng)))
      .map((d) => ({ lat: Number(d.lat), lng: Number(d.lng) }));
  }, [tasks]);

  if (!isLoaded) return <p className="text-sm text-slate-500">Loading map…</p>;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-dark">Unified map</h1>
          <p className="mt-1 text-sm text-slate-500">Agents, customers (geo), and task destinations — route optimize preview.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {['agents', 'customers', 'tasks'].map((k) => (
            <label key={k} className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold capitalize shadow-sm">
              <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers((o) => ({ ...o, [k]: e.target.checked }))} />
              {k}
            </label>
          ))}
          <button type="button" className="btn-secondary text-xs" onClick={optimizePreview}>
            Route optimize (tasks)
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-panel">
        <GoogleMap mapContainerStyle={container} center={center} zoom={5} options={getFluxMapOptions()}>
          {layers.tasks && taskLine.length > 1 && (
            <Polyline path={taskLine} options={{ strokeColor: FLUX_ROUTE_GOLD, strokeOpacity: 0.85, strokeWeight: 3 }} />
          )}
          {layers.agents &&
            tracking.map((p) => (
              <Marker
                key={p.userId}
                position={{ lat: p.latitude, lng: p.longitude }}
                title={p.userName}
                icon={
                  window.google?.maps
                    ? fluxCircleMarkerIcon(window.google, { fill: FLUX_PRIMARY, scale: 11 })
                    : undefined
                }
              />
            ))}
          {layers.customers &&
            customers
              .filter((c) => c.geoLocation?.lat != null)
              .map((c) => (
                <Marker
                  key={c._id}
                  position={{ lat: Number(c.geoLocation.lat), lng: Number(c.geoLocation.lng) }}
                  title={c.customerName}
                  icon={
                    window.google?.maps
                      ? fluxCircleMarkerIcon(window.google, { fill: '#2563eb', scale: 9 })
                      : undefined
                  }
                />
              ))}
          {layers.tasks &&
            tasks.map((t) => {
              const d = t.destinationLocation;
              if (!d || d.lat == null) return null;
              return (
                <Marker
                  key={t._id}
                  position={{ lat: Number(d.lat), lng: Number(d.lng) }}
                  title={t.taskName || t.title}
                  icon={
                    window.google?.maps
                      ? fluxCircleMarkerIcon(window.google, { fill: '#111111', scale: 9 })
                      : undefined
                  }
                />
              );
            })}
        </GoogleMap>
      </div>
    </section>
  );
}

export default OperationsMapPage;
