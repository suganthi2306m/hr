import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useSearchParams } from 'react-router-dom';
import apiClient from '../api/client';
import { normalizeBranchesFromApi } from '../components/settings/CompanyBranchesPanel';
import BranchesDirectoryPanel from '../components/settings/BranchesDirectoryPanel';
import { cleanBranchesForApi } from '../utils/branchWorkspace';
import SlideOverPanel from '../components/common/SlideOverPanel';
import LocationLoadingIndicator from '../components/common/LocationLoadingIndicator';
import ShiftsManagementPanel from '../components/settings/ShiftsManagementPanel';
import SingleCustomFieldDefForm, { emptyCustomFieldDef } from '../components/settings/SingleCustomFieldDefForm';

const TABS = [
  { id: 'branches', label: 'Branches', icon: 'branch' },
  { id: 'geofence', label: 'Geofence', icon: 'pin' },
  { id: 'customFields', label: 'Custom fields', icon: 'form' },
  { id: 'leaveTypes', label: 'Leave types', icon: 'leave' },
  { id: 'designations', label: 'Designations', icon: 'badge' },
  { id: 'departments', label: 'Departments', icon: 'building' },
  { id: 'employmentTypes', label: 'Employment types', icon: 'briefcase' },
  { id: 'weeklyOff', label: 'Weekly off', icon: 'calendar' },
  { id: 'shifts', label: 'Shifts', icon: 'clock' },
];

const CUSTOM_FIELDS_INNER_TABS = [
  { id: 'employee', label: 'Employee fields' },
  { id: 'company', label: 'Company fields' },
];

const WEEK_DAYS = [
  { key: 'sunday', label: 'Sunday' },
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
];

const WEEK_RULE_KEYS = ['all', 'first', 'second', 'third', 'fourth', 'fifth'];

function emptyWeekRule() {
  return { all: false, first: false, second: false, third: false, fourth: false, fifth: false };
}

function emptyWeeklyOffDraft() {
  return {
    name: '',
    days: {
      sunday: emptyWeekRule(),
      monday: emptyWeekRule(),
      tuesday: emptyWeekRule(),
      wednesday: emptyWeekRule(),
      thursday: emptyWeekRule(),
      friday: emptyWeekRule(),
      saturday: emptyWeekRule(),
    },
  };
}

function normalizeWeekRule(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    all: Boolean(r.all),
    first: Boolean(r.first),
    second: Boolean(r.second),
    third: Boolean(r.third),
    fourth: Boolean(r.fourth),
    fifth: Boolean(r.fifth),
  };
}

function normalizeWeeklyOffFromApi(raw) {
  const out = emptyWeeklyOffDraft();
  if (!raw) return out;
  // Backward compatibility with old string format.
  if (typeof raw === 'string') {
    const lk = String(raw).trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(out.days, lk)) {
      out.name = 'Weekly Off';
      out.days[lk] = { ...emptyWeekRule(), all: true };
    }
    return out;
  }
  if (typeof raw === 'object') {
    out.name = String(raw.name || '').trim();
    const days = raw.days && typeof raw.days === 'object' ? raw.days : {};
    WEEK_DAYS.forEach((d) => {
      out.days[d.key] = normalizeWeekRule(days[d.key]);
    });
  }
  return out;
}

function normalizeBranchIdGenerationFromApi(os) {
  const b = os?.idGeneration?.branch;
  if (!b || typeof b !== 'object') {
    return { enabled: false, prefix: 'BR', startNumber: 1, nextNumber: 1, padLength: 0 };
  }
  const startNumber = Math.max(0, Math.floor(Number(b.startNumber) || 1));
  let nextNumber = Math.max(0, Math.floor(Number(b.nextNumber) != null ? Number(b.nextNumber) : startNumber));
  nextNumber = Math.max(startNumber, nextNumber);
  return {
    enabled: b.enabled === true,
    prefix: String(b.prefix != null ? b.prefix : 'BR').trim(),
    startNumber,
    nextNumber,
    padLength: Math.min(12, Math.max(0, Math.floor(Number(b.padLength) || 0))),
  };
}

function normalizeOrgSetup(c) {
  const os = c?.orgSetup && typeof c.orgSetup === 'object' ? c.orgSetup : {};
  const idStr = (x) => (x?._id != null ? String(x._id) : '');
  return {
    leaveTypes: Array.isArray(os.leaveTypes)
      ? os.leaveTypes.map((r) => ({
          _id: idStr(r),
          name: r.name || '',
          annualDays: r.annualDays != null ? Number(r.annualDays) : 0,
          carryForward: Boolean(r.carryForward),
          paidLeave: r.paidLeave !== false,
          applicableTo: r.applicableTo || 'All',
          isActive: r.isActive !== false,
        }))
      : [],
    designations: Array.isArray(os.designations)
      ? os.designations.map((r) => ({ _id: idStr(r), name: r.name || '', isActive: r.isActive !== false }))
      : [],
    departments: Array.isArray(os.departments)
      ? os.departments.map((r) => ({ _id: idStr(r), name: r.name || '', isActive: r.isActive !== false }))
      : [],
    employmentTypes: Array.isArray(os.employmentTypes)
      ? os.employmentTypes.map((r) => ({
          _id: idStr(r),
          name: r.name || '',
          description: r.description || '',
          isActive: r.isActive !== false,
        }))
      : [],
    expenseCategories: Array.isArray(os.expenseCategories)
      ? os.expenseCategories.map((r) => ({
          _id: idStr(r),
          name: r.name || '',
          budgetAmount: r.budgetAmount != null ? Number(r.budgetAmount) : 0,
          iconKey: r.iconKey || 'receipt',
          isActive: r.isActive !== false,
        }))
      : [],
    shifts: Array.isArray(os.shifts)
      ? os.shifts.map((r) => ({
          _id: idStr(r),
          name: r.name || '',
          letter: String(r.letter || '').slice(0, 1).toUpperCase(),
          startTime: r.startTime || '09:00',
          endTime: r.endTime || '18:00',
          createdByName: r.createdByName || '',
          updatedByName: r.updatedByName || '',
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }))
      : [],
    weeklyOff: normalizeWeeklyOffFromApi(os.weeklyOff),
  };
}

function normalizeCustomFieldDefForUi(row) {
  if (!row || typeof row !== 'object') return emptyCustomFieldDef();
  return {
    key: row.key || '',
    label: row.label || '',
    category: String(row.category || 'General').trim() || 'General',
    fieldType: row.fieldType || 'text',
    options: Array.isArray(row.options) ? row.options.map((o) => ({ ...o })) : [],
    isActive: row.isActive !== false,
    isRequired: row.isRequired === true || row.isRequired === 'true' || row.isRequired === 1 || row.isRequired === '1',
  };
}

function filterCustomFieldDefs(defs, q) {
  const t = String(q || '').trim().toLowerCase();
  if (!t) return defs;
  return defs.filter((d) => {
    if ([d.label, d.key, d.category, d.fieldType].some((x) => String(x || '').toLowerCase().includes(t))) return true;
    return (Array.isArray(d.options) ? d.options : []).some(
      (o) => String(o.label || '').toLowerCase().includes(t) || String(o.value || '').toLowerCase().includes(t),
    );
  });
}

function choicesSummary(def) {
  const opts = Array.isArray(def.options) ? def.options : [];
  if (!opts.length) return def.fieldType === 'checkbox' ? 'Single toggle' : '-';
  const parts = opts.slice(0, 3).map((o) => o.label || o.value);
  const more = opts.length > 3 ? ` +${opts.length - 3}` : '';
  return `${parts.join(', ')}${more}`;
}

