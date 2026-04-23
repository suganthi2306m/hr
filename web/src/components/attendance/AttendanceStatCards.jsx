import { memo, useMemo } from 'react';

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black tabular-nums text-dark">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

function formatHoursMinutes(totalMinutes) {
  const m = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * @param {{ present: number, absent: number, leave: number, workingDays: number, workedMinutes: number, expectedMinutes: number }} props
 */
function AttendanceStatCards({ present, absent, leave, workingDays, workedMinutes, expectedMinutes }) {
  const cards = useMemo(
    () => [
      { label: 'Present', value: String(present) },
      { label: 'Absent', value: String(absent) },
      { label: 'Leave', value: String(leave) },
      { label: 'Working days', value: String(workingDays) },
      { label: 'Total working hours', value: formatHoursMinutes(workedMinutes) },
      { label: 'Total hours', value: formatHoursMinutes(expectedMinutes) },
    ],
    [present, absent, leave, workingDays, workedMinutes, expectedMinutes],
  );

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <StatCard key={c.label} label={c.label} value={c.value} />
      ))}
    </div>
  );
}

export default memo(AttendanceStatCards);
