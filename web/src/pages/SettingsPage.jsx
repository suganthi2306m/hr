import { useEffect, useState } from 'react';
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

function SettingsPage() {
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [companyMeta, setCompanyMeta] = useState({ _id: null, createdAt: null, updatedAt: null });
  const [passwordPayload, setPasswordPayload] = useState(defaultPassword);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingCompany(true);
      setError('');
      try {
        const { data } = await apiClient.get('/company');
        if (cancelled) return;
        if (data.company) {
          const c = data.company;
          setCompanyForm({
            name: c.name || '',
            address: c.address || '',
            phone: c.phone || '',
            email: c.email || '',
          });
          setCompanyMeta({
            _id: c._id || null,
            createdAt: c.createdAt || null,
            updatedAt: c.updatedAt || null,
          });
        } else {
          setCompanyMeta({ _id: null, createdAt: null, updatedAt: null });
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.response?.data?.message || 'Unable to load company details.');
        }
      } finally {
        if (!cancelled) setLoadingCompany(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateCompany = async (event) => {
    event.preventDefault();
    setSavingCompany(true);
    setMessage('');
    setError('');
    try {
      await apiClient.put('/company', companyForm);
      setError('');
      setMessage('Company settings saved.');
      const { data } = await apiClient.get('/company');
      if (data.company) {
        const c = data.company;
        setCompanyMeta({
          _id: c._id || null,
          createdAt: c.createdAt || null,
          updatedAt: c.updatedAt || null,
        });
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Unable to save company settings.');
    } finally {
      setSavingCompany(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      await apiClient.put('/auth/change-password', passwordPayload);
      setPasswordPayload(defaultPassword);
      setError('');
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
    <section className="space-y-6">
      {(message || error) && (
        <div className="space-y-2">
          {message && <p className="alert-success">{message}</p>}
          {error && <p className="alert-error">{error}</p>}
        </div>
      )}

      <div className="flux-card p-6 shadow-panel-lg">
        <h3 className="text-lg font-bold text-dark">Company settings</h3>
        <p className="mt-1 text-sm text-slate-500">
          Update your organization profile. These details are used across your <LiveTrackWordmark className="inline" /> workspace.
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
              {savingCompany ? 'Saving…' : 'Save company settings'}
            </button>
          </form>
        )}
      </div>

      <form onSubmit={changePassword} className="flux-card p-6 shadow-panel-lg">
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
    </section>
  );
}

export default SettingsPage;
