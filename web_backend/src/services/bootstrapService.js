const Admin = require('../models/Admin');
const User = require('../models/User');
const Company = require('../models/Company');
const Customer = require('../models/Customer');

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

module.exports = { ensureDefaultAdmin, ensureDefaultUsers, ensureCustomerIndexes };
