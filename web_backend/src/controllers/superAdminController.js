const mongoose = require('mongoose');
const { validatePaysharpApiBaseUrlInput } = require('../services/paysharpService');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const Company = require('../models/Company');
const User = require('../models/User');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const License = require('../models/License');
const PlatformSettings = require('../models/PlatformSettings');
const PaymentTransaction = require('../models/PaymentTransaction');
const { generateUniqueLicenseKey, addMonths } = require('../services/licenseKeyService');
const { encryptSecret } = require('../services/fieldCrypto');
const { getPaysharpConfig } = require('../services/platformGatewayConfig');
const { fetchPaysharpUpiOrderStatus } = require('../services/paysharpService');
const { applyCapturedSubscriptionPayment } = require('../services/subscriptionEntitlementService');
const {
  normalizeEmail,
  assertCompanyEmailPhoneUnique,
  assertAdminEmailAvailable,
} = require('../utils/contactUniqueness');

function asInt(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function isMainSuperAdmin(req) {
  return req.admin?.role === 'mainsuperadmin';
}

function scopeForPartner(req) {
  if (isMainSuperAdmin(req)) return {};
  return { createdBySuperAdminId: req.admin._id };
}

function canAccessPartnerResource(req, createdById) {
  if (isMainSuperAdmin(req)) return true;
  const ownerId =
    createdById && typeof createdById === 'object' && createdById._id != null
      ? createdById._id
      : createdById;
  return String(ownerId || '') === String(req.admin?._id || '');
}

async function listPlans(req, res, next) {
  try {
    const activeOnly = String(req.query.active || '').toLowerCase() === '1' || String(req.query.active || '').toLowerCase() === 'true';
    const q = { createdByAdminId: req.admin._id };
    if (activeOnly) q.isActive = true;
    const items = await SubscriptionPlan.find(q).sort({ priceInr: 1, name: 1 }).lean();
    return res.json({ items });
  } catch (e) {
    return next(e);
  }
}

async function createPlan(req, res, next) {
  try {
    const planCode = String(req.body.planCode || '').trim().toLowerCase().replace(/\s+/g, '-');
    if (!planCode) return res.status(400).json({ message: 'Plan code is required.' });
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Plan name is required.' });
    const licensePrefix = String(req.body.licensePrefix || planCode).trim().toUpperCase().slice(0, 4);
    const maxUsers = Math.max(1, asInt(req.body.maxUsers, 30));
    const maxBranches = Math.max(1, asInt(req.body.maxBranches, 3));
    const durationMonths = Math.max(1, asInt(req.body.durationMonths, 12));
    const priceInr = Math.max(0, Number(req.body.priceInr) || 0);
    const trialDays = Math.max(0, asInt(req.body.trialDays, 0));
    const item = await SubscriptionPlan.create({
      createdByAdminId: req.admin._id,
      planCode,
      name,
      description: String(req.body.description || '').trim(),
      priceInr,
      durationMonths,
      maxUsers,
      maxBranches,
      trialDays,
      licensePrefix,
      isActive: req.body.isActive !== false,
    });
    return res.status(201).json({ item });
  } catch (e) {
    if (e && e.code === 11000) return res.status(409).json({ message: 'A plan with this code already exists.' });
    return next(e);
  }
}

async function updatePlan(req, res, next) {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid plan id.' });
    const patch = {};
    for (const k of ['name', 'description', 'priceInr', 'durationMonths', 'maxUsers', 'maxBranches', 'trialDays', 'licensePrefix', 'isActive']) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    if (patch.licensePrefix != null) patch.licensePrefix = String(patch.licensePrefix).trim().toUpperCase().slice(0, 4);
    if (patch.maxUsers != null) patch.maxUsers = Math.max(1, asInt(patch.maxUsers, 1));
    if (patch.maxBranches != null) patch.maxBranches = Math.max(1, asInt(patch.maxBranches, 1));
    if (patch.durationMonths != null) patch.durationMonths = Math.max(1, asInt(patch.durationMonths, 12));
    if (patch.priceInr != null) patch.priceInr = Math.max(0, Number(patch.priceInr) || 0);
    if (patch.trialDays != null) patch.trialDays = Math.max(0, asInt(patch.trialDays, 0));
    const item = await SubscriptionPlan.findOneAndUpdate({ _id: id, createdByAdminId: req.admin._id }, { $set: patch }, {
      new: true,
    });
    if (!item) return res.status(404).json({ message: 'Plan not found.' });
    return res.json({ item });
  } catch (e) {
    return next(e);
  }
}

