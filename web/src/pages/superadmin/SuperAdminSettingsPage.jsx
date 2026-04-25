import { useCallback, useEffect, useState } from 'react';
import apiClient, { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const emptyProfile = () => ({
  companyName: '',
  companyEmail: '',
  companyPhone: '',
  companyWebsiteUrl: '',
  description: '',
  address: '',
  supportEmail: '',
  contactPersonName: '',
  altPhone: '',
});

function profileFromAdmin(admin) {
  const p = admin?.superAdminOrgProfile && typeof admin.superAdminOrgProfile === 'object' ? admin.superAdminOrgProfile : {};
  return {
    companyName: String(p.companyName || ''),
    companyEmail: String(p.companyEmail || ''),
    companyPhone: String(p.companyPhone || ''),
    companyWebsiteUrl: String(p.companyWebsiteUrl || ''),
    description: String(p.description || ''),
    address: String(p.address || ''),
    supportEmail: String(p.supportEmail || ''),
    contactPersonName: String(p.contactPersonName || ''),
    altPhone: String(p.altPhone || ''),
  };
}

export default function SuperAdminSettingsPage() {
  const { admin, refetchProfile } = useAuth();
  const [form, setForm] = useState(emptyProfile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (admin) setForm(profileFromAdmin(admin));
  }, [admin]);

  const onChange = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  const save = useCallback(async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await apiClient.patch('/super/me/org-profile', form);
      setMessage('Company details saved.');
      await refetchProfile();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not save company details.'));
    } finally {
      setSaving(false);
    }
  }, [form, refetchProfile]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-16">
      <div>
        <p className="mt-1 text-sm text-slate-600">Platform super admin profile and public company details.</p>
        <p className="mt-2 text-xs text-slate-500">
          The company block below is shown to tenant companies under <span className="font-semibold">Our products</span> /{' '}
          <span className="font-semibold">Support</span> (contact for more details), and to the platform main super admin on your Super admin detail page.
        </p>
      </div>

      <div className="flux-card border border-neutral-200/90 p-5 shadow-panel">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Login account</p>
        <p className="form-label !mb-0 !mt-3 !text-slate-500">Name</p>
        <p className="mt-1 text-lg font-semibold text-dark">{admin?.name}</p>
        <p className="mt-4 form-label !mb-0 !text-slate-500">Email</p>
        <p className="mt-1 text-sm text-slate-700">{admin?.email}</p>
      </div>

      <div className="flux-card border border-neutral-200/90 p-5 shadow-panel space-y-4">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Company &amp; contact (public)</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="form-field min-w-0 sm:col-span-2">
            <span className="form-label-muted">Company name</span>
            <input className="form-input" value={form.companyName} onChange={onChange('companyName')} placeholder="e.g. Acme Platform Services" />
          </label>
          <label className="form-field min-w-0">
            <span className="form-label-muted">Company email</span>
            <input type="email" className="form-input" value={form.companyEmail} onChange={onChange('companyEmail')} placeholder="hello@company.com" />
          </label>
          <label className="form-field min-w-0">
            <span className="form-label-muted">Phone no.</span>
            <input className="form-input" value={form.companyPhone} onChange={onChange('companyPhone')} placeholder="+91 …" />
          </label>
          <label className="form-field min-w-0 sm:col-span-2">
            <span className="form-label-muted">Company website URL</span>
            <input
              className="form-input"
              value={form.companyWebsiteUrl}
              onChange={onChange('companyWebsiteUrl')}
              placeholder="https://www.example.com"
            />
          </label>
          <label className="form-field min-w-0 sm:col-span-2">
            <span className="form-label-muted">Description</span>
            <textarea className="form-input min-h-[5rem]" value={form.description} onChange={onChange('description')} placeholder="Short description of your organization" />
          </label>
          <label className="form-field min-w-0 sm:col-span-2">
            <span className="form-label-muted">Address</span>
            <textarea className="form-input min-h-[4rem]" value={form.address} onChange={onChange('address')} placeholder="Registered / office address" />
          </label>
          <label className="form-field min-w-0">
            <span className="form-label-muted">Support email</span>
            <input type="email" className="form-input" value={form.supportEmail} onChange={onChange('supportEmail')} placeholder="support@company.com" />
          </label>
          <label className="form-field min-w-0">
            <span className="form-label-muted">Company person name</span>
            <input className="form-input" value={form.contactPersonName} onChange={onChange('contactPersonName')} placeholder="Contact person" />
          </label>
          <label className="form-field min-w-0 sm:col-span-2">
            <span className="form-label-muted">Alternative contact no.</span>
            <input className="form-input" value={form.altPhone} onChange={onChange('altPhone')} placeholder="Alternate phone" />
          </label>
        </div>
        {error ? <p className="alert-error text-sm">{error}</p> : null}
        {message ? <p className="alert-success text-sm">{message}</p> : null}
        <div className="flex flex-wrap gap-2 pt-2">
          <button type="button" disabled={saving} onClick={() => void save()} className="btn-primary px-4 py-2.5 text-sm font-bold">
            {saving ? 'Saving…' : 'Save company details'}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Use the standard LiveTrack login screen &ldquo;Forgot password&rdquo; flow to rotate credentials for this account.
      </p>
    </div>
  );
}
