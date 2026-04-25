import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import apiClient from '../../api/client';
import SuperAdminModal from '../../components/superadmin/SuperAdminModal';
import SlideOverPanel from '../../components/common/SlideOverPanel';

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function findPlan(plans, planId) {
  return (plans || []).find((p) => String(p._id) === String(planId || '')) || null;
}

/** End-of-day style default for paid licenses: today + durationMonths (calendar months). */
function paidDefaultValidUntilYmd(plan) {
  const months = Math.max(1, Number(plan?.durationMonths) || 12);
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function PencilIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export default function SuperAdminLicensesPage() {
  const [items, setItems] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [inspectId, setInspectId] = useState(null);
  const [inspectMode, setInspectMode] = useState('view');
  const [licenseDetail, setLicenseDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createFormError, setCreateFormError] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);
  const [createForm, setCreateForm] = useState({
    planId: '',
    maxUsers: 25,
    maxBranches: 1,
    isTrial: false,
    notes: '',
  });
  const [editForm, setEditForm] = useState({
    planId: '',
    maxUsers: 1,
    maxBranches: 1,
    validUntil: '',
    notes: '',
    isTrial: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lRes, pRes] = await Promise.all([
        apiClient.get('/super/licenses', { params: { q, status } }),
        apiClient.get('/super/plans'),
      ]);
      setItems(lRes.data.items || []);
      setPlans(pRes.data.items || []);
      setCreateForm((f) =>
        f.planId || !(pRes.data.items || []).length ? f : { ...f, planId: String(pRes.data.items[0]._id) },
      );
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load licenses.');
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const p = findPlan(plans, createForm.planId);
    if (!p || Number(p.trialDays) > 0) return;
    setCreateForm((f) => (f.isTrial ? { ...f, isTrial: false } : f));
  }, [createForm.planId, plans]);

  useEffect(() => {
    if (!inspectId) {
      setLicenseDetail(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setLicenseDetail(null);
      try {
        const { data } = await apiClient.get(`/super/licenses/${inspectId}`);
        if (!cancelled) {
          setLicenseDetail(data.item);
          const lic = data.item;
          setEditForm({
            planId: lic.planId?._id ? String(lic.planId._id) : String(lic.planId || ''),
            maxUsers: lic.maxUsers,
            maxBranches: lic.maxBranches,
            validUntil: lic.validUntil ? String(lic.validUntil).slice(0, 10) : '',
            notes: lic.notes || '',
            isTrial: Boolean(lic.isTrial),
          });
        }
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.message || 'Could not load license.');
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inspectId]);

  useEffect(() => {
    if (!copiedKey) return undefined;
    const t = window.setTimeout(() => setCopiedKey(null), 2000);
    return () => window.clearTimeout(t);
  }, [copiedKey]);

  const handleCopy = async (key, idForFeedback = key) => {
    const ok = await copyToClipboard(key);
    if (ok) setCopiedKey(idForFeedback);
  };

  const validateCreateLicense = () => {
    if (!plans.length) return 'Create a subscription plan first.';
    if (!String(createForm.planId || '').trim()) return 'Select a subscription plan.';
    const mu = Number(createForm.maxUsers);
    if (!Number.isFinite(mu) || mu < 1) return 'Max users must be at least 1.';
    const mb = Number(createForm.maxBranches);
    if (!Number.isFinite(mb) || mb < 1) return 'Max branches must be at least 1.';
    if (createForm.isTrial) {
      const p = findPlan(plans, createForm.planId);
      if (!p || !(Number(p.trialDays) > 0)) return 'This plan does not support trial.';
    }
    return '';
  };

  const createLicense = async (e) => {
    e.preventDefault();
    setCreateFormError('');
    const msg = validateCreateLicense();
    if (msg) {
      setCreateFormError(msg);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/super/licenses', {
        planId: createForm.planId,
        maxUsers: Number(createForm.maxUsers),
        maxBranches: Number(createForm.maxBranches),
        isTrial: createForm.isTrial,
        notes: createForm.notes,
      });
      setCreateOpen(false);
      await load();
    } catch (err) {
      const m = err.response?.data?.message || 'Could not create license.';
      setCreateFormError(typeof m === 'string' ? m : 'Could not create license.');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!inspectId) return;
    setSaving(true);
    setError('');
    try {
      const patch = {
        planId: editForm.planId,
        maxUsers: Number(editForm.maxUsers),
        maxBranches: Number(editForm.maxBranches),
        notes: editForm.notes,
        isTrial: editForm.isTrial,
      };
      if (!editForm.isTrial) {
        patch.validUntil = editForm.validUntil || undefined;
      }
      await apiClient.patch(`/super/licenses/${inspectId}`, patch);
      setInspectMode('view');
      const { data } = await apiClient.get(`/super/licenses/${inspectId}`);
      setLicenseDetail(data.item);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save license.');
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (licId) => {
    if (!window.confirm('Revoke this license?')) return;
    try {
      await apiClient.patch(`/super/licenses/${licId}`, { action: 'revoke' });
      setInspectId(null);
      setLicenseDetail(null);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Revoke failed.');
    }
  };

  const closeInspect = () => {
    setInspectId(null);
    setLicenseDetail(null);
    setInspectMode('view');
  };

  const lic = licenseDetail;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mt-1 text-sm text-slate-600">Create and manage license keys.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateFormError('');
            setCreateOpen(true);
          }}
          className="btn-primary px-4 py-2.5 text-sm"
        >
          + Create license
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex flex-wrap gap-1 rounded-full border border-neutral-200 bg-white p-0.5 shadow-sm">
          {['all', 'active', 'unassigned', 'expired', 'suspended'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={clsx(
                'rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition',
                status === s ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-neutral-50',
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Search by license key or company…"
          className="form-input w-full lg:max-w-sm"
        />
      </div>

      {error && !createOpen && !inspectId ? <p className="alert-error text-sm">{error}</p> : null}

      <div className="flux-card overflow-x-auto shadow-panel">
        <table className="w-full min-w-[900px] text-left text-sm text-dark">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50/80">
              <th className="px-4 py-3">License key</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Max users</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Valid until</th>
              <th className="px-4 py-3">Trial</th>
              <th className="w-[1%] whitespace-nowrap px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No licenses.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr
                  key={row._id}
                  className="cursor-pointer hover:bg-neutral-50/80"
                  onClick={() => {
                    setError('');
                    setInspectMode('view');
                    setInspectId(String(row._id));
                  }}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setError('');
                      setInspectMode('view');
                      setInspectId(String(row._id));
                    }
                  }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-mono text-xs text-dark">
                      <span className="text-primary">{row.licenseKey}</span>
                      <button
                        type="button"
                        className={clsx(
                          'rounded-lg border px-2 py-1 text-[10px] font-semibold transition',
                          copiedKey === row.licenseKey
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : 'border-neutral-200 bg-white text-dark hover:border-primary/40',
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleCopy(row.licenseKey, row.licenseKey);
                        }}
                      >
                        {copiedKey === row.licenseKey ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.companyId?.name || row.companyName || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{row.planName || row.planId?.name || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{row.maxUsers}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold capitalize text-emerald-900">
                      {row.derivedStatus || row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.validUntil ? String(row.validUntil).slice(0, 10) : '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{row.isTrial ? 'Yes' : '—'}</td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="text-sm font-semibold text-primary hover:underline"
                        onClick={() => {
                          setError('');
                          setInspectMode('view');
                          setInspectId(String(row._id));
                        }}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-lg border border-neutral-200 bg-white p-2 text-dark shadow-sm hover:border-primary/40 hover:bg-primary/10"
                        title="Edit license"
                        aria-label="Edit license"
                        onClick={() => {
                          setError('');
                          setInspectMode('edit');
                          setInspectId(String(row._id));
                        }}
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className="text-sm font-semibold text-red-700 hover:underline"
                        onClick={() => revoke(row._id)}
                      >
                        Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <SlideOverPanel
        open={createOpen}
        onClose={() => {
          setCreateFormError('');
          setCreateOpen(false);
        }}
        title="Create license"
        description="Unassigned keys can be linked when you add a company."
        widthClass="sm:max-w-xl"
      >
        <form className="grid gap-5" onSubmit={createLicense}>
          <div className="form-field">
            <label htmlFor="sa-lic-plan" className="form-label-muted">
              Subscription plan <span className="text-red-600">*</span>
            </label>
            <select
              id="sa-lic-plan"
              className="form-select"
              value={createForm.planId}
              onChange={(e) => setCreateForm({ ...createForm, planId: e.target.value })}
              disabled={!plans.length}
            >
              {plans.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} — ₹{p.priceInr} / {p.durationMonths || 12} mo
                  {Number(p.trialDays) > 0 ? ` · trial ${p.trialDays}d` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-field">
              <label htmlFor="sa-lic-max-u" className="form-label-muted">
                Max users <span className="text-red-600">*</span>
              </label>
              <input
                id="sa-lic-max-u"
                type="number"
                min={1}
                className="form-input"
                value={createForm.maxUsers}
                onChange={(e) => setCreateForm({ ...createForm, maxUsers: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor="sa-lic-max-b" className="form-label-muted">
                Max branches <span className="text-red-600">*</span>
              </label>
              <input
                id="sa-lic-max-b"
                type="number"
                min={1}
                className="form-input"
                value={createForm.maxBranches}
                onChange={(e) => setCreateForm({ ...createForm, maxBranches: e.target.value })}
              />
            </div>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-flux-panel p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Options</p>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="form-checkbox"
                checked={createForm.isTrial}
                disabled={(() => {
                  const p = findPlan(plans, createForm.planId);
                  return !p || !(Number(p.trialDays) > 0);
                })()}
                onChange={(e) => setCreateForm({ ...createForm, isTrial: e.target.checked })}
              />
              Trial license
            </label>
            {(() => {
              const p = findPlan(plans, createForm.planId);
              if (!p) return null;
              if (createForm.isTrial && Number(p.trialDays) > 0) {
                return (
                  <p className="mt-2 text-xs text-slate-600">
                    This license will be valid for <span className="font-semibold text-dark">{p.trialDays}</span> days based on the
                    plan trial. Valid until is set automatically and cannot be edited for trials.
                  </p>
                );
              }
              if (!createForm.isTrial) {
                return (
                  <p className="mt-2 text-xs text-slate-600">
                    Paid term defaults to <span className="font-semibold text-dark">{p.durationMonths || 12}</span> month(s) from
                    today (plan duration). You can adjust validity when editing an assigned license if your process allows it.
                  </p>
                );
              }
              return (
                <p className="mt-2 text-xs text-amber-800">This plan has no trial days — trial is not available.</p>
              );
            })()}
          </div>
          <div className="form-field">
            <label htmlFor="sa-lic-notes" className="form-label-muted">
              Notes
            </label>
            <textarea
              id="sa-lic-notes"
              rows={3}
              className="form-textarea"
              placeholder="Optional internal notes…"
              value={createForm.notes}
              onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
            />
          </div>

          {createFormError ? <p className="alert-error">{createFormError}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => {
                setCreateFormError('');
                setCreateOpen(false);
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving || !plans.length} className="btn-primary disabled:opacity-50">
              {saving ? 'Saving…' : 'Generate license'}
            </button>
          </div>
        </form>
      </SlideOverPanel>

      <SuperAdminModal
        open={Boolean(inspectId)}
        title={inspectMode === 'edit' ? 'Edit license' : 'License details'}
        onClose={closeInspect}
        wide
      >
        {detailLoading ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : inspectMode === 'view' && lic ? (
          <div className="space-y-4">
            {error ? <p className="alert-error text-sm">{error}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="break-all font-mono text-lg font-bold text-primary">{lic.licenseKey}</span>
                <button
                  type="button"
                  className={clsx(
                    'shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
                    copiedKey === lic.licenseKey
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'btn-secondary',
                  )}
                  onClick={() => void handleCopy(lic.licenseKey, lic.licenseKey)}
                >
                  {copiedKey === lic.licenseKey ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: 'Company', value: lic.companyId?.name || '—' },
                { label: 'Plan', value: lic.planName || lic.planId?.name || '—' },
                { label: 'Max users', value: lic.maxUsers },
                { label: 'Max branches', value: lic.maxBranches },
                { label: 'Status', value: lic.derivedStatus || lic.status, highlight: true },
                {
                  label: 'Valid from',
                  value: lic.validFrom
                    ? String(lic.validFrom).slice(0, 10)
                    : lic.createdAt
                      ? String(lic.createdAt).slice(0, 10)
                      : '—',
                },
                { label: 'Valid until', value: lic.validUntil ? String(lic.validUntil).slice(0, 10) : '—' },
                { label: 'Trial', value: lic.isTrial ? 'Yes' : 'No' },
              ].map((cell) => (
                <div key={cell.label} className="rounded-xl border border-neutral-200 bg-neutral-50/80 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{cell.label}</p>
                  <p
                    className={clsx(
                      'mt-0.5 text-sm font-semibold text-dark',
                      cell.highlight && String(cell.value).toLowerCase() === 'active' && 'text-emerald-700',
                    )}
                  >
                    {cell.value}
                  </p>
                </div>
              ))}
            </div>
            {lic.notes ? (
              <div>
                <p className="form-label !mb-1">Notes</p>
                <p className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-slate-700">{lic.notes}</p>
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 pt-4">
              <button type="button" className="btn-secondary" onClick={() => setInspectMode('edit')}>
                Edit
              </button>
              <button type="button" className="text-sm font-semibold text-red-700 hover:underline" onClick={() => revoke(lic._id)}>
                Revoke
              </button>
              <button type="button" className="btn-primary" onClick={closeInspect}>
                Close
              </button>
            </div>
          </div>
        ) : inspectMode === 'edit' && lic ? (
          <form className="form-stack !space-y-4" onSubmit={saveEdit}>
            {error ? <p className="alert-error text-sm">{error}</p> : null}
            <div className="form-field">
              <label className="form-label">License key</label>
              <p className="font-mono text-sm font-semibold text-primary">{lic.licenseKey}</p>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="edit-lic-plan">
                Plan
              </label>
              <select
                id="edit-lic-plan"
                className="form-select"
                value={editForm.planId}
                onChange={(e) => {
                  const pid = e.target.value;
                  setEditForm((f) => {
                    const plan = findPlan(plans, pid);
                    const next = { ...f, planId: pid };
                    if (!f.isTrial && plan) next.validUntil = paidDefaultValidUntilYmd(plan);
                    if (f.isTrial && plan && !(Number(plan.trialDays) > 0)) {
                      next.isTrial = false;
                      next.validUntil = paidDefaultValidUntilYmd(plan);
                    }
                    return next;
                  });
                }}
              >
                {plans.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="form-field">
                <label className="form-label" htmlFor="edit-lic-mu">
                  Max users
                </label>
                <input
                  id="edit-lic-mu"
                  type="number"
                  min={1}
                  className="form-input"
                  value={editForm.maxUsers}
                  onChange={(e) => setEditForm({ ...editForm, maxUsers: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="edit-lic-mb">
                  Max branches
                </label>
                <input
                  id="edit-lic-mb"
                  type="number"
                  min={1}
                  className="form-input"
                  value={editForm.maxBranches}
                  onChange={(e) => setEditForm({ ...editForm, maxBranches: e.target.value })}
                />
              </div>
            </div>
            {editForm.isTrial ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-3 text-sm text-amber-950">
                {(() => {
                  const p = findPlan(plans, editForm.planId);
                  const d = p && Number(p.trialDays) > 0 ? p.trialDays : null;
                  return d ? (
                    <p>
                      Trial validity is fixed from the plan: <span className="font-semibold">{d} days</span> from the license start.
                      Valid until cannot be edited for trial licenses.
                    </p>
                  ) : (
                    <p>This plan does not define trial days; turn off trial or pick another plan.</p>
                  );
                })()}
              </div>
            ) : (
              <div className="form-field">
                <label className="form-label" htmlFor="edit-lic-until">
                  Valid until
                </label>
                <input
                  id="edit-lic-until"
                  type="date"
                  className="form-input"
                  value={editForm.validUntil}
                  onChange={(e) => setEditForm({ ...editForm, validUntil: e.target.value })}
                />
                <p className="mt-1 text-xs text-slate-500">Defaults to full plan duration; adjust only if your policy allows.</p>
              </div>
            )}
            <div className="form-field">
              <label className="form-label" htmlFor="edit-lic-notes">
                Notes
              </label>
              <textarea
                id="edit-lic-notes"
                rows={2}
                className="form-textarea"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="form-checkbox"
                checked={editForm.isTrial}
                disabled={(() => {
                  const p = findPlan(plans, editForm.planId);
                  return !p || !(Number(p.trialDays) > 0);
                })()}
                onChange={(e) => {
                  const trial = e.target.checked;
                  setEditForm((f) => {
                    if (trial) return { ...f, isTrial: true };
                    const plan = findPlan(plans, f.planId);
                    return { ...f, isTrial: false, validUntil: plan ? paidDefaultValidUntilYmd(plan) : f.validUntil };
                  });
                }}
              />
              Trial license
            </label>
            <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4">
              <button type="button" className="btn-secondary" onClick={() => setInspectMode('view')}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-600">No data.</p>
        )}
      </SuperAdminModal>
    </div>
  );
}