function normalizeLicenseKey(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function licenseStatusFromRow(row, now = new Date()) {
  if (row.status === 'revoked' || row.status === 'suspended') return row.status;
  if (!row.companyId) return 'unassigned';
  if (row.validUntil && new Date(row.validUntil) < now) return 'expired';
  return 'active';
}

async function listLicenses(req, res, next) {
  try {
    const search = String(req.query.q || '').trim();
    const statusFilter = String(req.query.status || '').trim().toLowerCase();
    const q = isMainSuperAdmin(req) ? {} : { createdByAdminId: req.admin._id };
    if (search) {
      q.$or = [
        { licenseKey: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { planName: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      ];
    }
    const items = await License.find(q).populate('companyId', 'name email').populate('planId', 'name planCode').sort({ createdAt: -1 }).limit(500).lean();

    const now = new Date();
    const mapped = items.map((row) => {
      const derived = licenseStatusFromRow(row, now);
      return {
        ...row,
        derivedStatus: derived,
        companyName: row.companyId?.name || '',
      };
    });
    const filtered =
      statusFilter && statusFilter !== 'all'
        ? mapped.filter((r) => {
            if (statusFilter === 'active') return r.derivedStatus === 'active';
            if (statusFilter === 'unassigned') return r.derivedStatus === 'unassigned';
            if (statusFilter === 'expired') return r.derivedStatus === 'expired';
            if (statusFilter === 'suspended') return r.status === 'suspended';
            return true;
          })
        : mapped;

    return res.json({ items: filtered });
  } catch (e) {
    return next(e);
  }
}

async function createLicense(req, res, next) {
  try {
    if (!isMainSuperAdmin(req) && req.admin?.maxLicenses != null) {
      const used = await License.countDocuments({ createdByAdminId: req.admin._id });
      if (used >= Number(req.admin.maxLicenses)) {
        return res.status(403).json({ message: 'License creation limit reached for this super admin.' });
      }
    }
    const planId = String(req.body.planId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(planId)) return res.status(400).json({ message: 'Valid planId is required.' });
    const plan = await SubscriptionPlan.findOne({ _id: planId, createdByAdminId: req.admin._id });
    if (!plan || plan.isActive === false) return res.status(400).json({ message: 'Plan not found or inactive.' });

    const maxUsers = req.body.maxUsers != null ? Math.max(1, asInt(req.body.maxUsers, plan.maxUsers)) : plan.maxUsers;
    const maxBranches = req.body.maxBranches != null ? Math.max(1, asInt(req.body.maxBranches, plan.maxBranches)) : plan.maxBranches;
    const isTrial = Boolean(req.body.isTrial);
    const notes = String(req.body.notes || '').trim();

    let validUntil = req.body.validUntil ? new Date(req.body.validUntil) : addMonths(new Date(), plan.durationMonths);
    if (!Number.isFinite(validUntil.getTime())) validUntil = addMonths(new Date(), plan.durationMonths);

    const licenseKey =
      req.body.licenseKey && String(req.body.licenseKey).trim()
        ? normalizeLicenseKey(req.body.licenseKey)
        : await generateUniqueLicenseKey(plan);
    if (licenseKey.length < 8) return res.status(400).json({ message: 'License key is too short.' });
    const dup = await License.exists({ licenseKey });
    if (dup) return res.status(409).json({ message: 'This license key already exists.' });

    const companyIdRaw = req.body.companyId != null ? String(req.body.companyId).trim() : '';
    const companyId = mongoose.Types.ObjectId.isValid(companyIdRaw) ? new mongoose.Types.ObjectId(companyIdRaw) : null;
    if (companyId && !isMainSuperAdmin(req)) {
      const owned = await Company.exists({ _id: companyId, createdBySuperAdminId: req.admin._id });
      if (!owned) return res.status(403).json({ message: 'You can only assign licenses to your companies.' });
    }

    const row = await License.create({
      licenseKey,
      companyId,
      planId: plan._id,
      planCode: plan.planCode,
      planName: plan.name,
      maxUsers,
      maxBranches,
      validUntil,
      status: companyId ? 'active' : 'unassigned',
      isTrial,
      notes,
      createdByAdminId: req.admin._id,
    });

    if (companyId) {
      await Company.findByIdAndUpdate(companyId, {
        $set: {
          'subscription.planId': plan._id,
          'subscription.planCode': plan.planCode,
          'subscription.planName': plan.name,
          'subscription.licenseId': row._id,
          'subscription.licenseKey': row.licenseKey,
          'subscription.maxUsers': maxUsers,
          'subscription.maxBranches': maxBranches,
          'subscription.expiresAt': validUntil,
          'subscription.isActive': true,
        },
      });
    }

    const populated = await License.findById(row._id).populate('companyId', 'name email').populate('planId', 'name planCode');
    return res.status(201).json({ item: populated });
  } catch (e) {
    return next(e);
  }
}

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
    },
  });
}

async function getLicense(req, res, next) {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid license id.' });
    const item = await License.findById(id).populate('companyId', 'name email').populate('planId', 'name planCode priceInr').lean();
    if (!item) return res.status(404).json({ message: 'License not found.' });
    if (!canAccessPartnerResource(req, item.createdByAdminId)) return res.status(403).json({ message: 'Access denied.' });
    const derivedStatus = licenseStatusFromRow(item, new Date());
    return res.json({ item: { ...item, derivedStatus } });
  } catch (e) {
    return next(e);
  }
}

async function patchLicense(req, res, next) {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid license id.' });
    const lic = await License.findById(id);
    if (!lic) return res.status(404).json({ message: 'License not found.' });
    if (!canAccessPartnerResource(req, lic.createdByAdminId)) return res.status(403).json({ message: 'Access denied.' });

    if (req.body.action === 'revoke') {
      lic.status = 'revoked';
      await lic.save();
      if (lic.companyId) {
        await Company.findByIdAndUpdate(lic.companyId, {
          $set: { 'subscription.isActive': false },
        });
      }
      const populated = await License.findById(lic._id).populate('companyId', 'name email').populate('planId', 'name planCode');
      return res.json({ item: populated });
    }

    if (req.body.status && ['active', 'suspended', 'unassigned', 'revoked'].includes(req.body.status)) {
      lic.status = req.body.status;
    }

    if (req.body.planId !== undefined && String(req.body.planId).trim() && mongoose.Types.ObjectId.isValid(String(req.body.planId))) {
      const plan = await SubscriptionPlan.findOne({ _id: req.body.planId, createdByAdminId: lic.createdByAdminId });
      if (!plan || plan.isActive === false) return res.status(400).json({ message: 'Plan not found or inactive.' });
      lic.planId = plan._id;
      lic.planCode = plan.planCode;
      lic.planName = plan.name;
      if (req.body.maxUsers == null && req.body.maxBranches == null) {
        lic.maxUsers = plan.maxUsers;
        lic.maxBranches = plan.maxBranches;
      }
    }
    if (req.body.maxUsers != null) lic.maxUsers = Math.max(1, asInt(req.body.maxUsers, lic.maxUsers));
    if (req.body.maxBranches != null) lic.maxBranches = Math.max(1, asInt(req.body.maxBranches, lic.maxBranches));
    if (req.body.validUntil !== undefined) {
      const d = req.body.validUntil ? new Date(req.body.validUntil) : lic.validUntil;
      if (Number.isFinite(d.getTime())) lic.validUntil = d;
    }
    if (req.body.notes !== undefined) lic.notes = String(req.body.notes || '').trim();
    if (req.body.isTrial !== undefined) lic.isTrial = Boolean(req.body.isTrial);

    await lic.save();

    if (lic.companyId) {
      await syncCompanyFromLicenseDoc(lic.companyId, lic);
    }

    const populated = await License.findById(lic._id).populate('companyId', 'name email').populate('planId', 'name planCode');
    return res.json({ item: populated });
  } catch (e) {
    return next(e);
  }
}

