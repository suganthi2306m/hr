import clsx from 'clsx';

/**
 * Shows "{n} / {total} selected" when at least one row is selected.
 * totalCount should be the size of the filtered list the selection applies to.
 */
export default function SelectionCountBadge({ selectedCount, totalCount, className = '' }) {
  const n = Number(selectedCount) || 0;
  if (n <= 0) return null;
  const total = Math.max(Number(totalCount) || 0, n);
  return (
    <span
      role="status"
      className={clsx(
        'inline-flex items-center rounded-full border border-primary/45 bg-primary/12 px-3 py-1 text-xs font-semibold tabular-nums text-dark',
        className,
      )}
      aria-label={`${n} of ${total} rows selected`}
    >
      {n} / {total} selected
    </span>
  );
}
