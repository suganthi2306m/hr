import clsx from 'clsx';

export default function LocationLoadingIndicator({ label = 'Loading...', className }) {
  return (
    <div className={clsx('flex w-full items-center justify-center gap-3 text-slate-600', className)} role="status" aria-live="polite">
      <span className="relative inline-flex h-10 w-10 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-primary/30" />
        <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-dark" aria-hidden>
          <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z" />
          <circle cx="12" cy="10" r="2.2" />
        </svg>
      </span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