async function listCompanies(req, res, next) {
  try {
    const search = String(req.query.q || '').trim().toLowerCase();
    const q = { ...scopeForPartner(req) };
    if (search) {
      q.$or = [
        { name: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { email: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { 'subscription.licenseKey': new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      ];
    }
    const companies = await Company.find(q)
      .populate('adminId', 'name email')
      .populate('createdBySuperAdminId', 'name email role')
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean();
    const ids = companies.map((c) => c._id);
    const userCounts = await User.aggregate([{ $match: { companyId: { $in: ids } } }, { $group: { _id: '$companyId', n: { $sum: 1 } } }]);
    const ucMap = new Map(userCounts.map((x) => [String(x._id), x.n]));
    const items = companies.map((c) => ({
      ...c,
      staffCount: ucMap.get(String(c._id)) || 0,
      branchCount: Array.isArray(c.branches) ? c.branches.length : 0,
      createdBy: c.createdBySuperAdminId
        ? {
            _id: c.createdBySuperAdminId._id,
            name: c.createdBySuperAdminId.name || '',
            email: c.createdBySuperAdminId.email || '',
            role: c.createdBySuperAdminId.role || '',
          }
        : null,
    }));
    return res.json({ items });
  } catch (e) {
    return next(e);
  }
}

async function getCompany(req, res, next) {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid company id.' });
    const company = await Company.findById(id)
      .populate('adminId', 'name email')
      .populate('createdBySuperAdminId', 'name email role')
      .populate('subscription.planId')
      .lean();
    if (!company) return res.status(404).json({ message: 'Company not found.' });
    if (!canAccessPartnerResource(req, company.createdBySuperAdminId)) return res.status(403).json({ message: 'Access denied.' });
    const staffCount = await User.countDocuments({ companyId: company._id });
    const branchCount = Array.isArray(company.branches) ? company.branches.length : 0;

    let planRecord =
      company.subscription?.planId && typeof company.subscription.planId === 'object'
        ? company.subscription.planId
        : null;
    const planIdOid =
      company.subscription?.planId && typeof company.subscription.planId === 'object'
        ? company.subscription.planId._id
        : company.subscription?.planId;
    if (!planRecord && planIdOid && mongoose.Types.ObjectId.isValid(String(planIdOid))) {
      planRecord = await SubscriptionPlan.findById(planIdOid).lean();
    }

    const licRef = company.subscription?.licenseId;
    let licenseRecord = null;
    if (licRef && mongoose.Types.ObjectId.isValid(String(licRef))) {
      licenseRecord = await License.findById(licRef)
        .populate(
          'planId',
          'planCode name description priceInr durationMonths maxUsers maxBranches licensePrefix isActive createdAt updatedAt',
        )
        .populate('createdByAdminId', 'name email role')
        .lean();
    }
    if (!licenseRecord) {
      licenseRecord = await License.findOne({ companyId: company._id })
        .sort({ createdAt: -1 })
        .populate(
          'planId',
          'planCode name description priceInr durationMonths maxUsers maxBranches licensePrefix isActive createdAt updatedAt',
        )
        .populate('createdByAdminId', 'name email role')
        .lean();
    }

    const subscriptionOut = company.subscription
      ? { ...company.subscription, planId: planIdOid || company.subscription.planId }
      : company.subscription;

    return res.json({
      company: {
        ...company,
        subscription: subscriptionOut,
        staffCount,
        branchCount,
        createdBy: company.createdBySuperAdminId
          ? {
              _id: company.createdBySuperAdminId._id,
              name: company.createdBySuperAdminId.name || '',
              email: company.createdBySuperAdminId.email || '',
              role: company.createdBySuperAdminId.role || '',
            }
          : null,
      },
      planRecord,
      licenseRecord,
    });
  } catch (e) {
    return next(e);
  }
}

async function createCompany(req, res, next) {
  try {
    if (!isMainSuperAdmin(req) && req.admin?.maxCompanies != null) {
      const used = await Company.countDocuments({ createdBySuperAdminId: req.admin._id });
      if (used >= Number(req.admin.maxCompanies)) {
        return res.status(403).json({ message: 'Company creation limit reached for this super admin.' });
      }
    }
    const name = String(req.body.name || '').trim();
    const companyEmail = String(req.body.companyEmail || req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const city = String(req.body.city || '').trim();
    const state = String(req.body.state || '').trim();
    const address = String(req.body.address || '').trim() || [city, state].filter(Boolean).join(', ');
    const ownerName = String(req.body.ownerName || '').trim();
    const ownerEmail = String(req.body.ownerEmail || '').trim().toLowerCase();
    const ownerPassword = String(req.body.ownerPassword || '').trim();
    const planId = String(req.body.planId || '').trim();
    const generateLicense = req.body.generateLicense !== false && req.body.generateLicense !== 'false';
    const manualKey = req.body.licenseKey != null ? normalizeLicenseKey(req.body.licenseKey) : '';
    const companyIsActive = req.body.companyIsActive !== false;

    if (!name || !companyEmail || !phone || !address) {
      return res.status(400).json({ message: 'Company name, email, phone, and address (or city & state) are required.' });
    }
    if (!ownerName || !ownerEmail || !ownerPassword || ownerPassword.length < 6) {
      return res.status(400).json({ message: 'Owner name, email, and password (min 6 chars) are required.' });
    }
    if (!mongoose.Types.ObjectId.isValid(planId)) return res.status(400).json({ message: 'Valid planId is required.' });

    const plan = await SubscriptionPlan.findOne({ _id: planId, createdByAdminId: req.admin._id });
    if (!plan || plan.isActive === false) return res.status(400).json({ message: 'Plan not found or inactive.' });

    try {
      await assertCompanyEmailPhoneUnique(null, companyEmail, phone);
      await assertAdminEmailAvailable(ownerEmail);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ message: e.message });
      throw e;
    }

    const owner = await Admin.create({
      name: ownerName,
      email: ownerEmail,
      password: ownerPassword,
      role: 'admin',
      companySetupCompleted: true,
      isActive: true,
    });

    const company = await Company.create({
      adminId: owner._id,
      createdBySuperAdminId: req.admin._id,
      name,
      address,
      phone,
      email: companyEmail,
      city,
      state,
      branches: [],
      subscription: {
        planId: plan._id,
        planCode: plan.planCode,
        planName: plan.name,
        maxUsers: plan.maxUsers,
        maxBranches: plan.maxBranches,
        isActive: companyIsActive,
      },
    });

    let license = null;
    if (generateLicense) {
      const licenseKey = await generateUniqueLicenseKey(plan);
      const validUntil = addMonths(new Date(), plan.durationMonths);
      license = await License.create({
        licenseKey,
        companyId: company._id,
        planId: plan._id,
        planCode: plan.planCode,
        planName: plan.name,
        maxUsers: plan.maxUsers,
        maxBranches: plan.maxBranches,
        validUntil,
        status: 'active',
        isTrial: false,
        notes: String(req.body.licenseNotes || '').trim(),
        createdByAdminId: req.admin._id,
      });
      await Company.findByIdAndUpdate(company._id, {
        $set: {
          'subscription.licenseId': license._id,
          'subscription.licenseKey': license.licenseKey,
          'subscription.expiresAt': validUntil,
        },
      });
    } else if (manualKey) {
      license = await License.findOne({ licenseKey: manualKey });
      if (!license) return res.status(400).json({ message: 'License key not found.' });
      if (license.companyId) return res.status(400).json({ message: 'This license is already assigned to a company.' });
      license.companyId = company._id;
      license.status = 'active';
      await license.save();
      await Company.findByIdAndUpdate(company._id, {
        $set: {
          'subscription.licenseId': license._id,
          'subscription.licenseKey': license.licenseKey,
          'subscription.maxUsers': license.maxUsers,
          'subscription.maxBranches': license.maxBranches,
          'subscription.expiresAt': license.validUntil,
          'subscription.planId': license.planId,
          'subscription.planCode': license.planCode,
          'subscription.planName': license.planName,
        },
      });
    }

    const fresh = await Company.findById(company._id).populate('adminId', 'name email').lean();
    const licLean = license ? await License.findById(license._id).lean() : null;
    return res.status(201).json({ company: fresh, license: licLean });
  } catch (e) {
    return next(e);
  }
}

async function updateCompany(req, res, next) {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid company id.' });
    const company = await Company.findById(id);
    if (!company) return res.status(404).json({ message: 'Company not found.' });
    if (!canAccessPartnerResource(req, company.createdBySuperAdminId)) return res.status(403).json({ message: 'Access denied.' });

    if (req.body.subscriptionIsActive !== undefined) {
      company.subscription = company.subscription || {};
      company.subscription.isActive = Boolean(req.body.subscriptionIsActive);
    }
    if (req.body.name !== undefined) company.name = String(req.body.name || '').trim();
    if (req.body.companyEmail !== undefined) company.email = String(req.body.companyEmail || '').trim().toLowerCase();
    if (req.body.phone !== undefined) company.phone = String(req.body.phone || '').trim();
    if (req.body.address !== undefined) company.address = String(req.body.address || '').trim();
    if (req.body.city !== undefined) company.city = String(req.body.city || '').trim();
    if (req.body.state !== undefined) company.state = String(req.body.state || '').trim();

    if (req.body.planId !== undefined && String(req.body.planId).trim()) {
      const pid = String(req.body.planId).trim();
      if (!mongoose.Types.ObjectId.isValid(pid)) return res.status(400).json({ message: 'Invalid plan id.' });
      const catalogOwnerId = company.createdBySuperAdminId || req.admin._id;
      const plan = await SubscriptionPlan.findOne({ _id: pid, createdByAdminId: catalogOwnerId });
      if (!plan || plan.isActive === false) return res.status(400).json({ message: 'Plan not found or inactive.' });
      company.subscription = company.subscription || {};
      company.subscription.planId = plan._id;
      company.subscription.planCode = plan.planCode;
      company.subscription.planName = plan.name;
      company.subscription.maxUsers = plan.maxUsers;
      company.subscription.maxBranches = plan.maxBranches;
      const licId = company.subscription.licenseId;
      if (licId) {
        const lic = await License.findById(licId);
        if (lic) {
          lic.planId = plan._id;
          lic.planCode = plan.planCode;
          lic.planName = plan.name;
          lic.maxUsers = plan.maxUsers;
          lic.maxBranches = plan.maxBranches;
          await lic.save();
        }
      }
    }

    await company.save();

    if (req.body.ownerName !== undefined && company.adminId) {
      const nm = String(req.body.ownerName || '').trim();
      if (nm) await Admin.findByIdAndUpdate(company.adminId, { $set: { name: nm } });
    }

    if (req.body.ownerPassword && String(req.body.ownerPassword).trim().length >= 6 && company.adminId) {
      const hash = await bcrypt.hash(String(req.body.ownerPassword).trim(), 10);
      await Admin.findByIdAndUpdate(company.adminId, { $set: { password: hash } });
    }

    const fresh = await Company.findById(company._id).populate('adminId', 'name email').lean();
    const staffCount = await User.countDocuments({ companyId: company._id });
    const branchCount = Array.isArray(fresh.branches) ? fresh.branches.length : 0;
    return res.json({ company: { ...fresh, staffCount, branchCount } });
  } catch (e) {
    return next(e);
  }
}

