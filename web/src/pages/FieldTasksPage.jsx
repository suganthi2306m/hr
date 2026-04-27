import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import apiClient from '../api/client';
import LocationLoadingIndicator from '../components/common/LocationLoadingIndicator';
import SlideOverPanel from '../components/common/SlideOverPanel';
import TablePagination from '../components/common/TablePagination';
import UiSelect from '../components/common/UiSelect';
import MapLocationPickerScreen from '../components/map/MapLocationPickerScreen';
import { useGoogleMaps } from '../context/GoogleMapsContext';
import { parseGeocodeResult } from '../utils/googleAddress';
import { employeeSelectLabel } from '../utils/employeeSelectLabel';
import { TASK_LIFECYCLE_STATUSES, TASK_PRIORITIES, TASK_TYPES } from '../constants/rbac';

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadTasksCsv(filename, header, rows) {
  const body = [header.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
  const blob = new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function normTaskStatus(s) {
  const x = String(s || '').toLowerCase().trim();
  if (x === 'progress') return 'in_progress';
  return x;
}

function taskCreatedDateKey(iso) {
  if (!iso) return null;
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY-MM-DD') : null;
}

function assignedUserIdStr(task) {
  const u = task.assignedUser;
  if (!u) return '';
  if (typeof u === 'object' && u._id != null) return String(u._id);
  return String(u);
}

function taskCustomerIdStr(task) {
  const c = task.customerId;
  if (!c) return '';
  if (typeof c === 'object' && c._id != null) return String(c._id);
  return String(c);
}

function taskMatchesSearch(task, customers, q) {
  const s = String(q || '')
    .trim()
    .toLowerCase();
  if (!s) return true;
  const cust = customers.find((c) => String(c._id) === taskCustomerIdStr(task));
  const parts = [
    task.taskCode,
    task.taskName,
    task.title,
    task._id != null ? String(task._id) : '',
    task.assignedUser?.name,
    task.assignedUser?.email,
    cust?.companyName,
    cust?.customerName,
  ]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase());
  return parts.some((p) => p.includes(s));
}

const defaultTask = {
  title: '',
  description: '',
  assignedUser: '',
  customerId: '',
  status: 'assigned',
  taskType: 'visit',
  priority: 'medium',
  completionDate: '',
  destinationLocation: null,
  geofenceName: '',
  geofenceLat: '',
  geofenceLng: '',
  geofenceRadiusM: '',
  generateOtp: false,
};

function FieldTasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [payload, setPayload] = useState(defaultTask);
  const [editingId, setEditingId] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [fillFromCustomer, setFillFromCustomer] = useState(false);
  const [lastMapPin, setLastMapPin] = useState(null);
  const [filterEmployeeId, setFilterEmployeeId] = useState('');
  const [filterTaskCustomerId, setFilterTaskCustomerId] = useState('');
  const [createdFrom, setCreatedFrom] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [createdTo, setCreatedTo] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [taskStatusFilter, setTaskStatusFilter] = useState('');
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(12);
  const { isLoaded } = useGoogleMaps();

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [{ data: tasksData }, { data: usersData }, { data: custData }] = await Promise.all([
        apiClient.get('/fieldtasks'),
        apiClient.get('/users'),
        apiClient.get('/customers'),
      ]);
      setTasks(Array.isArray(tasksData?.items) ? tasksData.items : []);
      setUsers(Array.isArray(usersData?.items) ? usersData.items : []);
      setCustomers(Array.isArray(custData?.items) ? custData.items : []);
    } catch {
      setTasks([]);
      setUsers([]);
      setCustomers([]);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const employeeFilterOptions = useMemo(() => {
    const sorted = [...users].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return [
      { value: '', label: 'All employees' },
      ...sorted.map((u) => ({ value: String(u._id), label: employeeSelectLabel(u) })),
    ];
  }, [users]);

  const customerFilterOptions = useMemo(() => {
    const sorted = [...customers].sort((a, b) =>
      String(a.customerName || a.companyName || '').localeCompare(String(b.customerName || b.companyName || '')),
    );
    return [
      { value: '', label: 'All customers' },
      ...sorted.map((c) => ({
        value: String(c._id),
        label: [c.customerName, c.companyName].filter(Boolean).join(' — ') || 'Customer',
      })),
    ];
  }, [customers]);

  const taskStatusFilterOptions = useMemo(
    () => [
      { value: '', label: 'All statuses' },
      ...TASK_LIFECYCLE_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })),
    ],
    [],
  );

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterEmployeeId && assignedUserIdStr(t) !== filterEmployeeId) return false;
      if (filterTaskCustomerId && taskCustomerIdStr(t) !== filterTaskCustomerId) return false;
      if (taskStatusFilter && normTaskStatus(t.status) !== normTaskStatus(taskStatusFilter)) return false;
      if (createdFrom || createdTo) {
        const dayKey = taskCreatedDateKey(t.createdAt);
        if (dayKey == null) return false;
        if (createdFrom && dayKey < createdFrom) return false;
        if (createdTo && dayKey > createdTo) return false;
      }
      if (!taskMatchesSearch(t, customers, taskSearchQuery)) return false;
      return true;
    });
  }, [
    tasks,
    customers,
    taskSearchQuery,
    filterEmployeeId,
    filterTaskCustomerId,
    createdFrom,
    createdTo,
    taskStatusFilter,
  ]);
  const tableTotalPages = Math.max(1, Math.ceil(filteredTasks.length / tablePageSize));
  const pagedTasks = useMemo(() => {
    const start = (tablePage - 1) * tablePageSize;
    return filteredTasks.slice(start, start + tablePageSize);
  }, [filteredTasks, tablePage, tablePageSize]);

  useEffect(() => {
    setTablePage(1);
  }, [
    taskSearchQuery,
    filterEmployeeId,
    filterTaskCustomerId,
    createdFrom,
    createdTo,
    taskStatusFilter,
  ]);

  const resetFieldTaskFilters = useCallback(() => {
    const t = dayjs().format('YYYY-MM-DD');
    setCreatedFrom(t);
    setCreatedTo(t);
    setFilterEmployeeId('');
    setFilterTaskCustomerId('');
    setTaskStatusFilter('');
    setTaskSearchQuery('');
    setTablePage(1);
    void loadData();
  }, [loadData]);

  const exportFilteredTasksCsv = useCallback(() => {
    if (!filteredTasks.length) return;
    const header = [
      'Task code',
      'Title',
      'Type',
      'Priority',
      'Status',
      'Assigned user',
      'Customer',
      'Destination',
      'Completion due',
      'Created',
    ];
    const rows = filteredTasks.map((task) => {
      const cust = customers.find((c) => String(c._id) === taskCustomerIdStr(task));
      const customerLabel = [cust?.companyName, cust?.customerName].filter(Boolean).join(' — ') || '';
      const dest = task.destinationLocation;
      const destText =
        task.location ||
        [dest?.address, dest?.city, dest?.state, dest?.pincode].filter(Boolean).join(', ') ||
        (dest?.lat != null && dest?.lng != null ? `${dest.lat}, ${dest.lng}` : '');
      const due =
        task.completionDate != null
          ? dayjs(task.completionDate).format('YYYY-MM-DD HH:mm')
          : '';
      const created =
        task.createdAt != null && dayjs(task.createdAt).isValid()
          ? dayjs(task.createdAt).format('YYYY-MM-DD HH:mm')
          : '';
      return [
        task.taskCode || '',
        task.taskName || task.title || '',
        task.taskType || '',
        task.priority || '',
        String(task.status || '').replace(/_/g, ' '),
        task.assignedUser?.name || task.assignedUser?.email || '',
        customerLabel,
        destText,
        due,
        created,
      ];
    });
    const q = String(taskSearchQuery || '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 24);
    const parts = [
      createdFrom,
      createdTo,
      taskStatusFilter || 'all-status',
      filterEmployeeId ? 'emp' : '',
      filterTaskCustomerId ? 'cust' : '',
      q,
    ].filter(Boolean);
    const suffix = parts.join('_');
    downloadTasksCsv(
      `field-tasks_${dayjs().format('YYYY-MM-DD')}${suffix ? `_${suffix}` : ''}.csv`,
      header,
      rows,
    );
  }, [
    filteredTasks,
    customers,
    taskSearchQuery,
    createdFrom,
    createdTo,
    taskStatusFilter,
    filterEmployeeId,
    filterTaskCustomerId,
  ]);

  useEffect(() => {
    if (tablePage > tableTotalPages) setTablePage(tableTotalPages);
  }, [tablePage, tableTotalPages]);

  const patchDestination = useCallback((partial) => {
    setPayload((old) => {
      const cur = old.destinationLocation || {};
      return {
        ...old,
        destinationLocation: {
          lat: partial.lat !== undefined ? partial.lat : cur.lat ?? null,
          lng: partial.lng !== undefined ? partial.lng : cur.lng ?? null,
          address: partial.address !== undefined ? partial.address : cur.address ?? '',
          city: partial.city !== undefined ? partial.city : cur.city ?? '',
          pincode: partial.pincode !== undefined ? partial.pincode : cur.pincode ?? '',
          state: partial.state !== undefined ? partial.state : cur.state ?? '',
          country: partial.country !== undefined ? partial.country : cur.country ?? '',
        },
      };
    });
  }, []);

  const applyCustomerAddress = useCallback(async (customerId) => {
    const c = customers.find((x) => String(x._id) === String(customerId));
    if (!c) {
      window.alert('Choose a customer first.');
      return false;
    }
    const latSaved = c.geoLocation?.lat != null ? Number(c.geoLocation.lat) : NaN;
    const lngSaved = c.geoLocation?.lng != null ? Number(c.geoLocation.lng) : NaN;
    if (Number.isFinite(latSaved) && Number.isFinite(lngSaved)) {
      setPayload((old) => ({
        ...old,
        destinationLocation: {
          lat: latSaved,
          lng: lngSaved,
          address: String(c.address || '').trim(),
          city: String(c.city || '').trim(),
          pincode: String(c.pincode || '').trim(),
          state: String(c.state || '').trim(),
          country: String(c.country || '').trim(),
        },
      }));
      setLocationSearch(String(c.address || '').trim());
      setLastMapPin({ lat: latSaved, lng: lngSaved });
      return true;
    }
    if (!isLoaded || !window.google?.maps?.Geocoder) {
      window.alert('Map is still loading. Try again in a moment.');
      return false;
    }
    const q = [c.address, c.city, c.state, c.pincode, c.country].filter(Boolean).join(', ');
    if (!q.trim()) {
      window.alert('This customer has no address on file.');
      return false;
    }
    try {
      const geocoder = new window.google.maps.Geocoder();
      const { results } = await geocoder.geocode({ address: q });
      const first = results?.[0];
      if (!first?.geometry?.location) {
        window.alert('Could not locate that address. Use Select on map to pin it.');
        return false;
      }
      const loc = first.geometry.location;
      const lat = loc.lat();
      const lng = loc.lng();
      const parsed = parseGeocodeResult(first);
      setPayload((old) => ({
        ...old,
        destinationLocation: {
          lat,
          lng,
          address: (c.address || parsed.address || '').trim(),
          city: (c.city || parsed.city || '').trim(),
          pincode: (c.pincode || parsed.pincode || '').trim(),
          state: (c.state || parsed.state || '').trim(),
          country: (c.country || parsed.country || '').trim(),
        },
      }));
      setLocationSearch((c.address || parsed.address || '').trim());
      setLastMapPin({ lat, lng });
      return true;
    } catch {
      window.alert('Could not locate that address. Use Select on map.');
      return false;
    }
  }, [customers, isLoaded]);

  useEffect(() => {
    if (!fillFromCustomer || !payload.customerId) return undefined;
    let cancelled = false;
    (async () => {
      const ok = await applyCustomerAddress(payload.customerId);
      if (cancelled) return;
      if (!ok) setFillFromCustomer(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fillFromCustomer, payload.customerId, applyCustomerAddress]);

  const submit = async (event) => {
    event.preventDefault();
    if (!payload.assignedUser) {
      window.alert('Select an assigned user.');
      return;
    }
    const dest = payload.destinationLocation;
    const destLat = dest?.lat != null ? Number(dest.lat) : NaN;
    const destLng = dest?.lng != null ? Number(dest.lng) : NaN;
    if (!Number.isFinite(destLat) || !Number.isFinite(destLng)) {
      window.alert('Set a destination using the map or customer address.');
      return;
    }
    const body = {
      taskName: payload.title,
      description: payload.description,
      assignedUser: payload.assignedUser,
      status: payload.status,
      taskType: payload.taskType,
      priority: payload.priority,
      completionDate: payload.completionDate || undefined,
      generateOtp: Boolean(payload.generateOtp),
      destinationLocation: {
        lat: destLat,
        lng: destLng,
        address: String(dest.address || '').trim(),
        city: String(dest.city || '').trim(),
        pincode: String(dest.pincode || '').trim(),
        state: String(dest.state || '').trim(),
        country: String(dest.country || '').trim(),
      },
    };
    if (payload.geofenceLat && payload.geofenceLng && payload.geofenceRadiusM) {
      body.geofence = {
        name: payload.geofenceName || 'Task zone',
        lat: Number(payload.geofenceLat),
        lng: Number(payload.geofenceLng),
        radiusM: Number(payload.geofenceRadiusM),
      };
    }
    if (payload.customerId) {
      body.customerId = payload.customerId;
    } else if (editingId) {
      body.customerId = null;
    }
    if (editingId) {
      await apiClient.put(`/fieldtasks/${editingId}`, body);
    } else {
      await apiClient.post('/fieldtasks', body);
    }
    setPayload(defaultTask);
    setLocationSearch('');
    setEditingId('');
    setIsPanelOpen(false);
    setFillFromCustomer(false);
    setLastMapPin(null);
    setMapPickerOpen(false);
    loadData();
  };

  const editTask = (task) => {
    setEditingId(task._id);
    const d = task.destinationLocation || {};
    const gf = task.geofence || {};
    setPayload({
      title: task.taskName || task.title || '',
      description: task.description,
      assignedUser: task.assignedUser?._id || '',
      customerId: taskCustomerIdStr(task),
      destinationLocation: {
        lat: d.lat != null ? Number(d.lat) : null,
        lng: d.lng != null ? Number(d.lng) : null,
        address: d.address || '',
        city: d.city || '',
        pincode: d.pincode || '',
        state: d.state || '',
        country: d.country || '',
      },
      status: task.status,
      taskType: task.taskType || 'visit',
      priority: task.priority || 'medium',
      completionDate: task.completionDate ? new Date(task.completionDate).toISOString().slice(0, 16) : '',
      geofenceName: gf.name || '',
      geofenceLat: gf.lat != null ? String(gf.lat) : '',
      geofenceLng: gf.lng != null ? String(gf.lng) : '',
      geofenceRadiusM: gf.radiusM != null ? String(gf.radiusM) : '',
      generateOtp: false,
    });
    setLocationSearch(d.address || '');
    setFillFromCustomer(false);
    setLastMapPin(d.lat != null && d.lng != null ? { lat: Number(d.lat), lng: Number(d.lng) } : null);
    setIsPanelOpen(true);
  };

  const startCreate = () => {
    setPayload(defaultTask);
    setLocationSearch('');
    setEditingId('');
    setFillFromCustomer(false);
    setLastMapPin(null);
    setMapPickerOpen(false);
    setIsPanelOpen(true);
  };

  const closePanel = () => {
    setPayload(defaultTask);
    setLocationSearch('');
    setEditingId('');
    setFillFromCustomer(false);
    setLastMapPin(null);
    setMapPickerOpen(false);
    setIsPanelOpen(false);
  };

  const removeTask = async (id) => {
    await apiClient.delete(`/fieldtasks/${id}`);
    loadData();
  };

  const dest = payload.destinationLocation || {};

  const onMapConfirm = (data) => {
    patchDestination({
      lat: data.lat,
      lng: data.lng,
      address: data.address,
      city: data.city,
      pincode: data.pincode,
      state: data.state,
      country: data.country,
    });
    setLocationSearch(data.address || '');
    setLastMapPin({ lat: data.lat, lng: data.lng });
    setFillFromCustomer(false);
    setMapPickerOpen(false);
  };

  return (
    <section className="space-y-4">
      <div className="flux-card overflow-auto p-4 shadow-panel-lg">
        <div className="mb-4 flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
            <div className="form-field min-w-0 lg:col-span-3">
              <label htmlFor="field-task-filter-employee" className="form-label-muted text-xs">
                Assigned employee
              </label>
              <UiSelect
                id="field-task-filter-employee"
                value={filterEmployeeId}
                onChange={setFilterEmployeeId}
                options={employeeFilterOptions}
                searchable
              />
            </div>
            <div className="form-field min-w-0 lg:col-span-3">
              <label htmlFor="field-task-filter-customer" className="form-label-muted text-xs">
                Customer
              </label>
              <UiSelect
                id="field-task-filter-customer"
                value={filterTaskCustomerId}
                onChange={setFilterTaskCustomerId}
                options={customerFilterOptions}
                searchable
              />
            </div>
            <div className="form-field min-w-0 lg:col-span-2">
              <label htmlFor="field-task-status-filter" className="form-label-muted text-xs">
                Task status
              </label>
              <UiSelect
                id="field-task-status-filter"
                value={taskStatusFilter}
                onChange={setTaskStatusFilter}
                options={taskStatusFilterOptions}
                className="capitalize"
                menuClassName="capitalize"
              />
            </div>
            <div className="form-field min-w-0 lg:col-span-2">
              <label htmlFor="field-task-created-from" className="form-label-muted text-xs">
                Created from
              </label>
              <input
                id="field-task-created-from"
                type="date"
                className="form-input max-w-[10.5rem] py-2.5"
                value={createdFrom}
                onChange={(e) => setCreatedFrom(e.target.value)}
              />
            </div>
            <div className="form-field min-w-0 lg:col-span-2">
              <label htmlFor="field-task-created-to" className="form-label-muted text-xs">
                Created to
              </label>
              <input
                id="field-task-created-to"
                type="date"
                className="form-input max-w-[10.5rem] py-2.5"
                value={createdTo}
                onChange={(e) => setCreatedTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-secondary inline-flex h-10 w-10 shrink-0 items-center justify-center p-0"
                title="Reset filters to today and reload"
                aria-label="Reset filters to today and reload"
                onClick={() => resetFieldTaskFilters()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <path d="M21 3v6h-6" />
                </svg>
              </button>
              <button
                type="button"
                className="btn-secondary shrink-0 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!filteredTasks.length}
                onClick={() => exportFilteredTasksCsv()}
              >
                Export CSV
              </button>
              <button
                type="button"
                className="btn-primary inline-flex h-11 shrink-0 items-center justify-center gap-2 px-3 sm:px-4"
                title="Import from Excel"
                aria-label="Import from Excel"
                onClick={() => navigate('/dashboard/track/fieldtasks/import')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 17V8m-4 3 4-4 4 4" />
                  <path strokeLinecap="round" d="M5 21h14" />
                </svg>
                <span className="font-semibold">Import</span>
              </button>
              <button type="button" onClick={startCreate} className="btn-primary inline-flex h-11 shrink-0 items-center gap-2 px-3 sm:px-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Create task
              </button>
            </div>
            <div className="form-field min-w-0 min-h-[2.75rem] flex-1 sm:min-w-[12rem]">
              <label htmlFor="field-task-search" className="form-label-muted text-xs">
                Search
              </label>
              <input
                id="field-task-search"
                className="form-input py-2.5"
                value={taskSearchQuery}
                onChange={(e) => setTaskSearchQuery(e.target.value)}
                placeholder="Title, code, id, company, customer, assignee…"
              />
            </div>
            <p className="shrink-0 pb-1 text-sm text-slate-500 sm:ml-auto sm:self-end">
              {filteredTasks.length} of {tasks.length} match filters
            </p>
          </div>
        </div>
        {loadingData ? (
          <LocationLoadingIndicator label="Loading users and customers..." className="py-3" />
        ) : (
          <>
          <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th>Task code</th>
              <th>Title</th>
              <th>Type</th>
              <th>Priority</th>
              <th>Assigned user</th>
              <th>Destination</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedTasks.map((task) => (
              <tr
                key={task._id}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                onClick={() => navigate(`/dashboard/track/fieldtasks/${task._id}`)}
              >
                <td className="py-2">{task.taskCode || '-'}</td>
                <td className="py-2">{task.taskName || task.title || '-'}</td>
                <td className="capitalize text-slate-600">{task.taskType || 'visit'}</td>
                <td>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold capitalize text-dark">
                    {task.priority || 'medium'}
                  </span>
                </td>
                <td>{task.assignedUser?.name || '-'}</td>
                <td>{task.location}</td>
                <td className="capitalize">{(task.status || '').replace(/_/g, ' ')}</td>
                <td className="whitespace-nowrap text-slate-600">
                  {task.createdAt && dayjs(task.createdAt).isValid()
                    ? dayjs(task.createdAt).format('YYYY-MM-DD HH:mm')
                    : '—'}
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        editTask(task);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 text-dark hover:bg-neutral-100"
                      type="button"
                      title="Edit task"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTask(task._id);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary bg-primary/10 text-dark hover:bg-primary/20"
                      type="button"
                      title="Delete task"
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
            {!pagedTasks.length && (
              <tr>
                <td className="py-8 text-center text-slate-600" colSpan={9}>
                  {tasks.length ? 'No tasks match your filters.' : 'No field tasks yet. Create one or import from Excel.'}
                </td>
              </tr>
            )}
          </tbody>
          </table>
          {!loadingData && (
            <div className="mt-4">
              <TablePagination
                page={tablePage}
                pageSize={tablePageSize}
                totalCount={filteredTasks.length}
                onPageChange={(next) => setTablePage(Math.max(1, next))}
                onPageSizeChange={(nextSize) => {
                  setTablePageSize(nextSize);
                  setTablePage(1);
                }}
                pageSizeOptions={[10, 12, 25, 50]}
              />
            </div>
          )}
          </>
        )}
      </div>

      <SlideOverPanel
        open={isPanelOpen}
        onClose={closePanel}
        title={editingId ? 'Edit task' : 'Create task'}
        description="Assign destination, timing, and field user."
      >
        <form className="grid gap-4" onSubmit={submit}>
          <div className="form-field">
            <label htmlFor="task-title" className="form-label-muted">
              Task title
            </label>
            <input
              id="task-title"
              value={payload.title}
              placeholder="e.g. Site inspection"
              onChange={(e) => setPayload((old) => ({ ...old, title: e.target.value }))}
              className="form-input"
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="task-desc" className="form-label-muted">
              Description
            </label>
            <input
              id="task-desc"
              value={payload.description}
              placeholder="What should the field user do?"
              onChange={(e) => setPayload((old) => ({ ...old, description: e.target.value }))}
              className="form-input"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-field">
              <label htmlFor="task-type" className="form-label-muted">
                Task type
              </label>
              <UiSelect
                id="task-type"
                className="capitalize"
                menuClassName="capitalize"
                value={payload.taskType}
                onChange={(next) => setPayload((old) => ({ ...old, taskType: next }))}
                options={TASK_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              />
            </div>
            <div className="form-field">
              <label htmlFor="task-priority" className="form-label-muted">
                Priority
              </label>
              <UiSelect
                id="task-priority"
                className="capitalize"
                menuClassName="capitalize"
                value={payload.priority}
                onChange={(next) => setPayload((old) => ({ ...old, priority: next }))}
                options={TASK_PRIORITIES.map((p) => ({ value: p.value, label: p.label }))}
              />
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-flux-panel px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lifecycle</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {['assigned', 'accepted', 'in_progress', 'completed', 'verified'].map((s) => {
                const cur = String(payload.status || '').toLowerCase();
                const norm = cur === 'progress' ? 'in_progress' : cur;
                const active = norm === s;
                return (
                  <span
                    key={s}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                      active ? 'bg-primary text-dark' : 'bg-white text-slate-500'
                    }`}
                  >
                    {s.replace(/_/g, ' ')}
                  </span>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500">Pick status below — timestamps are stored on the server.</p>
          </div>

          <div className="form-field">
            <label htmlFor="task-assignee" className="form-label-muted">
              Assigned user
            </label>
            <UiSelect
              id="task-assignee"
              value={payload.assignedUser}
              onChange={(next) => setPayload((old) => ({ ...old, assignedUser: next }))}
              options={[
                { value: '', label: 'Select a user' },
                ...users.map((user) => ({ value: String(user._id), label: user.name })),
              ]}
            />
          </div>

          <div className="form-field">
            <label htmlFor="task-customer" className="form-label-muted">
              Customer (optional)
            </label>
            <UiSelect
              id="task-customer"
              value={payload.customerId}
              onChange={(next) => setPayload((old) => ({ ...old, customerId: next }))}
              options={[
                { value: '', label: 'No customer linked' },
                ...customers.map((c) => ({
                  value: String(c._id),
                  label: `${c.customerName}${c.city ? ` · ${c.city}` : ''}`,
                })),
              ]}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-200/90 bg-flux-panel px-4 py-3 transition hover:border-neutral-300">
            <input
              type="checkbox"
              checked={fillFromCustomer}
              disabled={!payload.customerId}
              onChange={(e) => setFillFromCustomer(e.target.checked)}
              className="form-checkbox mt-0.5"
            />
            <span className="text-sm leading-snug text-slate-700">
              <span className="font-semibold text-dark">Use customer address as destination</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {`Uses the customer's saved map pin (lat/lng) when present; otherwise geocodes their address for coordinates.`}
              </span>
            </span>
          </label>

          <div className="rounded-xl border border-neutral-200/90 bg-gradient-to-br from-flux-panel via-white to-primary/10 p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Destination on map</p>
                <p className="mt-1 text-sm text-slate-600">
                  Pin or search sets latitude and longitude plus address fields; coordinates are stored on the task when
                  you save.
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
            {dest.lat != null && dest.lng != null && (
              <p className="mt-2 font-mono text-xs text-slate-500">
                Destination lat/lng (saved with task): {Number(dest.lat).toFixed(5)}, {Number(dest.lng).toFixed(5)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-field">
              <label htmlFor="task-city" className="form-label-muted">
                City
              </label>
              <input
                id="task-city"
                value={dest.city || ''}
                onChange={(e) => patchDestination({ city: e.target.value })}
                placeholder="City"
                className="form-input"
              />
            </div>
            <div className="form-field">
              <label htmlFor="task-pin" className="form-label-muted">
                Pincode
              </label>
              <input
                id="task-pin"
                value={dest.pincode || ''}
                onChange={(e) => patchDestination({ pincode: e.target.value })}
                placeholder="Pincode"
                inputMode="numeric"
                className="form-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-field">
              <label htmlFor="task-state" className="form-label-muted">
                State / region
              </label>
              <input
                id="task-state"
                value={dest.state || ''}
                onChange={(e) => patchDestination({ state: e.target.value })}
                placeholder="State"
                className="form-input"
              />
            </div>
            <div className="form-field">
              <label htmlFor="task-country" className="form-label-muted">
                Country
              </label>
              <input
                id="task-country"
                value={dest.country || ''}
                onChange={(e) => patchDestination({ country: e.target.value })}
                placeholder="Country"
                className="form-input"
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="task-dest-address" className="form-label-muted">
              Destination address
            </label>
            <textarea
              id="task-dest-address"
              value={dest.address || ''}
              placeholder="From map, customer, or type manually"
              onChange={(e) => {
                const v = e.target.value;
                setLocationSearch(v);
                patchDestination({ address: v });
              }}
              rows={3}
              className="form-textarea min-h-[5.5rem]"
            />
          </div>

          <div className="form-field">
            <label htmlFor="task-due" className="form-label-muted">
              Target completion
            </label>
            <input
              id="task-due"
              type="datetime-local"
              value={payload.completionDate}
              onChange={(e) => setPayload((old) => ({ ...old, completionDate: e.target.value }))}
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label htmlFor="task-status" className="form-label-muted">
              Status
            </label>
            <UiSelect
              id="task-status"
              className="capitalize"
              menuClassName="capitalize"
              value={payload.status}
              onChange={(next) => setPayload((old) => ({ ...old, status: next }))}
              options={TASK_LIFECYCLE_STATUSES.map((status) => ({
                value: status,
                label: status.replace(/_/g, ' '),
              }))}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={closePanel} className="btn-secondary">
              Cancel
            </button>
            <button className="btn-primary" type="submit">
              {editingId ? 'Update' : 'Assign'} task
            </button>
          </div>
        </form>
      </SlideOverPanel>

      <MapLocationPickerScreen
        open={mapPickerOpen}
        onClose={() => setMapPickerOpen(false)}
        isLoaded={isLoaded}
        initialSearch={locationSearch || dest.address || ''}
        initialPin={lastMapPin}
        onConfirm={onMapConfirm}
      />
    </section>
  );
}

export default FieldTasksPage;