function matchesStatus(isActive, statusFilter) {
  if (statusFilter === 'active') return isActive;
  if (statusFilter === 'inactive') return !isActive;
  return true;
}

function TabIcon({ name }) {
  const c = 'h-4 w-4 flex-shrink-0';
  switch (name) {
    case 'leave':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={c} aria-hidden>
          <path d="M5 19c5.5 0 12.2-2.2 14-9.5C12.5 9.5 8 12.5 5 19Z" />
        </svg>
      );
    case 'badge':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={c} aria-hidden>
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .4 1.9L21 18.3l-2.3 2.3-1.4-1.2a1.7 1.7 0 0 0-1.9-.4 9 9 0 0 1-10.8 0 1.7 1.7 0 0 0-1.9.4L3.3 20.6 1 18.3l1.2-1.4a1.7 1.7 0 0 0 .4-1.9 9 9 0 0 1 0-10.8 1.7 1.7 0 0 0-.4-1.9L1 5.7 3.3 3.4l1.4 1.2a1.7 1.7 0 0 0 1.9.4 9 9 0 0 1 10.8 0 1.7 1.7 0 0 0 1.9-.4L20.7 3.4 23 5.7l-1.2 1.4a1.7 1.7 0 0 0-.4 1.9 9 9 0 0 1 0 10.8Z" />
        </svg>
      );
    case 'building':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={c} aria-hidden>
          <path d="M4 21V8l8-4 8 4v13" />
          <path d="M9 21v-6h6v6" />
          <path d="M9 10h.01M9 14h.01M15 10h.01M15 14h.01" />
        </svg>
      );
    case 'briefcase':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={c} aria-hidden>
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <rect x="3" y="7" width="18" height="14" rx="2" />
          <path d="M12 12v5" />
        </svg>
      );
    case 'branch':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={c} aria-hidden>
          <path d="M6 3v18" />
          <path d="M6 7h8a4 4 0 0 1 0 8H6" />
          <path d="M6 15h9a3 3 0 0 1 0 6H6" />
        </svg>
      );
    case 'pin':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={c} aria-hidden>
          <path d="M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12Z" />
          <circle cx="12" cy="10" r="2.7" />
        </svg>
      );
    case 'clock':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={c} aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6l3 2" />
        </svg>
      );
    case 'calendar':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={c} aria-hidden>
          <rect x="3" y="4.5" width="18" height="16" rx="2" />
          <path d="M8 3v3M16 3v3M3 9.5h18" />
        </svg>
      );
    case 'form':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={c} aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9h10M7 13h6M7 17h8" />
        </svg>
      );
    default:
      return null;
  }
}