async function getOrCreatePlatformSettings() {
  let doc = await PlatformSettings.findOne({ key: 'default' });
  if (!doc) doc = await PlatformSettings.create({ key: 'default' });
  return doc;
}

function sanitizePlatformSettings(leanOrDoc) {
  const raw = leanOrDoc && typeof leanOrDoc.toObject === 'function' ? leanOrDoc.toObject() : { ...leanOrDoc };
  const em = raw.email || {};
  const pay = raw.paysharp || {};
  const pal = raw.paypal || {};
  const rz = raw.razorpay || {};
  const paysharpEnvToken = String(process.env.PAYSHARP_API_TOKEN || process.env.PAYSHARP_BEARER_TOKEN || '').trim();
  return {
    _id: raw._id,
    key: raw.key,
    updatedAt: raw.updatedAt,
    createdAt: raw.createdAt,
    email: {
      smtpHost: em.smtpHost || '',
      smtpPort: em.smtpPort ?? 587,
      useTls: em.useTls !== false,
      smtpUser: em.smtpUser || '',
      fromEmail: em.fromEmail || '',
      fromName: em.fromName || '',
      smtpPasswordSet: Boolean(em.smtpPassword),
    },
    paysharp: {
      enabled: Boolean(pay.enabled),
      merchantId: pay.merchantId || '',
      apiKeySet: Boolean(pay.apiKey) || Boolean(paysharpEnvToken),
      apiTokenFromEnv: Boolean(paysharpEnvToken),
      webhookSecretSet: Boolean(pay.webhookSecret),
      apiBaseUrl: pay.apiBaseUrl || '',
      useSandbox: pay.useSandbox === true,
    },
    paypal: {
      enabled: Boolean(pal.enabled),
      clientId: pal.clientId || '',
      mode: pal.mode === 'live' ? 'live' : 'sandbox',
      clientSecretSet: Boolean(pal.clientSecret),
    },
    razorpay: {
      enabled: Boolean(rz.enabled),
      keyId: rz.keyId || '',
      keySecretSet: Boolean(rz.keySecret),
      webhookSecretSet: Boolean(rz.webhookSecret),
    },
  };
}

