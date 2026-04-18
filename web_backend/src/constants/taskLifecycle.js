/** Canonical web + mobile lifecycle */
const TASK_STATUSES = [
  'assigned',
  'accepted',
  'in_progress',
  'completed',
  'verified',
];

/** Legacy / mobile statuses mapped to canonical for transitions */
const LEGACY_STATUS_MAP = {
  progress: 'in_progress',
  arrived: 'in_progress',
  resumed: 'in_progress',
  hold: 'in_progress',
  exited: 'in_progress',
  rejected: 'assigned',
};

const TASK_TYPES = ['visit', 'delivery', 'collection', 'inspection'];

const TASK_PRIORITIES = ['high', 'medium', 'low'];

function normalizeStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  return LEGACY_STATUS_MAP[s] || s || 'assigned';
}

/** Allowed next statuses from current (flexible for legacy data) */
const CANONICAL_ORDER = ['assigned', 'accepted', 'in_progress', 'completed', 'verified'];

function isCanonical(s) {
  return CANONICAL_ORDER.includes(s);
}

function applyStatusTimestamps(existing, nextStatus) {
  const now = new Date();
  const cur = { ...(existing.statusTimestamps || {}) };
  const n = normalizeStatus(nextStatus);
  if (n === 'accepted') cur.acceptedAt = cur.acceptedAt || now;
  if (n === 'in_progress') cur.inProgressAt = cur.inProgressAt || now;
  if (n === 'completed') cur.completedAt = cur.completedAt || now;
  if (n === 'verified') cur.verifiedAt = cur.verifiedAt || now;
  return cur;
}

module.exports = {
  TASK_STATUSES,
  TASK_TYPES,
  TASK_PRIORITIES,
  LEGACY_STATUS_MAP,
  normalizeStatus,
  isCanonical,
  CANONICAL_ORDER,
  applyStatusTimestamps,
};
