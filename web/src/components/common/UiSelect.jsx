import clsx from 'clsx';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MENU_GAP = 6;
const Z_MENU = 10050;

function Chevron({ open }) {
  return (
    <span
      className={clsx(
        'pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-transform duration-200',
        open && '-scale-y-100',
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-full w-full">
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * Custom single-select: consistent rounded menu, brand-tinted focus, no native OS list styling.
 *
 * @param {{
 *   id: string,
 *   value: string,
 *   onChange: (next: string) => void,
 *   options: { value: string, label: string }[],
 *   disabled?: boolean,
 *   className?: string,
 *   menuClassName?: string,
 *   searchable?: boolean,
 * }} props
 */
export default function UiSelect({
  id,
  value,
  onChange,
  options,
  disabled = false,
  className,
  menuClassName,
  searchable = false,
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [menuStyle, setMenuStyle] = useState(null);
  const [menuFilter, setMenuFilter] = useState('');
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRootRef = useRef(null);
  const searchInputRef = useRef(null);
  const highlightRef = useRef(0);

  const flatOptions = useMemo(() => (Array.isArray(options) ? options : []), [options]);

  const listOptions = useMemo(() => {
    if (!searchable) return flatOptions;
    const q = menuFilter.trim().toLowerCase();
    if (!q) return flatOptions;
    return flatOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [flatOptions, menuFilter, searchable]);

  const selected = useMemo(() => {
    const hit = flatOptions.find((o) => o.value === value);
    return hit ?? flatOptions[0];
  }, [flatOptions, value]);

  const close = useCallback(() => setOpen(false), []);

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - MENU_GAP - 8;
    const searchReserve = searchable ? 52 : 0;
    const maxHeight = Math.min(280, Math.max(72 + searchReserve, spaceBelow));
    setMenuStyle({
      position: 'fixed',
      left: r.left,
      width: r.width,
      top: r.bottom + MENU_GAP,
      maxHeight,
      zIndex: Z_MENU,
    });
  }, [searchable]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return undefined;
    }
    updateMenuPosition();
    const onScroll = () => updateMenuPosition();
    const onResize = () => updateMenuPosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      if (menuRootRef.current?.contains(e.target)) return;
      close();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, close]);

  useEffect(() => {
    if (open && searchable) {
      setMenuFilter('');
    }
  }, [open, searchable]);

  useEffect(() => {
    highlightRef.current = highlight;
  }, [highlight]);

  useEffect(() => {
    if (!open) return;
    const i = Math.max(0, listOptions.findIndex((o) => o.value === value));
    const clamped = Math.min(i, Math.max(0, listOptions.length - 1));
    setHighlight(clamped);
  }, [open, value, listOptions]);

  useEffect(() => {
    if (open && searchable) {
      const t = window.setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open, searchable]);

  const pick = useCallback(
    (next) => {
      onChange(next);
      close();
      triggerRef.current?.focus();
    },
    [onChange, close],
  );

  const onKeyDown = useCallback(
    (e) => {
      if (disabled) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      const opts = listOptions;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!open) setOpen(true);
        setHighlight((h) => Math.min(h + 1, Math.max(0, opts.length - 1)));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!open) setOpen(true);
        setHighlight((h) => Math.max(h - 1, 0));
        return;
      }
      if (e.key === 'Home' && open) {
        e.preventDefault();
        setHighlight(0);
        return;
      }
      if (e.key === 'End' && open) {
        e.preventDefault();
        setHighlight(Math.max(0, opts.length - 1));
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        const opt = opts[highlight];
        if (opt) pick(opt.value);
        return;
      }
      if (e.key === 'Tab' && open) {
        close();
      }
    },
    [disabled, open, listOptions, highlight, pick, close],
  );

  const displayLabel = selected?.label ?? '—';

  const canOpen = flatOptions.length > 0;

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled || !canOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-listbox` : undefined}
        className={clsx(
          'relative w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 pr-10 text-left text-sm text-dark shadow-sm outline-none transition-[border-color,box-shadow,background-color] duration-200',
          'hover:border-neutral-300',
          'focus-visible:border-primary/90 focus-visible:ring-2 focus-visible:ring-primary/30',
          open && 'border-primary/85 ring-2 ring-primary/25',
          (disabled || !canOpen) && 'cursor-not-allowed bg-slate-50 text-slate-500',
          !disabled && canOpen && 'cursor-pointer',
          className,
        )}
        onClick={() => {
          if (disabled || !canOpen) return;
          setOpen((o) => !o);
        }}
        onKeyDown={onKeyDown}
      >
        <span className="block truncate">{displayLabel}</span>
        <Chevron open={open} />
      </button>

      {open && menuStyle && canOpen
        ? createPortal(
            <div
              ref={menuRootRef}
              style={{
                position: menuStyle.position,
                left: menuStyle.left,
                width: menuStyle.width,
                top: menuStyle.top,
                maxHeight: menuStyle.maxHeight,
                zIndex: menuStyle.zIndex,
                display: 'flex',
                flexDirection: 'column',
              }}
              className={clsx(
                'overflow-hidden rounded-xl border border-neutral-200/95 bg-white shadow-panel ring-1 ring-black/[0.04]',
                menuClassName,
              )}
            >
              {searchable && (
                <div className="shrink-0 border-b border-neutral-100 p-2">
                  <input
                    ref={searchInputRef}
                    type="search"
                    id={`${id}-search`}
                    value={menuFilter}
                    onChange={(ev) => setMenuFilter(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'ArrowDown') {
                        ev.preventDefault();
                        setHighlight((h) => Math.min(h + 1, Math.max(0, listOptions.length - 1)));
                      } else if (ev.key === 'ArrowUp') {
                        ev.preventDefault();
                        setHighlight((h) => Math.max(h - 1, 0));
                      } else if (ev.key === 'Enter') {
                        ev.preventDefault();
                        const opt = listOptions[highlightRef.current];
                        if (opt) pick(opt.value);
                      }
                    }}
                    placeholder="Type to filter…"
                    className="form-input w-full py-2 text-sm"
                    aria-label="Filter options"
                  />
                </div>
              )}
              <ul
                id={`${id}-listbox`}
                role="listbox"
                aria-labelledby={id}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1.5"
              >
                {listOptions.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-slate-500">No matches</li>
                ) : (
                  listOptions.map((opt, idx) => {
                    const active = opt.value === value;
                    const hi = idx === highlight;
                    return (
                      <li
                        key={opt.value === '' ? '__empty' : String(opt.value)}
                        role="option"
                        aria-selected={active}
                        className={clsx(
                          'mx-1.5 cursor-pointer select-none rounded-lg px-3 py-2.5 text-sm transition-colors duration-150',
                          active && 'bg-primary/18 font-semibold text-dark',
                          !active && hi && 'bg-flux-panel text-dark',
                          !active && !hi && 'text-slate-700 hover:bg-neutral-50',
                        )}
                        onMouseEnter={() => setHighlight(idx)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pick(opt.value)}
                      >
                        {opt.label}
                      </li>
                    );
                  })
                )}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
