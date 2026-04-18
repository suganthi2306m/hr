import { LiveTrackWordmark } from '../components/brand/LiveTrackWordmark';

const PHASE1 = [
  { title: 'Roles & RBAC', desc: 'Admin / Manager / Field agent with granular permission keys on users.' },
  { title: 'Single company workspace', desc: 'All users share one company profile (no branch split in UI).' },
  { title: 'Live GPS + geo-fences', desc: 'Idle minutes, last seen, fence inside/out on tracking API.' },
  { title: 'Task lifecycle', desc: 'Assigned → Accepted → In progress → Completed → Verified + types & priority.' },
  { title: 'CRM lite', desc: 'Segments, tags, notes, attachments, visit timeline API.' },
  { title: 'Proof of work', desc: 'OTP verify endpoint, signatures & attachments on tasks.' },
  { title: 'Attendance & expenses', desc: 'Web supervisor tools + totals (cash vs digital).' },
  { title: 'Notifications & audit', desc: 'In-app notifications on assign + activity log export.' },
  { title: 'Route heuristic', desc: 'Nearest-neighbor multi-stop order with km / rough ETA.' },
];

const PHASE2 = [
  'Automation rules engine & recurring tasks',
  'SMS / WhatsApp provider hooks',
  'In-app chat & call masking',
  'PWA offline queue + conflict resolution',
  'Device binding & admin 2FA',
  'AI routing (Directions + optimization vendors)',
];

function PlatformModulesPage() {
  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-dark">Platform capabilities</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          <LiveTrackWordmark className="inline font-semibold" /> web console ships with the foundations below. Advanced modules are staged for
          mobile + integrations.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {PHASE1.map((m) => (
          <article key={m.title} className="flux-card p-5 shadow-panel">
            <h2 className="text-base font-bold text-dark">{m.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{m.desc}</p>
          </article>
        ))}
      </div>

      <div className="flux-card-dark rounded-2xl border border-white/10 bg-flux-sidebar p-6 text-white shadow-flux">
        <h2 className="text-lg font-bold">Phase 2+ (integrations)</h2>
        <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-slate-300">
          {PHASE2.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default PlatformModulesPage;
