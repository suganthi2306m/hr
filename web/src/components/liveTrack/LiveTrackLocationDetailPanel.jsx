import {
  formatAttendanceDateTime,
  formatAttendanceTimeShort,
} from '../../utils/attendanceTime';
import { HELP_GPS_ACCURACY, HELP_PRESENCE_AWAY } from './liveTrackHelpText';

function IconBattery({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="6" y="7" width="12" height="10" rx="2" />
      <path d="M10 7V5h4v2" />
      <path d="M9 11h4" strokeLinecap="round" />
    </svg>
  );
}

function IconBuilding({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 21V8l8-4 8 4v13" />
      <path d="M9 21v-4h6v4" />
      <path d="M9 13h2M13 13h2M9 17h2M13 17h2" strokeLinecap="round" />
    </svg>
  );
}

function IconPhone({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M10 18h4" strokeLinecap="round" />
    </svg>
  );
}

function IconGps({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" strokeLinecap="round" />
    </svg>
  );
}

function IconPin({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s7-4.35 7-10a7 7 0 10-14 0c0 5.65 7 10 7 10z" />
      <circle cx="12" cy="11" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconUser({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 21v-1c0-3 3-5.5 7-5.5s7 2.5 7 5.5v1" strokeLinecap="round" />
    </svg>
  );
}

function presenceLabel(entry) {
  const ps = entry?.presenceStatus;
  if (ps === 'in_office') return 'In office';
  if (ps === 'out_of_office') return 'Away';
  const inside = (entry?.geofenceStatus || []).find((g) => g.inside);
  if (inside) return `In ${inside.name}`;
  return 'Away';
}

function appStatusLabel(entry) {
  const raw = (entry?.appStatus || entry?.status || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (raw === 'app_background' || raw.includes('background')) return 'App closed';
  if (raw.includes('closed') || raw.includes('kill')) return 'App closed';
  if (raw.includes('foreground') || raw === 'active' || raw.includes('open')) return 'App open';
  const a = entry?.appStatus;
  if (a) return String(a).replace(/_/g, ' ');
  const st = entry?.status;
  if (st) return String(st).replace(/_/g, ' ');
  return '—';
}

function gpsAccuracyText(entry) {
  const m = entry?.accuracy;
  if (m != null && Number.isFinite(Number(m)) && Number(m) > 0) {
    return `±${Number(m).toFixed(1)}m`;
  }
  return '—';
}

function StatCell({ icon: Icon, label, value, valueClass = 'text-dark', hint }) {
  return (
    <div
      title={hint || undefined}
      className={`flex gap-2 rounded-lg border border-neutral-200/90 bg-white/80 p-2 shadow-sm${
        hint ? ' cursor-help' : ''
      }`}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-flux-panel text-slate-600">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`mt-0.5 truncate text-xs font-semibold ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
}

/**
 * Rich point detail for live tracking (map pin, route sample, or polyline pick).
 */
export default function LiveTrackLocationDetailPanel({
  entry,
  source,
  resolvedAddress,
  onClose,
  onSeeAll,
}) {
  if (!entry) return null;

  const addressLine =
    entry.address || (resolvedAddress === '…' ? 'Looking up address…' : resolvedAddress) || '—';
  const subtitle = formatAttendanceDateTime(entry.timestamp);
  const presence = presenceLabel(entry);
  const appLine = appStatusLabel(entry);
  const presenceHint =
    presence === 'Away'
      ? HELP_PRESENCE_AWAY
        : presence === 'In office'
        ? "Inside the office geofence for this staff member's branch."
        : presence.startsWith('In ')
          ? 'Inside this named office or site zone.'
          : undefined;
  const coords = `${Number(entry.latitude).toFixed(7)}, ${Number(entry.longitude).toFixed(7)}`;
  const battery =
    entry.batteryPercent != null && Number.isFinite(Number(entry.batteryPercent))
      ? `${Math.round(entry.batteryPercent)}%`
      : '—';
  const gpsText = gpsAccuracyText(entry);
  const trackingLabel = entry.isActive ? 'Active' : 'Inactive';

  return (
    <div className="flex h-full min-h-0 flex-col bg-gradient-to-b from-white to-flux-panel">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-neutral-200/80 px-3 py-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex h-2 w-2 shrink-0 rounded-full ring-2 ring-amber-200/80"
              style={{ backgroundColor: '#f2d04a' }}
              aria-hidden
            />
            <span className="text-lg font-black tracking-tight text-amber-500">
              {formatAttendanceTimeShort(entry.timestamp)}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">{subtitle}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {source === 'live' ? 'Live position' : 'Route point'} · {entry.userName}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {typeof onSeeAll === 'function' && entry.userId ? (
            <button
              type="button"
              onClick={() => onSeeAll(entry)}
              className="px-1.5 py-1 text-[11px] font-bold text-amber-600 underline decoration-amber-400/80 underline-offset-2 hover:text-amber-700"
            >
              See all
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-base leading-none text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-dark"
            aria-label="Close details"
          >
            ×
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <StatCell icon={IconBattery} label="Battery" value={battery} valueClass="text-emerald-600" />
          <StatCell
            icon={IconBuilding}
            label="Presence"
            value={presence}
            hint={presenceHint}
          />
          <StatCell icon={IconPhone} label="Status" value={trackingLabel} />
          <StatCell
            icon={IconGps}
            label="GPS"
            value={gpsText}
            valueClass="text-amber-600"
            hint={HELP_GPS_ACCURACY}
          />
        </div>
        <StatCell icon={IconUser} label="Coordinates" value={coords} valueClass="font-mono text-[11px] text-dark" />

        {(entry.taskName || entry.taskCode) && (
          <div className="rounded-lg border border-neutral-200/90 bg-white/80 p-2 shadow-sm">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Task</p>
            <p className="mt-0.5 text-xs font-semibold text-dark">{entry.taskName || entry.taskCode}</p>
            {entry.taskStatus ? (
              <p className="mt-0.5 text-[11px] text-slate-600">Status: {entry.taskStatus}</p>
            ) : null}
          </div>
        )}

        <div className="rounded-xl border border-neutral-200 bg-slate-50/90 p-2.5 shadow-inner">
          <div className="flex gap-1.5">
            <IconPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Address</p>
              <p className="mt-0.5 text-xs font-medium leading-snug text-dark">{addressLine}</p>
              {(entry.city || entry.area || entry.pincode) && (
                <p className="mt-1 text-[11px] text-slate-600">
                  {[entry.area, entry.city].filter(Boolean).join(', ')}
                  {entry.pincode ? ` · ${entry.pincode}` : ''}
                </p>
              )}
              <p className="mt-1 text-[11px] text-slate-500">App: {appLine}</p>
            </div>
          </div>
        </div>

        {entry.geofenceStatus?.length > 0 ? (
          <div className="rounded-lg border border-neutral-200/80 bg-white/60 p-2">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Geofences</p>
            <ul className="mt-1.5 space-y-1 text-[11px] text-slate-700">
              {entry.geofenceStatus.map((g) => (
                <li key={g.id} className="flex justify-between gap-2">
                  <span className="font-medium">{g.name}</span>
                  <span className="shrink-0 text-slate-500">
                    {g.inside ? 'Inside' : 'Outside'} · {g.distanceM}m
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
