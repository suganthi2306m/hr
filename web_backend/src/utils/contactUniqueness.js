const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Company = require('../models/Company');
const User = require('../models/User');

function conflict(message) {
  const err = new Error(message);
  err.status = 409;
  return err;
}

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

/** Digits only for comparing phone numbers across formatted strings. */
function normalizePhoneDigits(raw) {
  return String(raw || '').replace(/\D/g, '');
}

/**
 * Another company must not use the same email or the same phone (digits, min 7 digits to compare).
 * Company profile email must not match any employee login email (User) anywhere.
 *
 * @param {import('mongoose').Types.ObjectId | string | null | undefined} excludeCompanyId
 */
async function assertCompanyEmailPhoneUnique(excludeCompanyId, emailRaw, phoneRaw) {
  const email = normalizeEmail(emailRaw);
  const exclude =
    excludeCompanyId && mongoose.Types.ObjectId.isValid(String(excludeCompanyId))
      ? new mongoose.Types.ObjectId(String(excludeCompanyId))
      : null;

  if (email) {
    const q = { email };
    if (exclude) q._id = { $ne: exclude };
    const cHit = await Company.findOne(q).select('name').lean();
    if (cHit) {
      throw conflict('This company email is already used by another organization.');
    }
    const uHit = await User.findOne({ email }).select('name companyId').lean();
    if (uHit) {
      throw conflict('This email is already used as an employee login. Choose a different company email.');
    }
  }

  const digits = normalizePhoneDigits(phoneRaw);
  if (digits.length >= 7) {
    const q = exclude ? { _id: { $ne: exclude } } : {};
    const others = await Company.find(q).select('phone name').lean();
    const hit = others.find((row) => normalizePhoneDigits(row.phone) === digits);
    if (hit) {
      throw conflict('This company phone number is already used by another organization.');
    }
  }
}

/**
 * Admin / superadmin login email must be unique among Admins and must not match any User email.
 *
 * @param {string} emailRaw
 * @param {import('mongoose').Types.ObjectId | string | null | undefined} excludeAdminId
 */
async function assertAdminEmailAvailable(emailRaw, excludeAdminId) {
  const email = normalizeEmail(emailRaw);
  if (!email) return;

  const exclude =
    excludeAdminId && mongoose.Types.ObjectId.isValid(String(excludeAdminId))
      ? new mongoose.Types.ObjectId(String(excludeAdminId))
      : null;

  const q = { email };
  if (exclude) q._id = { $ne: exclude };
  const aHit = await Admin.findOne(q).select('name role').lean();
  if (aHit) {
    throw conflict('This email is already used by another admin account.');
  }

  const uHit = await User.findOne({ email }).select('name').lean();
  if (uHit) {
    throw conflict('This email is already used as an employee login. Use a different admin email.');
  }
}

/**
 * Employee email: unique among Users (Mongo also enforces) and must not match any Admin login.
 *
 * @param {string} emailRaw
 * @param {import('mongoose').Types.ObjectId | string | null | undefined} excludeUserId
 */
async function assertUserEmailAvailable(emailRaw, excludeUserId) {
  const email = normalizeEmail(emailRaw);
  if (!email) {
    const err = new Error('Email is required.');
    err.status = 400;
    throw err;
  }

  const exclude =
    excludeUserId && mongoose.Types.ObjectId.isValid(String(excludeUserId))
      ? new mongoose.Types.ObjectId(String(excludeUserId))
      : null;

  const q = { email };
  if (exclude) q._id = { $ne: exclude };
  const uHit = await User.findOne(q).select('name').lean();
  if (uHit) {
    throw conflict('This email is already used by another employee.');
  }

  const aHit = await Admin.findOne({ email }).select('name').lean();
  if (aHit) {
    throw conflict('This email is already used for an admin login. Employee email must be different.');
  }
}

/**
 * Optional employee phone: unique within the same company when non-empty (7+ digits).
 *
 * @param {import('mongoose').Types.ObjectId | string} companyId
 * @param {string} phoneRaw
 * @param {import('mongoose').Types.ObjectId | string | null | undefined} excludeUserId
 */
async function assertUserPhoneUniqueInCompany(companyId, phoneRaw, excludeUserId) {
  if (!companyId || !mongoose.Types.ObjectId.isValid(String(companyId))) return;
  const cid = new mongoose.Types.ObjectId(String(companyId));
  const digits = normalizePhoneDigits(phoneRaw);
  if (digits.length < 7) return;

  const exclude =
    excludeUserId && mongoose.Types.ObjectId.isValid(String(excludeUserId))
      ? new mongoose.Types.ObjectId(String(excludeUserId))
      : null;

  const q = { companyId: cid };
  if (exclude) q._id = { $ne: exclude };
  const peers = await User.find(q).select('phone name email').lean();
  const hit = peers.find((u) => normalizePhoneDigits(u.phone) === digits);
  if (hit) {
    throw conflict('This phone number is already used by another employee in your company.');
  }
}

module.exports = {
  normalizeEmail,
  normalizePhoneDigits,
  assertCompanyEmailPhoneUnique,
  assertAdminEmailAvailable,
  assertUserEmailAvailable,
  assertUserPhoneUniqueInCompany,
};
