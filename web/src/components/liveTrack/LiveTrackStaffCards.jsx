import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { formatAttendanceTimeShort } from '../../utils/attendanceTime';
import { HELP_PRESENCE_AWAY } from './liveTrackHelpText';

dayjs.extend(relativeTime);

function initials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

function staffIdLine(user) {
  if (user?.branchId) return String(user.branchId).trim();
  if (user?.email) return String(user.email).split('@')[0];
  return user?._id ? String(user._id).slice(-8) : '—';
}

function IconBatteryTiny({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="6" y="7" width="12" height="10" rx="2" />
      <path d="M10 7V5h4v2" />
      <path d="M9 11h4" strokeLinecap="round" />
    </svg>
  );
}

function IconClockTiny({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}

function presenceBadge(entry) {
  const ps = entry?.presenceStatus;
  if (ps === 'in_office') return { text: 'In office', className: 'bg-emerald-100 text-emerald-800' };
  const inside = (entry?.geofenceStatus || []).find((g) => g.inside);
  if (inside) return { text: `In ${inside.name}`, className: 'bg-emerald-100 text-emerald-800' };
  return { text: 'Away', className: 'bg-slate-100 text-slate-600' };
}

function appBadge(entry) {
  const raw = (entry?.appStatus || entry?.status || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (raw === 'app_background' || raw.includes('background')) {
    return { text: 'App closed', className: 'bg-rose-50 text-rose-700' };
  }
  if (raw.includes('closed') || raw.includes('kill')) {
    return { text: 'App closed', className: 'bg-rose-50 text-rose-700' };
  }
  if (raw.includes('open') || raw.includes('foreground') || raw === 'active') {
    return { text: 'App open', className: 'bg-sky-50 text-sky-800' };
  }
  if (!raw) return { text: 'App', className: 'bg-slate-100 text-slate-600' };
  return { text: entry.appStatus || entry.status || 'App', className: 'bg-slate-100 text-slate-600' };
}

/**
 * Staff summary row under the map — matches latest point for the selected calendar day.
 */
export default function LiveTrackStaffCards({
  staffUsers,
  trackingByUserId,
  routeDate,
  selectedUserId,
  onSelectUser,
  onViewTimeline,
}) {
  if (!staffUsers.length) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-flux-panel/50 p-6 text-center text-sm text-slate-500">
        No field staff in this company yet.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {staffUsers.map((user) => {
        const uid = String(user._id);
        const pt = trackingByUserId.get(uid);
        const selected = selectedUserId === uid;
        const pres = pt ? presenceBadge(pt) : { text: 'No data', className: 'bg-slate-100 text-slate-500' };
        const app = pt ? appBadge(pt) : { text: '—', className: 'bg-slate-100 text-slate-500' };
        const lastRel = pt?.timestamp ? dayjs(pt.timestamp).fromNow() : '—';
        const lastClock = pt?.timestamp ? formatAttendanceTimeShort(pt.timestamp) : '';

        return (
          <article
            key={uid}
            className={`flux-card flex flex-col overflow-hidden border bg-white p-3 shadow-panel transition ${
              selected ? 'border-amber-400 ring-1 ring-amber-300/60' : 'border-neutral-200'
            }`}
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 text-left"
                onClick={() => onSelectUser(uid)}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dark text-xs font-black text-amber-300">
                  {initials(user.name)}
                </div>
                <div className="ml-2 min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-dark">{user.name}</p>
                  <p className="truncate text-[11px] text-slate-500">{staffIdLine(user)}</p>
                </div>
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={`h-2 w-2 rounded-full ${pt?.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`}
                  title={pt?.isActive ? 'Active' : 'Inactive'}
                />
                <button
                  type="button"
                  className="text-[11px] font-bold text-amber-600 underline decoration-amber-400/80 underline-offset-2 hover:text-amber-700"
                  onClick={() => onViewTimeline(uid)}
                >
                  See all
                </button>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-neutral-100 pt-2 text-[10px] text-slate-600">
              <div title="Battery level reported by the device">
                <p className="flex items-center gap-1 font-semibold text-slate-400">
                  <IconBatteryTiny className="h-3 w-3 text-slate-500" />
                  Battery
                </p>
                <p className="mt-0.5 text-xs font-bold text-dark">
                  {pt?.batteryPercent != null ? `${Math.round(pt.batteryPercent)}%` : '—'}
                </p>
              </div>
              <div title={lastClock || 'Last GPS update'}>
                <p className="flex items-center gap-1 font-semibold text-slate-400">
                  <IconClockTiny className="h-3 w-3 text-slate-500" />
                  Updated
                </p>
                <p className="mt-0.5 text-xs font-bold text-dark">{lastRel}</p>
              </div>
            </div>

            <div className="mt-1.5 flex flex-wrap gap-1">
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${pres.className}`}
                title={pres.text === 'Away' ? HELP_PRESENCE_AWAY : 'Based on branch office geofences.'}
              >
                {pres.text}
              </span>
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${app.className}`}>{app.text}</span>
            </div>

            {pt?.address ? (
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-slate-600">{pt.address}</p>
            ) : (
              <p className="mt-1.5 text-[11px] italic text-slate-400">No address for this day</p>
            )}

            <p className="mt-1.5 text-center text-[9px] text-slate-400">Date: {routeDate}</p>
          </article>
        );
      })}
    </div>
  );
}
