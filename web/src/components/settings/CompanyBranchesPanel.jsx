import clsx from 'clsx';

export { MAX_BRANCHES, normalizeBranchesFromApi, emptyBranchRow } from '../../utils/branchWorkspace';

/**
 * Company profile card (Organization setup → Company).
 */
export default function CompanyBranchesPanel({ companyForm, setCompanyForm, onSaveCompany, saving }) {
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (onSaveCompany) await onSaveCompany();
  };

  return (
    <form className="space-y-8" onSubmit={handleSubmit}>
      <div className="relative overflow-hidden rounded-2xl border border-neutral-200/90 bg-gradient-to-br from-white via-white to-primary/5 p-5 shadow-panel sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative">
          <h2 className="text-lg font-black tracking-tight text-dark">Company details</h2>
          <p className="mt-1 text-sm text-slate-500">Legal / billing identity for your organization.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="form-field sm:col-span-2">
              <span className="form-label-muted">Company name</span>
              <input
                className="form-input"
                value={companyForm.name}
                onChange={(e) => setCompanyForm((c) => ({ ...c, name: e.target.value }))}
                autoComplete="organization"
                required
              />
            </label>
            <label className="form-field">
              <span className="form-label-muted">Company email</span>
              <input
                type="email"
                className="form-input"
                value={companyForm.email}
                onChange={(e) => setCompanyForm((c) => ({ ...c, email: e.target.value }))}
                autoComplete="email"
                required
              />
            </label>
            <label className="form-field">
              <span className="form-label-muted">Phone number</span>
              <input
                type="tel"
                className="form-input"
                value={companyForm.phone}
                onChange={(e) => setCompanyForm((c) => ({ ...c, phone: e.target.value }))}
                autoComplete="tel"
                required
              />
            </label>
            <label className="form-field sm:col-span-2">
              <span className="form-label-muted">Registered address</span>
              <input
                className="form-input"
                value={companyForm.address}
                onChange={(e) => setCompanyForm((c) => ({ ...c, address: e.target.value }))}
                autoComplete="street-address"
                required
              />
            </label>
          </div>
        </div>
      </div>

      <div className={clsx('flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-6', 'justify-end')}>
        <button type="submit" className="btn-primary min-w-[10rem] disabled:opacity-60" disabled={saving}>
          {saving ? 'Saving…' : 'Save company details'}
        </button>
      </div>
    </form>
  );
}