async function getIntegrations(req, res, next) {
  try {
    const doc = await getOrCreatePlatformSettings();
    return res.json({ item: sanitizePlatformSettings(doc) });
  } catch (e) {
    return next(e);
  }
}

async function patchIntegrations(req, res, next) {
  try {
    const doc = await getOrCreatePlatformSettings();
    const { email, paysharp, paypal, razorpay } = req.body || {};

    if (email && typeof email === 'object') {
      doc.email = doc.email || {};
      const e = email;
      if (e.smtpHost !== undefined) doc.email.smtpHost = String(e.smtpHost || '').trim();
      if (e.smtpPort !== undefined) doc.email.smtpPort = Math.max(1, asInt(e.smtpPort, doc.email.smtpPort || 587));
      if (e.useTls !== undefined) doc.email.useTls = Boolean(e.useTls);
      if (e.smtpUser !== undefined) doc.email.smtpUser = String(e.smtpUser || '').trim();
      if (e.fromEmail !== undefined) doc.email.fromEmail = String(e.fromEmail || '').trim();
      if (e.fromName !== undefined) doc.email.fromName = String(e.fromName || '').trim();
      if (e.smtpPassword !== undefined && String(e.smtpPassword).trim()) {
        doc.email.smtpPassword = encryptSecret(String(e.smtpPassword).trim());
      }
    }

    if (paysharp && typeof paysharp === 'object') {
      doc.paysharp = doc.paysharp || {};
      const p = paysharp;
      if (p.enabled !== undefined) doc.paysharp.enabled = Boolean(p.enabled);
      if (p.merchantId !== undefined) doc.paysharp.merchantId = String(p.merchantId || '').trim();
      if (p.apiKey !== undefined && String(p.apiKey).trim()) doc.paysharp.apiKey = encryptSecret(String(p.apiKey).trim());
      if (p.webhookSecret !== undefined && String(p.webhookSecret).trim()) {
        doc.paysharp.webhookSecret = encryptSecret(String(p.webhookSecret).trim());
      }
      if (p.apiBaseUrl !== undefined) {
        const trimmed = String(p.apiBaseUrl || '').trim().slice(0, 500);
        if (trimmed) {
          const chk = validatePaysharpApiBaseUrlInput(trimmed);
          if (!chk.ok) return res.status(400).json({ message: chk.message });
          doc.paysharp.apiBaseUrl = chk.value;
        } else {
          doc.paysharp.apiBaseUrl = '';
        }
      }
      if (p.useSandbox !== undefined) doc.paysharp.useSandbox = Boolean(p.useSandbox);
    }

    if (paypal && typeof paypal === 'object') {
      doc.paypal = doc.paypal || {};
      const p = paypal;
      if (p.enabled !== undefined) doc.paypal.enabled = Boolean(p.enabled);
      if (p.clientId !== undefined) doc.paypal.clientId = String(p.clientId || '').trim();
      if (p.clientSecret !== undefined && String(p.clientSecret).trim()) {
        doc.paypal.clientSecret = encryptSecret(String(p.clientSecret).trim());
      }
      if (p.mode !== undefined && ['sandbox', 'live'].includes(String(p.mode))) {
        doc.paypal.mode = String(p.mode);
      }
    }

    if (razorpay && typeof razorpay === 'object') {
      doc.razorpay = doc.razorpay || {};
      const r = razorpay;
      if (r.enabled !== undefined) doc.razorpay.enabled = Boolean(r.enabled);
      if (r.keyId !== undefined) doc.razorpay.keyId = String(r.keyId || '').trim();
      if (r.keySecret !== undefined && String(r.keySecret).trim()) {
        doc.razorpay.keySecret = encryptSecret(String(r.keySecret).trim());
      }
      if (r.webhookSecret !== undefined && String(r.webhookSecret).trim()) {
        doc.razorpay.webhookSecret = encryptSecret(String(r.webhookSecret).trim());
      }
    }

    await doc.save();
    const fresh = await PlatformSettings.findById(doc._id).lean();
    return res.json({ item: sanitizePlatformSettings(fresh) });
  } catch (e) {
    return next(e);
  }
}

