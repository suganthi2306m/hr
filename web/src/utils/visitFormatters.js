export function formatDt(iso) {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

export function formatDay(iso) {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function durationLabel(row) {
  if (row.durationMinutes != null && Number.isFinite(Number(row.durationMinutes))) {
    return `${row.durationMinutes} min`;
  }
  if (row.checkOutTime && row.checkInTime) {
    const m = Math.round((new Date(row.checkOutTime) - new Date(row.checkInTime)) / 60000);
    return `${Math.max(0, m)} min`;
  }
  return row.status === 'open' ? 'In progress' : '—';
}

export function visitSourceLabel(source) {
  const s = String(source || '').trim().toLowerCase();
  if (!s) return '—';
  if (s === 'smart_visit_sync') return 'Auto check-in';
  return String(source).trim();
}
