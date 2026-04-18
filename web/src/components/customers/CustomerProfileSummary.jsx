import clsx from 'clsx';

/** Operational status: API uses enum; tolerate legacy boolean isActive. */
export function isCustomerOperationalActive(c) {
  if (c.customerStatus === 'inactive') return false;
  if (c.customerStatus === 'active') return true;
  return c.isActive !== false;
}

export default function CustomerProfileSummary({ c, compact = false }) {
  const phone = [c.countryCode ? `+${c.countryCode}` : '', c.customerNumber].filter(Boolean).join(' ').trim();
  const fullAddress = [c.address, c.city, c.state, c.pincode, c.country].filter(Boolean).join(', ');
  const tagLine = Array.isArray(c.tags) && c.tags.length ? c.tags.join(', ') : '';

  const k = (label) => (
    <p
      className={clsx(
        'font-semibold uppercase tracking-wide text-slate-500',
        compact ? 'text-[10px]' : 'text-xs',
      )}
    >
      {label}
    </p>
  );

  return (
    <div className={clsx(compact ? 'space-y-2' : 'space-y-3')}>
      <div>
        {k('Company')}
        <p className={clsx('text-dark', compact ? 'text-sm font-semibold leading-snug' : 'text-lg font-bold')}>
          {c.companyName?.trim() || '—'}
        </p>
      </div>
      <div className={clsx('grid gap-2', !compact && 'sm:grid-cols-2')}>
        <div>
          {k('Contact name')}
          <p className={clsx('text-slate-800', compact ? 'text-xs font-medium' : 'font-medium')}>
            {c.customerName?.trim() || '—'}
          </p>
        </div>
        <div>
          {k('Phone')}
          <p className={clsx('text-slate-800', compact ? 'text-xs font-medium' : 'font-medium')}>{phone || '—'}</p>
        </div>
        <div className={clsx(!compact && 'sm:col-span-2')}>
          {k('Email')}
          <p className={clsx('break-all text-slate-800', compact ? 'text-xs font-medium' : 'font-medium')}>
            {c.emailId?.trim() || '—'}
          </p>
        </div>
      </div>
      <div>
        {k('Address')}
        <p className={clsx('whitespace-pre-wrap text-slate-800', compact ? 'text-xs font-medium' : 'font-medium')}>
          {fullAddress || '—'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={clsx(
            'rounded-full bg-primary/25 font-semibold capitalize text-dark',
            compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs',
          )}
        >
          Segment: {c.segment || 'lead'}
        </span>
        <span
          className={clsx(
            'rounded-full font-semibold',
            compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs',
            isCustomerOperationalActive(c) ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-800',
          )}
        >
          {isCustomerOperationalActive(c) ? 'Active' : 'Inactive'}
        </span>
      </div>
      {tagLine ? (
        <div>
          {k('Tags')}
          <p className={clsx('text-slate-700', compact ? 'text-[11px]' : 'text-xs')}>{tagLine}</p>
        </div>
      ) : null}
      {c.geoLocation?.lat != null && c.geoLocation?.lng != null ? (
        <p className={clsx('font-mono text-slate-500', compact ? 'text-[10px]' : 'text-[11px]')}>
          {Number(c.geoLocation.lat).toFixed(5)}, {Number(c.geoLocation.lng).toFixed(5)}
        </p>
      ) : null}
    </div>
  );
}
