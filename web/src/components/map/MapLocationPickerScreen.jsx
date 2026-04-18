import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Autocomplete, GoogleMap, Marker } from '@react-google-maps/api';
import { parseGeocodeResult, parsePlaceResult } from '../../utils/googleAddress';
import { FLUX_PRIMARY, fluxCircleMarkerIcon, getFluxMapOptions } from '../../theme/fluxMap';

const defaultCenter = { lat: 20.5937, lng: 78.9629 };

function MapLocationPickerScreen({ open, onClose, onConfirm, isLoaded, initialPin, initialSearch = '' }) {
  const [search, setSearch] = useState('');
  const [pin, setPin] = useState(null);
  const [draft, setDraft] = useState(null);
  const mapRef = useRef(null);
  const autocompleteRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setSearch(initialSearch || '');
    setPin(
      initialPin?.lat != null && initialPin?.lng != null
        ? { lat: Number(initialPin.lat), lng: Number(initialPin.lng) }
        : null,
    );
    setDraft(null);
  }, [open, initialPin, initialSearch]);

  const reverseGeocode = useCallback(async (lat, lng) => {
    if (!window.google?.maps?.Geocoder) {
      setDraft({
        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        city: '',
        pincode: '',
        state: '',
        country: '',
        lat,
        lng,
      });
      return;
    }
    try {
      const geocoder = new window.google.maps.Geocoder();
      const { results } = await geocoder.geocode({ location: { lat, lng } });
      const parsed = parseGeocodeResult(results?.[0]);
      setDraft({
        address: parsed.address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        city: parsed.city || '',
        pincode: parsed.pincode || '',
        state: parsed.state || '',
        country: parsed.country || '',
        lat,
        lng,
      });
    } catch {
      setDraft({
        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        city: '',
        pincode: '',
        state: '',
        country: '',
        lat,
        lng,
      });
    }
  }, []);

  const onMapPick = async (latLng) => {
    if (!latLng) return;
    const lat = latLng.lat();
    const lng = latLng.lng();
    setPin({ lat, lng });
    await reverseGeocode(lat, lng);
  };

  const onPlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();
    const parsed = parsePlaceResult(place);
    if (!parsed) return;
    setPin({ lat: parsed.lat, lng: parsed.lng });
    setDraft(parsed);
    setSearch(parsed.address);
    if (mapRef.current) {
      mapRef.current.panTo({ lat: parsed.lat, lng: parsed.lng });
      mapRef.current.setZoom(16);
    }
  };

  const goToMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPin({ lat, lng });
        reverseGeocode(lat, lng);
        if (mapRef.current) {
          mapRef.current.panTo({ lat, lng });
          mapRef.current.setZoom(16);
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleConfirm = () => {
    if (!draft || draft.lat == null || draft.lng == null) return;
    onConfirm({
      address: (draft.address || '').trim(),
      city: (draft.city || '').trim(),
      pincode: (draft.pincode || '').trim(),
      state: (draft.state || '').trim(),
      country: (draft.country || '').trim(),
      lat: draft.lat,
      lng: draft.lng,
    });
  };

  const center = pin || defaultCenter;
  const canConfirm = draft && draft.lat != null && draft.lng != null;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-neutral-200">
      <header className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-flux-sidebar px-4 py-3 text-white shadow-flux">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15"
        >
          <span className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold">Select on map</h2>
          <p className="truncate text-xs text-slate-400">Search or tap the map — lat/lng are captured when you confirm.</p>
        </div>
      </header>

      <div className="shrink-0 space-y-2 border-b border-neutral-200 bg-white px-4 py-3">
        {!import.meta.env.VITE_GOOGLE_MAPS_API_KEY && (
          <p className="text-sm text-amber-700">Set VITE_GOOGLE_MAPS_API_KEY to use the map.</p>
        )}
        {isLoaded && (
          <Autocomplete onLoad={(ac) => { autocompleteRef.current = ac; }} onPlaceChanged={onPlaceChanged}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for a place…"
              className="form-input"
            />
          </Autocomplete>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Tap map to drop pin · drag pin to adjust</p>
          <button type="button" onClick={goToMyLocation} className="text-xs font-semibold text-amber-700 hover:underline">
            Use my location
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-neutral-300">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%', minHeight: 'min(520px, calc(100dvh - 280px))' }}
            center={center}
            zoom={pin ? 16 : 5}
            onLoad={(map) => {
              mapRef.current = map;
            }}
            onClick={(e) => {
              if (e.latLng) onMapPick(e.latLng);
            }}
            options={getFluxMapOptions()}
          >
            {pin && (
              <Marker
                position={pin}
                draggable
                icon={window.google?.maps ? fluxCircleMarkerIcon(window.google, { fill: FLUX_PRIMARY, scale: 12 }) : undefined}
                onDragEnd={(e) => {
                  if (e.latLng) onMapPick(e.latLng);
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div className="flex h-full min-h-[240px] items-center justify-center text-sm text-slate-500">Loading map…</div>
        )}
      </div>

      <footer className="shrink-0 space-y-3 border-t border-neutral-200 bg-white p-4 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        <div
          className={clsx(
            'rounded-xl border px-3 py-2 text-sm',
            draft ? 'border-neutral-200 bg-flux-panel' : 'border-dashed border-neutral-300 bg-flux-panel/80 text-slate-500',
          )}
        >
          {draft ? (
            <>
              <p className="font-medium text-dark">{draft.address || '—'}</p>
              <p className="mt-1 text-xs text-slate-600">
                {[draft.city, draft.state, draft.country, draft.pincode].filter(Boolean).join(' · ') ||
                  'City / state / country / pincode from map'}
              </p>
            </>
          ) : (
            <p>Drop a pin or choose a search result to preview the address.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 sm:flex-none">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className="btn-primary flex-1 sm:min-w-[200px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Use this location
          </button>
        </div>
      </footer>
    </div>
  );
}

export default MapLocationPickerScreen;
