const DashboardNotification = require('../models/DashboardNotification');
const socketHub = require('./socketHub');

function toSocketPayload(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    _id: String(o._id),
    title: o.title,
    body: o.body,
    type: o.type,
    readAt: o.readAt || null,
    createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
    meta: o.meta && typeof o.meta === 'object' ? o.meta : {},
  };
}

async function saveAndEmit({ companyId, title, body, type, meta }) {
  const doc = await DashboardNotification.create({
    companyId,
    title,
    body,
    type,
    meta: meta || {},
  });
  socketHub.emitToCompany(String(companyId), 'ops_notification', toSocketPayload(doc));
}

/**
 * Fire-and-forget from company visit check-in (new visit only).
 */
async function notifyCompanyVisitCheckIn({ businessId, visit, siteLabel, actorName }) {
  if (!businessId || !visit) return;
  const name = (actorName && String(actorName).trim()) || 'A team member';
  const site = (siteLabel && String(siteLabel).trim()) || 'a customer site';
  await saveAndEmit({
    companyId: businessId,
    title: 'Company visit · Check-in',
    body: `${name} checked in at ${site}.`,
    type: 'company_visit_checkin',
    meta: { visitId: String(visit._id), companyName: site },
  });
}

async function notifyCompanyVisitCheckOut({ businessId, visit, actorName }) {
  if (!businessId || !visit) return;
  const name = (actorName && String(actorName).trim()) || 'A team member';
  const site =
    (visit.companyName && String(visit.companyName).trim()) || 'customer site';
  const mins = visit.durationMinutes;
  const dur =
    typeof mins === 'number' && Number.isFinite(mins) ? ` · ${mins} min` : '';
  await saveAndEmit({
    companyId: businessId,
    title: 'Company visit · Check-out',
    body: `${name} checked out from ${site}${dur}.`,
    type: 'company_visit_checkout',
    meta: {
      visitId: String(visit._id),
      companyName: site,
      durationMinutes: mins,
    },
  });
}

module.exports = {
  notifyCompanyVisitCheckIn,
  notifyCompanyVisitCheckOut,
};
