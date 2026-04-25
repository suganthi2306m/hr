import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import apiClient from '../../api/client';
import SlideOverPanel from '../../components/common/SlideOverPanel';
import { CompanyPageHeader, ReadField, Section } from './superAdminCompanyUi';

const PORTFOLIO_TABS = [
  { id: 'companies', label: 'Companies' },
  { id: 'licenses', label: 'Licenses' },
  { id: 'plans', label: 'Plans' },
  { id: 'products', label: 'Products' },
];

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

function fmtMoneyInr(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `₹${Number(n).toLocaleString('en-IN')}`;
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

function tabButtonClass(active) {
  return clsx(
    'rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wide transition sm:text-sm',
    active
      ? 'border-primary bg-primary text-dark shadow-sm'
      : 'border-neutral-200 bg-white text-slate-600 hover:border-neutral-300',
  );
}

function tableShell(children) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}

export default function SuperAdminPartnerDetailPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const tabParam = String(searchParams.get('tab') || '').trim().toLowerCase();
  const activeTab = PORTFOLIO_TABS.some((t) => t.id === tabParam) ? tabParam : 'companies';

  const setActiveTab = useCallback(
    (nextId) => {
      const next = new URLSearchParams(searchParams);
      next.set('tab', nextId);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const [companyPanel, setCompanyPanel] = useState(null);
  const [licensePanel, setLicensePanel] = useState(null);
  const [productPanel, setProductPanel] = useState(null);

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

  const sa = data?.superAdmin;
  const summary = data?.summary || {};
  const companies = data?.companies || [];
  const licenses = data?.licenses || [];
  const plans = data?.plans || [];
  const products = data?.products || [];

  const initials = useMemo(
    () =>
      String(sa?.name || 'SA')
        .split(/\s+/)
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    [sa?.name],
  );

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

      <Section title="Public company & contact (tenant Our products)">
        <ReadField label="Company name" value={sa?.superAdminOrgProfile?.companyName} />
        <ReadField label="Company email" value={sa?.superAdminOrgProfile?.companyEmail} />
        <ReadField label="Phone no." value={sa?.superAdminOrgProfile?.companyPhone} />
        <ReadField
          label="Company website"
          value={sa?.superAdminOrgProfile?.companyWebsiteUrl}
          linkExternal
          className="sm:col-span-2"
        />
        <ReadField label="Support email" value={sa?.superAdminOrgProfile?.supportEmail} />
        <ReadField label="Contact person" value={sa?.superAdminOrgProfile?.contactPersonName} />
        <ReadField label="Alternative contact no." value={sa?.superAdminOrgProfile?.altPhone} />
        <ReadField label="Description" value={sa?.superAdminOrgProfile?.description} className="sm:col-span-2" />
        <ReadField label="Address" value={sa?.superAdminOrgProfile?.address} className="sm:col-span-2 lg:col-span-3" />
      </Section>

      <div className="rounded-2xl border border-neutral-200/90 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="mb-3 border-b border-neutral-100 pb-2 text-sm font-bold uppercase tracking-wide text-primary">
          Portfolio
        </h3>
        <div className="mb-4 flex flex-wrap gap-2">
          {PORTFOLIO_TABS.map((t) => (
            <button key={t.id} type="button" className={tabButtonClass(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'companies' ? (
          companies.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-slate-500">No companies yet.</p>
          ) : (
            tableShell(
              <>
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50/90 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3">Company</th>
                    <th className="px-3 py-3">Location</th>
                    <th className="px-3 py-3">Users</th>
                    <th className="px-3 py-3">Branches</th>
                    <th className="px-3 py-3">Plan</th>
                    <th className="px-3 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {companies.map((c) => (
                    <tr
                      key={c._id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setCompanyPanel(c)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setCompanyPanel(c);
                        }
                      }}
                      className="cursor-pointer bg-white transition hover:bg-amber-50/40"
                    >
                      <td className="px-3 py-3">
                        <p className="font-bold text-dark">{c.name}</p>
                        <p className="text-xs text-slate-500">{c.email}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                      <td className="px-3 py-3 tabular-nums text-sm font-semibold">{c.userCount ?? 0}</td>
                      <td className="px-3 py-3 tabular-nums text-sm font-semibold">{c.branchCount ?? 0}</td>
                      <td className="px-3 py-3 text-xs">
                        <span className="font-medium text-dark">{c.subscription?.planName || c.license?.planName || '—'}</span>
                        {c.subscription?.planCode || c.license?.planCode ? (
                          <p className="font-mono text-[11px] text-slate-500">{c.subscription?.planCode || c.license?.planCode}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">{fmtShortDate(c.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            )
          )
        ) : null}

        {activeTab === 'licenses' ? (
          licenses.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-slate-500">No licenses yet.</p>
          ) : (
            tableShell(
              <>
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50/90 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3">License key</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Plan</th>
                    <th className="px-3 py-3">Company</th>
                    <th className="px-3 py-3">Valid until</th>
                    <th className="px-3 py-3">Caps</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {licenses.map((L) => (
                    <tr
                      key={L._id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setLicensePanel(L)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setLicensePanel(L);
                        }
                      }}
                      className="cursor-pointer bg-white transition hover:bg-amber-50/40"
                    >
                      <td className="px-3 py-3 font-mono text-xs font-semibold text-dark">{L.licenseKey}</td>
                      <td className="px-3 py-3 text-xs font-semibold text-dark">
                        {L.derivedStatus || L.status}
                        {L.status !== L.derivedStatus ? <span className="font-normal text-slate-500"> ({L.status})</span> : null}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className="font-medium">{L.planName || '—'}</div>
                        <div className="text-slate-500">{L.planCode || ''}</div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {L.companyId ? (
                          <span className="font-semibold text-dark">{L.companyName || 'Company'}</span>
                        ) : (
                          <span className="text-slate-500">Unassigned</span>
                        )}
                        {L.companyEmail ? <div className="text-slate-500">{L.companyEmail}</div> : null}
                      </td>
                      <td className="px-3 py-3 text-xs">{fmtShortDate(L.validUntil)}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {L.maxUsers} users · {L.maxBranches} branches
                        {L.isTrial ? <span className="ml-1 font-semibold text-amber-700">Trial</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )
          )
        ) : null}

        {activeTab === 'plans' ? (
          plans.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-slate-500">No subscription plans yet.</p>
          ) : (
            tableShell(
              <>
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50/90 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3">Code</th>
                    <th className="px-3 py-3">Name</th>
                    <th className="px-3 py-3">Price (INR)</th>
                    <th className="px-3 py-3">Duration</th>
                    <th className="px-3 py-3">Users / branches</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {plans.map((p) => (
                    <tr key={p._id} className="bg-white">
                      <td className="px-3 py-3 font-mono text-xs font-semibold text-dark">{p.planCode}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-dark">{p.name}</td>
                      <td className="px-3 py-3 text-sm tabular-nums">{fmtMoneyInr(p.priceInr)}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">{p.durationMonths} mo</td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {p.maxUsers} / {p.maxBranches}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <span
                          className={clsx(
                            'inline-flex rounded-full px-2 py-0.5 font-bold',
                            p.isActive === false ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-900',
                          )}
                        >
                          {p.isActive === false ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )
          )
        ) : null}

        {activeTab === 'products' ? (
          products.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-slate-500">No products yet.</p>
          ) : (
            tableShell(
              <>
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50/90 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3">Product</th>
                    <th className="px-3 py-3">Scope</th>
                    <th className="px-3 py-3">Video</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {products.map((p) => (
                    <tr
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setProductPanel(p)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setProductPanel(p);
                        }
                      }}
                      className="cursor-pointer bg-white transition hover:bg-amber-50/40"
                    >
                      <td className="px-3 py-3">
                        <p className="font-bold text-dark">{p.name}</p>
                        <p className="line-clamp-2 text-xs text-slate-500">{p.shortDescription || '—'}</p>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {p.portfolioWide ? (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 font-bold text-sky-900">All companies</span>
                        ) : (
                          <span className="rounded-full bg-neutral-200 px-2 py-0.5 font-bold text-slate-700">One company</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs font-semibold text-emerald-700">{p.videoUrl ? 'Yes' : '—'}</td>
                      <td className="px-3 py-3 text-xs">
                        <span
                          className={clsx(
                            'inline-flex rounded-full px-2 py-0.5 font-bold',
                            p.status === 'inactive' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-900',
                          )}
                        >
                          {p.status === 'inactive' ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">{fmtShortDate(p.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            )
          )
        ) : null}
      </div>

      <SlideOverPanel
        open={Boolean(companyPanel)}
        title={companyPanel?.name || 'Company'}
        description={companyPanel?.email || ''}
        onClose={() => setCompanyPanel(null)}
        widthClass="sm:max-w-lg"
      >
        {companyPanel ? (
          <div className="space-y-4 overflow-y-auto p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadField label="Phone" value={companyPanel.phone} />
              <ReadField label="Address" value={companyPanel.address} className="sm:col-span-2" />
              <ReadField label="Tenant owner" value={companyPanel.tenantOwner ? `${companyPanel.tenantOwner.name} · ${companyPanel.tenantOwner.email}` : '—'} className="sm:col-span-2" />
              <ReadField label="Subscription active" value={companyPanel.subscription?.isActive === false ? 'No' : 'Yes'} />
              <ReadField label="Plan" value={companyPanel.subscription?.planName} />
              <ReadField label="Plan code" value={companyPanel.subscription?.planCode} mono />
              <ReadField label="License key" value={companyPanel.license?.licenseKey || companyPanel.subscription?.licenseKey} mono accent />
              <ReadField label="License status" value={companyPanel.license ? `${companyPanel.license.derivedStatus || companyPanel.license.status}` : '—'} />
              <ReadField label="Valid until (license)" value={fmtShortDate(companyPanel.license?.validUntil)} />
              <ReadField label="Subscription expires" value={fmtShortDate(companyPanel.subscription?.expiresAt)} />
              <ReadField label="Max users (subscription)" value={companyPanel.subscription?.maxUsers != null ? String(companyPanel.subscription.maxUsers) : '—'} />
              <ReadField label="Max branches (subscription)" value={companyPanel.subscription?.maxBranches != null ? String(companyPanel.subscription.maxBranches) : '—'} />
              <ReadField label="Company updated" value={fmtDate(companyPanel.updatedAt)} className="sm:col-span-2" />
            </div>
            <Link to={`/super/companies/${companyPanel._id}`} className="btn-primary inline-flex text-sm font-bold">
              Open full company page
            </Link>
          </div>
        ) : null}
      </SlideOverPanel>

      <SlideOverPanel
        open={Boolean(licensePanel)}
        title="License"
        description={licensePanel?.licenseKey || ''}
        onClose={() => setLicensePanel(null)}
        widthClass="sm:max-w-md"
      >
        {licensePanel ? (
          <div className="space-y-4 overflow-y-auto p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadField label="Status" value={`${licensePanel.derivedStatus || licensePanel.status}`} />
              <ReadField label="Raw status" value={licensePanel.status} />
              <ReadField label="Plan name" value={licensePanel.planName} />
              <ReadField label="Plan code" value={licensePanel.planCode} mono />
              <ReadField label="Valid until" value={fmtShortDate(licensePanel.validUntil)} />
              <ReadField label="Max users" value={String(licensePanel.maxUsers)} />
              <ReadField label="Max branches" value={String(licensePanel.maxBranches)} />
              <ReadField label="Trial" value={licensePanel.isTrial ? 'Yes' : 'No'} />
              <ReadField label="Company" value={licensePanel.companyName || (licensePanel.companyId ? '—' : 'Unassigned')} className="sm:col-span-2" />
              <ReadField label="Company email" value={licensePanel.companyEmail} className="sm:col-span-2" />
            </div>
            {licensePanel.companyId ? (
              <Link to={`/super/companies/${String(licensePanel.companyId)}`} className="btn-primary inline-flex text-sm font-bold">
                Open company
              </Link>
            ) : null}
          </div>
        ) : null}
      </SlideOverPanel>

      <SlideOverPanel
        open={Boolean(productPanel)}
        title={productPanel?.name || 'Product'}
        description={productPanel?.shortDescription || ''}
        onClose={() => setProductPanel(null)}
        widthClass="sm:max-w-lg"
      >
        {productPanel ? (
          <div className="space-y-4 overflow-y-auto p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadField label="Scope" value={productPanel.portfolioWide ? 'All companies (portfolio)' : 'Single company'} />
              <ReadField label="Status" value={productPanel.status === 'inactive' ? 'Inactive' : 'Active'} />
              <ReadField label="Offer tag" value={productPanel.offerTag} />
              <ReadField label="Price" value={productPanel.price != null ? String(productPanel.price) : '—'} />
              <ReadField label="Video URL" value={productPanel.videoUrl} className="sm:col-span-2" mono />
              <ReadField label="Banner image" value={productPanel.bannerImage} className="sm:col-span-2" mono />
              <ReadField label="Full description" value={productPanel.fullDescription} className="sm:col-span-2" />
              <ReadField label="CTA" value={`${productPanel.ctaLabel || '—'} (${productPanel.ctaType || 'none'})`} />
              <ReadField label="CTA value" value={productPanel.ctaValue} mono className="sm:col-span-2" />
              <ReadField label="Show in app" value={productPanel.showInApp ? 'Yes' : 'No'} />
              <ReadField label="Highlight" value={productPanel.highlightProduct ? 'Yes' : 'No'} />
              <ReadField label="Home banner" value={productPanel.showOnHomeBanner ? 'Yes' : 'No'} />
              <ReadField label="Updated" value={fmtDate(productPanel.updatedAt)} className="sm:col-span-2" />
            </div>
          </div>
        ) : null}
      </SlideOverPanel>
    </div>
  );
}