async function listPayments(req, res, next) {
  try {
    const q = String(req.query.q || '').trim();
    const statusFilter = String(req.query.status || 'all').trim().toLowerCase();
    const syncPaysharp = String(req.query.syncPaysharp || '').trim() === '1';
    const match = {};
    if (!isMainSuperAdmin(req)) {
      const companyIds = await Company.find({ createdBySuperAdminId: req.admin._id }).distinct('_id');
      match.companyId = { $in: companyIds };
    }
    if (q) {
      const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(esc, 'i');
      match.$or = [
        { companyName: rx },
        { payerEmail: rx },
        { planName: rx },
        { externalPaymentId: rx },
        { gatewayOrderId: rx },
        { gatewayPaymentId: rx },
        { failureReason: rx },
        { gateway: rx },
      ];
    }

    if (statusFilter === 'paid') match.status = 'captured';
    else if (statusFilter === 'failed') match.status = 'failed';
    else if (statusFilter === 'pending') match.status = { $in: ['created', 'pending'] };

    if (syncPaysharp) {
      const paysharp = await getPaysharpConfig();
      if (paysharp.enabled && paysharp.apiKey) {
        const pendingRows = await PaymentTransaction.find({
          ...match,
          gateway: 'paysharp',
          status: { $in: ['created', 'pending'] },
        })
          .sort({ createdAt: -1 })
          .limit(100);
        for (const row of pendingRows) {
          try {
            const refNo = String(row.gatewayPayload?.data?.paysharpReferenceNo || '').trim();
            const s = await fetchPaysharpUpiOrderStatus({
              apiKey: paysharp.apiKey,
              useSandbox: paysharp.useSandbox,
              orderId: row.gatewayOrderId,
              paysharpReferenceNo: refNo,
            });
            row.gatewayPayload = {
              ...((row.gatewayPayload && typeof row.gatewayPayload === 'object' && row.gatewayPayload) || {}),
              statusCheck: s.raw,
            };
            if (s.paymentId) {
              row.gatewayPaymentId = s.paymentId;
              row.externalPaymentId = s.paymentId;
            }
            if (s.isSuccess) {
              row.status = 'captured';
              row.paidAt = row.paidAt || new Date();
              row.failureReason = '';
              await row.save();
              try {
                await applyCapturedSubscriptionPayment(row);
              } catch (entErr) {
                row.gatewayPayload = {
                  ...((row.gatewayPayload && typeof row.gatewayPayload === 'object' && row.gatewayPayload) || {}),
                  entitlementError: {
                    message: String(entErr?.message || 'Entitlement update failed'),
                    at: new Date().toISOString(),
                  },
                };
                await row.save();
              }
            } else if (s.isFailed) {
              row.status = 'failed';
              row.failureReason = String(s.failureReason || 'Payment failed').slice(0, 500);
              await row.save();
            } else {
              row.status = 'pending';
              await row.save();
            }
          } catch {
            // best-effort sync; keep current DB row if gateway status call fails
          }
        }
      }
    }
    const [agg] = await PaymentTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalCapturedPaise: { $sum: { $cond: [{ $eq: ['$status', 'captured'] }, '$amountPaise', 0] } },
          paidCount: { $sum: { $cond: [{ $eq: ['$status', 'captured'] }, 1, 0] } },
          failedCount: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          pendingCount: { $sum: { $cond: [{ $in: ['$status', ['created', 'pending']] }, 1, 0] } },
          refundedPaise: {
            $sum: {
              $cond: [{ $in: ['$status', ['refunded', 'partially_refunded']] }, '$amountPaise', 0],
            },
          },
          transactionCount: { $sum: 1 },
        },
      },
    ]);
    const stats = {
      totalCapturedPaise: agg?.totalCapturedPaise || 0,
      refundedPaise: agg?.refundedPaise || 0,
      paidCount: agg?.paidCount || 0,
      failedCount: agg?.failedCount || 0,
      pendingCount: agg?.pendingCount || 0,
      transactionCount: agg?.transactionCount || 0,
    };
    const items = await PaymentTransaction.find(match)
      .sort({ createdAt: -1 })
      .limit(300)
      .populate('companyId', 'name email')
      .lean();

    const rows = items.map((row) => ({
      _id: row._id,
      company: row.companyId?.name || row.companyName || '—',
      email: row.payerEmail || row.companyId?.email || '—',
      amountPaise: row.amountPaise,
      plan: row.planName || '—',
      gateway: row.gateway,
      method: row.method,
      status: row.status,
      gatewayOrderId: row.gatewayOrderId || '—',
      gatewayPaymentId: row.gatewayPaymentId || row.externalPaymentId || '—',
      externalPaymentId: row.externalPaymentId || row.gatewayPaymentId || '—',
      failureReason: row.failureReason || '',
      gatewayStatus:
        row.gatewayPayload?.statusCheck?.data?.status ||
        row.gatewayPayload?.statusCheck?.status ||
        row.gatewayPayload?.data?.status ||
        '',
      paysharpReferenceNo:
        row.gatewayPayload?.statusCheck?.data?.paysharpReferenceNo ||
        row.gatewayPayload?.data?.paysharpReferenceNo ||
        '',
      paidAt: row.paidAt,
      durationMonths: row.durationMonths,
      createdAt: row.createdAt,
    }));

    return res.json({ stats, items: rows });
  } catch (e) {
    return next(e);
  }
}

