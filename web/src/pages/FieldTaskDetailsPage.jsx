import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GoogleMap, Marker, Polyline } from '@react-google-maps/api';
import dayjs from 'dayjs';
import apiClient from '../api/client';
import { useGoogleMaps } from '../context/GoogleMapsContext';
import { FLUX_PRIMARY, FLUX_ROUTE_GOLD, fluxCircleMarkerIcon, getFluxMapOptions } from '../theme/fluxMap';

const detailsMapStyle = { width: '100%', height: '420px' };
const defaultCenter = { lat: 20.5937, lng: 78.9629 };

function formatJson(value) {
  if (value == null) return '-';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (_) {
    return String(value);
  }
}

function DetailBlock({ title, value }) {
  return (
    <div className="rounded-xl border border-neutral-200/90 bg-flux-panel p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <pre className="mt-1 whitespace-pre-wrap break-words text-sm text-dark">{formatJson(value)}</pre>
    </div>
  );
}

function FieldTaskDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [otpCode, setOtpCode] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [proofMsg, setProofMsg] = useState('');
  const mapRef = useRef(null);

  const { isLoaded } = useGoogleMaps();

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data } = await apiClient.get(`/fieldtasks/${id}/details`);
        setDetails(data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  useEffect(() => {
    const sig = details?.taskDetails?.signatureDataUrl;
    if (sig) setSignatureDataUrl(sig);
  }, [details]);

  const reload = async () => {
    const { data } = await apiClient.get(`/fieldtasks/${id}/details`);
    setDetails(data);
  };

  const verifyOtp = async () => {
    setProofMsg('');
    try {
      await apiClient.post(`/fieldtasks/${id}/verify-otp`, { code: otpCode });
      setProofMsg('OTP verified.');
      reload();
    } catch (e) {
      setProofMsg(e.response?.data?.message || 'Verification failed');
    }
  };

  const saveProof = async () => {
    setProofMsg('');
    try {
      await apiClient.put(`/fieldtasks/${id}`, {
        signatureDataUrl: signatureDataUrl || undefined,
      });
      setProofMsg('Proof saved.');
      reload();
    } catch (e) {
      setProofMsg(e.response?.data?.message || 'Save failed');
    }
  };

  const path = useMemo(() => {
    const points = details?.path || [];
    return points
      .filter((p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)))
      .map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) }));
  }, [details]);

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps || path.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    const destination = details?.taskDetails?.locations?.destination;
    if (destination?.lat != null && destination?.lng != null) {
      bounds.extend({ lat: Number(destination.lat), lng: Number(destination.lng) });
    }
    mapRef.current.fitBounds(bounds);
  }, [details, path]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading task details...</p>;
  }

  if (!details) {
    return <p className="text-sm text-red-600">Task details unavailable.</p>;
  }

  const task = details.taskDetails || {};
  const destination = task.locations?.destination;
  const source = task.locations?.source;
  const arrival = task.locations?.arrival || task.arrivalLocation;
  const locationRows = details.locations || [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-dark">{task.taskName || details.item?.taskName || 'Task details'}</h3>
          <p className="text-sm text-slate-500">Code: {task.taskCode || details.item?.taskCode || '-'}</p>
        </div>
        <button type="button" onClick={() => navigate('/dashboard/track/fieldtasks')} className="btn-secondary text-sm">
          Back to tasks
        </button>
      </div>

      <div className="flux-card space-y-4 p-5 shadow-panel-lg">
        <h4 className="text-base font-bold text-dark">Proof of work</h4>
        <p className="text-xs text-slate-500">
          OTP verification, digital signature (paste data URL from capture), and photo proof JSON below. Mobile apps can attach GPS + timestamp watermarks.
        </p>
        {proofMsg && <p className="text-sm text-dark">{proofMsg}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">OTP</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                className="form-input max-w-[160px]"
                placeholder="Code"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
              />
              <button type="button" className="btn-primary text-sm" onClick={verifyOtp}>
                Verify
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">Generate OTP from task create / edit panel.</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Signature (data URL)</p>
            <textarea
              className="form-textarea mt-2 min-h-[80px] font-mono text-xs"
              placeholder="data:image/png;base64,..."
              value={signatureDataUrl}
              onChange={(e) => setSignatureDataUrl(e.target.value)}
            />
            <button type="button" className="btn-secondary mt-2 text-sm" onClick={saveProof}>
              Save signature
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DetailBlock title="Assigned user" value={task.assignedTo} />
        <DetailBlock title="Status" value={task.status} />
        <DetailBlock title="Completion date" value={task.completionDate} />
        <DetailBlock title="Description" value={task.description} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 shadow-panel">
        <h4 className="mb-3 text-base font-semibold text-dark">Travel map</h4>
        {isLoaded ? (
          <div className="overflow-hidden rounded-2xl border border-neutral-200">
            <GoogleMap
              mapContainerStyle={detailsMapStyle}
              center={defaultCenter}
              zoom={5}
              options={getFluxMapOptions()}
              onLoad={(map) => {
                mapRef.current = map;
              }}
            >
            {path.length > 1 && (
              <Polyline
                path={path}
                options={{ strokeColor: FLUX_ROUTE_GOLD, strokeOpacity: 0.95, strokeWeight: 4 }}
              />
            )}
            {path[0] && (
              <Marker
                position={path[0]}
                title="Start"
                icon={window.google?.maps ? fluxCircleMarkerIcon(window.google, { fill: '#111111', scale: 9 }) : undefined}
              />
            )}
            {path.length > 1 && (
              <Marker
                position={path[path.length - 1]}
                title="End"
                icon={window.google?.maps ? fluxCircleMarkerIcon(window.google, { fill: FLUX_PRIMARY, scale: 11 }) : undefined}
              />
            )}
            {destination?.lat != null && destination?.lng != null && (
              <Marker
                position={{ lat: Number(destination.lat), lng: Number(destination.lng) }}
                title="Destination"
                icon={window.google?.maps ? fluxCircleMarkerIcon(window.google, { fill: '#2563eb', scale: 10 }) : undefined}
              />
            )}
            {source?.lat != null && source?.lng != null && (
              <Marker
                position={{ lat: Number(source.lat), lng: Number(source.lng) }}
                title="Source"
                icon={window.google?.maps ? fluxCircleMarkerIcon(window.google, { fill: '#6b7280', scale: 9 }) : undefined}
              />
            )}
            {arrival?.lat != null && arrival?.lng != null && (
              <Marker
                position={{ lat: Number(arrival.lat), lng: Number(arrival.lng) }}
                title="Arrival"
                icon={window.google?.maps ? fluxCircleMarkerIcon(window.google, { fill: '#111111', scale: 9 }) : undefined}
              />
            )}
            </GoogleMap>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Loading map...</p>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <DetailBlock title="Source location" value={source} />
        <DetailBlock title="Destination location" value={destination} />
        <DetailBlock title="Arrived location" value={arrival} />
        <DetailBlock title="Changed location history" value={task.changedLocationHistory} />
        <DetailBlock title="Exit history" value={task.exitHistory} />
        <DetailBlock title="Resumed history" value={task.resumedHistory} />
        <DetailBlock title="Photo proof details" value={task.photoDetails} />
        <DetailBlock title="OTP details" value={task.otp} />
        <DetailBlock title="Progress" value={task.progress} />
        <DetailBlock title="Approval" value={task.approval} />
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-panel">
        <h4 className="mb-3 text-base font-semibold text-dark">All locations from collection</h4>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pr-3">Time</th>
                <th className="pr-3">Lat</th>
                <th className="pr-3">Lng</th>
                <th className="pr-3">Address</th>
                <th className="pr-3">Status</th>
                <th className="pr-3">Exit</th>
                <th className="pr-3">Battery</th>
              </tr>
            </thead>
            <tbody>
              {locationRows.map((row) => (
                <tr key={row._id} className="border-t border-slate-100">
                  <td className="py-2 pr-3">{row.timestamp ? dayjs(row.timestamp).format('DD MMM YYYY hh:mm:ss A') : '-'}</td>
                  <td className="pr-3">{row.latitude ?? '-'}</td>
                  <td className="pr-3">{row.longitude ?? '-'}</td>
                  <td className="pr-3">{row.address || '-'}</td>
                  <td className="pr-3">{row.status || '-'}</td>
                  <td className="pr-3">{row.exitStatus || row.exitReason || '-'}</td>
                  <td className="pr-3">{row.batteryPercent ?? '-'}</td>
                </tr>
              ))}
              {locationRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-3 text-slate-500">
                    No locations found for this task.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default FieldTaskDetailsPage;
