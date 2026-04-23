import clsx from 'clsx';
import { memo } from 'react';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

function AttendancePeriodNav({
  viewMode,
  onViewMode,
  anchorYmd,
  labelText,
  onPrev,
  onNext,
  disabled,
  showWeekView = true,
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onViewMode('month')}
          className={clsx(
            'rounded-full px-3 py-1.5 text-xs font-semibold transition',
            viewMode === 'month' ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-neutral-50',
          )}
        >
          Month view
        </button>
        {showWeekView ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onViewMode('week')}
            className={clsx(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition',
              viewMode === 'week' ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-neutral-50',
            )}
          >
            Week view
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onPrev}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-dark shadow-sm hover:bg-neutral-50 disabled:opacity-50"
          aria-label="Previous period"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="m14 6-6 6 6 6" />
          </svg>
        </button>
        <span className="min-w-[10rem] text-center text-sm font-bold text-dark">{labelText}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={onNext}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-dark shadow-sm hover:bg-neutral-50 disabled:opacity-50"
          aria-label="Next period"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="m10 6 6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function formatNavLabel(anchorYmd, viewMode) {
  const a = dayjs(anchorYmd);
  if (viewMode === 'week') {
    const s = a.startOf('isoWeek');
    const e = a.endOf('isoWeek');
    return `${s.format('D MMM')} – ${e.format('D MMM YYYY')}`;
  }
  return a.format('MMM YYYY');
}

export default memo(AttendancePeriodNav);
