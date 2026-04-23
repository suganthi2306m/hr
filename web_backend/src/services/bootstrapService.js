const Admin = require('../models/Admin');
const User = require('../models/User');
const Company = require('../models/Company');
const Customer = require('../models/Customer');
const SubscriptionPlan = require('../models/SubscriptionPlan');

async function ensureDefaultAdmin() {
  const seedEmail = process.env.DEFAULT_ADMIN_EMAIL || 'h@gmail.com';
  const existing = await Admin.findOne({ email: seedEmail });
  if (existing) return;

  await Admin.create({
    name: process.env.DEFAULT_ADMIN_NAME || 'LiveTrack Admin',
    email: seedEmail,
    password: process.env.DEFAULT_ADMIN_PASSWORD || 'web123',
  });

  console.log('Default admin created');
}

async function ensureSuperAdmin() {
  const email = String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.SUPERADMIN_PASSWORD || '').trim();
  if (!email || !password) return;

  const existing = await Admin.findOne({ email });
  if (existing) {
    if (existing.role !== 'superadmin') {
      existing.role = 'superadmin';
      await existing.save();
    }
    return;
  }

  await Admin.create({
    name: process.env.SUPERADMIN_NAME || 'Super Admin',
    email,
    password,
    role: 'superadmin',
    companySetupCompleted: true,
    isActive: true,
  });
  console.log('Super admin created');
}

async function ensureMainSuperAdmin() {
  const email = 'suganthi0623m@gmail.com';
  const password = 'sh#1994';
  const existing = await Admin.findOne({ email });
  if (existing) {
    let dirty = false;
    if (existing.role !== 'mainsuperadmin') {
      existing.role = 'mainsuperadmin';
      dirty = true;
    }
    if (existing.isActive === false) {
      existing.isActive = true;
      dirty = true;
    }
    if (dirty) await existing.save();
    return;
  }
  await Admin.create({
    name: 'Main Super Admin',
    email,
    password,
    role: 'mainsuperadmin',
    companySetupCompleted: true,
    isActive: true,
  });
  console.log('Main super admin created');
}

/**
 * Legacy installs: assign catalog ownership + replace global planCode unique index
 * with (createdByAdminId, planCode).
 */
async function migrateSubscriptionPlans() {
  const main = await Admin.findOne({ role: 'mainsuperadmin' }).sort({ createdAt: 1 }).select('_id').lean();
  if (main?._id) {
    await SubscriptionPlan.updateMany(
      { $or: [{ createdByAdminId: null }, { createdByAdminId: { $exists: false } }] },
      { $set: { createdByAdminId: main._id } },
    );
  }
  try {
    await SubscriptionPlan.collection.dropIndex('planCode_1');
  } catch (e) {
    const code = e && e.code;
    const msg = String(e && e.message ? e.message : '');
    if (code !== 27 && !/index not found|ns not found/i.test(msg)) {
      // eslint-disable-next-line no-console
      console.warn('[bootstrap] subscription plan index drop (planCode_1):', msg);
    }
  }
  try {
    await SubscriptionPlan.syncIndexes();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[bootstrap] subscription plan syncIndexes:', e.message);
  }
}

async function ensureDefaultSubscriptionPlans() {
  const n = await SubscriptionPlan.countDocuments();
  if (n > 0) return;
  const main = await Admin.findOne({ role: 'mainsuperadmin' }).sort({ createdAt: 1 }).select('_id').lean();
  if (!main?._id) {
    console.log('Skipping default subscription plans: no main super admin yet.');
    return;
  }
  await SubscriptionPlan.insertMany([
    {
      createdByAdminId: main._id,
      planCode: 'basic',
      name: 'Basic',
      description: 'Default starter plan',
      priceInr: 2999,
      durationMonths: 12,
      maxUsers: 30,
      maxBranches: 3,
      trialDays: 0,
      licensePrefix: 'BAS',
      isActive: true,
    },
    {
      createdByAdminId: main._id,
      planCode: 'premium',
      name: 'Premium',
      description: 'Full operations suite',
      priceInr: 1,
      durationMonths: 12,
      maxUsers: 30,
      maxBranches: 3,
      trialDays: 0,
      licensePrefix: 'PRE',
      isActive: true,
    },
  ]);
  console.log('Default subscription plans created');
}

async function ensureDefaultUsers() {
  const total = await User.countDocuments();
  if (total > 0) return;

  const defaultAdminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'h@gmail.com';
  const admin = await Admin.findOne({ email: defaultAdminEmail.toLowerCase() }).select('_id');
  if (!admin) return;

  const company = await Company.findOne({ adminId: admin._id }).select('_id');
  if (!company) {
    console.log('Skipping default users seed until company profile exists');
    return;
  }

  await User.insertMany([
    { name: 'Ravi Kumar', email: 'ravi@livetrack.com', phone: '9000000001', isActive: true, companyId: company._id },
    { name: 'Priya Singh', email: 'priya@livetrack.com', phone: '9000000002', isActive: true, companyId: company._id },
    { name: 'Arjun Das', email: 'arjun@livetrack.com', phone: '9000000003', isActive: false, companyId: company._id },
  ]);
}

async function ensureCustomerIndexes() {
  const staleIndexName = 'customerNumber_1_businessId_1';
  const indexes = await Customer.collection.indexes();
  const hasStaleIndex = indexes.some((item) => item.name === staleIndexName);
  if (!hasStaleIndex) {
    return;
  }

  await Customer.collection.dropIndex(staleIndexName);
  console.log(`Dropped stale customers index: ${staleIndexName}`);
}

module.exports = {
  ensureDefaultAdmin,
  ensureMainSuperAdmin,
  ensureSuperAdmin,
  migrateSubscriptionPlans,
  ensureDefaultSubscriptionPlans,
  ensureDefaultUsers,
  ensureCustomerIndexes,
};
