import { useCallback, useEffect, useState } from 'react';
import apiClient, { getApiErrorMessage } from '../../api/client';
import SlideOverPanel from '../../components/common/SlideOverPanel';
import { useAuth } from '../../context/AuthContext';

export default function SuperAdminPlansPage() {
  const { admin } = useAuth();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    planCode: '',
    name: '',
    description: '',
    priceInr: 1999,
    durationMonths: 12,
    maxUsers: 30,
    maxBranches: 3,
    trialDays: 0,
    licensePrefix: '',
    isActive: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const { data } = await apiClient.get('/super/plans', { params: { active: activeOnly ? '1' : '0' } });
      let list = data.items || [];
      const qq = q.trim().toLowerCase();
      if (qq) list = list.filter((p) => `${p.name} ${p.planCode}`.toLowerCase().includes(qq));
      setItems(list);
    } catch (e) {
      setListError(getApiErrorMessage(e, 'Failed to load plans.'));
    } finally {
      setLoading(false);
    }
  }, [activeOnly, q]);

  useEffect(() => {
    load();
  }, [load]);

  const openPanel = () => {
    setFormError('');
    setForm({
      planCode: '',
      name: '',
      description: '',
      priceInr: 1999,
      durationMonths: 12,
      maxUsers: 30,
      maxBranches: 3,
      trialDays: 0,
      licensePrefix: '',
      isActive: true,
    });
    setPanelOpen(true);
  };

  const closePanel = () => {
    setFormError('');
    setPanelOpen(false);
  };

  const validatePlan = () => {
    if (!String(form.planCode || '').trim()) return 'Plan code is required.';
    if (!String(form.name || '').trim()) return 'Plan name is required.';
    const price = Number(form.priceInr);
    if (!Number.isFinite(price) || price < 0) return 'Price must be zero or a positive number.';
    const dur = Number(form.durationMonths);
    if (!Number.isFinite(dur) || dur < 1) return 'Duration must be at least 1 month.';
    const mu = Number(form.maxUsers);
    if (!Number.isFinite(mu) || mu < 1) return 'Max users must be at least 1.';
    const mb = Number(form.maxBranches);
    if (!Number.isFinite(mb) || mb < 1) return 'Max branches must be at least 1.';
    const td = Number(form.trialDays);
    if (!Number.isFinite(td) || td < 0) return 'Trial days must be zero or greater.';
    return '';
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const msg = validatePlan();
    if (msg) {
      setFormError(msg);
      return;
    }
    setSaving(true);
    try {
      await apiClient.post('/super/plans', {
        planCode: String(form.planCode).trim().toLowerCase(),
        name: String(form.name).trim(),
        description: String(form.description || '').trim(),
        priceInr: Number(form.priceInr),
        durationMonths: Number(form.durationMonths),
        maxUsers: Number(form.maxUsers),
        maxBranches: Number(form.maxBranches),
        trialDays: Number(form.trialDays),
        licensePrefix: String(form.licensePrefix || '').trim().toUpperCase() || String(form.planCode).trim().toLowerCase(),
        isActive: form.isActive,
      });
      closePanel();
      await load();
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'Could not create plan.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mt-1 text-sm text-slate-600">Define user and branch limits for each tier.</p>
          {admin?.role === 'mainsuperadmin' ? (
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-slate-500">
              Only plans in <span className="font-semibold text-slate-600">your</span> catalog appear here. Companies you provision from this
              account use the same catalog for billing and renewals (other super admins have their own catalogs).
            </p>
          ) : null}
        </div>
        <button type="button" onClick={openPanel} className="btn-primary px-4 py-2.5 text-sm">
          + Create plan
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search plans…"
          className="form-input max-w-full sm:max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="form-checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
          Active only
        </label>
      </div>

      {listError ? <p className="alert-error text-sm">{listError}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <div key={p._id} className="flux-card border border-neutral-200/90 p-5 shadow-panel">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-bold text-dark">{p.name}</h3>
                <span className="rounded-full bg-primary/25 px-2 py-0.5 text-[10px] font-bold text-dark">{p.maxBranches} branches</span>
              </div>
              <p className="mt-2 text-2xl font-black text-dark">
                ₹{p.priceInr}
                <span className="text-sm font-semibold text-slate-500"> /{p.durationMonths} mo</span>
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-dark">{p.maxUsers}</p>
                  <p className="text-[10px] font-semibold uppercase text-slate-500">Users</p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-dark">{p.maxBranches}</p>
                  <p className="text-[10px] font-semibold uppercase text-slate-500">Branches</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">Code: {p.planCode}</p>
            </div>
          ))}
        </div>
      )}

      <SlideOverPanel
        open={panelOpen}
        onClose={closePanel}
        title="Create plan"
        description="Same layout as customer add — required fields are marked."
        widthClass="sm:max-w-2xl"
      >
        <form className="grid gap-5" onSubmit={submit}>
          <div className="form-field">
            <label htmlFor="sa-pl-code" className="form-label-muted">
              Plan code <span className="text-red-600">*</span>
            </label>
            <input
              id="sa-pl-code"
              className="form-input"
              placeholder="starter"
              value={form.planCode}
              onChange={(e) => setForm({ ...form, planCode: e.target.value.toLowerCase() })}
            />
          </div>
          <div className="form-field">
            <label htmlFor="sa-pl-name" className="form-label-muted">
              Plan name <span className="text-red-600">*</span>
            </label>
            <input
              id="sa-pl-name"
              className="form-input"
              placeholder="Starter"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label htmlFor="sa-pl-desc" className="form-label-muted">
              Description
            </label>
            <textarea
              id="sa-pl-desc"
              className="form-textarea"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-field">
              <label htmlFor="sa-pl-price" className="form-label-muted">
                Price (₹) <span className="text-red-600">*</span>
              </label>
              <input
                id="sa-pl-price"
                type="number"
                min={0}
                className="form-input"
                value={form.priceInr}
                onChange={(e) => setForm({ ...form, priceInr: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor="sa-pl-dur" className="form-label-muted">
                Duration (months) <span className="text-red-600">*</span>
              </label>
              <input
                id="sa-pl-dur"
                type="number"
                min={1}
                className="form-input"
                value={form.durationMonths}
                onChange={(e) => setForm({ ...form, durationMonths: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-field">
              <label htmlFor="sa-pl-mu" className="form-label-muted">
                Max users <span className="text-red-600">*</span>
              </label>
              <input
                id="sa-pl-mu"
                type="number"
                min={1}
                className="form-input"
                value={form.maxUsers}
                onChange={(e) => setForm({ ...form, maxUsers: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor="sa-pl-mb" className="form-label-muted">
                Max branches <span className="text-red-600">*</span>
              </label>
              <input
                id="sa-pl-mb"
                type="number"
                min={1}
                className="form-input"
                value={form.maxBranches}
                onChange={(e) => setForm({ ...form, maxBranches: e.target.value })}
              />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="sa-pl-prefix" className="form-label-muted">
              License prefix (e.g. BAS)
            </label>
            <input
              id="sa-pl-prefix"
              className="form-input font-mono uppercase"
              maxLength={4}
              placeholder="Auto from plan code if empty"
              value={form.licensePrefix}
              onChange={(e) => setForm({ ...form, licensePrefix: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="form-field">
            <label htmlFor="sa-pl-trial" className="form-label-muted">
              Trial days
            </label>
            <input
              id="sa-pl-trial"
              type="number"
              min={0}
              className="form-input"
              value={form.trialDays}
              onChange={(e) => setForm({ ...form, trialDays: e.target.value })}
            />
          </div>
          <div className="rounded-xl border border-neutral-200 bg-flux-panel p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Visibility</p>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="form-checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Plan is active
            </label>
          </div>

          {formError ? <p className="alert-error">{formError}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={closePanel} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? 'Saving…' : 'Create plan'}
            </button>
          </div>
        </form>
      </SlideOverPanel>
    </div>
  );
}
