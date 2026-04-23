import clsx from 'clsx';

export default function SuperAdminModal({ open, title, onClose, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close dialog" />
      <div
        className={clsx(
          'relative z-10 max-h-[min(90vh,720px)] w-full overflow-y-auto rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-panel-lg',
          wide ? 'max-w-lg' : 'max-w-md',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="super-admin-modal-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 id="super-admin-modal-title" className="text-lg font-bold tracking-tight text-dark">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-neutral-100 hover:text-dark"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
