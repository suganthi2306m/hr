import { useEffect, useState } from 'react';
import apiClient from '../api/client';

function MiniBars() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-dark" fill="currentColor" aria-hidden="true">
      <rect x="3" y="14" width="4" height="7" rx="1" opacity="0.35" />
      <rect x="10" y="10" width="4" height="11" rx="1" opacity="0.55" />
      <rect x="17" y="6" width="4" height="15" rx="1" />
    </svg>
  );
}

function StatCard({ label, value, accent, hint }) {
  return (
    <article className="flux-card relative overflow-hidden p-6 shadow-panel">
      <div className={`absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-xl ${accent} shadow-sm`}>
        <MiniBars />
      </div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-4xl font-black tracking-tight text-dark">{value}</p>
      {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </article>
  );
}

function HomeDashboardPage() {
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
  const delayed = s.delayedTasks ?? '—';
  const activeAgents = s.activeAgents ?? '—';
  const total = s.totalTasks ?? '—';
  const completed = s.completedTasks ?? '—';
  const rate = s.completionRate != null ? `${s.completionRate}%` : '—';

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-dark sm:text-3xl">Live dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Operations snapshot — tasks, agents, and SLA risk.</p>
        </div>
        <p className="text-sm font-medium text-slate-500">{new Date().toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
      </div>

      {err && <p className="alert-error text-sm">{err}</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total tasks" value={total} accent="bg-primary/90" />
        <StatCard label="Active agents (GPS)" value={activeAgents} accent="bg-primary/70" hint="Last 10 min ping" />
        <StatCard label="Completed" value={completed} accent="bg-primary/50" hint={`Completion rate ${rate}`} />
        <StatCard label="Delayed / overdue risk" value={delayed} accent="bg-amber-400/90" hint="Past due & not verified" />
      </div>

      {summary?.byStatus && (
        <div className="flux-card p-5 shadow-panel-lg">
          <h2 className="text-base font-bold text-dark">Tasks by status</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(summary.byStatus).map(([k, v]) => (
              <span key={k} className="rounded-full bg-flux-panel px-3 py-1 text-xs font-semibold capitalize text-dark">
                {k.replace(/_/g, ' ')}: {v}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default HomeDashboardPage;
