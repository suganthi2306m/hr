import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { GoogleMap, Marker, OverlayView, OVERLAY_MOUSE_TARGET } from '@react-google-maps/api';
import clsx from 'clsx';
import apiClient from '../api/client';
import LocationLoadingIndicator from '../components/common/LocationLoadingIndicator';
import SlideOverPanel from '../components/common/SlideOverPanel';
import UiSelect from '../components/common/UiSelect';
import MapLocationPickerScreen from '../components/map/MapLocationPickerScreen';
import { useGoogleMaps } from '../context/GoogleMapsContext';
import { getCustomerMapPinIcon, getFluxMapOptions } from '../theme/fluxMap';
import { downloadCustomersExportXlsx } from '../utils/customersExcelImport';
import CustomerProfileSummary, {
  isCustomerOperationalActive,
} from '../components/customers/CustomerProfileSummary';

const DIAL_OPTIONS = [
  { title: 'IN +91', digits: '91' },
  { title: 'US +1', digits: '1' },
  { title: 'AE +971', digits: '971' },
  { title: 'GB +44', digits: '44' },
];

const defaultMapCenter = { lat: 20.5937, lng: 78.9629 };
const MAP_AREA_HEIGHT = 'min(72vh,640px)';
const mapContainerStyle = { width: '100%', height: '100%' };
const PAGE_SIZE = 12;

const emptyForm = () => ({
  customerName: '',
  countryCode: '91',
  customerNumber: '',
  companyName: '',
  emailId: '',
  city: '',
  state: '',
  country: '',
  pincode: '',
  address: '',
  segment: 'lead',
  tags: '',
  geoLat: '',
  geoLng: '',
  customerStatus: 'active',
});

function digitsOnly(v) {
  return String(v || '').replace(/\D/g, '');
}

function validateMobile(countryDigits, raw) {
  const d = digitsOnly(raw);
  if (!d) return 'Mobile number is required.';
  if (countryDigits === '91' && d.length !== 10) return 'Enter a 10-digit mobile number.';
  if (countryDigits !== '91' && d.length < 6) return 'Enter a valid number.';
  return '';
}

