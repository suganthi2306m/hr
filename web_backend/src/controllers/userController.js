const User = require('../models/User');
const Company = require('../models/Company');
const bcrypt = require('bcryptjs');

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

function pickUserPayload(body, { includePassword } = {}) {
  const role = normalizeRole(body.role);
  const finalRole = ALLOWED_ROLES.includes(role) ? role : 'field_agent';
  const out = {
    name: String(body.name || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    phone: String(body.phone || '').trim(),
    role: finalRole,
    isActive: body.isActive !== false,
    branchId: body.branchId != null ? String(body.branchId).trim() : '',
    permissions: sanitizePermissions(body.permissions),
    kycStatus: body.kycStatus != null ? String(body.kycStatus).trim() : '',
    kycNotes: body.kycNotes != null ? String(body.kycNotes).trim() : '',
  };
  if (includePassword && body.password) {
    out.password = body.password;
  }
  return out;
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
    out.branchId = body.branchId != null ? String(body.branchId).trim() : '';
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

  return out;
}

async function getCompanyIdForAdmin(adminId) {
  const company = await Company.findOne({ adminId }).select('_id');
  return company?._id;
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
    if (!req.body.password || !String(req.body.password).trim()) {
      return res.status(400).json({ message: 'Password is required while creating a user.' });
    }
    const picked = pickUserPayload(req.body, { includePassword: true });
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
    const payload = pickUserUpdatePayload(req.body);
    if (Object.prototype.hasOwnProperty.call(req.body, 'password')) {
      if (String(req.body.password || '').trim()) {
        payload.password = await bcrypt.hash(String(req.body.password), 10);
      }
    }
    const item = await User.findOneAndUpdate({ _id: req.params.id, companyId }, payload, { new: true });
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
