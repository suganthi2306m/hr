import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, InfoWindow, Marker, Polyline } from '@react-google-maps/api';
import { io } from 'socket.io-client';
import dayjs from 'dayjs';
import apiClient from '../api/client';
import { LiveTrackWordmark } from '../components/brand/LiveTrackWordmark';
import UiSelect from '../components/common/UiSelect';
import { useGoogleMaps } from '../context/GoogleMapsContext';
import { FLUX_PRIMARY, FLUX_ROUTE_GOLD, fluxCircleMarkerIcon, getFluxMapOptions } from '../theme/fluxMap';

const mapContainerStyle = { width: '100%', height: '65vh' };
const defaultCenter = { lat: 20.5937, lng: 78.9629 };
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
/** Avoid fitBounds zooming to max when there is only one point (grey “blank” map). */
const SINGLE_POINT_ZOOM = 11;
const MAX_ZOOM_AFTER_FIT = 14;
const MIN_ZOOM_AFTER_FIT = 5;

const ACTIVITY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

function locationDayKey(ts) {
  if (ts == null) return '';
  return dayjs(ts).format('YYYY-MM-DD');
}

function LiveTrackPage() {
  const [trackingPoints, setTrackingPoints] = useState([]);
  const [historyPoints, setHistoryPoints] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');
  const [routeDate, setRouteDate] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [activeMarker, setActiveMarker] = useState(null);
  const mapRef = useRef(null);
  const historyUserIdRef = useRef('');
  const routeDateRef = useRef(routeDate);

  const { isLoaded } = useGoogleMaps();

  useEffect(() => {
    routeDateRef.current = routeDate;
  }, [routeDate]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [{ data: usersData }, { data: trackingData }] = await Promise.all([
          apiClient.get('/users'),
          apiClient.get('/tracking/latest'),
        ]);
        setUsers(Array.isArray(usersData?.items) ? usersData.items : []);
        setTrackingPoints(Array.isArray(trackingData?.items) ? trackingData.items : []);
      } catch {
        setUsers([]);
        setTrackingPoints([]);
      }
    }
    bootstrap();
  }, []);

  const filteredLocations = useMemo(() => {
    return trackingPoints.filter((item) => {
      if (locationDayKey(item.timestamp) !== routeDate) return false;
      if (selectedUserId && item.userId !== selectedUserId) return false;
      if (activityFilter === 'active' && !item.isActive) return false;
      if (activityFilter === 'inactive' && item.isActive) return false;
      return true;
    });
  }, [activityFilter, trackingPoints, selectedUserId, routeDate]);

  const userFilterOptions = useMemo(
    () => [{ value: '', label: 'All users' }, ...users.map((u) => ({ value: String(u._id), label: u.name }))],
    [users],
  );

  /** Latest points for activity filter only (not date) — used to infer which user’s trail to load when date changes. */
  const activityFilteredLatest = useMemo(() => {
    return trackingPoints.filter((item) => {
      if (selectedUserId && item.userId !== selectedUserId) return false;
      if (activityFilter === 'active' && !item.isActive) return false;
      if (activityFilter === 'inactive' && item.isActive) return false;
      return true;
    });
  }, [activityFilter, selectedUserId, trackingPoints]);

  /** Explicit user pick, or exactly one user in latest set → load their `locations` trail for the selected date. */
  const historyUserId = useMemo(() => {
    if (selectedUserId) return selectedUserId;
    if (activityFilteredLatest.length === 1 && activityFilteredLatest[0].userId) {
      return String(activityFilteredLatest[0].userId);
    }
    return '';
  }, [selectedUserId, activityFilteredLatest]);

  useEffect(() => {
    historyUserIdRef.current = historyUserId;
  }, [historyUserId]);

  useEffect(() => {
    async function loadHistory() {
      if (!historyUserId) {
        setHistoryPoints([]);
        return;
      }
      try {
        const { data } = await apiClient.get(
          `/tracking/history/${historyUserId}?limit=2000&date=${encodeURIComponent(routeDate)}`,
        );
        setHistoryPoints(Array.isArray(data?.items) ? data.items : []);
      } catch {
        setHistoryPoints([]);
      }
    }
    loadHistory();
  }, [historyUserId, routeDate]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
    });

    socket.on('location:update', (entry) => {
      setTrackingPoints((prev) => {
        const withoutUser = prev.filter((item) => item.userId !== entry.userId);
        return [...withoutUser, entry];
      });
      const target = historyUserIdRef.current;
      const day = routeDateRef.current;
      if (target && entry.userId === target && locationDayKey(entry.timestamp) === day) {
        setHistoryPoints((prev) => [entry, ...prev].slice(0, 2000));
      }
    });

    return () => socket.disconnect();
  }, []);

  const polylinePath = useMemo(() => {
    const points = [...historyPoints].reverse();
    return points
      .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
      .map((item) => ({ lat: item.latitude, lng: item.longitude }));
  }, [historyPoints]);

  const applyMapBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return undefined;

    if (filteredLocations.length === 0 && polylinePath.length === 0) return undefined;

    const bounds = new window.google.maps.LatLngBounds();
    const extend = (lat, lng) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      bounds.extend({ lat, lng });
    };

    filteredLocations.forEach((item) => extend(item.latitude, item.longitude));
    polylinePath.forEach((p) => extend(p.lat, p.lng));

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const degenerate =
      !Number.isFinite(ne.lat()) ||
      !Number.isFinite(sw.lat()) ||
      (ne.lat() === sw.lat() && ne.lng() === sw.lng());

    if (degenerate) {
      const first =
        filteredLocations[0] ||
        (polylinePath[0] ? { latitude: polylinePath[0].lat, longitude: polylinePath[0].lng } : null);
      if (!first) return undefined;
      map.setCenter({
        lat: Number(first.latitude ?? first.lat),
        lng: Number(first.longitude ?? first.lng),
      });
      map.setZoom(SINGLE_POINT_ZOOM);
      return undefined;
    }

    map.fitBounds(bounds, 64);
    const listener = window.google.maps.event.addListenerOnce(map, 'idle', () => {
      let z = map.getZoom();
      if (z > MAX_ZOOM_AFTER_FIT) z = MAX_ZOOM_AFTER_FIT;
      if (z < MIN_ZOOM_AFTER_FIT) z = MIN_ZOOM_AFTER_FIT;
      map.setZoom(z);
    });
    return () => window.google.maps.event.removeListener(listener);
  }, [filteredLocations, polylinePath]);

  useEffect(() => {
    const cleanup = applyMapBounds();
    return typeof cleanup === 'function' ? cleanup : undefined;
  }, [applyMapBounds]);

  if (!isLoaded) {
    return <p className="text-sm text-slate-500">Loading Google Maps...</p>;
  }

  return (
    <section className="space-y-4">
      <div>
        <LiveTrackWordmark as="h1" className="text-2xl font-black tracking-tight text-dark" />
        <p className="mt-1 text-sm text-slate-500">Live positions, routes and history for your field users.</p>
      </div>
      <div className="grid gap-4 rounded-2xl border border-neutral-200/90 bg-white p-4 shadow-panel sm:grid-cols-2 xl:grid-cols-4">
        <div className="form-field sm:mb-0">
          <label htmlFor="track-user" className="form-label">
            User filter
          </label>
          <UiSelect
            id="track-user"
            value={selectedUserId}
            onChange={setSelectedUserId}
            options={userFilterOptions}
          />
        </div>
        <div className="form-field">
          <label htmlFor="track-activity" className="form-label">
            Activity
          </label>
          <UiSelect
            id="track-activity"
            value={activityFilter}
            onChange={setActivityFilter}
            options={ACTIVITY_OPTIONS}
          />
        </div>
        <div className="form-field">
          <label htmlFor="track-date" className="form-label">
            Date
          </label>
          <input
            id="track-date"
            type="date"
            className="form-input"
            value={routeDate}
            max={dayjs().format('YYYY-MM-DD')}
            onChange={(e) => setRouteDate(e.target.value || dayjs().format('YYYY-MM-DD'))}
          />
        </div>
        <div className="flex items-end">
          <p className="w-full rounded-xl border border-neutral-200 bg-flux-panel px-4 py-3 text-sm font-semibold text-dark">
            Showing {filteredLocations.length} on map
            {polylinePath.length > 1 && (
              <span className="mt-1 block text-xs font-normal text-slate-600">
                Route: {polylinePath.length} points on {dayjs(routeDate).format('DD MMM YYYY')}
              </span>
            )}
            {polylinePath.length <= 1 && historyUserId && (
              <span className="mt-1 block text-xs font-normal text-slate-600">
                {polylinePath.length === 0 ? 'No trail' : 'Single point'} for {dayjs(routeDate).format('DD MMM YYYY')}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-panel">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={defaultCenter}
          zoom={6}
          options={getFluxMapOptions()}
          onLoad={(map) => {
            mapRef.current = map;
            applyMapBounds();
          }}
        >
        {historyUserId && polylinePath.length > 1 && (
          <Polyline
            path={polylinePath}
            options={{
              strokeColor: FLUX_ROUTE_GOLD,
              strokeOpacity: 0.95,
              strokeWeight: 4,
            }}
          />
        )}

        {filteredLocations.map((item) => {
          return (
            <Marker
              key={item.userId}
              position={{ lat: item.latitude, lng: item.longitude }}
              title={item.userName}
              onClick={() => setActiveMarker(item)}
              icon={
                window.google?.maps
                  ? fluxCircleMarkerIcon(window.google, {
                      fill: item.isActive ? FLUX_PRIMARY : '#111111',
                      stroke: '#ffffff',
                      scale: item.isActive ? 12 : 10,
                    })
                  : undefined
              }
            />
          );
        })}

        {activeMarker && (
          <InfoWindow
            position={{ lat: activeMarker.latitude, lng: activeMarker.longitude }}
            onCloseClick={() => setActiveMarker(null)}
          >
            <div>
              <p className="font-semibold">{activeMarker.userName}</p>
              <p className="text-xs text-slate-500">
                Last updated: {dayjs(activeMarker.timestamp).format('DD MMM YYYY hh:mm:ss A')}
              </p>
              <p className="text-xs text-slate-500">Status: {activeMarker.isActive ? 'Active' : 'Inactive'}</p>
              <p className="text-xs text-slate-500">Task: {activeMarker.taskName || activeMarker.taskCode || '-'}</p>
              <p className="text-xs text-slate-500">Task status: {activeMarker.taskStatus || '-'}</p>
              <p className="text-xs text-slate-500">Address: {activeMarker.address || '-'}</p>
              {activeMarker.idleMinutes != null && (
                <p className="text-xs text-slate-500">
                  Idle ~{Math.round(activeMarker.idleMinutes)} min {activeMarker.isIdle ? '(flagged)' : ''}
                </p>
              )}
              {activeMarker.geofenceStatus?.length > 0 && (
                <ul className="mt-1 text-xs text-slate-500">
                  {activeMarker.geofenceStatus.map((g) => (
                    <li key={g.id}>
                      {g.name}: {g.inside ? 'Inside' : 'Outside'} ({g.distanceM}m)
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </InfoWindow>
        )}
        </GoogleMap>
      </div>
    </section>
  );
}

export default LiveTrackPage;
