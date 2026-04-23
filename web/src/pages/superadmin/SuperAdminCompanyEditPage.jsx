import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import { CompanyPageHeader, Field, Section } from './superAdminCompanyUi';

export default function SuperAdminCompanyEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [form, setForm] = useState({
    name: '',
    companyEmail: '',
    phone: '',
    city: '',
    state: '',
    address: '',
    planId: '',
    companyIsActive: true,
    ownerName: '',
    ownerPassword: '',
    ownerPasswordConfirm: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [cRes, pRes] = await Promise.all([
          apiClient.get(`/super/companies/${id}`),
          apiClient.get('/super/plans'),
        ]);
        if (cancelled) return;
        const c = cRes.data.company;
        const list = pRes.data.items || [];
        const planFromCo = c.subscription?.planId != null ? String(c.subscription.planId) : '';
        const planId = planFromCo || (list[0]?._id ? String(list[0]._id) : '');
        setPlans(list);
        setOwnerEmail(c.adminId?.email || '');
        setForm({
          name: c.name || '',
          companyEmail: c.email || '',
          phone: c.phone || '',
          city: c.city || '',
          state: c.state || '',
          address: c.address || '',
          planId,
          companyIsActive: c.subscription?.isActive !== false,
          ownerName: c.adminId?.name || '',
          ownerPassword: '',
          ownerPasswordConfirm: '',
        });
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.message || 'Could not load company.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const validate = () => {
    if (!String(form.name || '').trim()) return 'Company name is required.';
    const em = String(form.companyEmail || '').trim();
    if (!em) return 'Company email is required.';
    if (!em.includes('@')) return 'Enter a valid company email.';
    if (!String(form.phone || '').trim()) return 'Phone is required.';
    const addr = String(form.address || '').trim();
    const city = String(form.city || '').trim();
    const st = String(form.state || '').trim();
    if (!addr && !city && !st) {
      return 'Enter address, or at least city or state (used for the company record).';
    }
    if (plans.length > 0 && !String(form.planId || '').trim()) return 'Select a subscription plan.';
    if (!String(form.ownerName || '').trim()) return 'Tenant owner name is required.';
    const pw = String(form.ownerPassword || '').trim();
    const pw2 = String(form.ownerPasswordConfirm || '').trim();
    if (pw || pw2) {
      if (pw.length < 6) return 'New password must be at least 6 characters.';
      if (pw !== pw2) return 'Password and confirmation do not match.';
    }
    return '';
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        companyEmail: form.companyEmail.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        address: form.address.trim(),
        subscriptionIsActive: form.companyIsActive,
        ownerName: form.ownerName.trim(),
      };
      if (String(form.planId || '').trim()) payload.planId = form.planId;
      const pw = String(form.ownerPassword || '').trim();
      if (pw) payload.ownerPassword = pw;
      await apiClient.patch(`/super/companies/${id}`, payload);
      navigate(`/super/companies/${id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-600">Loading…</p>;

  if (error && !form.name) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <CompanyPageHeader backTo="/super/companies" title="Edit company" subtitle="Could not load this company." />
        <p className="alert-error text-sm">{error}</p>
        <Link to="/super/companies" className="text-sm font-semibold text-primary hover:underline">
          Back to companies
        </Link>
      </div>
    );
  }

  return (
    <form className="mx-auto max-w-6xl space-y-6 pb-24" onSubmit={submit}>
      <CompanyPageHeader
        backTo={`/super/companies/${id}`}
        title="Edit company"
        subtitle="Update profile, plan, and tenant owner — same sections as add company."
        actions={
          <>
            <Link to={`/super/companies/${id}`} className="btn-secondary inline-flex items-center justify-center">
              Cancel
            </Link>
            <button type="submit" className="btn-primary" disabled={saving || !plans.length}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      />

      {!plans.length ? (
        <p className="alert-error text-sm">No subscription plans found. Create a plan before assigning.</p>
      ) : null}
      {error ? <p className="alert-error">{error}</p> : null}

      <Section title="Company profile">
        <Field label="Company name" required>
          <input
            className="form-input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoComplete="organization"
          />
        </Field>
        <Field label="Company email" required>
          <input
            type="email"
            className="form-input"
            value={form.companyEmail}
            onChange={(e) => setForm({ ...form, companyEmail: e.target.value })}
            autoComplete="off"
          />
        </Field>
        <Field label="Phone" required>
          <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
        </Field>
        <Field label="City">
          <input className="form-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </Field>
        <Field label="State / region">
          <input className="form-input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
        </Field>
        <Field label="Street address" className="sm:col-span-2 lg:col-span-3">
          <textarea
            rows={3}
            className="form-textarea"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
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
            onChange={(e) => setForm({ ...form, planId: e.target.value })}
            disabled={!plans.length}
          >
            {plans.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} — ₹{p.priceInr}/{p.durationMonths} mo — {p.maxUsers} users / {p.maxBranches} branches
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status" className="sm:col-span-2 lg:col-span-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="form-checkbox"
              checked={form.companyIsActive}
              onChange={(e) => setForm({ ...form, companyIsActive: e.target.checked })}
            />
            Company subscription is active
          </label>
        </Field>
      </Section>

      <Section title="Tenant owner (console login)">
        <div className="form-field min-w-0 sm:col-span-2">
          <p className="form-label-muted">Owner email</p>
          <p className="mt-1 text-sm font-semibold text-dark">{ownerEmail || '—'}</p>
          <p className="mt-1 text-xs text-slate-500">Email is not changed here; it stays tied to the admin account.</p>
        </div>
        <Field label="Owner name" required>
          <input className="form-input" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} autoComplete="name" />
        </Field>
        <Field label="New password" className="sm:col-span-2 lg:col-span-3">
          <input
            type="password"
            autoComplete="new-password"
            className="form-input max-w-md"
            placeholder="Leave blank to keep current password"
            value={form.ownerPassword}
            onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })}
          />
        </Field>
        <Field label="Confirm new password" className="sm:col-span-2 lg:col-span-3">
          <input
            type="password"
            autoComplete="new-password"
            className="form-input max-w-md"
            placeholder="Re-enter new password"
            value={form.ownerPasswordConfirm}
            onChange={(e) => setForm({ ...form, ownerPasswordConfirm: e.target.value })}
          />
        </Field>
      </Section>
    </form>
  );
}
