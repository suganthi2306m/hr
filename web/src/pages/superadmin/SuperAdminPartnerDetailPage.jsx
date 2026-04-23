import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import { CompanyPageHeader, ReadField, Section } from './superAdminCompanyUi';

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function fmtShortDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-neutral-200/90 bg-gradient-to-br from-white to-amber-50/40 p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-dark">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function StatusPill({ active }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-bold',
        active ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-800',
      )}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export default function SuperAdminPartnerDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: body } = await apiClient.get(`/super/partners/superadmins/${id}/portfolio`);
      setData(body);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load this partner super admin.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="mx-auto flex max-w-6xl items-center justify-center py-24">
        <p className="text-sm font-medium text-slate-500">Loading partner profile…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <CompanyPageHeader backTo="/super/super-admins" title="Partner super admin" subtitle="This profile could not be loaded." />
        <p className="alert-error text-sm">{error}</p>
        <Link to="/super/super-admins" className="text-sm font-semibold text-primary hover:underline">
          Back to Super Admins
        </Link>
      </div>
    );
  }

  const sa = data?.superAdmin;
  const summary = data?.summary || {};
  const companies = data?.companies || [];
  const licenses = data?.licenses || [];

  const initials = String(sa?.name || 'SA')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      <CompanyPageHeader
        backTo="/super/super-admins"
        title={sa?.name || 'Partner super admin'}
        subtitle={sa?.email || ''}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill active={sa?.isActive !== false} />
            <Link to="/super/super-admins" className="btn-secondary text-sm">
              Back to list
            </Link>
          </div>
        }
      />

      {error ? <p className="alert-error text-sm">{error}</p> : null}

      <div className="overflow-hidden rounded-3xl border border-neutral-200/90 bg-white shadow-panel">
        <div className="flex flex-col gap-6 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-8 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-black text-dark shadow-lg">
              {initials}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-200/90">Partner super admin</p>
              <h3 className="mt-0.5 text-2xl font-black tracking-tight">{sa?.name}</h3>
              <p className="mt-1 text-sm text-slate-300">{sa?.email}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                <span className="rounded-lg bg-white/10 px-2 py-1 font-mono">ID {sa?._id}</span>
                <span className="rounded-lg bg-white/10 px-2 py-1">Role {sa?.role || 'superadmin'}</span>
              </div>
            </div>
          </div>
          <div className="grid w-full max-w-md grid-cols-2 gap-3 sm:w-auto">
            <StatCard label="Companies" value={summary.companies ?? 0} />
            <StatCard label="Licenses issued" value={summary.licensesIssued ?? 0} />
            <StatCard label="Users (total)" value={summary.totalUsers ?? 0} hint="Across all their companies" />
            <StatCard label="Branches (total)" value={summary.totalBranches ?? 0} hint="Head office + locations" />
          </div>
        </div>
      </div>

      <Section title="Account & limits">
        <ReadField label="Display name" value={sa?.name} />
        <ReadField label="Email" value={sa?.email} />
        <ReadField label="Account status" value={sa?.isActive === false ? 'Inactive (cannot sign in)' : 'Active'} />
        <ReadField label="Max companies" value={sa?.maxCompanies == null ? 'Unlimited' : String(sa.maxCompanies)} />
        <ReadField label="Max licenses" value={sa?.maxLicenses == null ? 'Unlimited' : String(sa.maxLicenses)} />
        <ReadField label="Company setup flag" value={sa?.companySetupCompleted ? 'Yes' : 'No'} />
        <ReadField label="Created" value={fmtDate(sa?.createdAt)} />
        <ReadField label="Last updated" value={fmtDate(sa?.updatedAt)} />
        <ReadField
          label="Provisioned by (main super admin id)"
          value={sa?.createdByMainSuperAdminId ? String(sa.createdByMainSuperAdminId) : '—'}
          mono
          className="sm:col-span-2 lg:col-span-3"
        />
      </Section>

      <div>
        <h3 className="mb-3 border-b border-neutral-100 pb-2 text-sm font-bold uppercase tracking-wide text-primary">Companies they created</h3>
        {companies.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-200 bg-white/80 px-4 py-8 text-center text-sm text-slate-500">No companies yet.</p>
        ) : (
          <div className="space-y-4">
            {companies.map((c) => (
              <div key={c._id} className="rounded-2xl border border-neutral-200/90 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 pb-4">
                  <div>
                    <Link to={`/super/companies/${c._id}`} className="text-lg font-black text-dark hover:text-primary">
                      {c.name}
                    </Link>
                    <p className="mt-0.5 text-sm text-slate-600">{c.email}</p>
                    <p className="mt-1 text-xs text-slate-500">{[c.city, c.state].filter(Boolean).join(', ') || c.address || '—'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{c.userCount ?? 0} users</span>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-950">{c.branchCount ?? 0} branches</span>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <ReadField label="Phone" value={c.phone} />
                  <ReadField label="Tenant owner" value={c.tenantOwner ? `${c.tenantOwner.name} · ${c.tenantOwner.email}` : '—'} />
                  <ReadField label="Subscription active" value={c.subscription?.isActive === false ? 'No' : 'Yes'} />
                  <ReadField label="Plan" value={c.subscription?.planName} />
                  <ReadField label="Plan code" value={c.subscription?.planCode} mono />
                  <ReadField label="License key" value={c.license?.licenseKey || c.subscription?.licenseKey} mono accent />
                  <ReadField label="License status" value={c.license ? `${c.license.derivedStatus || c.license.status}` : '—'} />
                  <ReadField label="Valid until (license)" value={fmtShortDate(c.license?.validUntil)} />
                  <ReadField label="Subscription expires" value={fmtShortDate(c.subscription?.expiresAt)} />
                  <ReadField label="Max users (subscription)" value={c.subscription?.maxUsers != null ? String(c.subscription.maxUsers) : '—'} />
                  <ReadField label="Max branches (subscription)" value={c.subscription?.maxBranches != null ? String(c.subscription.maxBranches) : '—'} />
                  <ReadField label="Company updated" value={fmtDate(c.updatedAt)} className="sm:col-span-2" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Section title="All licenses created by this partner">
        {licenses.length === 0 ? (
          <p className="col-span-full text-center text-sm text-slate-500">No licenses yet.</p>
        ) : (
          <div className="col-span-full overflow-x-auto rounded-xl border border-neutral-200">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/90">
                  <th className="px-3 py-2.5 font-bold text-dark">License key</th>
                  <th className="px-3 py-2.5 font-bold text-dark">Status</th>
                  <th className="px-3 py-2.5 font-bold text-dark">Plan</th>
                  <th className="px-3 py-2.5 font-bold text-dark">Assigned company</th>
                  <th className="px-3 py-2.5 font-bold text-dark">Valid until</th>
                  <th className="px-3 py-2.5 font-bold text-dark">Caps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {licenses.map((L) => (
                  <tr key={L._id} className="bg-white hover:bg-amber-50/30">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-dark">{L.licenseKey}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-dark">{L.derivedStatus || L.status}</span>
                      {L.status !== L.derivedStatus ? <span className="text-xs text-slate-500"> ({L.status})</span> : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <div className="font-medium">{L.planName || '—'}</div>
                      <div className="text-slate-500">{L.planCode || ''}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {L.companyId ? (
                        <Link to={`/super/companies/${String(L.companyId)}`} className="font-semibold text-primary hover:underline">
                          {L.companyName || 'Open company'}
                        </Link>
                      ) : (
                        <span className="text-slate-500">Unassigned</span>
                      )}
                      {L.companyEmail ? <div className="text-slate-500">{L.companyEmail}</div> : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs">{fmtShortDate(L.validUntil)}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {L.maxUsers} users · {L.maxBranches} branches
                      {L.isTrial ? <span className="ml-1 font-semibold text-amber-700">Trial</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