/** Same compact toggle as Users table rows */
function StatusToggle({ checked, onToggle, disabled }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={clsx(
        'inline-flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition',
        checked ? 'border-primary bg-primary' : 'border-primary/50 bg-primary/15',
        disabled && 'cursor-not-allowed opacity-50',
      )}
      title={checked ? 'Set inactive' : 'Set active'}
      aria-label={checked ? 'Set inactive' : 'Set active'}
    >
      <span
        className={clsx(
          'h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
}

function IconEdit({ onClick, disabled, title = 'Edit' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 text-dark hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}

function IconDelete({ onClick, disabled, title = 'Delete' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary bg-primary/10 text-dark hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}

function ListToolbar({
  title,
  subtitle,
  addLabel,
  onAdd,
  searchValue,
  onSearchChange,
  hideSearch,
  statusFilter,
  onStatusChange,
  hideStatus,
  shown,
  total,
  saving,
  trailing,
}) {
  return (
    <>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h4 className="min-w-0 text-base font-semibold text-dark">{title}</h4>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
          {trailing}
          {onAdd ? (
            <button type="button" onClick={onAdd} className="btn-primary gap-2" disabled={saving}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {addLabel}
            </button>
          ) : null}
        </div>
      </div>

      {!hideSearch ? (
        <div className="mb-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search…"
              className="form-input w-full py-2 pl-9"
              autoComplete="off"
            />
          </div>
          {!hideStatus ? (
            <>
              <span className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-primary sm:text-[11px]">Status</span>
              <div className="inline-flex min-w-0 shrink rounded-full border border-primary/50 bg-flux-panel p-0.5">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'active', label: 'Active' },
                  { id: 'inactive', label: 'Inactive' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onStatusChange(opt.id)}
                    className={clsx(
                      'rounded-full px-3 py-1.5 text-sm font-semibold transition',
                      statusFilter === opt.id ? 'bg-white text-dark shadow-sm' : 'text-slate-600 hover:text-dark',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <span className="min-w-0 text-sm text-slate-500 sm:whitespace-nowrap">
            {shown} of {total} shown
          </span>
        </div>
      ) : null}
    </>
  );
}

function readValidTabFromSearch(searchParams) {
  const raw = String(searchParams.get('tab') || '').trim();
  return TABS.some((t) => t.id === raw) ? raw : 'branches';
}

function OrganizationSetupPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = readValidTabFromSearch(searchParams);
  const setTab = useCallback(
    (id) => {
      const next = new URLSearchParams(searchParams);
      next.set('tab', String(id));
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );
  const [companyForm, setCompanyForm] = useState({ name: '', address: '', phone: '', email: '' });
  const [branches, setBranches] = useState([]);
  const [branchIdGeneration, setBranchIdGeneration] = useState(() => normalizeBranchIdGenerationFromApi({}));
  const [org, setOrg] = useState(normalizeOrgSetup({}));
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [panel, setPanel] = useState(null);
  const [listSearch, setListSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [weeklyOffDraft, setWeeklyOffDraft] = useState(() => emptyWeeklyOffDraft());
  const [planBranchLimit, setPlanBranchLimit] = useState(null);
  const [customFieldsInnerTab, setCustomFieldsInnerTab] = useState('employee');
  const [employeeFieldDefs, setEmployeeFieldDefs] = useState([]);
  const [companyFieldDefs, setCompanyFieldDefs] = useState([]);
  const [employeeFieldSearch, setEmployeeFieldSearch] = useState('');
  const [companyFieldSearch, setCompanyFieldSearch] = useState('');
  const [fieldPanelOpen, setFieldPanelOpen] = useState(false);
  const [fieldPanelScope, setFieldPanelScope] = useState('employee');
  const [fieldPanelMode, setFieldPanelMode] = useState('add');
  const [fieldPanelIndex, setFieldPanelIndex] = useState(null);
  const [fieldPanelDraft, setFieldPanelDraft] = useState(() => emptyCustomFieldDef());
  const [geofenceEmployees, setGeofenceEmployees] = useState([]);
  const [selectedGeofenceUserIds, setSelectedGeofenceUserIds] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data }, usersRes] = await Promise.all([
        apiClient.get('/company'),
        apiClient.get('/users').catch(() => ({ data: { items: [] } })),
      ]);
      const c = data.company;
      if (c) {
        setCompanyForm({
          name: c.name || '',
          address: c.address || '',
          phone: c.phone || '',
          email: c.email || '',
        });
        setBranches(normalizeBranchesFromApi(c.branches));
        setOrg(normalizeOrgSetup(c));
        setBranchIdGeneration(normalizeBranchIdGenerationFromApi(c.orgSetup));
        setWeeklyOffDraft(normalizeWeeklyOffFromApi(c?.orgSetup?.weeklyOff));
        setEmployeeFieldDefs(
          Array.isArray(c.employeeCustomFieldDefs) ? c.employeeCustomFieldDefs.map(normalizeCustomFieldDefForUi) : [],
        );
        setCompanyFieldDefs(
          Array.isArray(c.companyCustomFieldDefs) ? c.companyCustomFieldDefs.map(normalizeCustomFieldDefForUi) : [],
        );
        const cap = Number(c.subscription?.maxBranches);
        setPlanBranchLimit(Number.isFinite(cap) && cap > 0 ? cap : null);
        setGeofenceEmployees(Array.isArray(usersRes?.data?.items) ? usersRes.data.items : []);
      } else {
        setBranches([]);
        setOrg(normalizeOrgSetup({}));
        setBranchIdGeneration(normalizeBranchIdGenerationFromApi({}));
        setWeeklyOffDraft(emptyWeeklyOffDraft());
        setEmployeeFieldDefs([]);
        setCompanyFieldDefs([]);
        setPlanBranchLimit(null);
        setGeofenceEmployees(Array.isArray(usersRes?.data?.items) ? usersRes.data.items : []);
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Unable to load organization.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const raw = String(searchParams.get('tab') || '').trim();
    if (raw && TABS.some((t) => t.id === raw)) return;
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'branches');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setListSearch('');
    setStatusFilter('all');
    setPanel(null);
    setSelectedGeofenceUserIds([]);
    setMessage('');
    if (tab === 'customFields') {
      setEmployeeFieldSearch('');
      setCompanyFieldSearch('');
      setCustomFieldsInnerTab('employee');
    }
  }, [tab]);

  const persistOrgSlice = async (slice, body) => {
    setSavingKey(slice);
    setMessage('');
    setError('');
    try {
      const { data } = await apiClient.put('/company', { orgSetup: { [slice]: body } });
      setMessage('Saved.');
      const c = data?.company;
      if (c) {
        setCompanyForm({
          name: c.name || '',
          address: c.address || '',
          phone: c.phone || '',
          email: c.email || '',
        });
        setBranches(normalizeBranchesFromApi(c.branches));
        setOrg(normalizeOrgSetup(c));
        setBranchIdGeneration(normalizeBranchIdGenerationFromApi(c.orgSetup));
        setEmployeeFieldDefs(
          Array.isArray(c.employeeCustomFieldDefs) ? c.employeeCustomFieldDefs.map(normalizeCustomFieldDefForUi) : [],
        );
        setCompanyFieldDefs(
          Array.isArray(c.companyCustomFieldDefs) ? c.companyCustomFieldDefs.map(normalizeCustomFieldDefForUi) : [],
        );
      } else {
        await load();
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Unable to save.');
    } finally {
      setSavingKey('');
    }
  };

  const persistBranchesList = async (nextBranches) => {
    setSavingKey('branches');
    setMessage('');
    setError('');
    try {
      const cleaned = cleanBranchesForApi(nextBranches, branches);
      const { data } = await apiClient.put('/company', { ...companyForm, branches: cleaned });
      setMessage('Branches and attendance zones saved.');
      const c = data?.company;
      if (c) {
        setCompanyForm({
          name: c.name || '',
          address: c.address || '',
          phone: c.phone || '',
          email: c.email || '',
        });
        setBranches(normalizeBranchesFromApi(c.branches));
        setOrg(normalizeOrgSetup(c));
        setBranchIdGeneration(normalizeBranchIdGenerationFromApi(c.orgSetup));
        setEmployeeFieldDefs(
          Array.isArray(c.employeeCustomFieldDefs) ? c.employeeCustomFieldDefs.map(normalizeCustomFieldDefForUi) : [],
        );
        setCompanyFieldDefs(
          Array.isArray(c.companyCustomFieldDefs) ? c.companyCustomFieldDefs.map(normalizeCustomFieldDefForUi) : [],
        );
      }
      await load();
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        (typeof e?.message === 'string' ? e.message : null) ||
        'Unable to save branches.';
      setError(typeof msg === 'string' ? msg : 'Unable to save branches.');
      throw e;
    } finally {
      setSavingKey('');
    }
  };

  const saveWeeklyOff = async () => {
    setSavingKey('weeklyOff');
    setMessage('');
    setError('');
    try {
      const { data } = await apiClient.put('/company', { orgSetup: { weeklyOff: weeklyOffDraft } });
      setMessage('Weekly off saved.');
      const c = data?.company;
      if (c) {
        setCompanyForm({
          name: c.name || '',
          address: c.address || '',
          phone: c.phone || '',
          email: c.email || '',
        });
        setBranches(normalizeBranchesFromApi(c.branches));
        setOrg(normalizeOrgSetup(c));
        setBranchIdGeneration(normalizeBranchIdGenerationFromApi(c.orgSetup));
        setWeeklyOffDraft(normalizeWeeklyOffFromApi(c?.orgSetup?.weeklyOff));
        setEmployeeFieldDefs(
          Array.isArray(c.employeeCustomFieldDefs) ? c.employeeCustomFieldDefs.map(normalizeCustomFieldDefForUi) : [],
        );
        setCompanyFieldDefs(
          Array.isArray(c.companyCustomFieldDefs) ? c.companyCustomFieldDefs.map(normalizeCustomFieldDefForUi) : [],
        );
      } else {
        await load();
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Unable to save weekly off.');
    } finally {
      setSavingKey('');
    }
  };

  const persistFieldDefs = async (nextEmployee, nextCompany) => {
    setSavingKey('customFields');
    setMessage('');
    setError('');
    try {
      await apiClient.put('/company', {
        employeeCustomFieldDefs: nextEmployee,
        companyCustomFieldDefs: nextCompany,
      });
      setEmployeeFieldDefs(nextEmployee);
      setCompanyFieldDefs(nextCompany);
      setMessage('Field settings saved.');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Unable to save field settings.');
    } finally {
      setSavingKey('');
    }
  };

  const closeFieldPanel = () => {
    setFieldPanelOpen(false);
    setFieldPanelIndex(null);
    setFieldPanelDraft(emptyCustomFieldDef());
  };

  const openAddField = (scope) => {
    setFieldPanelScope(scope);
    setFieldPanelMode('add');
    setFieldPanelIndex(null);
    setFieldPanelDraft(emptyCustomFieldDef());
    setFieldPanelOpen(true);
    setError('');
  };

  const openEditField = (scope, index) => {
    const list = scope === 'employee' ? employeeFieldDefs : companyFieldDefs;
    const row = list[index];
    if (!row) return;
    setFieldPanelScope(scope);
    setFieldPanelMode('edit');
    setFieldPanelIndex(index);
    setFieldPanelDraft(normalizeCustomFieldDefForUi(row));
    setFieldPanelOpen(true);
    setError('');
  };

  const applyFieldPanel = async () => {
    const d = fieldPanelDraft;
    if (!String(d.key || '').trim() || !String(d.label || '').trim() || !String(d.category || '').trim()) {
      setError('Key, label, and category are required.');
      return;
    }
    let nextEmp = [...employeeFieldDefs];
    let nextComp = [...companyFieldDefs];
    const slugKey = String(d.key)
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '_');
    const normalized = {
      ...d,
      key: slugKey,
      label: String(d.label).trim(),
      category: String(d.category || 'General').trim() || 'General',
      fieldType: d.fieldType || 'text',
      options: Array.isArray(d.options) ? d.options : [],
      isActive: d.isActive !== false,
      isRequired: d.isRequired === true || d.isRequired === 'true' || d.isRequired === 1 || d.isRequired === '1',
    };

    if (fieldPanelScope === 'employee') {
      if (fieldPanelMode === 'add') {
        if (nextEmp.some((x) => x.key === normalized.key)) {
          setError('A field with this key already exists.');
          return;
        }
        nextEmp.push(normalized);
      } else if (fieldPanelIndex != null) {
        const prevKey = nextEmp[fieldPanelIndex]?.key;
        nextEmp[fieldPanelIndex] = { ...normalized, key: prevKey || normalized.key };
      }
    } else if (fieldPanelMode === 'add') {
      if (nextComp.some((x) => x.key === normalized.key)) {
        setError('A field with this key already exists.');
        return;
      }
      nextComp.push(normalized);
    } else if (fieldPanelIndex != null) {
      const prevKey = nextComp[fieldPanelIndex]?.key;
      nextComp[fieldPanelIndex] = { ...normalized, key: prevKey || normalized.key };
    }

    await persistFieldDefs(nextEmp, nextComp);
    closeFieldPanel();
  };

  const handleToggleFieldActive = async (scope, key) => {
    const nextEmp = [...employeeFieldDefs];
    const nextComp = [...companyFieldDefs];
    const list = scope === 'employee' ? nextEmp : nextComp;
    const i = list.findIndex((x) => x.key === key);
    if (i < 0) return;
    const wasActive = list[i].isActive !== false;
    list[i] = { ...list[i], isActive: !wasActive };
    await persistFieldDefs(scope === 'employee' ? nextEmp : employeeFieldDefs, scope === 'company' ? nextComp : companyFieldDefs);
  };

  const setWeeklyOffRule = (dayKey, ruleKey, checked) => {
    setWeeklyOffDraft((prev) => {
      const currentDay = prev.days?.[dayKey] || emptyWeekRule();
      let nextDay = { ...currentDay };

      if (ruleKey === 'all') {
        // "All" acts as a master toggle for this day.
        nextDay = {
          all: checked,
          first: checked,
          second: checked,
          third: checked,
          fourth: checked,
          fifth: checked,
        };
      } else {
        nextDay[ruleKey] = checked;
        const allSelected = Boolean(nextDay.first && nextDay.second && nextDay.third && nextDay.fourth && nextDay.fifth);
        nextDay.all = allSelected;
      }

      return {
        ...prev,
        days: {
          ...prev.days,
          [dayKey]: nextDay,
        },
      };
    });
  };

  const saving = useMemo(() => Boolean(savingKey), [savingKey]);

  const term = listSearch.trim().toLowerCase();

  const filteredLeaveTypes = useMemo(() => {
    return org.leaveTypes
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => matchesStatus(r.isActive, statusFilter))
      .filter(({ r }) => {
        if (!term) return true;
        const hay = [r.name, r.applicableTo, String(r.annualDays), r.paidLeave ? 'paid' : 'unpaid']
          .join(' ')
          .toLowerCase();
        return hay.includes(term);
      });
  }, [org.leaveTypes, statusFilter, term]);

  const filteredDesignations = useMemo(() => {
    return org.designations
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => matchesStatus(r.isActive, statusFilter))
      .filter(({ r }) => (!term ? true : String(r.name || '').toLowerCase().includes(term)));
  }, [org.designations, statusFilter, term]);

  const filteredDepartments = useMemo(() => {
    return org.departments
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => matchesStatus(r.isActive, statusFilter))
      .filter(({ r }) => (!term ? true : String(r.name || '').toLowerCase().includes(term)));
  }, [org.departments, statusFilter, term]);

  const filteredEmploymentTypes = useMemo(() => {
    return org.employmentTypes
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => matchesStatus(r.isActive, statusFilter))
      .filter(({ r }) => {
        if (!term) return true;
        const hay = `${r.name} ${r.description || ''}`.toLowerCase();
        return hay.includes(term);
      });
  }, [org.employmentTypes, statusFilter, term]);

  const geofenceUsersFiltered = useMemo(() => {
    return geofenceEmployees.filter((u) => {
      const enabled = u.attendanceGeofenceEnabled !== false;
      if (statusFilter === 'active' && !enabled) return false;
      if (statusFilter === 'inactive' && enabled) return false;
      if (!term) return true;
      const branchName = branches.find((b) => String(b._id || '') === String(u.branchId || ''))?.name || '';
      const hay = [u.name, u.email, u.phone, u.employeeCode, branchName].join(' ').toLowerCase();
      return hay.includes(term);
    });
  }, [geofenceEmployees, statusFilter, term, branches]);

  const geofenceAllSelected =
    geofenceUsersFiltered.length > 0 && geofenceUsersFiltered.every((u) => selectedGeofenceUserIds.includes(String(u._id)));

  const toggleGeofenceSelectAll = () => {
    if (geofenceAllSelected) {
      setSelectedGeofenceUserIds((old) => old.filter((id) => !geofenceUsersFiltered.some((u) => String(u._id) === id)));
      return;
    }
    setSelectedGeofenceUserIds((old) => {
      const next = new Set(old);
      geofenceUsersFiltered.forEach((u) => next.add(String(u._id)));
      return [...next];
    });
  };

  const toggleGeofenceRow = (id) => {
    setSelectedGeofenceUserIds((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]));
  };

  const setUserGeofenceEnabled = async (user, enabled) => {
    if (!enabled) {
      const ok = window.confirm(`Disable geofence location for ${user.name}? They can punch in from anywhere.`);
      if (!ok) return;
    }
    setSavingKey('geofence');
    setMessage('');
    setError('');
    try {
      await apiClient.put(`/users/${user._id}`, { attendanceGeofenceEnabled: enabled });
      await load();
      setMessage(enabled ? `Geofence enabled for ${user.name}.` : `Geofence disabled for ${user.name}.`);
    } catch (e) {
      setError(e.response?.data?.message || 'Unable to update geofence setting.');
    } finally {
      setSavingKey('');
    }
  };

  const bulkSetGeofence = async (enabled) => {
    const selected = geofenceEmployees.filter((u) => selectedGeofenceUserIds.includes(String(u._id)));
    if (!selected.length) {
      window.alert('Select employees first.');
      return;
    }
    if (!enabled) {
      const ok = window.confirm(
        `Disable geofence location for ${selected.length} employee(s)? They can punch in from anywhere.`,
      );
      if (!ok) return;
    }
    setSavingKey('geofence');
    setMessage('');
    setError('');
    let done = 0;
    for (const u of selected) {
      try {
        await apiClient.put(`/users/${u._id}`, { attendanceGeofenceEnabled: enabled });
        done += 1;
      } catch {
        // keep processing
      }
    }
    setSelectedGeofenceUserIds([]);
    await load();
    setSavingKey('');
    setMessage(`${done} employee(s) updated.`);
  };

  const filteredEmployeeDefs = useMemo(
    () =>
      filterCustomFieldDefs(employeeFieldDefs, employeeFieldSearch).sort((a, b) => {
        const byCategory = String(a.category || 'General').localeCompare(String(b.category || 'General'));
        if (byCategory !== 0) return byCategory;
        return String(a.label || '').localeCompare(String(b.label || ''));
      }),
    [employeeFieldDefs, employeeFieldSearch],
  );
  const filteredCompanyDefs = useMemo(
    () =>
      filterCustomFieldDefs(companyFieldDefs, companyFieldSearch).sort((a, b) => {
        const byCategory = String(a.category || 'General').localeCompare(String(b.category || 'General'));
        if (byCategory !== 0) return byCategory;
        return String(a.label || '').localeCompare(String(b.label || ''));
      }),
    [companyFieldDefs, companyFieldSearch],
  );

  const renderFieldTable = (scope, filtered, fullList) => (
    <div className="min-w-0 overflow-hidden rounded-xl border border-neutral-100 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-neutral-100 bg-flux-panel px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="form-field min-w-0 flex-1 sm:max-w-md">
          <label className="form-label-muted">Search fields</label>
          <input
            className="form-input"
            placeholder="Label, key, category, type, or choice..."
            value={scope === 'employee' ? employeeFieldSearch : companyFieldSearch}
            onChange={(e) => (scope === 'employee' ? setEmployeeFieldSearch : setCompanyFieldSearch)(e.target.value)}
          />
        </div>
        <button type="button" className="btn-primary shrink-0" onClick={() => openAddField(scope)}>
          Add field
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-white text-left text-slate-500">
              <th className="px-4 py-3 font-semibold">Label</th>
              <th className="px-4 py-3 font-semibold">Key</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Choices</th>
              <th className="px-4 py-3 font-semibold">Req.</th>
              <th className="px-4 py-3 font-semibold">Active</th>
              <th className="px-4 py-3 font-semibold">Edit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => {
              const idx = fullList.findIndex((x) => x.key === d.key);
              const active = d.isActive !== false;
              return (
                <tr key={d.key} className="border-b border-neutral-100 bg-white hover:bg-flux-panel/40">
                  <td className="px-4 py-3 font-medium text-dark">{d.label}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{d.key}</td>
                  <td className="px-4 py-3 text-slate-700">{d.category || 'General'}</td>
                  <td className="px-4 py-3 capitalize text-slate-700">{d.fieldType || 'text'}</td>
                  <td className="hidden max-w-[14rem] truncate px-4 py-3 text-slate-600 md:table-cell">{choicesSummary(d)}</td>
                  <td className="px-4 py-3 text-slate-700">{d.isRequired ? 'Yes' : '-'}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleToggleFieldActive(scope, d.key)}
                      className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition ${
                        active ? 'border-primary bg-primary' : 'border-primary/50 bg-primary/15'
                      } disabled:opacity-50`}
                      title={active ? 'Set inactive' : 'Set active'}
                      aria-label={active ? 'Deactivate field' : 'Activate field'}
                    >
                      <span
                        className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                          active ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="text-sm font-semibold text-primary hover:underline disabled:opacity-50"
                      disabled={idx < 0 || saving}
                      onClick={() => openEditField(scope, idx)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  {fullList.length ? 'No fields match your search.' : 'No custom fields yet. Use Add field.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const openLeavePanel = (index) => {
    const row =
      index >= 0
        ? { ...org.leaveTypes[index] }
        : { name: '', annualDays: 12, carryForward: false, paidLeave: true, applicableTo: 'All', isActive: true };
    setError('');
    setPanel({ type: 'leave', index, draft: row });
  };

  const saveLeavePanel = () => {
    if (!panel || panel.type !== 'leave') return;
    const d = panel.draft;
    if (!String(d.name || '').trim()) {
      setError('Leave type name is required.');
      return;
    }
    const next = [...org.leaveTypes];
    const row = {
      _id: d._id || '',
      name: String(d.name).trim(),
      annualDays: Math.max(0, Number(d.annualDays) || 0),
      carryForward: Boolean(d.carryForward),
      paidLeave: d.paidLeave !== false,
      applicableTo: String(d.applicableTo || 'All').trim() || 'All',
      isActive: d.isActive !== false,
    };
    if (panel.index >= 0) next[panel.index] = row;
    else next.push(row);
    setPanel(null);
    persistOrgSlice('leaveTypes', next);
  };

  const openNamedPanel = (type, index, empty) => {
    const list = org[type];
    const row = index >= 0 ? { ...list[index] } : { ...empty };
    setError('');
    setPanel({ type, index, draft: row });
  };

  const saveNamedPanel = () => {
    if (!panel || !['designations', 'departments'].includes(panel.type)) return;
    const d = panel.draft;
    if (!String(d.name || '').trim()) {
      setError('Name is required.');
      return;
    }
    const key = panel.type;
    const next = [...org[key]];
    const row = { _id: d._id || '', name: String(d.name).trim(), isActive: d.isActive !== false };
    if (panel.index >= 0) next[panel.index] = row;
    else next.push(row);
    setPanel(null);
    persistOrgSlice(key, next);
  };

  const openEmploymentPanel = (index) => {
    const row = index >= 0 ? { ...org.employmentTypes[index] } : { name: '', description: '', isActive: true };
    setError('');
    setPanel({ type: 'employmentTypes', index, draft: row });
  };

  const saveEmploymentPanel = () => {
    if (!panel || panel.type !== 'employmentTypes') return;
    const d = panel.draft;
    if (!String(d.name || '').trim()) {
      setError('Name is required.');
      return;
    }
    const next = [...org.employmentTypes];
    const row = {
      _id: d._id || '',
      name: String(d.name).trim(),
      description: String(d.description || '').trim(),
      isActive: d.isActive !== false,
    };
    if (panel.index >= 0) next[panel.index] = row;
    else next.push(row);
    setPanel(null);
    persistOrgSlice('employmentTypes', next);
  };

  const deleteLeave = (index) => {
    if (!window.confirm('Delete this leave type?')) return;
    const next = org.leaveTypes.filter((_, i) => i !== index);
    persistOrgSlice('leaveTypes', next);
  };

  const deleteNamed = (key, index, label) => {
    if (!window.confirm(`Delete this ${label}?`)) return;
    const next = org[key].filter((_, i) => i !== index);
    persistOrgSlice(key, next);
  };

  const toggleLeaveActive = (index, on) => {
    const next = org.leaveTypes.map((r, i) => (i === index ? { ...r, isActive: on } : r));
    persistOrgSlice('leaveTypes', next);
  };

  const toggleNamedActive = (key, index, on) => {
    const next = org[key].map((r, i) => (i === index ? { ...r, isActive: on } : r));
    persistOrgSlice(key, next);
  };

  const closePanel = () => {
    setPanel(null);
  };

  const panelTitle =
    panel?.type === 'leave'
      ? panel.index >= 0
        ? 'Edit leave type'
        : 'Add leave type'
      : panel?.type === 'designations'
        ? panel.index >= 0
          ? 'Edit designation'
          : 'Add designation'
        : panel?.type === 'departments'
          ? panel.index >= 0
            ? 'Edit department'
            : 'Add department'
          : panel?.type === 'employmentTypes'
            ? panel.index >= 0
              ? 'Edit employment type'
              : 'Add employment type'
            : '';

  return (
    <section className="min-w-0 max-w-full space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setError('');
              setTab(t.id);
            }}
            className={clsx(
              'flex min-w-[7.25rem] flex-shrink-0 flex-col items-center gap-1 rounded-xl border px-2.5 py-2 text-[11px] font-semibold transition sm:min-w-[8rem] sm:flex-row sm:px-3 sm:py-2 sm:text-xs',
              tab === t.id
                ? 'border-primary bg-primary text-dark shadow-sm'
                : 'border-neutral-200/90 bg-white text-slate-600 hover:border-neutral-300',
            )}
          >
            <TabIcon name={t.icon} />
            <span className="text-center leading-tight">{t.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flux-card p-6 shadow-panel-lg">
          <LocationLoadingIndicator label="Loading organization…" className="py-6" />
        </div>
      ) : (
        <>
          {tab === 'leaveTypes' && (
            <div className="flux-card min-w-0 overflow-hidden p-4 shadow-panel-lg">
              {error && <p className="alert-error mb-3">{error}</p>}
              {message && <p className="alert-success mb-3">{message}</p>}
              <ListToolbar
                title="All leave types"
                subtitle="Days, paid rules, and applicability."
                addLabel="Add leave type"
                onAdd={() => openLeavePanel(-1)}
                searchValue={listSearch}
                onSearchChange={setListSearch}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                shown={filteredLeaveTypes.length}
                total={org.leaveTypes.length}
                saving={saving}
              />
              <div className="space-y-3 md:hidden">
                {filteredLeaveTypes.map(({ r, i }) => (
                  <div
                    key={r._id || `lt-${i}`}
                    className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm transition hover:border-primary/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-dark">{r.name}</p>
                      </div>
                      <StatusToggle
                        checked={r.isActive}
                        onToggle={() => toggleLeaveActive(i, !r.isActive)}
                        disabled={saving}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2 border-t border-neutral-100 pt-3">
                      <IconEdit onClick={() => openLeavePanel(i)} disabled={saving} />
                      <IconDelete onClick={() => deleteLeave(i)} disabled={saving} />
                    </div>
                  </div>
                ))}
                {!filteredLeaveTypes.length && (
                  <p className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-slate-500">
                    {org.leaveTypes.length ? 'No leave types match filters.' : 'No leave types yet. Add your first row.'}
                  </p>
                )}
              </div>

              <div className="hidden min-w-0 md:block">
                <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-neutral-100 [-webkit-overflow-scrolling:touch]">
                  <table className="min-w-[28rem] w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="w-10 px-2 py-2">#</th>
                        <th className="px-2 py-2">Leave type</th>
                        <th className="whitespace-nowrap px-2 py-2">Status</th>
                        <th className="whitespace-nowrap px-2 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeaveTypes.map(({ r, i }, idx) => (
                        <tr key={r._id || `lt-${i}`} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-2 py-2 text-slate-500">{idx + 1}</td>
                          <td className="px-2 py-2 font-medium text-dark">{r.name}</td>
                          <td className="px-2 py-2">
                            <StatusToggle
                              checked={r.isActive}
                              onToggle={() => toggleLeaveActive(i, !r.isActive)}
                              disabled={saving}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <IconEdit onClick={() => openLeavePanel(i)} disabled={saving} />
                              <IconDelete onClick={() => deleteLeave(i)} disabled={saving} />
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!filteredLeaveTypes.length && (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-500">
                            {org.leaveTypes.length ? 'No leave types match filters.' : 'No leave types yet.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'designations' && (
            <div className="flux-card min-w-0 overflow-hidden p-4 shadow-panel-lg">
              {error && <p className="alert-error mb-3">{error}</p>}
              {message && <p className="alert-success mb-3">{message}</p>}
              <ListToolbar
                title="All designations"
                subtitle="Job titles for reporting and HR alignment."
                addLabel="Add designation"
                onAdd={() => openNamedPanel('designations', -1, { name: '', isActive: true })}
                searchValue={listSearch}
                onSearchChange={setListSearch}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                shown={filteredDesignations.length}
                total={org.designations.length}
                saving={saving}
              />
              <div className="space-y-3 md:hidden">
                {filteredDesignations.map(({ r, i }) => (
                  <div key={r._id || `d-${i}`} className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-dark">{r.name}</p>
                      <StatusToggle
                        checked={r.isActive}
                        onToggle={() => toggleNamedActive('designations', i, !r.isActive)}
                        disabled={saving}
                      />
                    </div>
                    <div className="mt-3 flex justify-end gap-2 border-t border-neutral-100 pt-3">
                      <IconEdit onClick={() => openNamedPanel('designations', i, {})} disabled={saving} />
                      <IconDelete onClick={() => deleteNamed('designations', i, 'designation')} disabled={saving} />
                    </div>
                  </div>
                ))}
                {!filteredDesignations.length && (
                  <p className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-slate-500">
                    {org.designations.length ? 'No rows match filters.' : 'No designations yet.'}
                  </p>
                )}
              </div>
              <div className="hidden md:block">
                <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-neutral-100">
                  <table className="min-w-[28rem] w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="w-10 px-2 py-2">#</th>
                        <th className="px-2 py-2">Name</th>
                        <th className="whitespace-nowrap px-2 py-2">Status</th>
                        <th className="whitespace-nowrap px-2 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDesignations.map(({ r, i }, idx) => (
                        <tr key={r._id || `d-${i}`} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-2 py-2 text-slate-500">{idx + 1}</td>
                          <td className="px-2 py-2 font-medium text-dark">{r.name}</td>
                          <td className="px-2 py-2">
                            <StatusToggle
                              checked={r.isActive}
                              onToggle={() => toggleNamedActive('designations', i, !r.isActive)}
                              disabled={saving}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex gap-2">
                              <IconEdit onClick={() => openNamedPanel('designations', i, {})} disabled={saving} />
                              <IconDelete onClick={() => deleteNamed('designations', i, 'designation')} disabled={saving} />
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!filteredDesignations.length && (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-500">
                            {org.designations.length ? 'No rows match filters.' : 'No designations yet.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'departments' && (
            <div className="flux-card min-w-0 overflow-hidden p-4 shadow-panel-lg">
              {error && <p className="alert-error mb-3">{error}</p>}
              {message && <p className="alert-success mb-3">{message}</p>}
              <ListToolbar
                title="All departments"
                subtitle="Organize users and approvals by department."
                addLabel="Add department"
                onAdd={() => openNamedPanel('departments', -1, { name: '', isActive: true })}
                searchValue={listSearch}
                onSearchChange={setListSearch}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                shown={filteredDepartments.length}
                total={org.departments.length}
                saving={saving}
              />
              <div className="space-y-3 md:hidden">
                {filteredDepartments.map(({ r, i }) => (
                  <div key={r._id || `dp-${i}`} className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-dark">{r.name}</p>
                      <StatusToggle
                        checked={r.isActive}
                        onToggle={() => toggleNamedActive('departments', i, !r.isActive)}
                        disabled={saving}
                      />
                    </div>
                    <div className="mt-3 flex justify-end gap-2 border-t border-neutral-100 pt-3">
                      <IconEdit onClick={() => openNamedPanel('departments', i, {})} disabled={saving} />
                      <IconDelete onClick={() => deleteNamed('departments', i, 'department')} disabled={saving} />
                    </div>
                  </div>
                ))}
                {!filteredDepartments.length && (
                  <p className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-slate-500">
                    {org.departments.length ? 'No rows match filters.' : 'No departments yet.'}
                  </p>
                )}
              </div>
              <div className="hidden md:block">
                <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-neutral-100">
                  <table className="min-w-[28rem] w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="w-10 px-2 py-2">#</th>
                        <th className="px-2 py-2">Name</th>
                        <th className="whitespace-nowrap px-2 py-2">Status</th>
                        <th className="whitespace-nowrap px-2 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDepartments.map(({ r, i }, idx) => (
                        <tr key={r._id || `dp-${i}`} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-2 py-2 text-slate-500">{idx + 1}</td>
                          <td className="px-2 py-2 font-medium text-dark">{r.name}</td>
                          <td className="px-2 py-2">
                            <StatusToggle
                              checked={r.isActive}
                              onToggle={() => toggleNamedActive('departments', i, !r.isActive)}
                              disabled={saving}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex gap-2">
                              <IconEdit onClick={() => openNamedPanel('departments', i, {})} disabled={saving} />
                              <IconDelete onClick={() => deleteNamed('departments', i, 'department')} disabled={saving} />
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!filteredDepartments.length && (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-500">
                            {org.departments.length ? 'No rows match filters.' : 'No departments yet.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'employmentTypes' && (
            <div className="flux-card min-w-0 overflow-hidden p-4 shadow-panel-lg">
              {error && <p className="alert-error mb-3">{error}</p>}
              {message && <p className="alert-success mb-3">{message}</p>}
              <ListToolbar
                title="All employment types"
                subtitle="Contract, permanent, intern, and other labels."
                addLabel="Add employment type"
                onAdd={() => openEmploymentPanel(-1)}
                searchValue={listSearch}
                onSearchChange={setListSearch}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                shown={filteredEmploymentTypes.length}
                total={org.employmentTypes.length}
                saving={saving}
              />
              <div className="space-y-3 md:hidden">
                {filteredEmploymentTypes.map(({ r, i }) => (
                  <div key={r._id || `et-${i}`} className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-dark">{r.name}</p>
                        <p className="mt-1 text-xs text-slate-600">{r.description || '—'}</p>
                      </div>
                      <StatusToggle
                        checked={r.isActive}
                        onToggle={() => toggleNamedActive('employmentTypes', i, !r.isActive)}
                        disabled={saving}
                      />
                    </div>
                    <div className="mt-3 flex justify-end gap-2 border-t border-neutral-100 pt-3">
                      <IconEdit onClick={() => openEmploymentPanel(i)} disabled={saving} />
                      <IconDelete onClick={() => deleteNamed('employmentTypes', i, 'employment type')} disabled={saving} />
                    </div>
                  </div>
                ))}
                {!filteredEmploymentTypes.length && (
                  <p className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-slate-500">
                    {org.employmentTypes.length ? 'No rows match filters.' : 'No employment types yet.'}
                  </p>
                )}
              </div>
              <div className="hidden md:block">
                <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-neutral-100">
                  <table className="min-w-[36rem] w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="w-10 px-2 py-2">#</th>
                        <th className="px-2 py-2">Name</th>
                        <th className="min-w-[10rem] px-2 py-2">Description</th>
                        <th className="whitespace-nowrap px-2 py-2">Status</th>
                        <th className="whitespace-nowrap px-2 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmploymentTypes.map(({ r, i }, idx) => (
                        <tr key={r._id || `et-${i}`} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-2 py-2 text-slate-500">{idx + 1}</td>
                          <td className="px-2 py-2 font-medium text-dark">{r.name}</td>
                          <td className="max-w-[16rem] truncate px-2 py-2 text-slate-700" title={r.description}>
                            {r.description || '—'}
                          </td>
                          <td className="px-2 py-2">
                            <StatusToggle
                              checked={r.isActive}
                              onToggle={() => toggleNamedActive('employmentTypes', i, !r.isActive)}
                              disabled={saving}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex gap-2">
                              <IconEdit onClick={() => openEmploymentPanel(i)} disabled={saving} />
                              <IconDelete onClick={() => deleteNamed('employmentTypes', i, 'employment type')} disabled={saving} />
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!filteredEmploymentTypes.length && (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-500">
                            {org.employmentTypes.length ? 'No rows match filters.' : 'No employment types yet.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'weeklyOff' && (
            <div className="flux-card min-w-0 overflow-hidden p-4 shadow-panel-lg sm:p-6">
              {error && <p className="alert-error mb-3">{error}</p>}
              {message && <p className="alert-success mb-3">{message}</p>}
              <div className="space-y-5">
                <h4 className="text-base font-semibold text-dark">Weekly off</h4>
                <p className="text-sm text-slate-500">Configure one weekly-off policy and save.</p>
                <div className="form-field max-w-sm">
                  <label className="form-label-muted">Weekly Off Name</label>
                  <input
                    className="form-input"
                    placeholder="Enter weekly off name"
                    value={weeklyOffDraft.name}
                    onChange={(e) => setWeeklyOffDraft((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="overflow-x-auto rounded-lg border border-neutral-100">
                  <table className="min-w-[42rem] w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="px-3 py-2">Days</th>
                        <th className="px-3 py-2">All</th>
                        <th className="px-3 py-2">1st</th>
                        <th className="px-3 py-2">2nd</th>
                        <th className="px-3 py-2">3rd</th>
                        <th className="px-3 py-2">4th</th>
                        <th className="px-3 py-2">5th</th>
                      </tr>
                    </thead>
                    <tbody>
                      {WEEK_DAYS.map((d) => (
                        <tr key={d.key} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-medium text-dark">{d.label}</td>
                          {WEEK_RULE_KEYS.map((rk) => (
                            <td key={rk} className="px-3 py-2">
                              <input
                                type="checkbox"
                                className="form-checkbox"
                                checked={Boolean(weeklyOffDraft.days?.[d.key]?.[rk])}
                                onChange={(e) => setWeeklyOffRule(d.key, rk, e.target.checked)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end border-t border-neutral-100 pt-3">
                  <button type="button" className="btn-primary" disabled={savingKey === 'weeklyOff'} onClick={saveWeeklyOff}>
                    {savingKey === 'weeklyOff' ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'shifts' && (
            <div className="flux-card min-w-0 overflow-hidden p-4 shadow-panel-lg sm:p-6">
              {error && <p className="alert-error mb-3">{error}</p>}
              {message && <p className="alert-success mb-3">{message}</p>}
              <ShiftsManagementPanel
                shifts={org.shifts}
                saving={savingKey === 'shifts'}
                onPersist={async (next) => {
                  await persistOrgSlice('shifts', next);
                }}
              />
            </div>
          )}

          {tab === 'branches' && (
            <div className="flux-card min-w-0 overflow-hidden p-4 shadow-panel-lg sm:p-6">
              {error && <p className="alert-error mb-3">{error}</p>}
              {message && <p className="alert-success mb-3">{message}</p>}
              <BranchesDirectoryPanel
                branches={branches}
                onPersist={persistBranchesList}
                saving={savingKey === 'branches'}
                loading={loading}
                idGenerationBranch={branchIdGeneration}
                maxBranchLimit={planBranchLimit}
              />
            </div>
          )}

          {tab === 'geofence' && (
            <div className="flux-card min-w-0 overflow-hidden p-4 shadow-panel-lg sm:p-6">
              {error && <p className="alert-error mb-3">{error}</p>}
              {message && <p className="alert-success mb-3">{message}</p>}
              <ListToolbar
                title="Employee geofence control"
                subtitle="Enabled: punch-in must be inside assigned branch radius. Disabled: punch-in allowed from anywhere."
                searchValue={listSearch}
                onSearchChange={setListSearch}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                hideStatus
                shown={geofenceUsersFiltered.length}
                total={geofenceEmployees.length}
                saving={savingKey === 'geofence'}
              />

              <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">Geofence status</span>
                <div className="inline-flex min-w-0 shrink rounded-full border border-primary/50 bg-flux-panel p-0.5">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'active', label: 'Enabled' },
                    { id: 'inactive', label: 'Disabled' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setStatusFilter(opt.id)}
                      className={clsx(
                        'rounded-full px-3 py-1.5 text-sm font-semibold transition',
                        statusFilter === opt.id ? 'bg-white text-dark shadow-sm' : 'text-slate-600 hover:text-dark',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {!!selectedGeofenceUserIds.length && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-flux-panel px-3 py-2">
                  <span className="text-sm font-semibold text-dark">
                    {selectedGeofenceUserIds.length} selected
                  </span>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    disabled={savingKey === 'geofence'}
                    onClick={() => void bulkSetGeofence(true)}
                  >
                    Enable selected
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    disabled={savingKey === 'geofence'}
                    onClick={() => void bulkSetGeofence(false)}
                  >
                    Disable selected
                  </button>
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-neutral-100">
                <table className="min-w-[48rem] w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="w-10 px-2 py-2">
                        <input
                          type="checkbox"
                          checked={geofenceAllSelected}
                          onChange={toggleGeofenceSelectAll}
                          aria-label="Select all employees in geofence tab"
                        />
                      </th>
                      <th className="px-2 py-2">Employee</th>
                      <th className="px-2 py-2">Email</th>
                      <th className="px-2 py-2">Branch</th>
                      <th className="px-2 py-2">Radius</th>
                      <th className="px-2 py-2">Location rule</th>
                      <th className="px-2 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geofenceUsersFiltered.map((u) => {
                      const branch = branches.find((b) => String(b._id || '') === String(u.branchId || ''));
                      const branchGf = branch?.geofence || {};
                      const branchRadius = Number(branchGf.radiusM) || 150;
                      const branchEnabled = branchGf.enabled !== false;
                      const employeeEnabled = u.attendanceGeofenceEnabled !== false;
                      const effectiveEnabled = employeeEnabled && branchEnabled;
                      return (
                        <tr key={u._id} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={selectedGeofenceUserIds.includes(String(u._id))}
                              onChange={() => toggleGeofenceRow(String(u._id))}
                              aria-label={`Select ${u.name}`}
                            />
                          </td>
                          <td className="px-2 py-2 font-medium text-dark">{u.name}</td>
                          <td className="px-2 py-2 text-slate-800">{u.email}</td>
                          <td className="px-2 py-2 text-slate-800">{branch?.name || 'No branch assigned'}</td>
                          <td className="px-2 py-2 text-slate-700">
                            {branch ? `${Math.max(10, Math.round(branchRadius))} m` : '—'}
                          </td>
                          <td className="px-2 py-2 text-xs text-slate-600">
                            {!branch
                              ? 'No branch assigned'
                              : branchEnabled
                                ? 'Branch geofence ON'
                                : 'Branch geofence OFF (anywhere)'}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <StatusToggle
                                checked={employeeEnabled}
                                disabled={savingKey === 'geofence'}
                                onToggle={() => void setUserGeofenceEnabled(u, !employeeEnabled)}
                              />
                              <span className={clsx('text-xs font-semibold', effectiveEnabled ? 'text-emerald-700' : 'text-slate-500')}>
                                {effectiveEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!geofenceUsersFiltered.length && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          {geofenceEmployees.length ? 'No employees match filters.' : 'No employees found.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'customFields' && (
            <div className="flux-card min-w-0 overflow-hidden p-4 shadow-panel-lg sm:p-6">
              {error && <p className="alert-error mb-3">{error}</p>}
              {message && <p className="alert-success mb-3">{message}</p>}
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 rounded-2xl border border-neutral-200/90 bg-white p-1.5 shadow-sm">
                  {CUSTOM_FIELDS_INNER_TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setCustomFieldsInnerTab(t.id)}
                      className={clsx(
                        'rounded-xl px-4 py-2 text-sm font-bold transition',
                        customFieldsInnerTab === t.id
                          ? 'bg-primary text-dark shadow-sm'
                          : 'text-slate-600 hover:bg-flux-panel hover:text-dark',
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {customFieldsInnerTab === 'employee' && (
                  <div className="space-y-3">
                    <h2 className="text-lg font-bold text-dark">Employee custom fields</h2>
                    {renderFieldTable('employee', filteredEmployeeDefs, employeeFieldDefs)}
                  </div>
                )}

                {customFieldsInnerTab === 'company' && (
                  <div className="space-y-3">
                    <h2 className="text-lg font-bold text-dark">Company custom fields</h2>
                    {renderFieldTable('company', filteredCompanyDefs, companyFieldDefs)}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <SlideOverPanel
        open={Boolean(panel)}
        onClose={closePanel}
        title={panelTitle}
        description="Changes save to your company workspace."
      >
        {panel?.type === 'leave' && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveLeavePanel();
            }}
          >
            <div className="form-field">
              <label className="form-label-muted">Name</label>
              <input
                className="form-input"
                value={panel.draft.name}
                onChange={(e) => setPanel((p) => ({ ...p, draft: { ...p.draft, name: e.target.value } }))}
                required
              />
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200/80 bg-flux-panel px-4 py-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={panel.draft.isActive}
                onChange={(e) => setPanel((p) => ({ ...p, draft: { ...p.draft, isActive: e.target.checked } }))}
                className="form-checkbox"
              />
              Active
            </label>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" className="btn-secondary" onClick={closePanel}>
                Cancel
              </button>
              <button type="submit" className="btn-primary disabled:cursor-not-allowed" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}

        {(panel?.type === 'designations' || panel?.type === 'departments') && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveNamedPanel();
            }}
          >
            <div className="form-field">
              <label className="form-label-muted">Name</label>
              <input
                className="form-input"
                value={panel.draft.name}
                onChange={(e) => setPanel((p) => ({ ...p, draft: { ...p.draft, name: e.target.value } }))}
                required
              />
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200/80 bg-flux-panel px-4 py-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={panel.draft.isActive}
                onChange={(e) => setPanel((p) => ({ ...p, draft: { ...p.draft, isActive: e.target.checked } }))}
                className="form-checkbox"
              />
              Active
            </label>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" className="btn-secondary" onClick={closePanel}>
                Cancel
              </button>
              <button type="submit" className="btn-primary disabled:cursor-not-allowed" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}

        {panel?.type === 'employmentTypes' && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveEmploymentPanel();
            }}
          >
            <div className="form-field">
              <label className="form-label-muted">Name</label>
              <input
                className="form-input"
                value={panel.draft.name}
                onChange={(e) => setPanel((p) => ({ ...p, draft: { ...p.draft, name: e.target.value } }))}
                required
              />
            </div>
            <div className="form-field">
              <label className="form-label-muted">Description</label>
              <textarea
                className="form-input min-h-[5rem]"
                value={panel.draft.description}
                onChange={(e) => setPanel((p) => ({ ...p, draft: { ...p.draft, description: e.target.value } }))}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200/80 bg-flux-panel px-4 py-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={panel.draft.isActive}
                onChange={(e) => setPanel((p) => ({ ...p, draft: { ...p.draft, isActive: e.target.checked } }))}
                className="form-checkbox"
              />
              Active
            </label>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" className="btn-secondary" onClick={closePanel}>
                Cancel
              </button>
              <button type="submit" className="btn-primary disabled:cursor-not-allowed" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}

      </SlideOverPanel>

      <SlideOverPanel
        open={fieldPanelOpen}
        onClose={closeFieldPanel}
        widthClass="sm:max-w-2xl"
        title={fieldPanelMode === 'add' ? 'Add field' : 'Edit field'}
        description={
          fieldPanelScope === 'employee'
            ? 'Employee profile - custom field definition'
            : 'Company - custom field definition'
        }
      >
        <SingleCustomFieldDefForm
          draft={fieldPanelDraft}
          onDraftChange={setFieldPanelDraft}
          keyReadOnly={fieldPanelMode === 'edit'}
        />
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-neutral-200 pt-4">
          <button type="button" className="btn-secondary" onClick={closeFieldPanel} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void applyFieldPanel()}>
            {saving ? 'Saving...' : 'Save field'}
          </button>
        </div>
      </SlideOverPanel>
    </section>
  );
}

export default OrganizationSetupPage;
