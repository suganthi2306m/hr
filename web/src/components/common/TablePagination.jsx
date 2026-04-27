import clsx from 'clsx';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PAGE_SIZE_MENU_Z = 10060;
const PAGE_SIZE_MENU_GAP = 6;

function buildPageItems(currentPage, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  if (currentPage <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (currentPage >= totalPages - 2) [totalPages - 1, totalPages - 2, totalPages - 3].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const p = sorted[i];
    const prev = sorted[i - 1];
    if (prev && p - prev > 1) out.push('ellipsis');
    out.push(p);
  }
  return out;
}

/** Rows-per-page control: pill trigger + portal menu (avoids native OS select styling). */
function PageSizeSelect({ value, options, onChange, disabled }) {
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  const sizes = Array.isArray(options) && options.length ? options : [10, 25, 50];

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuStyle({
      position: 'fixed',
      left: r.left,
      top: r.bottom + PAGE_SIZE_MENU_GAP,
      minWidth: Math.max(r.width, 88),
      zIndex: PAGE_SIZE_MENU_Z,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return undefined;
    }
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${triggerId}-listbox` : undefined}
        className={clsx(
          'inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs shadow-sm transition',
          'hover:border-neutral-300 hover:bg-neutral-50/90',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
          open && 'border-primary/50 ring-2 ring-primary/20',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
      >
        <span className="font-medium text-slate-600">Rows</span>
        <span className="min-w-[1.25rem] text-center font-semibold tabular-nums text-dark">{value}</span>
        <svg
          viewBox="0 0 24 24"
          className={clsx('h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-200', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && menuStyle && !disabled
        ? createPortal(
            <div
              ref={menuRef}
              id={`${triggerId}-listbox`}
              role="listbox"
              aria-labelledby={triggerId}
              style={menuStyle}
              className="overflow-hidden rounded-lg border border-neutral-800 bg-white py-1 shadow-lg ring-1 ring-black/10"
            >
              {sizes.map((n) => {
                const selected = n === value;
                return (
                  <button
                    key={n}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={clsx(
                      'flex w-full items-center justify-center px-4 py-2.5 text-sm font-medium tabular-nums transition-colors duration-150',
                      selected
                        ? 'bg-neutral-100 font-semibold text-dark hover:bg-blue-600 hover:text-white'
                        : 'text-neutral-900 hover:bg-blue-600 hover:text-white',
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange?.(n);
                      setOpen(false);
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export default function TablePagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  className = '',
}) {
  const safeTotal = Math.max(0, Number(totalCount) || 0);
  const safePageSize = Math.max(1, Number(pageSize) || 10);
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const items = buildPageItems(currentPage, totalPages);
  const pageSizeDisabled = !onPageSizeChange;

  return (
    <div className={clsx('flex flex-wrap items-center justify-end gap-2', className)}>
      <PageSizeSelect
        value={safePageSize}
        options={pageSizeOptions}
        disabled={pageSizeDisabled}
        onChange={(n) => onPageSizeChange?.(n)}
      />

      <div className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => onPageChange?.(currentPage - 1)}
          disabled={currentPage <= 1}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-600 transition hover:bg-neutral-100 disabled:opacity-40"
          aria-label="Previous page"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m14 6-6 6 6 6" />
          </svg>
        </button>

        {items.map((it, idx) =>
          it === 'ellipsis' ? (
            <span key={`el-${idx}`} className="px-1 text-xs text-slate-400">
              ...
            </span>
          ) : (
            <button
              key={`p-${it}`}
              type="button"
              onClick={() => onPageChange?.(it)}
              className={clsx(
                'min-w-7 rounded-full px-2 py-1 text-xs font-semibold transition-colors',
                it === currentPage ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-neutral-100',
              )}
            >
              {it}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => onPageChange?.(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-600 transition hover:bg-neutral-100 disabled:opacity-40"
          aria-label="Next page"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m10 6 6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
