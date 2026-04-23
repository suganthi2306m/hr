const User = require('../models/User');
const Company = require('../models/Company');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const {
  missingRequiredEmployeeCustomFieldLabels,
  mergeEmployeeProfilesForValidation,
} = require('../utils/customFieldValidation');
const {
  assertUserEmailAvailable,
  assertUserPhoneUniqueInCompany,
} = require('../utils/contactUniqueness');

const ROLE_ALIASES = {
  field_user: 'field_agent',
  supervisor: 'manager',
};

const ALLOWED_ROLES = ['admin', 'manager', 'field_agent'];

const PERMISSION_KEYS = [
  'tasks.view',
  'tasks.create',
  'tasks.edit',
  'customers.view',
  'customers.edit',
  'tracking.view',
  'reports.view',
  'expenses.view',
  'attendance.view',
];

function normalizeRole(role) {
  const r = String(role || 'field_agent').toLowerCase();
  return ROLE_ALIASES[r] || r;
}

function sanitizePermissions(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  PERMISSION_KEYS.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(raw, k)) {
      out[k] = Boolean(raw[k]);
    }
  });
  return out;
}

function normalizeObjectIdOrUndefined(value) {
  const raw = value == null ? '' : String(value).trim();
  if (!raw) return undefined;
  if (!mongoose.Types.ObjectId.isValid(raw)) {
    const err = new Error('Invalid ObjectId value.');
    err.status = 400;
    throw err;
  }
  return new mongoose.Types.ObjectId(raw);
}

function pickUserPayload(body, { includePassword } = {}) {
  const role = normalizeRole(body.role);
  const finalRole = ALLOWED_ROLES.includes(role) ? role : 'field_agent';
  const out = {
    name: String(body.name || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    phone: String(body.phone || '').trim(),
    role: finalRole,
    isActive: body.isActive !== false,
    branchId: normalizeObjectIdOrUndefined(body.branchId),
    permissions: sanitizePermissions(body.permissions),
    kycStatus: body.kycStatus != null ? String(body.kycStatus).trim() : '',
    kycNotes: body.kycNotes != null ? String(body.kycNotes).trim() : '',
    employeeCode: body.employeeCode != null ? String(body.employeeCode).trim() : '',
    shiftId: normalizeObjectIdOrUndefined(body.shiftId),
    attendanceGeofenceEnabled: body.attendanceGeofenceEnabled !== false,
  };
  if (body.employeeProfile != null && typeof body.employeeProfile === 'object' && !Array.isArray(body.employeeProfile)) {
    out.employeeProfile = body.employeeProfile;
  }
  if (includePassword && body.password) {
    out.password = body.password;
  }
  return out;
}

function asNonNegativeInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function formatGeneratedCode(prefix, numberValue, padLength) {
  const n = Math.max(0, Math.floor(Number(numberValue) || 0));
  const padded = String(n).padStart(Math.max(0, Math.floor(Number(padLength) || 0)), '0');
  return `${String(prefix || '').trim()}${padded}`;
}

async function allocateEmployeeCode(companyId) {
  const company = await Company.findById(companyId).select('orgSetup.idGeneration.employee').lean();
  const cfg = company?.orgSetup?.idGeneration?.employee;
  if (!cfg || cfg.enabled !== true) return '';

  const startNumber = asNonNegativeInt(cfg.startNumber, 1);
  const nextNumber = asNonNegativeInt(cfg.nextNumber, startNumber);
  const padLength = asNonNegativeInt(cfg.padLength, 4);
  const prefix = String(cfg.prefix || '').trim();
  const base = Math.max(startNumber, nextNumber);

  const updated = await Company.findOneAndUpdate(
    { _id: companyId },
    {
      $set: { 'orgSetup.idGeneration.employee.nextNumber': base + 1 },
    },
    { new: true },
  )
    .select('orgSetup.idGeneration.employee')
    .lean();
  const usedNumber = asNonNegativeInt(updated?.orgSetup?.idGeneration?.employee?.nextNumber, base + 1) - 1;
  return formatGeneratedCode(prefix, usedNumber, padLength);
}

async function assertShiftIdForCompany(companyId, shiftId) {
  const sid = shiftId != null ? String(shiftId).trim() : '';
  if (!sid) return undefined;
  const company = await Company.findById(companyId).select('orgSetup.shifts').lean();
  const list = company?.orgSetup?.shifts || [];
  const ok = list.some((s) => s && String(s._id) === sid);
  if (!ok) {
    const err = new Error('Invalid shift for this company.');
    err.status = 400;
    throw err;
  }
  return new mongoose.Types.ObjectId(sid);
}

function pickUserUpdatePayload(body) {
  const out = {};

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    out.name = String(body.name || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(body, 'email')) {
    out.email = String(body.email || '').trim().toLowerCase();
  }
  if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
    out.phone = String(body.phone || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(body, 'role')) {
    const role = normalizeRole(body.role);
    out.role = ALLOWED_ROLES.includes(role) ? role : 'field_agent';
  }
  if (Object.prototype.hasOwnProperty.call(body, 'isActive')) {
    out.isActive = body.isActive !== false;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'branchId')) {
    out.branchId = normalizeObjectIdOrUndefined(body.branchId);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'permissions')) {
    out.permissions = sanitizePermissions(body.permissions);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'kycStatus')) {
    out.kycStatus = body.kycStatus != null ? String(body.kycStatus).trim() : '';
  }
  if (Object.prototype.hasOwnProperty.call(body, 'kycNotes')) {
    out.kycNotes = body.kycNotes != null ? String(body.kycNotes).trim() : '';
  }
  if (Object.prototype.hasOwnProperty.call(body, 'employeeCode')) {
    out.employeeCode = body.employeeCode != null ? String(body.employeeCode).trim() : '';
  }
  if (Object.prototype.hasOwnProperty.call(body, 'shiftId')) {
    out.shiftId = normalizeObjectIdOrUndefined(body.shiftId);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'attendanceGeofenceEnabled')) {
    out.attendanceGeofenceEnabled = body.attendanceGeofenceEnabled !== false;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'employeeProfile')) {
    if (body.employeeProfile != null && typeof body.employeeProfile === 'object' && !Array.isArray(body.employeeProfile)) {
      out.employeeProfile = body.employeeProfile;
    }
  }

  return out;
}

