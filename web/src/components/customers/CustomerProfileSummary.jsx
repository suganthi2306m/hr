import clsx from 'clsx';

/** Operational status: API uses enum; tolerate legacy boolean isActive. */
export function isCustomerOperationalActive(c) {
  if (c.customerStatus === 'inactive') return false;
  if (c.customerStatus === 'active') return true;
  return c.isActive !== false;
}

export default function CustomerProfileSummary({ c }) {
  const phone = [c.countryCode ? `+${c.countryCode}` : '', c.customerNumber].filter(Boolean).join(' ').trim();
  const fullAddress = [c.address, c.city, c.state, c.pincode, c.country].filter(Boolean).join(', ');
  const tagLine = Array.isArray(c.tags) && c.tags.length ? c.tags.join(', ') : '';

  const k = (label) => <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>;

  return (
    <div className="space-y-3">
      <div>
        {k('Company')}
        <p className="text-lg font-bold text-dark">{c.companyName?.trim() || '—'}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          {k('Contact name')}
          <p className="font-medium text-slate-800">{c.customerName?.trim() || '—'}</p>
        </div>
        <div>
          {k('Phone')}
          <p className="font-medium text-slate-800">{phone || '—'}</p>
        </div>
        <div className="sm:col-span-2">
          {k('Email')}
          <p className="break-all font-medium text-slate-800">{c.emailId?.trim() || '—'}</p>
        </div>
      </div>
      <div>
        {k('Address')}
        <p className="whitespace-pre-wrap font-medium text-slate-800">{fullAddress || '—'}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary/25 px-2.5 py-0.5 text-xs font-semibold capitalize text-dark">
          Segment: {c.segment || 'lead'}
        </span>
        <span
          className={clsx(
            'rounded-full px-2.5 py-0.5 text-xs font-semibold',
            isCustomerOperationalActive(c) ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-800',
          )}
        >
          {isCustomerOperationalActive(c) ? 'Active' : 'Inactive'}
        </span>
      </div>
      {tagLine ? (
        <div>
          {k('Tags')}
          <p className="text-xs text-slate-700">{tagLine}</p>
        </div>
      ) : null}
      {c.geoLocation?.lat != null && c.geoLocation?.lng != null ? (
        <p className="font-mono text-[11px] text-slate-500">
          {Number(c.geoLocation.lat).toFixed(5)}, {Number(c.geoLocation.lng).toFixed(5)}
        </p>
      ) : null}
    </div>
  );
}
