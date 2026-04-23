import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import { CompanyPageHeader, ReadField, Section } from './superAdminCompanyUi';

const DETAIL_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'plan', label: 'Plan & license' },
  { id: 'people', label: 'People' },
];

function fmtDate(iso) {
  if (iso == null || iso === '') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtMoneyInr(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return `₹${x.toLocaleString('en-IN')}`;
}

function PencilIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export default function SuperAdminCompanyDetailPage() {
  const { id } = useParams();
  const [tab, setTab] = useState('overview');
  const [company, setCompany] = useState(null);
  const [planRecord, setPlanRecord] = useState(null);
  const [licenseRecord, setLicenseRecord] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/super/companies/${id}`);
      setCompany(data.company);
      setPlanRecord(data.planRecord || null);
      setLicenseRecord(data.licenseRecord || null);
      setError('');
    } catch (e) {
      setError(e.response?.data?.message || 'Company not found.');
      setCompany(null);
      setPlanRecord(null);
      setLicenseRecord(null);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async () => {
    if (!company) return;
    setBusy(true);
    try {
      await apiClient.patch(`/super/companies/${id}`, {
        subscriptionIsActive: !(company.subscription?.isActive !== false),
      });
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Update failed.');
    } finally {
      setBusy(false);
    }
  };

  if (error && !company) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <CompanyPageHeader backTo="/super/companies" title="Company" subtitle="Could not load this company." />
        <p className="alert-error text-sm">{error}</p>
        <Link to="/super/companies" className="text-sm font-semibold text-primary hover:underline">
          Back to companies
        </Link>
      </div>
    );
  }

  if (!company) return <p className="text-sm text-slate-600">Loading…</p>;

  const sub = company.subscription || {};
  const active = sub.isActive !== false;
  const maxU = sub.maxUsers;
  const maxB = sub.maxBranches;
  const planAtIssue = licenseRecord?.planId && typeof licenseRecord.planId === 'object' ? licenseRecord.planId : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      <CompanyPageHeader
        backTo="/super/companies"
        title={company.name || 'Company'}
        subtitle="Use the tabs below to review profile, billing, plan metadata, and contacts."
        actions={
          <Link to={`/super/companies/${id}/edit`} className="btn-primary inline-flex items-center gap-2 text-sm">
            <PencilIcon />
            Edit company
          </Link>
        }
      />

      {error ? <p className="alert-error text-sm">{error}</p> : null}

      <div className="flex flex-wrap gap-1 border-b border-neutral-200 pb-0.5">
        {DETAIL_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={clsx(
              'rounded-t-lg px-4 py-2 text-sm font-bold transition',
              tab === t.id ? 'border-b-2 border-primary text-primary' : 'text-slate-500 hover:text-dark',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <Section title="Company profile">
          <ReadField label="Company name" value={company.name} />
          <ReadField label="Company email" value={company.email} />
          <ReadField label="Phone" value={company.phone} />
          <ReadField label="City" value={company.city} />
          <ReadField label="State / region" value={company.state} />
          <ReadField label="Street address" value={company.address} className="sm:col-span-2 lg:col-span-3" />
        </Section>
      )}

      {tab === 'subscription' && (
        <Section title="Subscription">
          <ReadField label="Plan (on company)" value={sub.planName} />
          <ReadField label="Plan code" value={sub.planCode} mono />
          <ReadField label="License key" value={sub.licenseKey} mono accent />
          <ReadField label="Expires" value={fmtDate(sub.expiresAt)} />
          <ReadField label="Renewal details" value={sub.renewalDetails} className="sm:col-span-2 lg:col-span-3" />
          <ReadField label="Last renewed" value={fmtDate(sub.lastRenewedAt)} />
          <div className="form-field min-w-0 sm:col-span-2 lg:col-span-3">
            <p className="form-label-muted">Subscription status</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span
                className={clsx(
                  'rounded-full px-3 py-1 text-xs font-semibold',
                  active ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-700',
                )}
              >
                {active ? 'Active' : 'Inactive'}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={toggleActive}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                {busy ? 'Updating…' : active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </Section>
      )}

      {tab === 'plan' && (
        <>
          <Section title="Subscription plan (catalog)">
            <p className="col-span-full text-xs text-slate-500">
              Master plan definition in the platform catalog — created / updated timestamps show when this plan version
              was defined.
            </p>
            {planRecord ? (
              <>
                <ReadField label="Plan name" value={planRecord.name} />
                <ReadField label="Plan code" value={planRecord.planCode} mono accent />
                <ReadField label="Description" value={planRecord.description} className="sm:col-span-2 lg:col-span-3" />
                <ReadField label="Price (INR)" value={fmtMoneyInr(planRecord.priceInr)} />
                <ReadField label="Billing period (months)" value={String(planRecord.durationMonths ?? '')} />
                <ReadField label="Max users" value={String(planRecord.maxUsers ?? '')} />
                <ReadField label="Max branches" value={String(planRecord.maxBranches ?? '')} />
                <ReadField label="Trial days" value={String(planRecord.trialDays ?? '')} />
                <ReadField label="License prefix" value={planRecord.licensePrefix} mono />
                <ReadField label="Plan active" value={planRecord.isActive !== false ? 'Yes' : 'No'} />
                <ReadField label="Plan created" value={fmtDate(planRecord.createdAt)} />
                <ReadField label="Plan last updated" value={fmtDate(planRecord.updatedAt)} />
              </>
            ) : (
              <p className="col-span-full text-sm text-slate-500">No linked subscription plan on this company record.</p>
            )}
          </Section>

          <Section title="License issued to this company">
            <p className="col-span-full text-xs text-slate-500">
              Snapshot taken when the license was issued; embedded plan shows definitions at issuance time.
            </p>
            {licenseRecord ? (
              <>
                <ReadField label="License key" value={licenseRecord.licenseKey} mono accent />
                <ReadField label="Status" value={licenseRecord.status} />
                <ReadField label="Valid until" value={fmtDate(licenseRecord.validUntil)} />
                <ReadField label="Trial license" value={licenseRecord.isTrial ? 'Yes' : 'No'} />
                <ReadField label="Notes" value={licenseRecord.notes} className="sm:col-span-2 lg:col-span-3" />
                <ReadField label="License created" value={fmtDate(licenseRecord.createdAt)} />
                <ReadField label="License last updated" value={fmtDate(licenseRecord.updatedAt)} />
                <ReadField label="Plan name (on license)" value={licenseRecord.planName} />
                <ReadField label="Plan code (on license)" value={licenseRecord.planCode} mono />
                <ReadField label="Max users (on license)" value={String(licenseRecord.maxUsers ?? '')} />
                <ReadField label="Max branches (on license)" value={String(licenseRecord.maxBranches ?? '')} />
                <ReadField
                  label="Issued by"
                  value={
                    licenseRecord.createdByAdminId?.name
                      ? `${licenseRecord.createdByAdminId.name} (${licenseRecord.createdByAdminId.email || '—'})`
                      : ''
                  }
                  className="sm:col-span-2 lg:col-span-3"
                />
              </>
            ) : (
              <p className="col-span-full text-sm text-slate-500">No license document found for this company.</p>
            )}
          </Section>

          {planAtIssue ? (
            <Section title="Plan record at license (reference)">
              <ReadField label="Name" value={planAtIssue.name} />
              <ReadField label="Code" value={planAtIssue.planCode} mono accent />
              <ReadField label="Price (INR)" value={fmtMoneyInr(planAtIssue.priceInr)} />
              <ReadField label="Duration (months)" value={String(planAtIssue.durationMonths ?? '')} />
              <ReadField label="Plan created" value={fmtDate(planAtIssue.createdAt)} />
            </Section>
          ) : null}
        </>
      )}

      {tab === 'people' && (
        <>
          <Section title="Usage">
            <ReadField
              label="Staff"
              value={maxU != null ? `${company.staffCount} / ${maxU}` : String(company.staffCount ?? 0)}
            />
            <ReadField
              label="Branches"
              value={maxB != null ? `${company.branchCount} / ${maxB}` : String(company.branchCount ?? 0)}
            />
          </Section>

          <Section title="Tenant owner (console login)">
            <ReadField label="Name" value={company.adminId?.name} />
            <ReadField label="Email" value={company.adminId?.email} className="sm:col-span-2" />
          </Section>

          <Section title="Created by">
            <ReadField label="Super admin name" value={company.createdBy?.name || company.createdBySuperAdminId?.name} />
            <ReadField
              label="Super admin email"
              value={company.createdBy?.email || company.createdBySuperAdminId?.email}
              className="sm:col-span-2"
            />
            <ReadField label="Role" value={company.createdBy?.role || company.createdBySuperAdminId?.role} />
          </Section>
        </>
      )}
    </div>
  );
}
