import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { CompanyPageHeader, Field, Section } from './superAdminCompanyUi';

const emptyForm = () => ({
  name: '',
  companyEmail: '',
  phone: '',
  city: '',
  state: '',
  address: '',
  planId: '',
  ownerName: '',
  ownerEmail: '',
  ownerPassword: '',
  generateLicense: true,
  licenseKey: '',
  companyIsActive: true,
});

export default function SuperAdminCompanyCreatePage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    setError('');
    try {
      const { data } = await apiClient.get('/super/plans');
      const list = data.items || [];
      setPlans(list);
      setForm((f) => (f.planId || !list.length ? f : { ...f, planId: String(list[0]._id) }));
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load subscription plans.');
    } finally {
      setLoadingPlans(false);
    }
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const validate = () => {
    if (!String(form.name || '').trim()) return 'Company name is required.';
    const em = String(form.companyEmail || '').trim();
    if (!em) return 'Company email is required.';
    if (!em.includes('@')) return 'Enter a valid company email.';
    if (!String(form.phone || '').trim()) return 'Phone is required.';
    if (plans.length > 0 && !String(form.planId || '').trim()) return 'Select a subscription plan.';
    if (!String(form.ownerName || '').trim()) return 'Tenant owner name is required.';
    const oe = String(form.ownerEmail || '').trim();
    if (!oe) return 'Tenant owner email is required.';
    if (!oe.includes('@')) return 'Enter a valid owner email.';
    const pw = String(form.ownerPassword || '').trim();
    if (pw.length < 6) return 'Owner password must be at least 6 characters.';
    if (!form.generateLicense && !String(form.licenseKey || '').trim()) {
      return 'Enter an existing license key, or enable “Generate new license key”.';
    }
    const addr = String(form.address || '').trim();
    const city = String(form.city || '').trim();
    const st = String(form.state || '').trim();
    if (!addr && !city && !st) {
      return 'Enter address, or at least city or state (used for the company record).';
    }
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setSaving(true);
    try {
      await apiClient.post('/super/companies', {
        ...form,
        planId: form.planId,
        generateLicense: form.generateLicense,
        licenseKey: form.generateLicense ? '' : String(form.licenseKey || '').trim(),
      });
      navigate('/super/companies');
    } catch (err) {
      const m = err.response?.data?.message || 'Could not create company.';
      setError(typeof m === 'string' ? m : 'Could not create company.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingPlans) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  return (
    <form className="mx-auto max-w-6xl space-y-6 pb-24" onSubmit={handleSubmit}>
      <CompanyPageHeader
        backTo="/super/companies"
        title="Add company"
        subtitle="Create a tenant, owner login, and subscription. Required fields are marked."
        actions={
          <>
            <Link to="/super/companies" className="btn-secondary inline-flex items-center justify-center">
              Cancel
            </Link>
            <button type="submit" className="btn-primary" disabled={saving || !plans.length}>
              {saving ? 'Creating…' : 'Create company'}
            </button>
          </>
        }
      />

      {!plans.length ? (
        <p className="alert-error text-sm">Create at least one subscription plan before adding a company.</p>
      ) : null}
      {error ? <p className="alert-error">{error}</p> : null}

      <Section title="Company profile">
        <Field label="Company name" required>
          <input
            className="form-input"
            value={form.name}
            onChange={(ev) => setForm({ ...form, name: ev.target.value })}
            autoComplete="organization"
          />
        </Field>
        <Field label="Company email" required>
          <input
            type="email"
            className="form-input"
            value={form.companyEmail}
            onChange={(ev) => setForm({ ...form, companyEmail: ev.target.value })}
            autoComplete="off"
          />
        </Field>
        <Field label="Phone" required>
          <input className="form-input" value={form.phone} onChange={(ev) => setForm({ ...form, phone: ev.target.value })} autoComplete="tel" />
        </Field>
        <Field label="City">
          <input className="form-input" value={form.city} onChange={(ev) => setForm({ ...form, city: ev.target.value })} />
        </Field>
        <Field label="State / region">
          <input className="form-input" value={form.state} onChange={(ev) => setForm({ ...form, state: ev.target.value })} />
        </Field>
        <Field label="Street address" className="sm:col-span-2 lg:col-span-3">
          <textarea
            rows={3}
            className="form-textarea"
            value={form.address}
            onChange={(ev) => setForm({ ...form, address: ev.target.value })}
            placeholder="Street and area"
          />
          <p className="mt-1 text-xs text-slate-500">
            <span className="text-rose-600">*</span> At least one of address, city, or state is required.
          </p>
        </Field>
      </Section>

      <Section title="Subscription">
        <Field label="Plan" required className="sm:col-span-2 lg:col-span-3">
          <select
            className="form-select"
            value={form.planId}
            onChange={(ev) => setForm({ ...form, planId: ev.target.value })}
            disabled={!plans.length}
          >
            {plans.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} — ₹{p.priceInr}/{p.durationMonths} mo — {p.maxUsers} users / {p.maxBranches} branches
              </option>
            ))}
          </select>
        </Field>
        <Field label="License key source" className="sm:col-span-2 lg:col-span-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="form-checkbox"
              checked={form.generateLicense}
              onChange={(ev) => setForm({ ...form, generateLicense: ev.target.checked })}
            />
            Generate new license key
          </label>
        </Field>
        {!form.generateLicense ? (
          <Field label="Existing license key" required className="sm:col-span-2 lg:col-span-3">
            <input
              className="form-input font-mono text-xs"
              placeholder="Unassigned key from Licenses"
              value={form.licenseKey}
              onChange={(ev) => setForm({ ...form, licenseKey: ev.target.value })}
            />
          </Field>
        ) : null}
        <Field label="Status" className="sm:col-span-2 lg:col-span-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="form-checkbox"
              checked={form.companyIsActive}
              onChange={(ev) => setForm({ ...form, companyIsActive: ev.target.checked })}
            />
            Company is active
          </label>
        </Field>
      </Section>

      <Section title="Tenant owner (console login)">
        <Field label="Owner name" required>
          <input className="form-input" value={form.ownerName} onChange={(ev) => setForm({ ...form, ownerName: ev.target.value })} autoComplete="name" />
        </Field>
        <Field label="Owner email" required>
          <input
            type="email"
            className="form-input"
            value={form.ownerEmail}
            onChange={(ev) => setForm({ ...form, ownerEmail: ev.target.value })}
            autoComplete="off"
          />
        </Field>
        <Field label="Owner password" required>
          <input
            type="password"
            className="form-input"
            value={form.ownerPassword}
            onChange={(ev) => setForm({ ...form, ownerPassword: ev.target.value })}
            autoComplete="new-password"
            placeholder="Minimum 6 characters"
          />
        </Field>
      </Section>
    </form>
  );
}
