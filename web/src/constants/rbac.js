export const USER_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'field_agent', label: 'Employee' },
];

/** Display label for a stored role value (matches USER_ROLES labels). */
export function roleLabel(role) {
  const r = USER_ROLES.find((x) => x.value === role);
  if (r) return r.label;
  const s = String(role || '').trim();
  return s ? s.replace(/_/g, ' ') : '—';
}

export const PERMISSION_PRESETS = [
  { key: 'tasks.view', label: 'View tasks' },
  { key: 'tasks.create', label: 'Create tasks' },
  { key: 'tasks.edit', label: 'Edit tasks' },
  { key: 'customers.view', label: 'View customers' },
  { key: 'customers.edit', label: 'Edit customers' },
  { key: 'tracking.view', label: 'Live tracking' },
  { key: 'reports.view', label: 'Reports' },
  { key: 'expenses.view', label: 'Expenses' },
  { key: 'attendance.view', label: 'Attendance' },
];

export const TASK_TYPES = [
  { value: 'visit', label: 'Visit' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'collection', label: 'Collection' },
  { value: 'inspection', label: 'Inspection' },
];

export const TASK_PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export const TASK_LIFECYCLE_STATUSES = [
  'assigned',
  'accepted',
  'in_progress',
  'completed',
  'verified',
  'cancelled',
  'reassigned',
  'progress',
  'arrived',
  'rejected',
  'resumed',
  'hold',
  'exited',
];
