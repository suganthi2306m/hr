import clsx from 'clsx';

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

  return (
    <div className={clsx('flex flex-wrap items-center justify-end gap-2', className)}>
      <label className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-slate-600">
        <span>Rows</span>
        <select
          className="bg-transparent text-xs font-semibold text-dark outline-none"
          value={String(safePageSize)}
          onChange={(e) => onPageSizeChange?.(Number(e.target.value) || 10)}
        >
          {pageSizeOptions.map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <div className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white p-1">
        <button
          type="button"
          onClick={() => onPageChange?.(currentPage - 1)}
          disabled={currentPage <= 1}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-neutral-100 disabled:opacity-40"
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
                'min-w-7 rounded-full px-2 py-1 text-xs font-semibold',
                it === currentPage ? 'bg-primary text-dark' : 'text-slate-600 hover:bg-neutral-100',
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
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-neutral-100 disabled:opacity-40"
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