async function dashboard(req, res, next) {
  try {
    const now = new Date();
    const companyScope = scopeForPartner(req);
    const licenseScope = isMainSuperAdmin(req) ? {} : { createdByAdminId: req.admin._id };
    const [companiesTotal, companiesActive, plans, licensesTotal, admins, staffTotal, licenseRows, recentCompanies] =
      await Promise.all([
        Company.countDocuments(companyScope),
        Company.countDocuments({ ...companyScope, 'subscription.isActive': { $ne: false } }),
        SubscriptionPlan.countDocuments({ isActive: true, createdByAdminId: req.admin._id }),
        License.countDocuments(licenseScope),
        Admin.countDocuments({ role: 'admin' }),
        isMainSuperAdmin(req)
          ? User.countDocuments()
          : User.countDocuments({ companyId: { $in: await Company.find(companyScope).distinct('_id') } }),
        License.find(licenseScope).select('status companyId validUntil').lean(),
        Company.find(companyScope)
          .sort({ updatedAt: -1 })
          .limit(8)
          .select('name subscription updatedAt')
          .lean(),
      ]);

    let licensesActive = 0;
    let licensesExpired = 0;
    let licensesSuspended = 0;
    let licensesUnassigned = 0;
    let licensesRevoked = 0;
    for (const row of licenseRows) {
      if (row.status === 'revoked') {
        licensesRevoked += 1;
        continue;
      }
      const d = licenseStatusFromRow(row, now);
      if (d === 'active') licensesActive += 1;
      else if (d === 'expired') licensesExpired += 1;
      else if (d === 'unassigned') licensesUnassigned += 1;
      else if (row.status === 'suspended') licensesSuspended += 1;
    }

    const ids = recentCompanies.map((c) => c._id);
    const userCounts =
      ids.length > 0
        ? await User.aggregate([{ $match: { companyId: { $in: ids } } }, { $group: { _id: '$companyId', n: { $sum: 1 } } }])
        : [];
    const ucMap = new Map(userCounts.map((x) => [String(x._id), x.n]));
    const recent = recentCompanies.map((c) => ({
      _id: c._id,
      name: c.name,
      planName: c.subscription?.planName || '',
      staffCount: ucMap.get(String(c._id)) || 0,
      active: c.subscription?.isActive !== false,
    }));

    return res.json({
      companies: companiesTotal,
      companiesActive,
      plans,
      licenses: licensesTotal,
      licensesActive,
      licensesExpired,
      licensesSuspended,
      licensesUnassigned,
      licensesRevoked,
      tenantAdmins: admins,
      staffTotal,
      recentCompanies: recent,
    });
  } catch (e) {
    return next(e);
  }
}

async function listSuperAdmins(req, res, next) {
  try {
    if (!isMainSuperAdmin(req)) return res.status(403).json({ message: 'Access denied.' });
    const items = await Admin.find({ role: 'superadmin' }).select('-password').sort({ createdAt: -1 }).lean();
    const adminIds = items.map((x) => x._id);
    const [companyCounts, licenseCounts] = await Promise.all([
      Company.aggregate([{ $match: { createdBySuperAdminId: { $in: adminIds } } }, { $group: { _id: '$createdBySuperAdminId', n: { $sum: 1 } } }]),
      License.aggregate([{ $match: { createdByAdminId: { $in: adminIds } } }, { $group: { _id: '$createdByAdminId', n: { $sum: 1 } } }]),
    ]);
    const cMap = new Map(companyCounts.map((r) => [String(r._id), r.n]));
    const lMap = new Map(licenseCounts.map((r) => [String(r._id), r.n]));
    return res.json({
      items: items.map((r) => ({
        ...r,
        companiesCreated: cMap.get(String(r._id)) || 0,
        licensesCreated: lMap.get(String(r._id)) || 0,
      })),
    });
  } catch (e) {
    return next(e);
  }
}

async function createSuperAdmin(req, res, next) {
  try {
    if (!isMainSuperAdmin(req)) return res.status(403).json({ message: 'Access denied.' });
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();
    const maxCompanies = req.body.maxCompanies == null || req.body.maxCompanies === '' ? null : Math.max(0, asInt(req.body.maxCompanies, 0));
    const maxLicenses = req.body.maxLicenses == null || req.body.maxLicenses === '' ? null : Math.max(0, asInt(req.body.maxLicenses, 0));
    if (!name || !email || password.length < 6) return res.status(400).json({ message: 'Name, email and password(min 6) are required.' });
    try {
      await assertAdminEmailAvailable(email);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ message: e.message });
      throw e;
    }
    const item = await Admin.create({
      name,
      email,
      password,
      role: 'superadmin',
      isActive: true,
      companySetupCompleted: true,
      createdByMainSuperAdminId: req.admin._id,
      maxCompanies,
      maxLicenses,
    });
    const lean = await Admin.findById(item._id).select('-password').lean();
    return res.status(201).json({ item: lean });
  } catch (e) {
    return next(e);
  }
}