/** Single search: name, company, email, phone (digits match), address fields, segment, coordinates text. */
function customerMatchesSearch(c, rawQuery) {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return true;
  const digitQuery = digitsOnly(rawQuery);
  const hay = [
    c.customerName,
    c.companyName,
    c.emailId,
    c.customerNumber,
    c.countryCode ? `+${c.countryCode}` : '',
    c.countryCode,
    c.address,
    c.city,
    c.state,
    c.country,
    c.pincode,
    c.segment,
    c.geoLocation?.lat != null ? String(c.geoLocation.lat) : '',
    c.geoLocation?.lng != null ? String(c.geoLocation.lng) : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (hay.includes(q)) return true;
  if (digitQuery.length >= 2 && digitsOnly(c.customerNumber).includes(digitQuery)) return true;
  return false;
}

function customerAddressForGeocode(c) {
  return [c.address, c.city, c.state, c.pincode, c.country].filter(Boolean).join(', ').trim();
}

function MapCompanyTooltip({ c }) {
  const name = (c.companyName || c.customerName || 'Company').trim() || 'Company';
  /** Inline-only: map overlay panes ignore or fight Tailwind; size grows with text. */
  const shell = {
    display: 'inline-block',
    boxSizing: 'border-box',
    width: 'max-content',
    maxWidth: 'min(92vw, 520px)',
    borderRadius: 10,
    border: '1px solid rgba(212,212,212,0.35)',
    backgroundColor: '#1f1f22',
    padding: '10px 18px',
    boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    isolation: 'isolate',
  };
  const label = {
    margin: 0,
    padding: 0,
    color: '#ffffff',
    WebkitTextFillColor: '#ffffff',
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.35,
    letterSpacing: '0.01em',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    textShadow: '0 1px 2px rgba(0,0,0,0.9)',
    WebkitFontSmoothing: 'antialiased',
  };
  return (
    <div style={shell}>
      <p style={label} title={name}>
        {name}
      </p>
    </div>
  );
}

function CustomersPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [listLoadState, setListLoadState] = useState({ status: 'idle', message: '' });
  const [mainTab, setMainTab] = useState('directory');
  const [customerQuery, setCustomerQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [directoryPage, setDirectoryPage] = useState(1);
  const [mapPlaceQuery, setMapPlaceQuery] = useState('');
  const [locationsGoHint, setLocationsGoHint] = useState('');
  const [mapActiveId, setMapActiveId] = useState(null);
  const [mapHoverId, setMapHoverId] = useState('');
  const mapRef = useRef(null);
  const mapHoverClearTimerRef = useRef(null);
  const skipNextMapBackgroundClickRef = useRef(false);

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [lastMapPin, setLastMapPin] = useState(null);

  const { isLoaded, loadError: mapsLoadError } = useGoogleMaps();

  const loadCustomers = useCallback(async () => {
    setListLoadState({ status: 'loading', message: '' });
    try {
      const { data } = await apiClient.get('/customers');
      const raw = Array.isArray(data) ? data : data?.items;
      setItems(Array.isArray(raw) ? raw : []);
      setListLoadState({ status: 'ok', message: '' });
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'Unable to load customers.';
      setItems([]);
      setListLoadState({ status: 'error', message: typeof msg === 'string' ? msg : 'Unable to load customers.' });
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const filteredDirectory = useMemo(() => {
    return items.filter((c) => {
      if (statusFilter === 'active' && !isCustomerOperationalActive(c)) return false;
      if (statusFilter === 'inactive' && isCustomerOperationalActive(c)) return false;
      if (!customerMatchesSearch(c, customerQuery)) return false;
      return true;
    });
  }, [items, customerQuery, statusFilter]);
  const directoryTotalPages = Math.max(1, Math.ceil(filteredDirectory.length / PAGE_SIZE));
  const pagedDirectory = useMemo(() => {
    const start = (directoryPage - 1) * PAGE_SIZE;
    return filteredDirectory.slice(start, start + PAGE_SIZE);
  }, [filteredDirectory, directoryPage]);

  useEffect(() => {
    setDirectoryPage(1);
  }, [customerQuery, statusFilter]);

  useEffect(() => {
    if (directoryPage > directoryTotalPages) setDirectoryPage(directoryTotalPages);
  }, [directoryPage, directoryTotalPages]);
  const allDirectorySelected =
    pagedDirectory.length > 0 && pagedDirectory.every((item) => selectedCustomerIds.includes(String(item._id)));

  const mapPlotted = useMemo(() => {
    return items.filter((c) => c.geoLocation?.lat != null && c.geoLocation?.lng != null);
  }, [items]);

  const visibleOnMap = useMemo(() => {
    if (!customerQuery.trim()) return mapPlotted;
    return mapPlotted.filter((c) => customerMatchesSearch(c, customerQuery));
  }, [mapPlotted, customerQuery]);

  const mapTooltipCustomer = useMemo(() => {
    const id = mapHoverId || mapActiveId;
    if (!id) return null;
    return visibleOnMap.find((x) => String(x._id) === id) ?? null;
  }, [mapHoverId, mapActiveId, visibleOnMap]);

  const cancelMapHoverClear = useCallback(() => {
    if (mapHoverClearTimerRef.current) {
      clearTimeout(mapHoverClearTimerRef.current);
      mapHoverClearTimerRef.current = null;
    }
  }, []);

  const scheduleMapHoverClear = useCallback(() => {
    cancelMapHoverClear();
    mapHoverClearTimerRef.current = setTimeout(() => {
      setMapHoverId('');
      mapHoverClearTimerRef.current = null;
    }, 220);
  }, [cancelMapHoverClear]);

  useEffect(() => () => cancelMapHoverClear(), [cancelMapHoverClear]);

  const customerTooltipPixelOffset = useCallback((w, h) => ({ x: -w / 2, y: -h - 14 }), []);

  const fitMapToCustomerPins = useCallback((list) => {
    const map = mapRef.current;
    if (!map || !window.google?.maps || !list?.length) return false;
    const valid = list.filter((c) => c.geoLocation?.lat != null && c.geoLocation?.lng != null);
    if (!valid.length) return false;
    if (valid.length === 1) {
      const c = valid[0];
      map.setCenter({ lat: Number(c.geoLocation.lat), lng: Number(c.geoLocation.lng) });
      map.setZoom(14);
      return true;
    }
    const bounds = new window.google.maps.LatLngBounds();
    valid.forEach((c) => {
      bounds.extend({ lat: Number(c.geoLocation.lat), lng: Number(c.geoLocation.lng) });
    });
    map.fitBounds(bounds, 48);
    return true;
  }, []);

  useEffect(() => {
    if (mainTab !== 'locations' || !mapRef.current || !window.google?.maps || !visibleOnMap.length) return;
    fitMapToCustomerPins(visibleOnMap);
  }, [mainTab, visibleOnMap, fitMapToCustomerPins]);

  useEffect(() => {
    setLocationsGoHint('');
  }, [customerQuery, mapPlaceQuery, mainTab]);

  /** Place field takes priority. Otherwise pans to customers: saved pins first, else geocoded addresses. */
  const handleLocationsGo = useCallback(async () => {
    setLocationsGoHint('');
    if (!isLoaded || !window.google?.maps?.Geocoder || !mapRef.current) return;

    const placeQ = mapPlaceQuery.trim();
    const custQ = customerQuery.trim();

    if (placeQ) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: placeQ }, (results, status) => {
        if (status !== 'OK' || !results?.[0]?.geometry?.location) {
          window.alert('Could not find that place.');
          return;
        }
        const loc = results[0].geometry.location;
        mapRef.current.setCenter(loc);
        mapRef.current.setZoom(14);
        setLocationsGoHint('Map moved to the place you searched.');
      });
      return;
    }

    if (!custQ) {
      window.alert('Type a customer search (name, company, phone, email…) or a place in the second field, then click Go.');
      return;
    }

    const plottedMatch = items
      .filter((c) => c.geoLocation?.lat != null && c.geoLocation?.lng != null)
      .filter((c) => customerMatchesSearch(c, custQ));

    if (plottedMatch.length) {
      fitMapToCustomerPins(plottedMatch);
      setLocationsGoHint(`Centered on ${plottedMatch.length} matching pin${plottedMatch.length === 1 ? '' : 's'}.`);
      return;
    }

    const matches = items.filter((c) => customerMatchesSearch(c, custQ));
    if (!matches.length) {
      window.alert('No customers match that search.');
      return;
    }

    const geocoder = new window.google.maps.Geocoder();
    const geocodeOne = (address) =>
      new Promise((resolve) => {
        if (!address) {
          resolve(null);
          return;
        }
        geocoder.geocode({ address }, (results, status) => {
          if (status !== 'OK' || !results?.[0]?.geometry?.location) {
            resolve(null);
            return;
          }
          const loc = results[0].geometry.location;
          resolve({ lat: loc.lat(), lng: loc.lng() });
        });
      });

    const points = [];
    for (const c of matches.slice(0, 12)) {
      const addr = customerAddressForGeocode(c);
      const pt = await geocodeOne(addr);
      if (pt) points.push(pt);
    }

    if (!points.length) {
      window.alert(
        'Matching customers have no saved map pin and no geocodable address. Open the customer, use Select on map, and save.',
      );
      return;
    }

    const map = mapRef.current;
    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(14);
    } else {
      const bounds = new window.google.maps.LatLngBounds();
      points.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 64);
      window.google.maps.event.addListenerOnce(map, 'idle', () => {
        let z = map.getZoom();
        if (z > 15) z = 15;
        if (z < 4) z = 5;
        map.setZoom(z);
      });
    }

    setLocationsGoHint(
      `${matches.length} match(es) — map shows approximate area from address (no saved pins). Use Select on map in customer edit for exact markers.`,
    );
  }, [isLoaded, items, customerQuery, mapPlaceQuery, fitMapToCustomerPins]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitError('');
    const mobileErr = validateMobile(form.countryCode, form.customerNumber);
    if (mobileErr) {
      setSubmitError(mobileErr);
      return;
    }
    if (!form.emailId.trim()) {
      setSubmitError('Email is required.');
      return;
    }
    if (!form.emailId.includes('@')) {
      setSubmitError('Enter a valid email.');
      return;
    }
    if (!form.city.trim() || !form.pincode.trim() || !form.address.trim()) {
      setSubmitError('Address, city, and pincode are required.');
      return;
    }
    if (/\D/.test(form.pincode.trim())) {
      setSubmitError('Pincode must be digits only.');
      return;
    }
    if (!form.customerName.trim()) {
      setSubmitError('Customer name is required.');
      return;
    }

    const body = {
      customerName: form.customerName.trim(),
      customerNumber: digitsOnly(form.customerNumber),
      countryCode: form.countryCode,
      companyName: form.companyName.trim(),
      emailId: form.emailId.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      country: form.country.trim(),
      pincode: form.pincode.trim(),
      segment: form.segment,
      customerStatus: form.customerStatus === 'inactive' ? 'inactive' : 'active',
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    const geoLatN = form.geoLat !== '' ? Number(form.geoLat) : NaN;
    const geoLngN = form.geoLng !== '' ? Number(form.geoLng) : NaN;
    if (Number.isFinite(geoLatN) && Number.isFinite(geoLngN)) {
      body.geoLocation = { lat: geoLatN, lng: geoLngN };
    }

    try {
      if (editingId) {
        await apiClient.put(`/customers/${editingId}`, body);
      } else {
        await apiClient.post('/customers', body);
      }
      await loadCustomers();
      setForm(emptyForm());
      setEditingId('');
      setIsPanelOpen(false);
      setLastMapPin(null);
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'Unable to save customer.';
      setSubmitError(typeof msg === 'string' ? msg : 'Unable to save customer.');
    }
  };

  const editCustomer = (item) => {
    setEditingId(item._id);
    setForm({
      customerName: item.customerName || '',
      countryCode: item.countryCode || '91',
      customerNumber: item.customerNumber || '',
      companyName: item.companyName || '',
      emailId: item.emailId || '',
      city: item.city || '',
      state: item.state || '',
      country: item.country || '',
      pincode: item.pincode || '',
      address: item.address || '',
      segment: item.segment || 'lead',
      tags: Array.isArray(item.tags) ? item.tags.join(', ') : '',
      geoLat: item.geoLocation?.lat != null ? String(item.geoLocation.lat) : '',
      geoLng: item.geoLocation?.lng != null ? String(item.geoLocation.lng) : '',
      customerStatus: item.customerStatus === 'inactive' || item.isActive === false ? 'inactive' : 'active',
    });
    setLastMapPin(null);
    setSubmitError('');
    setIsPanelOpen(true);
  };

  const startCreate = () => {
    setEditingId('');
    setForm(emptyForm());
    setSubmitError('');
    setLastMapPin(null);
    setIsPanelOpen(true);
  };

  const closePanel = () => {
    setEditingId('');
    setForm(emptyForm());
    setSubmitError('');
    setMapPickerOpen(false);
    setLastMapPin(null);
    setIsPanelOpen(false);
  };

  const deleteCustomer = async (id) => {
    await apiClient.delete(`/customers/${id}`);
    loadCustomers();
  };

  const toggleSelectAllDirectory = () => {
    if (allDirectorySelected) {
      setSelectedCustomerIds((old) => old.filter((id) => !pagedDirectory.some((c) => String(c._id) === id)));
      return;
    }
    setSelectedCustomerIds((old) => {
      const next = new Set(old);
      pagedDirectory.forEach((c) => next.add(String(c._id)));
      return [...next];
    });
  };

  const toggleSelectCustomer = (id) => {
    setSelectedCustomerIds((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]));
  };

  const bulkDeleteCustomers = async () => {
    const selected = items.filter((c) => selectedCustomerIds.includes(String(c._id)));
    if (!selected.length) {
      window.alert('Select customers first.');
      return;
    }
    if (!window.confirm(`Delete ${selected.length} selected customer(s)?`)) return;
    for (const c of selected) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await apiClient.delete(`/customers/${c._id}`);
      } catch {
        /* continue */
      }
    }
    setSelectedCustomerIds([]);
    await loadCustomers();
  };

  const bulkSetCustomerStatus = async (status) => {
    const selected = items.filter((c) => selectedCustomerIds.includes(String(c._id)));
    if (!selected.length) {
      window.alert('Select customers first.');
      return;
    }
    for (const c of selected) {
      const body = {
        customerName: c.customerName || '',
        customerNumber: c.customerNumber || '',
        countryCode: c.countryCode || '91',
        companyName: c.companyName || '',
        emailId: c.emailId || '',
        address: c.address || '',
        city: c.city || '',
        pincode: c.pincode || '',
        state: c.state || '',
        country: c.country || '',
        customerStatus: status,
      };
      if (c.segment) body.segment = c.segment;
      if (Array.isArray(c.tags)) body.tags = c.tags;
      if (c.geoLocation?.lat != null && c.geoLocation?.lng != null) body.geoLocation = c.geoLocation;
      try {
        // eslint-disable-next-line no-await-in-loop
        await apiClient.put(`/customers/${c._id}`, body);
      } catch {
        /* continue */
      }
    }
    setSelectedCustomerIds([]);
    await loadCustomers();
  };

  const updateSingleCustomerStatus = async (item, status) => {
    const body = {
      customerName: item.customerName || '',
      customerNumber: item.customerNumber || '',
      countryCode: item.countryCode || '91',
      companyName: item.companyName || '',
      emailId: item.emailId || '',
      address: item.address || '',
      city: item.city || '',
      pincode: item.pincode || '',
      state: item.state || '',
      country: item.country || '',
      customerStatus: status,
    };
    if (item.segment) body.segment = item.segment;
    if (Array.isArray(item.tags)) body.tags = item.tags;
    if (item.geoLocation?.lat != null && item.geoLocation?.lng != null) body.geoLocation = item.geoLocation;
    await apiClient.put(`/customers/${item._id}`, body);
    await loadCustomers();
  };

  const onMapLocationConfirm = (data) => {
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
  };

  const withoutGeoCount = useMemo(() => items.filter((c) => !c.geoLocation?.lat).length, [items]);

  const { setDashboardTrail } = useOutletContext() || {};

  useEffect(() => {
    if (!setDashboardTrail) return undefined;
    setDashboardTrail(
      <div className="inline-flex shrink-0 rounded-full border border-neutral-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setMainTab('directory')}
          className={clsx(
            'rounded-full px-4 py-2 text-sm font-semibold transition',
            mainTab === 'directory' ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-neutral-100',
          )}
        >
          Customers
        </button>
        <button
          type="button"
          onClick={() => setMainTab('locations')}
          className={clsx(
            'rounded-full px-4 py-2 text-sm font-semibold transition',
            mainTab === 'locations' ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-neutral-100',
          )}
        >
          Locations
        </button>
      </div>,
    );
    return () => setDashboardTrail(null);
  }, [mainTab, setDashboardTrail]);

  return (
    <section className="space-y-4 text-dark">
      {mapsLoadError && (
        <p className="alert-error text-sm">
          Maps failed to load (pick location may not work). {String(mapsLoadError.message || mapsLoadError)}
        </p>
      )}

      {mainTab === 'directory' && (
        <div className="flux-card p-4 shadow-panel-lg">
          <div className="flex w-full flex-row flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 basis-[min(100%,220px)]">
              <label htmlFor="customer-directory-search" className="sr-only">
                Search customers
              </label>
              <input
                id="customer-directory-search"
                className="form-input w-full py-2.5"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder="Search: name, phone, email, company, city, address, pincode…"
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
                {filteredDirectory.length} of {items.length} shown
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/dashboard/track/customers/import')}
              className="btn-primary inline-flex shrink-0 items-center gap-2 whitespace-nowrap"
            >
              Import
            </button>
            <button
              type="button"
              onClick={() => void downloadCustomersExportXlsx(filteredDirectory)}
              className="btn-primary inline-flex shrink-0 items-center gap-2 whitespace-nowrap"
            >
              Export
            </button>
            <button
              type="button"
              onClick={startCreate}
              className="btn-primary inline-flex shrink-0 items-center gap-2 whitespace-nowrap"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Create customer
            </button>
          </div>
        </div>
      )}

      {mainTab === 'directory' && (
        <div className="flux-card overflow-auto p-4 shadow-panel-lg">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-base font-semibold text-dark">Customer list</h4>
          </div>
          {listLoadState.status === 'loading' && (
            <LocationLoadingIndicator label="Loading customers..." className="mb-3" />
          )}
          {listLoadState.status === 'error' && (
            <div className="alert-error mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>{listLoadState.message}</span>
              <button type="button" className="btn-secondary shrink-0 text-sm" onClick={() => loadCustomers()}>
                Retry
              </button>
            </div>
          )}
          {!!selectedCustomerIds.length && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-flux-panel px-3 py-2">
              <span className="text-sm font-semibold text-dark">{selectedCustomerIds.length} selected</span>
              <button type="button" className="btn-secondary text-xs" onClick={() => void bulkSetCustomerStatus('active')}>
                Set Active
              </button>
              <button type="button" className="btn-secondary text-xs" onClick={() => void bulkSetCustomerStatus('inactive')}>
                Set Inactive
              </button>
              <button
                type="button"
                className="inline-flex items-center rounded-lg border border-primary bg-primary/10 px-3 py-2 text-xs font-semibold text-dark hover:bg-primary/20"
                onClick={() => void bulkDeleteCustomers()}
              >
                Delete selected
              </button>
            </div>
          )}
          <table className="min-w-full text-dark">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="w-10 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allDirectorySelected}
                    onChange={toggleSelectAllDirectory}
                    aria-label="Select all customers on page"
                  />
                </th>
                <th className="px-2 py-2">Company</th>
                <th className="px-2 py-2">Segment</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Mobile</th>
                <th className="px-2 py-2">Email</th>
                <th className="min-w-[12rem] max-w-xs px-2 py-2">Address</th>
                <th className="w-[1%] whitespace-nowrap px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedDirectory.map((item, idx) => (
                <tr
                  key={item._id != null ? String(item._id) : `row-${idx}`}
                  className="cursor-pointer border-t border-neutral-200 transition hover:bg-neutral-50/80"
                  onClick={() => navigate(`/dashboard/track/customers/${item._id}`)}
                >
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedCustomerIds.includes(String(item._id))}
                      onChange={() => toggleSelectCustomer(String(item._id))}
                      aria-label={`Select ${item.companyName || item.customerName || 'customer'}`}
                    />
                  </td>
                  <td className="px-2 py-2 font-medium" title={item.companyName}>
                    {item.companyName || '—'}
                  </td>
                  <td className="px-2 py-2">
                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold capitalize text-dark">
                      {item.segment || 'lead'}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void updateSingleCustomerStatus(item, isCustomerOperationalActive(item) ? 'inactive' : 'active');
                      }}
                      className={clsx(
                        'inline-flex h-5 w-9 items-center rounded-full border p-0.5 transition',
                        isCustomerOperationalActive(item)
                          ? 'border-primary bg-primary'
                          : 'border-primary/50 bg-primary/15',
                      )}
                      aria-label={isCustomerOperationalActive(item) ? 'Set customer inactive' : 'Set customer active'}
                    >
                      <span
                        className={clsx(
                          'h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform',
                          isCustomerOperationalActive(item) ? 'translate-x-4' : 'translate-x-0',
                        )}
                      />
                    </button>
                  </td>
                  <td className="px-2 py-2 text-slate-800">
                    {item.countryCode ? `+${item.countryCode} ` : ''}
                    {item.customerNumber}
                  </td>
                  <td className="max-w-[10rem] px-2 py-2 break-all text-slate-800 sm:max-w-[14rem]">{item.emailId}</td>
                  <td className="max-w-xs px-2 py-2 align-top text-slate-800">
                    <span className="line-clamp-2 whitespace-normal break-words" title={item.address}>
                      {item.address || '—'}
                    </span>
                  </td>
                  <td className="px-2 py-2 align-middle">
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => editCustomer(item)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 text-dark hover:bg-neutral-100"
                        type="button"
                        title="Edit customer"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteCustomer(item._id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary bg-primary/10 text-dark hover:bg-primary/20"
                        type="button"
                        title="Delete customer"
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
              {!pagedDirectory.length && listLoadState.status === 'ok' && (
                <tr>
                  <td className="py-8 text-center text-slate-600" colSpan={8}>
                    No customers match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {filteredDirectory.length > PAGE_SIZE && (
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
      )}

      {mainTab === 'locations' && (
        <div className="space-y-3">
          <div className="flux-card flex flex-col gap-3 p-4 shadow-panel-lg sm:flex-row sm:flex-wrap sm:items-end">
            <div className="form-field min-w-[200px] flex-1">
              <label className="form-label-muted">Find customers on map</label>
              <input
                className="form-input"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder="Name, company, phone, email, address…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleLocationsGo();
                }}
              />
            </div>
            <div className="form-field min-w-[200px] flex-1">
              <label className="form-label-muted">Search place / area (optional)</label>
              <div className="flex gap-2">
                <input
                  className="form-input flex-1"
                  value={mapPlaceQuery}
                  onChange={(e) => setMapPlaceQuery(e.target.value)}
                  placeholder="City, landmark, pincode…"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleLocationsGo();
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() => void handleLocationsGo()}
                  disabled={!isLoaded || (!mapPlaceQuery.trim() && !customerQuery.trim())}
                >
                  Go
                </button>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            <strong>Go</strong> moves the map: if the place field is filled, it finds that area; otherwise it zooms to
            customers matching the left search (saved pins first, then address lookup).
          </p>
          {locationsGoHint ? <p className="text-sm font-medium text-dark">{locationsGoHint}</p> : null}

          <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-panel md:flex-row">
            <div
              className="relative min-h-0 w-full shrink-0 md:min-w-0 md:flex-1"
              style={{ height: MAP_AREA_HEIGHT }}
            >
              {!isLoaded && <p className="p-6 text-sm text-slate-500">Loading map…</p>}
              {isLoaded && (
                <GoogleMap
                  mapContainerStyle={mapContainerStyle}
                  center={defaultMapCenter}
                  zoom={5}
                  options={getFluxMapOptions()}
                  onLoad={(map) => {
                    mapRef.current = map;
                  }}
                  onClick={() => {
                    if (skipNextMapBackgroundClickRef.current) {
                      skipNextMapBackgroundClickRef.current = false;
                      return;
                    }
                    setMapActiveId(null);
                    setMapHoverId('');
                    cancelMapHoverClear();
                  }}
                >
                  {visibleOnMap.map((c) => {
                    const lat = Number(c.geoLocation.lat);
                    const lng = Number(c.geoLocation.lng);
                    const id = String(c._id);
                    const active = isCustomerOperationalActive(c);
                    return (
                      <Marker
                        key={id}
                        position={{ lat, lng }}
                        title=""
                        onClick={() => {
                          skipNextMapBackgroundClickRef.current = true;
                          setMapActiveId(id);
                          cancelMapHoverClear();
                          setMapHoverId(id);
                          window.setTimeout(() => {
                            skipNextMapBackgroundClickRef.current = false;
                          }, 120);
                        }}
                        onMouseOver={() => {
                          cancelMapHoverClear();
                          setMapHoverId(id);
                        }}
                        onMouseOut={() => {
                          scheduleMapHoverClear();
                        }}
                        icon={window.google?.maps ? getCustomerMapPinIcon(window.google, { active }) : undefined}
                      />
                    );
                  })}
                  {mapTooltipCustomer && (
                    <OverlayView
                      key={`tip-${mapTooltipCustomer._id}`}
                      position={{
                        lat: Number(mapTooltipCustomer.geoLocation.lat),
                        lng: Number(mapTooltipCustomer.geoLocation.lng),
                      }}
                      mapPaneName={OVERLAY_MOUSE_TARGET}
                      getPixelPositionOffset={customerTooltipPixelOffset}
                    >
                      <div
                        className="pointer-events-auto"
                        style={{ color: '#fafafa' }}
                        onMouseEnter={cancelMapHoverClear}
                        onMouseLeave={scheduleMapHoverClear}
                        onClick={(e) => e.stopPropagation()}
                        role="presentation"
                      >
                        <MapCompanyTooltip c={mapTooltipCustomer} />
                      </div>
                    </OverlayView>
                  )}
                </GoogleMap>
              )}
              <div className="pointer-events-none absolute bottom-4 right-4 z-[1] rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-panel-lg">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">On map</p>
                <p className="text-lg font-black text-dark">{visibleOnMap.length}</p>
                <p className="text-xs text-slate-500">customers with a saved pin</p>
              </div>
            </div>

            <aside className="flex min-h-0 w-full shrink-0 flex-col border-t border-neutral-200 bg-flux-panel/40 md:w-72 md:self-stretch md:border-t-0 md:border-l">
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
                {mapTooltipCustomer ? (
                  <div className="flux-card rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Company details</h3>
                      <button
                        type="button"
                        onClick={() => {
                          setMapActiveId(null);
                          setMapHoverId('');
                          cancelMapHoverClear();
                        }}
                        className="shrink-0 rounded-lg border border-neutral-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-neutral-50"
                      >
                        Close
                      </button>
                    </div>
                    <CustomerProfileSummary c={mapTooltipCustomer} compact />
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-neutral-200 bg-white/80 px-3 py-4 text-center text-xs leading-relaxed text-slate-500">
                    Hover or click a pin to see customer details here — no need to scroll past the map.
                  </p>
                )}
              </div>
            </aside>
          </div>

          {withoutGeoCount > 0 && (
            <p className="text-sm text-slate-600">
              {withoutGeoCount} customer{withoutGeoCount === 1 ? '' : 's'} have no map pin yet — use <strong>Select on map</strong> in create/edit to
              save coordinates for the Locations view.
            </p>
          )}
        </div>
      )}

      <SlideOverPanel
        open={isPanelOpen}
        onClose={closePanel}
        title={editingId ? 'Edit customer' : 'Add New Customer'}
        description="Customer details match the mobile app form."
      >
        <form className="grid gap-5" onSubmit={submit}>
          <div className="rounded-xl border border-neutral-200 bg-flux-panel p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer status</p>
            <div className="mt-3 inline-flex rounded-full border border-neutral-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setForm((o) => ({ ...o, customerStatus: 'active' }))}
                className={clsx(
                  'rounded-full px-4 py-2 text-sm font-semibold transition',
                  form.customerStatus !== 'inactive' ? 'bg-primary text-dark shadow-sm' : 'text-slate-600',
                )}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setForm((o) => ({ ...o, customerStatus: 'inactive' }))}
                className={clsx(
                  'rounded-full px-4 py-2 text-sm font-semibold transition',
                  form.customerStatus === 'inactive' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-600',
                )}
              >
                Inactive
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Inactive customers stay in the directory but can be filtered out.</p>
          </div>

          <div className="form-field">
            <label htmlFor="cust-name" className="form-label-muted">
              Customer name <span className="text-red-600">*</span>
            </label>
            <input
              id="cust-name"
              value={form.customerName}
              onChange={(e) => setForm((o) => ({ ...o, customerName: e.target.value }))}
              className="form-input"
              required
            />
          </div>

          <div className="grid grid-cols-[minmax(0,7.5rem)_1fr] gap-3">
            <div className="form-field">
              <label htmlFor="cust-code" className="form-label-muted">
                Code
              </label>
              <UiSelect
                id="cust-code"
                className="text-sm"
                menuClassName="text-sm"
                value={form.countryCode}
                onChange={(next) => setForm((o) => ({ ...o, countryCode: next }))}
                options={DIAL_OPTIONS.map((o) => ({ value: o.digits, label: o.title }))}
              />
            </div>
            <div className="form-field">
              <label htmlFor="cust-mobile" className="form-label-muted">
                Mobile <span className="text-red-600">*</span>
              </label>
              <input
                id="cust-mobile"
                value={form.customerNumber}
                onChange={(e) => setForm((o) => ({ ...o, customerNumber: e.target.value }))}
                placeholder={form.countryCode === '91' ? '10 digits' : ''}
                inputMode="numeric"
                autoComplete="tel"
                className="form-input"
                required
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="cust-company" className="form-label-muted">
              Company name
            </label>
            <input
              id="cust-company"
              value={form.companyName}
              onChange={(e) => setForm((o) => ({ ...o, companyName: e.target.value }))}
              autoComplete="off"
              className="form-input"
            />
            {!editingId && (
              <p className="mt-1 text-xs text-slate-500">Optional. If left blank, your registered company name is used when saving.</p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="cust-email" className="form-label-muted">
              Email <span className="text-red-600">*</span>
            </label>
            <input
              id="cust-email"
              type="email"
              value={form.emailId}
              onChange={(e) => setForm((o) => ({ ...o, emailId: e.target.value }))}
              className="form-input"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-field">
              <label htmlFor="cust-segment" className="form-label-muted">
                CRM segment
              </label>
              <UiSelect
                id="cust-segment"
                value={form.segment}
                onChange={(next) => setForm((o) => ({ ...o, segment: next }))}
                options={[
                  { value: 'lead', label: 'Lead' },
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
              />
            </div>
            <div className="form-field">
              <label htmlFor="cust-tags" className="form-label-muted">
                Tags (comma separated)
              </label>
              <input
                id="cust-tags"
                className="form-input"
                value={form.tags}
                onChange={(e) => setForm((o) => ({ ...o, tags: e.target.value }))}
                placeholder="vip, retail, follow-up"
              />
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200/90 bg-gradient-to-br from-flux-panel via-white to-primary/10 p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address from map</p>
                <p className="mt-1 text-sm text-slate-600">
                  Search or drop a pin: we fill address fields and capture latitude and longitude. When you save this
                  customer, coordinates are stored for the Locations map.
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
              <label htmlFor="cust-city" className="form-label-muted">
                City <span className="text-red-600">*</span>
              </label>
              <input
                id="cust-city"
                value={form.city}
                onChange={(e) => setForm((o) => ({ ...o, city: e.target.value }))}
                className="form-input"
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="cust-pin" className="form-label-muted">
                Pincode <span className="text-red-600">*</span>
              </label>
              <input
                id="cust-pin"
                value={form.pincode}
                onChange={(e) => setForm((o) => ({ ...o, pincode: e.target.value }))}
                placeholder="Digits only"
                inputMode="numeric"
                className="form-input"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-field">
              <label htmlFor="cust-state" className="form-label-muted">
                State / region
              </label>
              <input
                id="cust-state"
                value={form.state}
                onChange={(e) => setForm((o) => ({ ...o, state: e.target.value }))}
                placeholder="e.g. Tamil Nadu"
                className="form-input"
              />
            </div>
            <div className="form-field">
              <label htmlFor="cust-country" className="form-label-muted">
                Country
              </label>
              <input
                id="cust-country"
                value={form.country}
                onChange={(e) => setForm((o) => ({ ...o, country: e.target.value }))}
                placeholder="e.g. India"
                className="form-input"
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="cust-address" className="form-label-muted">
              Address <span className="text-red-600">*</span>
            </label>
            <textarea
              id="cust-address"
              value={form.address}
              onChange={(e) => setForm((o) => ({ ...o, address: e.target.value }))}
              rows={4}
              className="form-textarea"
              required
            />
          </div>

          {(form.geoLat !== '' || form.geoLng !== '') && (
            <p className="text-xs text-slate-500">
              Map coordinates (saved to database): {form.geoLat}, {form.geoLng} — shown on the Locations tab.
            </p>
          )}

          {submitError && <p className="alert-error">{submitError}</p>}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={closePanel} className="btn-secondary">
              Cancel
            </button>
            <button className="btn-primary" type="submit">
              {editingId ? 'Update' : 'Add'} customer
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
    </section>
  );
}

export default CustomersPage;
