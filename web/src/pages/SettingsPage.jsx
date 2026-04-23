import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import clsx from 'clsx';
import apiClient from '../api/client';
import { LiveTrackWordmark } from '../components/brand/LiveTrackWordmark';
import BranchesDirectoryPanel from '../components/settings/BranchesDirectoryPanel';
import CompanySubscriptionProfileCard from '../components/settings/CompanySubscriptionProfileCard';
import SlideOverPanel from '../components/common/SlideOverPanel';
import SingleCustomFieldDefForm, { emptyCustomFieldDef } from '../components/settings/SingleCustomFieldDefForm';
import { cleanBranchesForApi, normalizeBranchesFromApi } from '../utils/branchWorkspace';
import { isTransientNetworkError, sleep } from '../utils/transientNetwork';

const emptyCompanyForm = { name: '', address: '', phone: '', email: '' };
const defaultPassword = { currentPassword: '', newPassword: '' };

const companyFields = [
  { key: 'name', label: 'Company name', type: 'text', autoComplete: 'organization' },
  { key: 'address', label: 'Address', type: 'text', autoComplete: 'street-address' },
  { key: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel' },
  { key: 'email', label: 'Company email', type: 'email', autoComplete: 'email' },
];

const MAIN_TABS = [
  { id: 'employee', label: 'Employee settings' },
  { id: 'company', label: 'Company settings' },
];

const COMPANY_INNER_TABS = [
  { id: 'fields', label: 'Custom fields' },
  { id: 'ids', label: 'Employee ID & Branch ID' },
  { id: 'organization', label: 'Organization' },
  { id: 'branches', label: 'Branches' },
  { id: 'security', label: 'Security' },
];

const defaultIdGeneration = {
  employee: { enabled: false, prefix: 'EMP', startNumber: 1, padLength: 4, nextNumber: 1 },
  branch: { enabled: false, prefix: 'BR', startNumber: 1, padLength: 0, nextNumber: 1 },
};

function asNonNegativeInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function normalizeIdGenerationForUi(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const normalizeOne = (item, defaults) => {
    const x = item && typeof item === 'object' ? item : {};
    const d = defaults && typeof defaults === 'object' ? defaults : {};
    const startNumber = asNonNegativeInt(
      Object.prototype.hasOwnProperty.call(x, 'startNumber') ? x.startNumber : d.startNumber,
      d.startNumber,
    );
    const nextNumber = asNonNegativeInt(x.nextNumber, startNumber);
    const enabledRaw = x.enabled;
    const enabled = Object.prototype.hasOwnProperty.call(x, 'enabled')
      ? enabledRaw === true || enabledRaw === 'true' || enabledRaw === 1 || enabledRaw === '1'
      : Boolean(d.enabled);
    return {
      enabled,
      prefix: String(x.prefix != null ? x.prefix : d.prefix),
      startNumber,
      nextNumber: Math.max(startNumber, nextNumber),
      padLength: asNonNegativeInt(
        Object.prototype.hasOwnProperty.call(x, 'padLength') ? x.padLength : d.padLength,
        d.padLength,
      ),
    };
  };
  return {
    employee: normalizeOne(src.employee, defaultIdGeneration.employee),
    branch: normalizeOne(src.branch, defaultIdGeneration.branch),
  };
}

function patchIdGenerationSlice(prev, key, patch) {
  const base = defaultIdGeneration[key] || {};
  const slice = prev[key] && typeof prev[key] === 'object' ? prev[key] : {};
  return { ...base, ...slice, ...patch };
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
  if (!opts.length) return def.fieldType === 'checkbox' ? 'Single toggle' : '—';
  const parts = opts.slice(0, 3).map((o) => o.label || o.value);
  const more = opts.length > 3 ? ` +${opts.length - 3}` : '';
  return `${parts.join(', ')}${more}`;
}

function ymdFromApiDate(d) {
  if (d == null || d === '') return '';
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return '';
  return new Date(t).toISOString().slice(0, 10);
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

function SettingsPage() {
  const [mainTab, setMainTab] = useState('employee');
  const [companyInnerTab, setCompanyInnerTab] = useState('fields');
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [branches, setBranches] = useState([]);
  const [companyMeta, setCompanyMeta] = useState({ _id: null, createdAt: null, updatedAt: null });
  const [passwordPayload, setPasswordPayload] = useState(defaultPassword);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingBranches, setSavingBranches] = useState(false);
  const [employeeFieldDefs, setEmployeeFieldDefs] = useState([]);
  const [companyFieldDefs, setCompanyFieldDefs] = useState([]);
  const [employeeFieldSearch, setEmployeeFieldSearch] = useState('');
  const [companyFieldSearch, setCompanyFieldSearch] = useState('');
  const [savingFields, setSavingFields] = useState(false);
  const [idGeneration, setIdGeneration] = useState(defaultIdGeneration);
  const [savingIdRules, setSavingIdRules] = useState(false);

  const [fieldPanelOpen, setFieldPanelOpen] = useState(false);
  const [fieldPanelScope, setFieldPanelScope] = useState('employee');
  const [fieldPanelMode, setFieldPanelMode] = useState('add');
  const [fieldPanelIndex, setFieldPanelIndex] = useState(null);
  const [fieldPanelDraft, setFieldPanelDraft] = useState(() => emptyCustomFieldDef());
  const [subscriptionSnap, setSubscriptionSnap] = useState(null);
  const [staffCount, setStaffCount] = useState(0);
  const [renewalDetailsDraft, setRenewalDetailsDraft] = useState('');
  const [lastRenewedAtDraft, setLastRenewedAtDraft] = useState('');
  const [savingRenewal, setSavingRenewal] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadCompany = useCallback(async () => {
    setLoadingCompany(true);
    setError('');
    const maxAttempts = 3;
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const { data } = await apiClient.get('/company');
          if (!mountedRef.current) return;
          if (data.company) {
            const c = data.company;
            setCompanyForm({
              name: c.name || '',
              address: c.address || '',
              phone: c.phone || '',
              email: c.email || '',
            });
            setBranches(normalizeBranchesFromApi(c.branches));
            setCompanyMeta({
              _id: c._id || null,
              createdAt: c.createdAt || null,
              updatedAt: c.updatedAt || null,
            });
            setEmployeeFieldDefs(
              Array.isArray(c.employeeCustomFieldDefs) ? c.employeeCustomFieldDefs.map(normalizeCustomFieldDefForUi) : [],
            );
            setCompanyFieldDefs(
              Array.isArray(c.companyCustomFieldDefs) ? c.companyCustomFieldDefs.map(normalizeCustomFieldDefForUi) : [],
            );
            setIdGeneration(normalizeIdGenerationForUi(c.orgSetup?.idGeneration));
            const sub = c.subscription && typeof c.subscription === 'object' ? c.subscription : {};
            setSubscriptionSnap(sub);
            setRenewalDetailsDraft(String(sub.renewalDetails || ''));
            setLastRenewedAtDraft(ymdFromApiDate(sub.lastRenewedAt));
            try {
              const { data: uData } = await apiClient.get('/users');
              if (mountedRef.current) setStaffCount(Array.isArray(uData?.items) ? uData.items.length : 0);
            } catch {
              if (mountedRef.current) setStaffCount(0);
            }
          } else {
            setCompanyMeta({ _id: null, createdAt: null, updatedAt: null });
            setBranches([]);
            setEmployeeFieldDefs([]);
            setCompanyFieldDefs([]);
            setIdGeneration(defaultIdGeneration);
            setSubscriptionSnap(null);
            setRenewalDetailsDraft('');
            setLastRenewedAtDraft('');
            setStaffCount(0);
          }
          return;
        } catch (e) {
          if (axios.isCancel(e) || e?.code === 'ERR_CANCELED' || !mountedRef.current) return;
          const retry = attempt < maxAttempts && isTransientNetworkError(e);
          if (retry) {
            await sleep(320 * attempt);
            continue;
          }
          const msg =
            e.response?.status === 401
              ? 'Session expired. Please sign in again.'
              : e.response?.data?.message ||
                (isTransientNetworkError(e)
                  ? 'Could not reach the server. Check your connection and tap Retry.'
                  : 'Unable to load company details.');
          setError(msg);
          return;
        }
      }
    } finally {
      if (mountedRef.current) setLoadingCompany(false);
    }
  }, []);

  useEffect(() => {
    loadCompany();
  }, [loadCompany]);

  const persistFieldDefs = async (nextEmployee, nextCompany) => {
    setSavingFields(true);
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
      await loadCompany();
    } catch (e) {
      setError(e.response?.data?.message || 'Unable to save field settings.');
    } finally {
      setSavingFields(false);
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

  const updateCompany = async (event) => {
    event.preventDefault();
    setSavingCompany(true);
    setMessage('');
    setError('');
    try {
      await apiClient.put('/company', companyForm);
      setMessage('Organization profile saved.');
      await loadCompany();
    } catch (e) {
      setError(e.response?.data?.message || 'Unable to save company settings.');
    } finally {
      setSavingCompany(false);
    }
  };

  const saveRenewal = async () => {
    setSavingRenewal(true);
    setMessage('');
    setError('');
    try {
      await apiClient.put('/company', {
        subscription: {
          renewalDetails: renewalDetailsDraft.trim(),
          lastRenewedAt: lastRenewedAtDraft || null,
        },
      });
      setMessage('Renewal details saved.');
      await loadCompany();
    } catch (e) {
      setError(e.response?.data?.message || 'Unable to save renewal details.');
    } finally {
      setSavingRenewal(false);
    }
  };

  const persistBranchesList = async (nextBranches) => {
    setSavingBranches(true);
    setMessage('');
    setError('');
    try {
      const cleaned = cleanBranchesForApi(nextBranches, branches);
      const { data } = await apiClient.put('/company', { ...companyForm, branches: cleaned });
      setMessage('Branches and attendance zones saved.');
      const saved = data?.company;
      if (saved) {
        setBranches(normalizeBranchesFromApi(saved.branches));
        if (saved.orgSetup?.idGeneration != null) {
          setIdGeneration(normalizeIdGenerationForUi(saved.orgSetup.idGeneration));
        }
      }
      await loadCompany();
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        (typeof e?.message === 'string' ? e.message : null) ||
        'Unable to save branches.';
      setError(typeof msg === 'string' ? msg : 'Unable to save branches.');
      throw e;
    } finally {
      setSavingBranches(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      await apiClient.put('/auth/change-password', passwordPayload);
      setPasswordPayload(defaultPassword);
      setMessage('Password changed successfully.');
    } catch (e) {
      setError(e.response?.data?.message || 'Unable to change password.');
    }
  };

  const updateIdGeneration = async (event) => {
    event.preventDefault();
    setSavingIdRules(true);
    setMessage('');
    setError('');
    try {
      const payload = normalizeIdGenerationForUi(idGeneration);
      await apiClient.put('/company', {
        orgSetup: {
          idGeneration: payload,
        },
      });
      setMessage('ID generation settings saved.');
      await loadCompany();
    } catch (e) {
      setError(e.response?.data?.message || 'Unable to save ID generation settings.');
    } finally {
      setSavingIdRules(false);
    }
  };

  const formatDate = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return '—';
    }
  };

  const renderFieldTable = (scope, filtered, fullList) => (
    <div className="flux-card min-w-0 overflow-hidden shadow-panel-lg">
      <div className="flex flex-col gap-3 border-b border-neutral-100 bg-flux-panel px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="form-field min-w-0 flex-1 sm:max-w-md">
          <label className="form-label-muted">Search fields</label>
          <input
            className="form-input"
            placeholder="Label, key, category, type, or choice…"
            value={scope === 'employee' ? employeeFieldSearch : companyFieldSearch}
            onChange={(e) => (scope === 'employee' ? setEmployeeFieldSearch : setCompanyFieldSearch)(e.target.value)}
          />
        </div>
        <button type="button" className="btn-primary shrink-0" onClick={() => openAddField(scope)}>
          Add field
        </button>
      </div>
      {loadingCompany ? (
        <p className="p-6 text-sm text-slate-500">Loading…</p>
      ) : (
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
                    <td className="px-4 py-3 text-slate-700">{d.isRequired ? 'Yes' : '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={savingFields}
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
                        disabled={idx < 0 || savingFields}
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
      )}
    </div>
  );

  return (
    <section className="min-w-0 max-w-full space-y-6">
      {(message || error) && (
        <div className="space-y-2">
          {message && <p className="alert-success">{message}</p>}
          {error && (
            <div className="alert-error flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              <button
                type="button"
                className="btn-secondary shrink-0 self-start sm:self-auto"
                disabled={loadingCompany}
                onClick={() => void loadCompany()}
              >
                {loadingCompany ? 'Retrying…' : 'Retry'}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 rounded-2xl border border-neutral-200/90 bg-white p-1.5 shadow-sm">
        {MAIN_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setMainTab(t.id);
              if (t.id === 'company') setCompanyInnerTab('fields');
            }}
            className={clsx(
              'rounded-xl px-4 py-2 text-sm font-bold transition',
              mainTab === t.id ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-flux-panel hover:text-dark',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mainTab === 'employee' && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-dark">Employee custom fields</h2>
          {renderFieldTable('employee', filteredEmployeeDefs, employeeFieldDefs)}
        </div>
      )}

      {mainTab === 'company' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 rounded-2xl border border-neutral-200/90 bg-white p-1.5 shadow-sm">
            {COMPANY_INNER_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setCompanyInnerTab(t.id)}
                className={clsx(
                  'rounded-xl px-4 py-2 text-sm font-bold transition',
                  companyInnerTab === t.id ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-flux-panel hover:text-dark',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {companyInnerTab === 'fields' && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-dark">Company custom fields</h2>
              <p className="text-sm text-slate-500">Definitions for extra company attributes (for future forms).</p>
              {renderFieldTable('company', filteredCompanyDefs, companyFieldDefs)}
            </div>
          )}

          {companyInnerTab === 'ids' && (
            <form onSubmit={updateIdGeneration} className="flux-card min-w-0 space-y-5 p-6 shadow-panel-lg">
              <div>
                <h3 className="text-lg font-bold text-dark">Auto-generate IDs</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Configure prefix and number format for employee and branch IDs.
                </p>
              </div>

              {[
                { key: 'employee', title: 'Employee ID', hint: 'Used as employee code when creating employees.' },
                { key: 'branch', title: 'Branch ID', hint: 'Used as branch ID when creating branches.' },
              ].map((cfg) => {
                const row = idGeneration[cfg.key];
                return (
                  <div key={cfg.key} className="rounded-xl border border-neutral-200 bg-flux-panel p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-dark">{cfg.title}</p>
                        <p className="text-xs text-slate-500">{cfg.hint}</p>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                          id={`id-gen-${cfg.key}-enabled`}
                          type="checkbox"
                          className="form-checkbox"
                          checked={Boolean(row.enabled)}
                          onChange={(e) =>
                            setIdGeneration((old) => ({
                              ...old,
                              [cfg.key]: patchIdGenerationSlice(old, cfg.key, { enabled: e.target.checked }),
                            }))
                          }
                        />
                        <span>Auto generate enabled</span>
                      </label>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-4">
                      <label className="form-field" htmlFor={`id-gen-${cfg.key}-prefix`}>
                        <span className="form-label-muted">Prefix</span>
                        <input
                          id={`id-gen-${cfg.key}-prefix`}
                          className="form-input"
                          value={row.prefix}
                          disabled={!row.enabled || savingIdRules}
                          onChange={(e) =>
                            setIdGeneration((old) => ({
                              ...old,
                              [cfg.key]: patchIdGenerationSlice(old, cfg.key, { prefix: e.target.value }),
                            }))
                          }
                        />
                      </label>
                      <label className="form-field" htmlFor={`id-gen-${cfg.key}-start`}>
                        <span className="form-label-muted">Start number</span>
                        <input
                          id={`id-gen-${cfg.key}-start`}
                          type="number"
                          min={0}
                          className="form-input"
                          value={row.startNumber}
                          disabled={!row.enabled || savingIdRules}
                          onChange={(e) =>
                            setIdGeneration((old) => ({
                              ...old,
                              [cfg.key]: patchIdGenerationSlice(old, cfg.key, {
                                startNumber: asNonNegativeInt(e.target.value, 0),
                              }),
                            }))
                          }
                        />
                      </label>
                      <label className="form-field" htmlFor={`id-gen-${cfg.key}-pad`}>
                        <span className="form-label-muted">Zero padding</span>
                        <input
                          id={`id-gen-${cfg.key}-pad`}
                          type="number"
                          min={0}
                          max={12}
                          className="form-input"
                          value={row.padLength}
                          disabled={!row.enabled || savingIdRules}
                          onChange={(e) =>
                            setIdGeneration((old) => ({
                              ...old,
                              [cfg.key]: patchIdGenerationSlice(old, cfg.key, {
                                padLength: Math.min(12, asNonNegativeInt(e.target.value, 0)),
                              }),
                            }))
                          }
                        />
                      </label>
                      <label className="form-field" htmlFor={`id-gen-${cfg.key}-next`}>
                        <span className="form-label-muted">Next number</span>
                        <input
                          id={`id-gen-${cfg.key}-next`}
                          type="number"
                          min={0}
                          className="form-input"
                          value={row.nextNumber}
                          disabled={!row.enabled || savingIdRules}
                          onChange={(e) =>
                            setIdGeneration((old) => ({
                              ...old,
                              [cfg.key]: patchIdGenerationSlice(old, cfg.key, {
                                nextNumber: asNonNegativeInt(e.target.value, 0),
                              }),
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>
                );
              })}

              <div className="flex justify-end">
                <button type="submit" className="btn-primary" disabled={savingIdRules}>
                  {savingIdRules ? 'Saving…' : 'Save ID settings'}
                </button>
              </div>
            </form>
          )}

          {companyInnerTab === 'organization' && (
            <div className="flux-card min-w-0 p-6 shadow-panel-lg">
              <h3 className="text-lg font-bold text-dark">Organization</h3>
              <p className="mt-1 text-sm text-slate-500">
                Legal and contact identity for your <LiveTrackWordmark className="inline" /> workspace.
              </p>

              {loadingCompany ? (
                <p className="mt-6 text-sm text-slate-500">Loading company…</p>
              ) : (
                <div className="form-stack mt-6 space-y-8">
                  <CompanySubscriptionProfileCard
                    variant="light"
                    companyName={companyForm.name}
                    subscription={subscriptionSnap}
                    staffCount={staffCount}
                    branchCount={branches.length}
                    renewalDetails={renewalDetailsDraft}
                    lastRenewedAtYmd={lastRenewedAtDraft}
                    onRenewalDetailsChange={setRenewalDetailsDraft}
                    onLastRenewedAtChange={setLastRenewedAtDraft}
                    onSaveRenewal={saveRenewal}
                    savingRenewal={savingRenewal}
                  />
                  <form className="form-stack" onSubmit={updateCompany}>
                  <div className="grid gap-4 rounded-xl border border-neutral-200/80 bg-flux-panel p-5 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Created</p>
                      <p className="mt-1 text-sm text-dark">{formatDate(companyMeta.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last updated</p>
                      <p className="mt-1 text-sm text-dark">{formatDate(companyMeta.updatedAt)}</p>
                    </div>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    {companyFields.map((field) => (
                      <div key={field.key} className={`form-field ${field.key === 'address' ? 'sm:col-span-2' : ''}`}>
                        <label htmlFor={`company-${field.key}`} className="form-label-muted">
                          {field.label}
                        </label>
                        <input
                          id={`company-${field.key}`}
                          type={field.type}
                          name={field.key}
                          autoComplete={field.autoComplete}
                          value={companyForm[field.key]}
                          onChange={(e) => setCompanyForm((old) => ({ ...old, [field.key]: e.target.value }))}
                          className="form-input"
                          required
                        />
                      </div>
                    ))}
                  </div>

                  <button type="submit" disabled={savingCompany} className="btn-primary disabled:cursor-not-allowed">
                    {savingCompany ? 'Saving…' : 'Save organization'}
                  </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {companyInnerTab === 'branches' &&
            (loadingCompany ? (
              <div className="flux-card min-w-0 p-6 shadow-panel-lg">
                <p className="text-sm text-slate-500">Loading…</p>
              </div>
            ) : (
              <BranchesDirectoryPanel
                branches={branches}
                onPersist={persistBranchesList}
                saving={savingBranches}
                idGenerationBranch={idGeneration.branch}
              />
            ))}

          {companyInnerTab === 'security' && (
            <form onSubmit={changePassword} className="flux-card min-w-0 p-6 shadow-panel-lg">
              <h3 className="text-lg font-bold text-dark">Change password</h3>
              <p className="mt-1 text-sm text-slate-500">Update your admin account password.</p>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div className="form-field">
                  <label htmlFor="current-password" className="form-label-muted">
                    Current password
                  </label>
                  <input
                    id="current-password"
                    type="password"
                    value={passwordPayload.currentPassword}
                    autoComplete="current-password"
                    onChange={(e) => setPasswordPayload((old) => ({ ...old, currentPassword: e.target.value }))}
                    className="form-input"
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="new-password" className="form-label-muted">
                    New password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    value={passwordPayload.newPassword}
                    autoComplete="new-password"
                    onChange={(e) => setPasswordPayload((old) => ({ ...old, newPassword: e.target.value }))}
                    className="form-input"
                    required
                  />
                </div>
              </div>
              <button type="submit" className="btn-primary mt-6">
                Update password
              </button>
            </form>
          )}
        </div>
      )}

      <SlideOverPanel
        open={fieldPanelOpen}
        onClose={closeFieldPanel}
        widthClass="sm:max-w-2xl"
        title={fieldPanelMode === 'add' ? 'Add field' : 'Edit field'}
        description={
          fieldPanelScope === 'employee'
            ? 'Employee profile — custom field definition'
            : 'Company — custom field definition'
        }
      >
        <SingleCustomFieldDefForm
          draft={fieldPanelDraft}
          onDraftChange={setFieldPanelDraft}
          keyReadOnly={fieldPanelMode === 'edit'}
        />
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-neutral-200 pt-4">
          <button type="button" className="btn-secondary" onClick={closeFieldPanel} disabled={savingFields}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={savingFields} onClick={() => void applyFieldPanel()}>
            {savingFields ? 'Saving…' : 'Save field'}
          </button>
        </div>
      </SlideOverPanel>
    </section>
  );
}

export default SettingsPage;