/** Main super admin only: companies, per-company users/branches, and all licenses created by this partner. */
async function getPartnerSuperAdminPortfolio(req, res, next) {
  try {
    if (!isMainSuperAdmin(req)) return res.status(403).json({ message: 'Access denied.' });
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid superadmin id.' });
    const partner = await Admin.findById(id).select('-password').lean();
    if (!partner || partner.role !== 'superadmin') {
      return res.status(404).json({ message: 'Super admin not found.' });
    }

    const companies = await Company.find({ createdBySuperAdminId: id })
      .populate('adminId', 'name email')
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean();

    const companyIds = companies.map((c) => c._id);
    const now = new Date();

    const userAgg =
      companyIds.length > 0
        ? await User.aggregate([{ $match: { companyId: { $in: companyIds } } }, { $group: { _id: '$companyId', n: { $sum: 1 } } }])
        : [];
    const userMap = new Map(userAgg.map((x) => [String(x._id), x.n]));

    const licIds = companies
      .map((c) => c.subscription && c.subscription.licenseId)
      .filter((x) => x && mongoose.Types.ObjectId.isValid(String(x)));
    const licenseById = new Map();
    if (licIds.length) {
      const licDocs = await License.find({ _id: { $in: licIds } }).lean();
      for (const L of licDocs) licenseById.set(String(L._id), L);
    }

    const allLicenses = await License.find({ createdByAdminId: id })
      .populate('companyId', 'name email')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    let totalUsers = 0;
    let totalBranches = 0;

    const companyRows = companies.map((c) => {
      const branchCount = Array.isArray(c.branches) ? c.branches.length : 0;
      totalBranches += branchCount;
      const userCount = userMap.get(String(c._id)) || 0;
      totalUsers += userCount;
      const licId = c.subscription && c.subscription.licenseId;
      const lic = licId ? licenseById.get(String(licId)) : null;
      const derived = lic ? licenseStatusFromRow(lic, now) : null;
      return {
        _id: c._id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        city: c.city,
        state: c.state,
        address: c.address,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
        branchCount,
        userCount,
        tenantOwner: c.adminId ? { name: c.adminId.name, email: c.adminId.email } : null,
        subscription: c.subscription || {},
        license: lic
          ? {
              _id: lic._id,
              licenseKey: lic.licenseKey,
              status: lic.status,
              derivedStatus: derived,
              validUntil: lic.validUntil,
              planName: lic.planName,
              planCode: lic.planCode,
              maxUsers: lic.maxUsers,
              maxBranches: lic.maxBranches,
              isTrial: lic.isTrial,
            }
          : null,
      };
    });

    const licenseRows = allLicenses.map((row) => ({
      _id: row._id,
      licenseKey: row.licenseKey,
      status: row.status,
      derivedStatus: licenseStatusFromRow(row, now),
      validUntil: row.validUntil,
      planName: row.planName,
      planCode: row.planCode,
      maxUsers: row.maxUsers,
      maxBranches: row.maxBranches,
      isTrial: row.isTrial,
      companyId: row.companyId && row.companyId._id ? row.companyId._id : row.companyId || null,
      companyName: row.companyId && row.companyId.name ? row.companyId.name : '',
      companyEmail: row.companyId && row.companyId.email ? row.companyId.email : '',
    }));

    return res.json({
      superAdmin: partner,
      summary: {
        companies: companies.length,
        licensesIssued: allLicenses.length,
        totalUsers,
        totalBranches,
      },
      companies: companyRows,
      licenses: licenseRows,
    });
  } catch (e) {
    return next(e);
  }
}

async function patchSuperAdmin(req, res, next) {
  try {
    if (!isMainSuperAdmin(req)) return res.status(403).json({ message: 'Access denied.' });
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid superadmin id.' });
    const admin = await Admin.findById(id);
    if (!admin || admin.role !== 'superadmin') return res.status(404).json({ message: 'Super admin not found.' });
    if (req.body.name !== undefined) admin.name = String(req.body.name || '').trim() || admin.name;
    if (req.body.email !== undefined) {
      const nextEmail = normalizeEmail(req.body.email);
      if (!nextEmail) {
        return res.status(400).json({ message: 'Email is required.' });
      }
      if (nextEmail !== normalizeEmail(admin.email)) {
        try {
          await assertAdminEmailAvailable(nextEmail, admin._id);
        } catch (e) {
          if (e.status) return res.status(e.status).json({ message: e.message });
          throw e;
        }
        admin.email = nextEmail;
      }
    }
    if (req.body.isActive !== undefined) admin.isActive = Boolean(req.body.isActive);
    if (req.body.maxCompanies !== undefined) admin.maxCompanies = req.body.maxCompanies == null || req.body.maxCompanies === '' ? null : Math.max(0, asInt(req.body.maxCompanies, 0));
    if (req.body.maxLicenses !== undefined) admin.maxLicenses = req.body.maxLicenses == null || req.body.maxLicenses === '' ? null : Math.max(0, asInt(req.body.maxLicenses, 0));
    if (req.body.password !== undefined && String(req.body.password).trim().length >= 6) {
      admin.password = String(req.body.password).trim();
    }
    await admin.save();
    const lean = await Admin.findById(admin._id).select('-password').lean();
    return res.json({ item: lean });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  listPlans,
  createPlan,
  updatePlan,
  listLicenses,
  getLicense,
  createLicense,
  patchLicense,
  listCompanies,
  getCompany,
  createCompany,
  updateCompany,
  getIntegrations,
  patchIntegrations,
  listPayments,
  dashboard,
  listSuperAdmins,
  createSuperAdmin,
  getPartnerSuperAdminPortfolio,
  patchSuperAdmin,
};
