import clsx from 'clsx';

function SlideOverPanel({
  open,
  title,
  description,
  onClose,
  children,
  widthClass = 'sm:max-w-xl',
  titleClassName = '',
}) {
  return (
    <div className={clsx('fixed inset-0 z-50', open ? 'pointer-events-auto' : 'pointer-events-none')}>
      <div
        onClick={onClose}
        className={clsx(
          'absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />
      <aside
        className={clsx(
          'absolute right-0 top-0 flex h-full max-h-[100dvh] w-full flex-col border-l border-neutral-200 bg-white shadow-panel-lg transition-transform duration-300 ease-out',
          widthClass,
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="shrink-0 border-b border-white/10 bg-flux-sidebar px-5 py-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className={clsx('text-lg font-bold tracking-tight', titleClassName || 'text-white')}>{title}</h3>
              {description && <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
              aria-label="Close panel"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-4 [-webkit-overflow-scrolling:touch]">
          {children}
        </div>
      </aside>
    </div>
  );
}

export default SlideOverPanel;
