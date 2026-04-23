import clsx from 'clsx';
import { memo } from 'react';

const TONE_CLASS = {
  present: 'bg-emerald-100 text-emerald-800',
  absent: 'bg-rose-100 text-rose-800',
  leave: 'bg-sky-100 text-sky-800',
  pending: 'bg-amber-100 text-amber-800',
  weekend: 'bg-amber-50 text-amber-800',
  holiday: 'bg-violet-100 text-violet-800',
  empty: '',
};

function AttendanceStatusBadge({ label, tone, className }) {
  if (!label) return null;
  const toneKey = TONE_CLASS[tone] ? tone : 'empty';
  return (
    <span
      className={clsx(
        'inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight',
        TONE_CLASS[toneKey],
        className,
      )}
    >
      {label}
    </span>
  );
}

export default memo(AttendanceStatusBadge);
