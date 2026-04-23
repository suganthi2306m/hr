import clsx from 'clsx';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { formatRenewalDetailsFromPayment } from '../../utils/subscriptionRenewalFromPayment';

function fmtDate(d) {
  if (d == null || d === '') return '—';
  const x = dayjs(d);
  return x.isValid() ? x.format('DD MMM YYYY') : '—';
}

/**
 * License / plan / renewal snapshot + staff & branch caps (tenant dashboard).
 * @param {{
 *   variant?: 'dark' | 'light',
 *   latestRenewalPayment?: object | null,
 *   renewalFromPaymentsOnly?: boolean,
 *   renewalBillingHref?: string,
 * }} props
 */
export default function CompanySubscriptionProfileCard({
  companyName,
  subscription,
  staffCount = 0,
  branchCount = 0,
  renewalDetails = '',
  lastRenewedAtYmd = '',
  onRenewalDetailsChange,
  onLastRenewedAtChange,
  onSaveRenewal,
  savingRenewal = false,
  variant = 'light',
  latestRenewalPayment = null,
  renewalFromPaymentsOnly = false,
  renewalBillingHref = '/dashboard/billing',
}) {
  const sub = subscription && typeof subscription === 'object' ? subscription : {};
  const maxU = sub.maxUsers;
  const maxB = sub.maxBranches;
  const planLine = [sub.planName, sub.planCode].filter(Boolean).join(sub.planName && sub.planCode ? ' · ' : '') || '';

  const paymentCaptured =
    latestRenewalPayment && String(latestRenewalPayment.status || '').toLowerCase() === 'captured' && latestRenewalPayment.paidAt;

  let renewalDetailsDisplay;
  let lastRenewalDisplay;
  if (renewalFromPaymentsOnly) {
    renewalDetailsDisplay = paymentCaptured
      ? formatRenewalDetailsFromPayment(latestRenewalPayment)
      : 'No completed renewal payment on file yet. Complete checkout from Subscription & billing.';
    lastRenewalDisplay = paymentCaptured ? fmtDate(latestRenewalPayment.paidAt) : '—';
  } else {
    renewalDetailsDisplay = String(sub.renewalDetails || renewalDetails || '').trim() || '—';
    lastRenewalDisplay = fmtDate(sub.lastRenewedAt || lastRenewedAtYmd);
  }

  const showEditor = typeof onSaveRenewal === 'function' && !renewalFromPaymentsOnly;

  const isDark = variant === 'dark';

  return (
    <div
      className={clsx(
        'mb-6 rounded-2xl border p-5 shadow-panel sm:p-6',
        isDark
          ? 'border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white'
          : 'border-neutral-200/90 bg-flux-panel text-dark',
      )}
    >
      <h2 className={clsx('text-lg font-black tracking-tight', isDark ? 'text-white' : 'text-dark')}>Company profile</h2>
      <p className={clsx('mt-1 text-sm', isDark ? 'text-slate-400' : 'text-slate-500')}>
        License, plan, and renewal information for your workspace.
      </p>

      {companyName ? (
        <p className={clsx('mt-3 text-xl font-black', isDark ? 'text-white' : 'text-dark')}>{companyName}</p>
      ) : null}

      <dl className={clsx('mt-4 space-y-3 text-sm', isDark ? 'text-slate-200' : 'text-dark')}>
        {sub.licenseKey ? (
          <div>
            <dt className={clsx('text-xs font-semibold uppercase', isDark ? 'text-slate-500' : 'text-slate-500')}>License</dt>
            <dd className={clsx('mt-0.5 break-all font-mono text-xs', 'text-primary')}>{sub.licenseKey}</dd>
          </div>
        ) : null}
        {planLine ? (
          <div>
            <dt className={clsx('text-xs font-semibold uppercase', isDark ? 'text-slate-500' : 'text-slate-500')}>Plan</dt>
            <dd className="mt-0.5 font-medium">{planLine}</dd>
          </div>
        ) : null}
        {sub.expiresAt ? (
          <div>
            <dt className={clsx('text-xs font-semibold uppercase', isDark ? 'text-slate-500' : 'text-slate-500')}>
              Valid until
            </dt>
            <dd className="mt-0.5 font-medium">{fmtDate(sub.expiresAt)}</dd>
          </div>
        ) : null}
        <div>
          <dt className={clsx('text-xs font-semibold uppercase', isDark ? 'text-slate-500' : 'text-slate-500')}>
            {renewalFromPaymentsOnly ? 'Latest renewal (payment)' : 'Renewal details'}
          </dt>
          <dd
            className={clsx(
              'mt-0.5 whitespace-pre-wrap break-words',
              renewalFromPaymentsOnly
                ? !paymentCaptured && 'text-slate-500'
                : !String(sub.renewalDetails || renewalDetails || '').trim() && 'text-slate-500',
            )}
          >
            {renewalDetailsDisplay}
          </dd>
        </div>
        <div>
          <dt className={clsx('text-xs font-semibold uppercase', isDark ? 'text-slate-500' : 'text-slate-500')}>
            {renewalFromPaymentsOnly ? 'Last payment date' : 'Last renewal date'}
          </dt>
          <dd className="mt-0.5 font-medium">{lastRenewalDisplay}</dd>
        </div>
      </dl>

      {renewalFromPaymentsOnly ? (
        <p className={clsx('mt-3 text-xs', isDark ? 'text-slate-400' : 'text-slate-600')}>
          Renewals are recorded automatically when a subscription payment is captured.{' '}
          <Link to={renewalBillingHref} className="font-semibold text-primary underline-offset-2 hover:underline">
            Go to Subscription &amp; billing
          </Link>
        </p>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div
          className={clsx(
            'rounded-xl border px-3 py-3 text-center',
            isDark ? 'border-white/10 bg-white/5' : 'border-neutral-200 bg-white',
          )}
        >
          <p className={clsx('text-2xl font-black', 'text-primary')}>
            {staffCount}
            {maxU != null ? <span className={clsx('text-lg font-semibold', isDark ? 'text-slate-400' : 'text-slate-500')}>/{maxU}</span> : null}
          </p>
          <p className={clsx('text-xs', isDark ? 'text-slate-500' : 'text-slate-500')}>Staff</p>
        </div>
        <div
          className={clsx(
            'rounded-xl border px-3 py-3 text-center',
            isDark ? 'border-white/10 bg-white/5' : 'border-neutral-200 bg-white',
          )}
        >
          <p className={clsx('text-2xl font-black', 'text-primary')}>
            {branchCount}
            {maxB != null ? <span className={clsx('text-lg font-semibold', isDark ? 'text-slate-400' : 'text-slate-500')}>/{maxB}</span> : null}
          </p>
          <p className={clsx('text-xs', isDark ? 'text-slate-500' : 'text-slate-500')}>Branches</p>
        </div>
      </div>

      {showEditor ? (
        <div
          className={clsx(
            'mt-6 space-y-4 border-t pt-5',
            isDark ? 'border-white/10' : 'border-neutral-200',
          )}
        >
          <p className={clsx('text-xs font-bold uppercase tracking-wide', isDark ? 'text-slate-400' : 'text-slate-500')}>
            Update renewal record
          </p>
          <label className="block">
            <span className={clsx('text-xs font-semibold', isDark ? 'text-slate-400' : 'text-slate-600')}>Renewal details</span>
            <textarea
              className={clsx(
                'mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none ring-primary focus:ring-2',
                isDark ? 'border-white/15 bg-white/10 text-white placeholder:text-slate-500' : 'form-input min-h-[72px]',
              )}
              rows={3}
              placeholder="e.g. Annual contract, PO number, billing contact…"
              value={renewalDetails}
              onChange={(e) => onRenewalDetailsChange?.(e.target.value)}
              maxLength={2000}
            />
          </label>
          <label className="block">
            <span className={clsx('text-xs font-semibold', isDark ? 'text-slate-400' : 'text-slate-600')}>Last renewal date</span>
            <input
              type="date"
              className={clsx(
                'mt-1 w-full max-w-xs rounded-lg border px-3 py-2 text-sm outline-none ring-primary focus:ring-2',
                isDark ? 'border-white/15 bg-white/10 text-white' : 'form-input',
              )}
              value={lastRenewedAtYmd}
              onChange={(e) => onLastRenewedAtChange?.(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={savingRenewal}
            onClick={() => onSaveRenewal?.()}
          >
            {savingRenewal ? 'Saving…' : 'Save renewal details'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
