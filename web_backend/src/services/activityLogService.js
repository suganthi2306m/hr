const ActivityLog = require('../models/ActivityLog');

async function logActivity({ companyId, adminId, action, entity, entityId, details, ip }) {
  try {
    await ActivityLog.create({
      companyId: companyId || undefined,
      adminId: adminId || undefined,
      action,
      entity: entity || '',
      entityId: entityId != null ? String(entityId) : '',
      details: details || {},
      ip: ip || '',
    });
  } catch (e) {
    console.warn('[activity-log]', e.message);
  }
}

module.exports = { logActivity };
