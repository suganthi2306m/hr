import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import apiClient from '../api/client';
import { LiveTrackWordmark } from '../components/brand/LiveTrackWordmark';

const emptyCompanyForm = { name: '', address: '', phone: '', email: '' };
const defaultPassword = { currentPassword: '', newPassword: '' };

const companyFields = [
  { key: 'name', label: 'Company name', type: 'text', autoComplete: 'organization' },
  { key: 'address', label: 'Address', type: 'text', autoComplete: 'street-address' },
  { key: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel' },
  { key: 'email', label: 'Company email', type: 'email', autoComplete: 'email' },
];

const SETTINGS_TABS = [
  { id: 'company', label: 'Organization' },
  { id: 'branches', label: 'Branches' },
  { id: 'security', label: 'Security' },
];

function normalizeBranchesFromApi(list) {
  if (!Array.isArray(list)) return [];
  return list.map((b) => ({
    _id: b._id != null ? String(b._id) : '',
    name: b.name || '',
    code: b.code || '',
    address: b.address || '',
    phone: b.phone || '',
  }));
}

function SettingsPage() {
  const [tab, setTab] = useState('company');
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [branches, setBranches] = useState([]);
  const [companyMeta, setCompanyMeta] = useState({ _id: null, createdAt: null, updatedAt: null });
  const [passwordPayload, setPasswordPayload] = useState(defaultPassword);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingBranches, setSavingBranches] = useState(false);

  const loadCompany = useCallback(async () => {
    setLoadingCompany(true);
    setError('');
    try {
      const { data } = await apiClient.get('/company');
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
      } else {
        setCompanyMeta({ _id: null, createdAt: null, updatedAt: null });
        setBranches([]);
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Unable to load company details.');
    } finally {
      setLoadingCompany(false);
    }
  }, []);

  useEffect(() => {
    loadCompany();
  }, [loadCompany]);

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

  const saveBranches = async (event) => {
    event.preventDefault();
    setSavingBranches(true);
    setMessage('');
    setError('');
    const cleaned = branches
      .filter((b) => String(b.name || '').trim())
      .map((b) => ({
        ...(b._id && /^[a-f\d]{24}$/i.test(b._id) ? { _id: b._id } : {}),
        name: String(b.name).trim(),
        code: String(b.code || '').trim(),
        address: String(b.address || '').trim(),
        phone: String(b.phone || '').trim(),
      }));
    try {
      await apiClient.put('/company', { ...companyForm, branches: cleaned });
      setMessage('Branches saved. Geofences can now be linked to these branches.');
      await loadCompany();
    } catch (e) {
      setError(e.response?.data?.message || 'Unable to save branches.');
    } finally {
      setSavingBranches(false);
    }
  };

  const addBranchRow = () => {
    setBranches((rows) => [...rows, { _id: '', name: '', code: '', address: '', phone: '' }]);
  };

  const updateBranch = (index, key, value) => {
    setBranches((rows) => rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  };

  const removeBranch = (index) => {
    setBranches((rows) => rows.filter((_, i) => i !== index));
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

  const formatDate = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return '—';
    }
  };

  return (
    <section className="min-w-0 max-w-full space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-dark">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Company profile, branches for geofencing and assignments, and account security.
        </p>
      </div>

      {(message || error) && (
        <div className="space-y-2">
          {message && <p className="alert-success">{message}</p>}
          {error && <p className="alert-error">{error}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2 rounded-2xl border border-neutral-200/90 bg-white p-1.5 shadow-sm">
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={clsx(
              'rounded-xl px-4 py-2 text-sm font-bold transition',
              tab === t.id ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-flux-panel hover:text-dark',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'company' && (
        <div className="flux-card min-w-0 p-6 shadow-panel-lg">
          <h3 className="text-lg font-bold text-dark">Organization</h3>
          <p className="mt-1 text-sm text-slate-500">
            Legal and contact identity for your <LiveTrackWordmark className="inline" /> workspace.
          </p>

          {loadingCompany ? (
            <p className="mt-6 text-sm text-slate-500">Loading company…</p>
          ) : (
            <form className="form-stack mt-6" onSubmit={updateCompany}>
              <div className="grid gap-4 rounded-xl border border-neutral-200/80 bg-flux-panel p-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company ID</p>
                  <p className="mt-1 font-mono text-sm text-dark">{companyMeta._id || '— (save company to generate)'}</p>
                </div>
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
          )}
        </div>
      )}

      {tab === 'branches' && (
        <div className="flux-card min-w-0 p-6 shadow-panel-lg">
          <h3 className="text-lg font-bold text-dark">Branches</h3>
          <p className="mt-1 text-sm text-slate-500">
            Offices or sites under your company. Assign users to a branch ID and attach geofences per branch under{' '}
            <strong>Operations → Geofences</strong>.
          </p>

          {loadingCompany ? (
            <p className="mt-6 text-sm text-slate-500">Loading…</p>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={saveBranches}>
              <div className="overflow-x-auto rounded-xl border border-neutral-200">
                <table className="min-w-[36rem] w-full text-sm">
                  <thead>
                    <tr className="bg-flux-panel text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Code</th>
                      <th className="min-w-[12rem] px-3 py-2">Address</th>
                      <th className="px-3 py-2">Phone</th>
                      <th className="w-24 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {branches.map((b, i) => (
                      <tr key={b._id || `new-${i}`} className="border-t border-neutral-100">
                        <td className="px-2 py-2">
                          <input
                            className="form-input py-1.5 text-sm"
                            value={b.name}
                            onChange={(e) => updateBranch(i, 'name', e.target.value)}
                            placeholder="Branch name"
                            required
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="form-input py-1.5 text-sm"
                            value={b.code}
                            onChange={(e) => updateBranch(i, 'code', e.target.value)}
                            placeholder="Code"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="form-input py-1.5 text-sm"
                            value={b.address}
                            onChange={(e) => updateBranch(i, 'address', e.target.value)}
                            placeholder="Address"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="form-input py-1.5 text-sm"
                            value={b.phone}
                            onChange={(e) => updateBranch(i, 'phone', e.target.value)}
                            placeholder="Phone"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button type="button" className="text-xs font-semibold text-red-600 hover:underline" onClick={() => removeBranch(i)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!branches.length && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                          No branches yet. Add one to enable per-branch geofences.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={addBranchRow}>
                  Add branch
                </button>
                <button type="submit" className="btn-primary disabled:opacity-60" disabled={savingBranches}>
                  {savingBranches ? 'Saving…' : 'Save branches'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {tab === 'security' && (
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
    </section>
  );
}

export default SettingsPage;
