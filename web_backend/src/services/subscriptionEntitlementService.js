const Company = require('../models/Company');
const License = require('../models/License');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const { addMonths } = require('./licenseKeyService');

async function syncCompanyFromLicenseDoc(companyId, lic) {
  if (!companyId || !lic) return;
  await Company.findByIdAndUpdate(companyId, {
    $set: {
      'subscription.licenseId': lic._id,
      'subscription.licenseKey': lic.licenseKey,
      'subscription.planId': lic.planId,
      'subscription.planCode': lic.planCode,
      'subscription.planName': lic.planName,
      'subscription.maxUsers': lic.maxUsers,
      'subscription.maxBranches': lic.maxBranches,
      'subscription.expiresAt': lic.validUntil,
      'subscription.isTrial': Boolean(lic.isTrial),
      'subscription.isActive': true,
    },
  });
}

/**
 * After a captured subscription payment: extend license and sync company snapshot.
 */
async function applyCapturedSubscriptionPayment(payment) {
  const companyId = payment.companyId;
  if (!companyId) return { ok: false, message: 'Missing company.' };

  const durationMonths = Math.max(1, Math.min(120, Number(payment.durationMonths) || 12));
  const plan = payment.planId ? await SubscriptionPlan.findById(payment.planId) : null;

  let lic =
    (payment.licenseId && (await License.findById(payment.licenseId))) ||
    (await License.findOne({ companyId }).sort({ updatedAt: -1 }));

  if (!lic) {
    return { ok: false, message: 'No license found for this company.' };
  }

  if (plan && String(lic.planId) !== String(plan._id)) {
    lic.planId = plan._id;
    lic.planCode = plan.planCode;
    lic.planName = plan.name;
    lic.maxUsers = plan.maxUsers;
    lic.maxBranches = plan.maxBranches;
  }

  const now = new Date();
  const currentEnd = lic.validUntil && new Date(lic.validUntil) > now ? new Date(lic.validUntil) : now;
  lic.validUntil = addMonths(currentEnd, durationMonths);
  lic.status = 'active';
  lic.isTrial = false;
  if (!lic.validFrom || new Date(lic.validFrom) > now) {
    lic.validFrom = now;
  }
  await lic.save();

  await syncCompanyFromLicenseDoc(companyId, lic);
  return { ok: true, license: lic };
}

module.exports = {
  applyCapturedSubscriptionPayment,
  syncCompanyFromLicenseDoc,
};
