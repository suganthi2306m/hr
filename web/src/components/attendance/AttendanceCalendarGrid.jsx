import clsx from 'clsx';
import { memo, useMemo } from 'react';
import { formatAttendanceTimeShort } from '../../utils/attendanceTime';
import { getOpsCalendarCellMeta } from '../../utils/attendanceCalendar';
import { resolvePunchInRaw, resolvePunchOutRaw } from '../../utils/attendancePunchFields';
import { normalizeWeeklyOffPolicy } from '../../utils/weeklyOff';
import AttendanceStatusBadge from './AttendanceStatusBadge';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function CalendarCell({ row, shiftChip, weeklyOffPolicy }) {
  const meta = getOpsCalendarCellMeta(row, weeklyOffPolicy);
  const { date, inRange, att } = row;
  const showTimes = meta.tone === 'present' && att;
  const isHolidayCell = meta.key === 'company-holiday' || meta.key === 'holiday';
  const hideShiftChip = inRange && meta.key === 'weekoff';

  return (
    <div
      className={clsx(
        'flex min-h-[88px] flex-col rounded-lg border p-2 text-left text-xs',
        inRange ? 'border-neutral-200 bg-white' : 'border-neutral-100 bg-slate-50 text-slate-400',
      )}
    >
      <div className="flex items-start gap-1.5">
        <span className="shrink-0 font-semibold tabular-nums">{date.format('DD MMM')}</span>
        {inRange && isHolidayCell ? (
          <span
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11px] font-black text-violet-800 ring-1 ring-violet-300/80"
            title={meta.label || 'Holiday'}
            aria-label={meta.label ? `Holiday: ${meta.label}` : 'Holiday'}
          >
            H
          </span>
        ) : null}
      </div>
      {meta.label ? (
        <div className="mt-1">
          <AttendanceStatusBadge label={meta.label} tone={meta.tone} />
        </div>
      ) : null}
      {showTimes ? (
        <div className="mt-1 space-y-0.5 text-[10px] leading-tight text-slate-600">
          {resolvePunchInRaw(att) ? <p>In: {formatAttendanceTimeShort(resolvePunchInRaw(att))}</p> : null}
          {resolvePunchOutRaw(att) ? <p>Out: {formatAttendanceTimeShort(resolvePunchOutRaw(att))}</p> : null}
        </div>
      ) : null}
      {inRange && !hideShiftChip ? (
        <div className="mt-auto min-w-0 pt-1">
          {shiftChip?.assigned ? (
            <span className="flex w-full min-w-0 flex-col gap-0.5 text-[10px] font-semibold leading-snug text-slate-700 sm:flex-row sm:items-baseline sm:gap-1.5">
              <span className="shrink-0">{shiftChip.letter}</span>
              <span className="min-w-0 flex-1 break-words">{shiftChip.timing}</span>
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-rose-600">Not assigned</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

const MemoCell = memo(CalendarCell);

function AttendanceCalendarGrid({ calendarDays, shiftChip, weeklyOffPolicy = null }) {
  const policy = useMemo(() => normalizeWeeklyOffPolicy(weeklyOffPolicy), [weeklyOffPolicy]);

  return (
    <div>
      <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {WEEKDAYS.map((d) => (
          <p key={d}>{d}</p>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-2">
        {calendarDays.map((d) => (
          <MemoCell key={d.key} row={d} shiftChip={shiftChip} weeklyOffPolicy={policy} />
        ))}
      </div>
    </div>
  );
}

export default memo(AttendanceCalendarGrid);
