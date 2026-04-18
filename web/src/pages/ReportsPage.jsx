import { useCallback, useState } from 'react';
import apiClient from '../api/client';

function downloadCsv(filename, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = Object.keys(rows[0] || {});
  const lines = [header.join(','), ...rows.map((r) => header.map((h) => esc(r[h])).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/ops/audit-logs');
      setAudit(data.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const exportTasks = async () => {
    const { data } = await apiClient.get('/fieldtasks');
    const rows = (data.items || []).map((t) => ({
      code: t.taskCode,
      title: t.taskName || t.title,
      status: t.status,
      type: t.taskType,
      priority: t.priority,
      assignee: t.assignedUser?.name,
      destination: t.location,
    }));
    downloadCsv('livetrack-tasks.csv', rows);
  };

  const exportCustomers = async () => {
    const { data } = await apiClient.get('/customers');
    const rows = (data.items || []).map((c) => ({
      name: c.customerName,
      phone: c.customerNumber,
      email: c.emailId,
      city: c.city,
      segment: c.segment,
    }));
    downloadCsv('livetrack-customers.csv', rows);
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-dark">Reports & export</h1>
        <p className="mt-1 text-sm text-slate-500">Excel-ready CSV from live data. Audit trail for compliance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <button type="button" className="flux-card p-5 text-left shadow-panel-lg transition hover:shadow-panel" onClick={exportTasks}>
          <p className="text-sm font-bold text-dark">Export tasks</p>
          <p className="mt-1 text-xs text-slate-500">All field tasks with status, type, assignee.</p>
        </button>
        <button type="button" className="flux-card p-5 text-left shadow-panel-lg transition hover:shadow-panel" onClick={exportCustomers}>
          <p className="text-sm font-bold text-dark">Export customers</p>
          <p className="mt-1 text-xs text-slate-500">CRM lite snapshot with segment.</p>
        </button>
        <button type="button" className="flux-card p-5 text-left shadow-panel-lg transition hover:shadow-panel" onClick={loadAudit}>
          <p className="text-sm font-bold text-dark">Refresh audit log</p>
          <p className="mt-1 text-xs text-slate-500">{loading ? 'Loading…' : `${audit.length} rows in memory`}</p>
        </button>
      </div>

      <div className="flux-card overflow-auto p-4 shadow-panel-lg">
        <h2 className="mb-3 text-base font-bold text-dark">Activity log</h2>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-2">When</th>
              <th>Action</th>
              <th>Entity</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a._id} className="border-t border-neutral-100">
                <td className="py-2">{new Date(a.createdAt).toLocaleString()}</td>
                <td>{a.action}</td>
                <td>
                  {a.entity} {a.entityId}
                </td>
              </tr>
            ))}
            {!audit.length && (
              <tr>
                <td colSpan={3} className="py-4 text-slate-500">
                  Click “Refresh audit log” to load entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default ReportsPage;
