import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';

function StatIcon({ kind }) {
  const c = 'h-5 w-5 text-dark';
  if (kind === 'attendance') {
    return (
      <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="16" rx="2" />
        <path d="M8 3v3M16 3v3M3 9.5h18" />
        <path d="m8 14 2.2 2.2L16 10.5" />
      </svg>
    );
  }
  if (kind === 'live') {
    return (
      <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }
  if (kind === 'leave') {
    return (
      <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M5 19c5.5 0 12.2-2.2 14-9.5C12.5 9.5 8 12.5 5 19Z" />
        <path d="M5 19c-.3-3.6.7-6.7 3.4-9.4" />
      </svg>
    );
  }
  if (kind === 'shift') {
    return (
      <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6l3 2" />
      </svg>
    );
  }
  if (kind === 'branch') {
    return (
      <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M6 3v18" />
        <path d="M6 7h8a4 4 0 0 1 0 8H6" />
        <path d="M6 15h9a3 3 0 0 1 0 6H6" />
      </svg>
    );
  }
  if (kind === 'visits') {
    return (
      <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-4v-6H8v6H4a1 1 0 0 1-1-1z" />
        <path d="M16 8h5M18.5 5.5V10.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={c} fill="currentColor" aria-hidden="true">
      <rect x="3" y="14" width="4" height="7" rx="1" opacity="0.45" />
      <rect x="10" y="10" width="4" height="11" rx="1" opacity="0.65" />
      <rect x="17" y="6" width="4" height="15" rx="1" />
    </svg>
  );
}

function StatCard({ label, value, accent, hint, icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flux-card relative overflow-hidden p-6 text-left shadow-panel transition hover:-translate-y-0.5 hover:shadow-panel-lg"
    >
      <div className={`absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-xl ${accent} shadow-sm`}>
        <StatIcon kind={icon} />
      </div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-4xl font-black tracking-tight text-dark">{value}</p>
      {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </button>
  );
}

function HomeDashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get('/dashboard/summary');
        if (!cancelled) setSummary(data.summary || null);
      } catch (e) {
        if (!cancelled) setErr(e.response?.data?.message || '');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const s = summary || {};
  const totalUsers = Number(s.totalUsers) || 0;
  const punchedInToday = Number(s.punchedInToday) || 0;
  const activeAgents = s.activeAgents ?? '—';
  const leavePending = s.leavePending ?? '—';
  const shiftAssigned = Number(s.shiftAssigned) || 0;
  const shiftNotAssigned = Number(s.shiftNotAssigned) || 0;
  const branchAssigned = Number(s.branchAssigned) || 0;
  const branchNotAssigned = Number(s.branchNotAssigned) || 0;
  const visitsToday = s.visitsToday ?? '—';

  const cards = useMemo(
    () => [
      {
        key: 'attendance',
        label: 'Total punched in today',
        value: `${punchedInToday}/${totalUsers}`,
        accent: 'bg-primary/90',
        hint: 'Punched in / total employees',
        icon: 'attendance',
        onClick: () => navigate('/dashboard/operations/attendance/approval'),
      },
      {
        key: 'live',
        label: 'Today live tracking',
        value: activeAgents,
        accent: 'bg-primary/70',
        hint: 'Active agents (GPS)',
        icon: 'live',
        onClick: () => navigate('/dashboard/track/livetrack'),
      },
      {
        key: 'leave',
        label: 'Leave requests pending',
        value: leavePending,
        accent: 'bg-amber-300/90',
        hint: 'Approval queue',
        icon: 'leave',
        onClick: () => navigate('/dashboard/operations/leave'),
      },
      {
        key: 'shift',
        label: 'Shift assigned / not assigned',
        value: `${shiftAssigned}/${shiftNotAssigned}`,
        accent: 'bg-primary/50',
        hint: 'Employee shift mapping',
        icon: 'shift',
        onClick: () => navigate('/dashboard/settings/organization?tab=shifts'),
      },
      {
        key: 'branch',
        label: 'Branch assigned / not assigned',
        value: `${branchAssigned}/${branchNotAssigned}`,
        accent: 'bg-primary/60',
        hint: 'Employee branch mapping',
        icon: 'branch',
        onClick: () => navigate('/dashboard/settings/organization?tab=branches'),
      },
      {
        key: 'visits',
        label: 'Today visits',
        value: visitsToday,
        accent: 'bg-primary/40',
        hint: 'Tap to open visits',
        icon: 'visits',
        onClick: () => navigate('/dashboard/track/visits'),
      },
    ],
    [
      activeAgents,
      branchAssigned,
      branchNotAssigned,
      leavePending,
      navigate,
      punchedInToday,
      shiftAssigned,
      shiftNotAssigned,
      totalUsers,
      visitsToday,
    ],
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-dark sm:text-3xl">Live dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Attendance, live tracking, visits, and operations approvals.</p>
        </div>
        <p className="text-sm font-medium text-slate-500">{new Date().toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
      </div>

      {err && <p className="alert-error text-sm">{err}</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <StatCard
            key={card.key}
            label={card.label}
            value={card.value}
            accent={card.accent}
            hint={card.hint}
            icon={card.icon}
            onClick={card.onClick}
          />
        ))}
      </div>
    </section>
  );
}

export default HomeDashboardPage;