async function getCompanyIdForAdmin(adminId) {
  const company = await Company.findOne({ adminId }).select('_id');
  return company?._id;
}

async function assertEmployeeRequiredCustomFieldsFilled(companyId, employeeProfile) {
  const company = await Company.findById(companyId).select('employeeCustomFieldDefs').lean();
  const defs = company?.employeeCustomFieldDefs || [];
  const custom = employeeProfile?.custom && typeof employeeProfile.custom === 'object' ? employeeProfile.custom : {};
  const missing = missingRequiredEmployeeCustomFieldLabels(defs, custom);
  if (missing.length) {
    const err = new Error(`Missing required custom field(s): ${missing.join(', ')}`);
    err.status = 400;
    throw err;
  }
}

async function assertWithinUserQuota(companyId) {
  const company = await Company.findById(companyId).select('subscription').lean();
  const cap = company?.subscription?.maxUsers;
  if (cap == null) return;
  const n = await User.countDocuments({ companyId });
  if (n >= cap) {
    const err = new Error(`This plan allows up to ${cap} users. Upgrade the plan or deactivate users to add more.`);
    err.status = 403;
    throw err;
  }
}

async function listUsers(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) {
      return res.status(400).json({ message: 'Complete company setup to manage users.' });
    }
    const items = await User.find({ companyId })
      .select('-password')
      .populate('companyId', 'name')
      .sort({ createdAt: -1 });
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
}

async function createUser(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) {
      return res.status(400).json({ message: 'Complete company setup to manage users.' });
    }
    try {
      await assertWithinUserQuota(companyId);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ message: e.message });
      throw e;
    }
    if (!req.body.password || !String(req.body.password).trim()) {
      return res.status(400).json({ message: 'Password is required while creating a user.' });
    }
    const picked = pickUserPayload(req.body, { includePassword: true });
    picked.shiftId = await assertShiftIdForCompany(companyId, picked.shiftId);
    try {
      await assertEmployeeRequiredCustomFieldsFilled(companyId, picked.employeeProfile || {});
    } catch (e) {
      if (e.status) return res.status(e.status).json({ message: e.message });
      throw e;
    }
    if (!String(picked.employeeCode || '').trim()) {
      picked.employeeCode = await allocateEmployeeCode(companyId);
    }
    try {
      await assertUserEmailAvailable(picked.email);
      await assertUserPhoneUniqueInCompany(companyId, picked.phone, null);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ message: e.message });
      throw e;
    }
    const payload = {
      ...picked,
      companyId,
      password: await bcrypt.hash(String(req.body.password), 10),
    };
    const item = await User.create(payload);
    return res.status(201).json({ item: { ...item.toObject(), password: undefined } });
  } catch (error) {
    return next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) {
      return res.status(400).json({ message: 'Complete company setup to manage users.' });
    }
    const existing = await User.findOne({ _id: req.params.id, companyId }).select('employeeCode employeeProfile').lean();
    if (!existing) {
      return res.status(404).json({ message: 'User not found for this company.' });
    }
    const payload = pickUserUpdatePayload(req.body);
    if (Object.prototype.hasOwnProperty.call(req.body, 'password')) {
      if (String(req.body.password || '').trim()) {
        payload.password = await bcrypt.hash(String(req.body.password), 10);
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'shiftId')) {
      payload.shiftId = await assertShiftIdForCompany(companyId, payload.shiftId);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'employeeCode')) {
      const incoming = String(payload.employeeCode || '').trim();
      const prev = String(existing.employeeCode || '').trim();
      if (!incoming && !prev) {
        const gen = await allocateEmployeeCode(companyId);
        payload.employeeCode = gen || '';
      } else if (!incoming && prev) {
        delete payload.employeeCode;
      } else {
        payload.employeeCode = incoming;
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'employeeProfile')) {
      const merged = mergeEmployeeProfilesForValidation(existing?.employeeProfile, payload.employeeProfile);
      try {
        await assertEmployeeRequiredCustomFieldsFilled(companyId, merged);
      } catch (e) {
        if (e.status) return res.status(e.status).json({ message: e.message });
        throw e;
      }
    }
    try {
      if (Object.prototype.hasOwnProperty.call(payload, 'email')) {
        await assertUserEmailAvailable(payload.email, req.params.id);
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'phone')) {
        await assertUserPhoneUniqueInCompany(companyId, payload.phone, req.params.id);
      }
    } catch (e) {
      if (e.status) return res.status(e.status).json({ message: e.message });
      throw e;
    }
    const item = await User.findOneAndUpdate({ _id: req.params.id, companyId }, payload, { new: true }).select('-password');
    if (!item) {
      return res.status(404).json({ message: 'User not found for this company.' });
    }
    return res.json({ item });
  } catch (error) {
    return next(error);
  }
}

async function deleteUser(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) {
      return res.status(400).json({ message: 'Complete company setup to manage users.' });
    }
    const deleted = await User.findOneAndDelete({ _id: req.params.id, companyId });
    if (!deleted) {
      return res.status(404).json({ message: 'User not found for this company.' });
    }
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
};
