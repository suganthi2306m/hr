import clsx from 'clsx';
import { Link } from 'react-router-dom';

export function Section({ title, children }) {
  return (
    <div className="rounded-2xl border border-neutral-200/90 bg-white p-5 shadow-sm">
      <h3 className="border-b border-neutral-100 pb-3 text-sm font-bold uppercase tracking-wide text-primary">{title}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

export function Field({ label, required, className = '', children }) {
  return (
    <div className={clsx('form-field min-w-0', className)}>
      <label className="form-label-muted">
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </label>
      {children}
    </div>
  );
}

export function ReadField({ label, value, className = '', mono, accent, linkExternal }) {
  const empty = value == null || String(value).trim() === '';
  const raw = empty ? '' : String(value).trim();
  const href =
    linkExternal && !empty ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) : null;
  const textClass = clsx(
    'mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-dark',
    mono && 'font-mono text-xs',
    accent && 'text-primary',
    empty && 'font-normal text-slate-400',
  );
  return (
    <div className={clsx('form-field min-w-0', className)}>
      <p className="form-label-muted">{label}</p>
      {empty ? (
        <p className={textClass}>—</p>
      ) : href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={clsx(textClass, 'inline-block text-primary underline decoration-primary/40 underline-offset-2')}
        >
          {raw}
        </a>
      ) : (
        <p className={textClass}>{raw}</p>
      )}
    </div>
  );
}

export function CompanyPageHeader({ backTo, title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <Link
          to={backTo}
          title="Back"
          className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-slate-600 transition hover:bg-neutral-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <div>
          <p className="text-sm font-semibold text-dark">{title}</p>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
