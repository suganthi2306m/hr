import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, Marker, Polyline } from '@react-google-maps/api';
import { io } from 'socket.io-client';
import dayjs from 'dayjs';
import apiClient, { SOCKET_BASE_URL } from '../api/client';
import LiveTrackLocationDetailPanel from '../components/liveTrack/LiveTrackLocationDetailPanel';
import LiveTrackStaffCards from '../components/liveTrack/LiveTrackStaffCards';
import UiSelect from '../components/common/UiSelect';
import { useGoogleMaps } from '../context/GoogleMapsContext';
import {
  FLUX_ROUTE_GOLD,
  getFluxMapOptions,
  getStaffLocationPinIcon,
  staffPinColorForUserId,
} from '../theme/fluxMap';

const mapContainerStyle = { width: '100%', height: '65vh' };
const ROUTE_POLYLINE_SNAP_METERS = 900;
const defaultCenter = { lat: 20.5937, lng: 78.9629 };
const SOCKET_URL = SOCKET_BASE_URL;
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

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, a)));
}

/** Pick the stored route sample closest to a map click (full location entry). */
function nearestRoutePoint(orderedEntries, clickLat, clickLng, maxMeters) {
  let best = null;
  let bestD = Infinity;
  for (const entry of orderedEntries) {
    const lat = Number(entry.latitude);
    const lng = Number(entry.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const d = haversineMeters(clickLat, clickLng, lat, lng);
    if (d < bestD) {
      bestD = d;
      best = entry;
    }
  }
  if (!best || bestD > maxMeters) return null;
  return best;
}

/** S / E label colour on user-coloured pins (contrast). */
function pinLabelTextColor(hex) {
  if (!hex || typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return '#ffffff';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#111111' : '#ffffff';
}

function LiveTrackPage() {
  const [trackingPoints, setTrackingPoints] = useState([]);
  const [historyPoints, setHistoryPoints] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');
  const [routeDate, setRouteDate] = useState(() => dayjs().format('YYYY-MM-DD'));
  /** `{ source, entry }` — live user pin or a history / route point */
  const [mapDetail, setMapDetail] = useState(null);
  const [resolvedAddress, setResolvedAddress] = useState('');
  const [routePolyline, setRoutePolyline] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dataRevision, setDataRevision] = useState(0);
  const mapRef = useRef(null);
  const geocoderRef = useRef(null);
  const routeOrderedRef = useRef([]);
  const historyUserIdRef = useRef('');
  const routeDateRef = useRef(routeDate);
  const allowedUserIdsRef = useRef(new Set());

  const { isLoaded } = useGoogleMaps();

  useEffect(() => {
    routeDateRef.current = routeDate;
  }, [routeDate]);

  useEffect(() => {
    allowedUserIdsRef.current = new Set(users.map((u) => String(u._id)));
  }, [users]);

  const loadBootstrap = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setDataRevision((n) => n + 1);
    try {
      await loadBootstrap();
    } finally {
      setRefreshing(false);
    }
  }, [loadBootstrap]);

  const staffUsers = useMemo(() => {
    return users.filter((u) => {
      const r = String(u.role || 'field_agent').toLowerCase();
      return r === 'field_agent' || r === 'field_user';
    });
  }, [users]);

  const trackingByUserIdForDay = useMemo(() => {
    const m = new Map();
    trackingPoints.forEach((p) => {
      if (locationDayKey(p.timestamp) !== routeDate) return;
      m.set(String(p.userId), p);
    });
    return m;
  }, [trackingPoints, routeDate]);

  const dayLatestPoints = useMemo(
    () => trackingPoints.filter((p) => locationDayKey(p.timestamp) === routeDate),
    [trackingPoints, routeDate],
  );

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
    () => [{ value: '', label: 'All staff' }, ...users.map((u) => ({ value: String(u._id), label: u.name }))],
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
  }, [historyUserId, routeDate, dataRevision]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
    });

    socket.on('location:update', (entry) => {
      const allowed = allowedUserIdsRef.current;
      if (!allowed.has(String(entry?.userId || ''))) {
        return;
      }
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

  /** Chronological (oldest → newest) for the trail and for nearest-point lookup */
  const routeOrdered = useMemo(() => {
    return [...historyPoints]
      .reverse()
      .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
  }, [historyPoints]);

  useEffect(() => {
    routeOrderedRef.current = routeOrdered;
  }, [routeOrdered]);

  const polylinePath = useMemo(
    () => routeOrdered.map((item) => ({ lat: item.latitude, lng: item.longitude })),
    [routeOrdered],
  );

  const routeEndpoints = useMemo(() => {
    if (routeOrdered.length < 2) return { start: null, end: null };
    return { start: routeOrdered[0], end: routeOrdered[routeOrdered.length - 1] };
  }, [routeOrdered]);

  /** Same hue as live pin for this user — polyline + S/E markers. */
  const routeTrailColor = useMemo(
    () => (historyUserId ? staffPinColorForUserId(historyUserId) : FLUX_ROUTE_GOLD),
    [historyUserId],
  );

  const mapStats = useMemo(() => {
    const staff = staffUsers.length;
    const active = dayLatestPoints.filter((p) => p.isActive).length;
    const inactive = dayLatestPoints.filter((p) => !p.isActive).length;
    return { staff, active, inactive };
  }, [staffUsers.length, dayLatestPoints]);

  useEffect(() => {
    if (isLoaded && window.google?.maps && !geocoderRef.current) {
      geocoderRef.current = new window.google.maps.Geocoder();
    }
  }, [isLoaded]);

  useEffect(() => {
    const entry = mapDetail?.entry;
    if (!entry) {
      setResolvedAddress('');
      return undefined;
    }
    if (entry.address) {
      setResolvedAddress('');
      return undefined;
    }
    const lat = Number(entry.latitude);
    const lng = Number(entry.longitude);
    const gc = geocoderRef.current;
    if (!gc || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setResolvedAddress('');
      return undefined;
    }
    let cancelled = false;
    setResolvedAddress('…');
    gc.geocode({ location: { lat, lng } }, (results, status) => {
      if (cancelled) return;
      if (status === 'OK' && results?.[0]?.formatted_address) {
        setResolvedAddress(results[0].formatted_address);
      } else {
        setResolvedAddress('');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mapDetail]);

  useEffect(() => {
    if (!routePolyline || !window.google?.maps) return undefined;
    const listener = routePolyline.addListener('click', (e) => {
      const ll = e.latLng;
      if (!ll) return;
      const hit = nearestRoutePoint(
        routeOrderedRef.current,
        ll.lat(),
        ll.lng(),
        ROUTE_POLYLINE_SNAP_METERS,
      );
      if (hit) setMapDetail({ source: 'route', entry: hit });
    });
    return () => listener.remove();
  }, [routePolyline]);

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
    <section className="space-y-6">
      <div className="grid gap-4 rounded-2xl border border-neutral-200/90 bg-white p-4 shadow-panel sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
        <div className="form-field lg:col-span-4">
          <label htmlFor="track-user" className="form-label">
            Staff
          </label>
          <UiSelect
            id="track-user"
            value={selectedUserId}
            onChange={setSelectedUserId}
            options={userFilterOptions}
          />
        </div>
        <div className="form-field lg:col-span-3">
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
        <div className="form-field lg:col-span-3">
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
        <div className="flex lg:col-span-2">
          <button
            type="button"
            className="btn-primary inline-flex w-full items-center justify-center gap-2 py-2.5 disabled:opacity-60"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <span className={refreshing ? 'animate-pulse' : ''} aria-hidden>
              ↻
            </span>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-panel lg:min-h-[70vh] lg:flex-row lg:items-stretch">
        <div className="relative min-h-[60vh] min-w-0 flex-1 lg:min-h-[70vh]">
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
                key={`trail-${historyUserId}-${routeTrailColor}`}
                path={polylinePath}
                onLoad={(poly) => setRoutePolyline(poly)}
                onUnmount={() => setRoutePolyline(null)}
                options={{
                  strokeColor: routeTrailColor,
                  strokeOpacity: 0.95,
                  strokeWeight: 5,
                  clickable: true,
                }}
              />
            )}

            {routeEndpoints.start && routeEndpoints.end && historyUserId && (
              <>
                <Marker
                  key={`route-start-${historyUserId}`}
                  position={{ lat: routeEndpoints.start.latitude, lng: routeEndpoints.start.longitude }}
                  title="Route start (oldest point this day)"
                  zIndex={4}
                  onClick={(e) => {
                    e?.domEvent?.stopPropagation?.();
                    setMapDetail({ source: 'route', entry: routeEndpoints.start });
                  }}
                  label={{
                    text: 'S',
                    color: pinLabelTextColor(routeTrailColor),
                    fontSize: '11px',
                    fontWeight: '800',
                  }}
                  icon={
                    window.google?.maps
                      ? getStaffLocationPinIcon(window.google, { fill: routeTrailColor, active: true })
                      : undefined
                  }
                />
                <Marker
                  key={`route-end-${historyUserId}`}
                  position={{ lat: routeEndpoints.end.latitude, lng: routeEndpoints.end.longitude }}
                  title="Latest point on trail"
                  zIndex={5}
                  onClick={(e) => {
                    e?.domEvent?.stopPropagation?.();
                    setMapDetail({ source: 'route', entry: routeEndpoints.end });
                  }}
                  label={{
                    text: 'E',
                    color: pinLabelTextColor(routeTrailColor),
                    fontSize: '11px',
                    fontWeight: '800',
                  }}
                  icon={
                    window.google?.maps
                      ? getStaffLocationPinIcon(window.google, { fill: routeTrailColor, active: true })
                      : undefined
                  }
                />
              </>
            )}

            {filteredLocations.map((item) => {
              const pinFill = staffPinColorForUserId(item.userId);
              return (
                <Marker
                  key={item.userId}
                  position={{ lat: item.latitude, lng: item.longitude }}
                  title={item.userName}
                  zIndex={6}
                  onClick={(e) => {
                    e?.domEvent?.stopPropagation?.();
                    setMapDetail({ source: 'live', entry: item });
                  }}
                  icon={
                    window.google?.maps
                      ? getStaffLocationPinIcon(window.google, {
                          fill: pinFill,
                          active: !!item.isActive,
                        })
                      : undefined
                  }
                />
              );
            })}
          </GoogleMap>

          <div className="pointer-events-none absolute left-2 top-2 z-10 max-w-[min(100%-1rem,14rem)]">
            <div className="pointer-events-auto rounded-xl border border-neutral-200/90 bg-white/95 px-2.5 py-2 shadow-panel backdrop-blur-sm">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Current</p>
              <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                <div>
                  <dt className="text-[10px] text-slate-500">Staffs</dt>
                  <dd className="text-sm font-black text-dark">{mapStats.staff}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-emerald-600">Active</dt>
                  <dd className="text-sm font-bold text-emerald-700">{mapStats.active}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[10px] text-slate-500">Inactive</dt>
                  <dd className="text-sm font-bold text-slate-700">{mapStats.inactive}</dd>
                </div>
              </dl>
              <p className="mt-1.5 border-t border-neutral-100 pt-1.5 text-[10px] leading-tight text-slate-500">
                Pins: {filteredLocations.length}
                {polylinePath.length > 1 ? ` · Trail ${polylinePath.length} pts` : ''}
              </p>
            </div>
          </div>
        </div>

        <aside className="flex max-h-[min(70vh,32rem)] w-full shrink-0 flex-col border-t border-neutral-200 lg:max-h-none lg:w-[22rem] lg:border-l lg:border-t-0">
          {mapDetail ? (
            <LiveTrackLocationDetailPanel
              entry={mapDetail.entry}
              source={mapDetail.source}
              resolvedAddress={resolvedAddress}
              onClose={() => setMapDetail(null)}
              onSeeAll={(e) => {
                if (e?.userId) {
                  setSelectedUserId(String(e.userId));
                  setMapDetail(null);
                }
              }}
            />
          ) : (
            <div className="flex flex-1 flex-col justify-center p-5">
              <h2 className="text-sm font-bold text-dark">Point details</h2>
              <p className="mt-3 text-xs leading-relaxed text-slate-600">
                Tap a <strong className="text-dark">staff pin</strong> (latest position),{' '}
                <strong className="text-dark">S</strong> or <strong className="text-dark">E</strong> on that staff
                member&apos;s trail (same colour as their line), or{' '}
                <strong className="text-dark">click the trail line</strong> to snap to the nearest GPS point. This panel
                shows address, battery, presence, GPS accuracy, and task context.
              </p>
            </div>
          )}
        </aside>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-black text-dark">Staff</h2>
        <LiveTrackStaffCards
          staffUsers={staffUsers}
          trackingByUserId={trackingByUserIdForDay}
          routeDate={routeDate}
          selectedUserId={selectedUserId}
          onSelectUser={(uid) => {
            setSelectedUserId(uid);
            setMapDetail(null);
          }}
          onViewTimeline={(uid) => {
            setSelectedUserId(uid);
            setMapDetail(null);
          }}
        />
      </div>
    </section>
  );
}

export default LiveTrackPage;
