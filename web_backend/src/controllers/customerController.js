const Customer = require('../models/Customer');
const Company = require('../models/Company');
const Task = require('../models/Task');

let customerStatusMigrationPromise;

/** One-time: boolean isActive → customerStatus enum; removes legacy isActive field. */
async function ensureCustomerStatusEnumInDb() {
  if (customerStatusMigrationPromise) return customerStatusMigrationPromise;
  customerStatusMigrationPromise = (async () => {
    try {
      const col = Customer.collection;
      await col.updateMany(
        { customerStatus: { $exists: false }, isActive: false },
        { $set: { customerStatus: 'inactive' } },
      );
      await col.updateMany({ customerStatus: { $exists: false } }, { $set: { customerStatus: 'active' } });
      await col.updateMany({ isActive: { $exists: true } }, { $unset: { isActive: '' } });
    } catch (e) {
      console.warn('[customers] customerStatus migration:', e?.message || e);
    }
  })();
  return customerStatusMigrationPromise;
}

async function getCompanyIdForAdmin(adminId) {
  const company = await Company.findOne({ adminId }).select('_id name');
  return company;
}

function digitsOnly(v) {
  return String(v || '').replace(/\D/g, '');
}

/**
 * Operational status from API body (enum + legacy isActive).
 * @param {object} body
 * @param {'create' | 'update'} mode
 * @returns {'active' | 'inactive'} for create (default active)
 * @returns {'active' | 'inactive' | null} for update — null when the client did not send a status field
 */
function parseCustomerStatus(body, mode) {
  if (body == null || typeof body !== 'object') {
    return mode === 'create' ? 'active' : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'customerStatus')) {
    const s = String(body.customerStatus || '').trim().toLowerCase();
    if (s === 'inactive') return 'inactive';
    if (s === 'active') return 'active';
    return mode === 'create' ? 'active' : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'isActive')) {
    if (body.isActive === false) return 'inactive';
    if (body.isActive === true) return 'active';
  }
  return mode === 'create' ? 'active' : null;
}

function normalizeStoredCustomer(doc) {
  const o = doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const customerName = String(o.customerName || o.name || '').trim();
  const customerNumber = String(o.customerNumber || o.phone || '').trim();
  const address = String(o.address || o.location || '').trim();
  return {
    _id: o._id,
    customerName,
    customerNumber,
    companyName: o.companyName ? String(o.companyName).trim() : '',
    emailId: String(o.emailId || o.email || '').trim(),
    address,
    city: String(o.city || '').trim(),
    pincode: String(o.pincode || '').trim(),
    state: String(o.state || '').trim(),
    country: String(o.country || '').trim(),
    countryCode: o.countryCode ? String(o.countryCode).trim() : '',
    tags: Array.isArray(o.tags) ? o.tags : [],
    notes: Array.isArray(o.notes) ? o.notes : [],
    attachments: Array.isArray(o.attachments) ? o.attachments : [],
    geoLocation:
      o.geoLocation && o.geoLocation.lat != null && o.geoLocation.lng != null
        ? { lat: Number(o.geoLocation.lat), lng: Number(o.geoLocation.lng) }
        : null,
    geoPoint:
      o.geoPoint &&
      Array.isArray(o.geoPoint.coordinates) &&
      o.geoPoint.coordinates.length === 2
        ? {
            lat: Number(o.geoPoint.coordinates[1]),
            lng: Number(o.geoPoint.coordinates[0]),
          }
        : null,
    segment: o.segment && ['lead', 'active', 'inactive'].includes(o.segment) ? o.segment : 'lead',
    customerStatus:
      o.customerStatus === 'inactive' || o.customerStatus === 'active'
        ? o.customerStatus
        : o.isActive === false
          ? 'inactive'
          : 'active',
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function validateCustomerPayload(body) {
  const customerName = String(body.customerName || '').trim();
  const rawNumber = String(body.customerNumber || '').trim();
  const customerNumber = digitsOnly(rawNumber);
  const countryCode = String(body.countryCode || '91').trim();
  const emailId = String(body.emailId || '').trim().toLowerCase();
  const address = String(body.address || '').trim();
  const city = String(body.city || '').trim();
  const pincode = String(body.pincode || '').trim();
  const state = String(body.state || '').trim();
  const country = String(body.country || '').trim();
  const companyName = String(body.companyName || '').trim();

  const errors = [];
  if (!customerName) errors.push('Customer name is required.');
  if (!emailId) errors.push('Email is required.');
  else if (!emailId.includes('@')) errors.push('Enter a valid email.');
  if (!address) errors.push('Address is required.');
  if (!city) errors.push('City is required.');
  if (!pincode) errors.push('Pincode is required.');
  else if (/\D/.test(pincode)) errors.push('Pincode must be digits only.');
  if (!customerNumber) errors.push('Mobile number is required.');
  else if (countryCode === '91' && customerNumber.length !== 10) {
    errors.push('Enter a 10-digit mobile number for +91.');
  } else if (countryCode !== '91' && customerNumber.length < 6) {
    errors.push('Enter a valid mobile number.');
  }

  return {
    ok: errors.length === 0,
    errors,
    payload: {
      customerName,
      customerNumber,
      companyName: companyName || undefined,
      emailId,
      address,
      city,
      pincode,
      state,
      country,
      countryCode: countryCode || undefined,
    },
  };
}

async function assertCustomerUnique(companyId, payload, excludeId) {
  const emailQuery = { companyId, emailId: payload.emailId };
  const phoneQuery = {
    companyId,
    customerNumber: payload.customerNumber,
    countryCode: payload.countryCode || '91',
  };
  if (excludeId) {
    emailQuery._id = { $ne: excludeId };
    phoneQuery._id = { $ne: excludeId };
  }
  const [byEmail, byPhone] = await Promise.all([
    Customer.findOne(emailQuery).select('_id').lean(),
    Customer.findOne(phoneQuery).select('_id').lean(),
  ]);
  if (byEmail) return 'A customer with this email already exists.';
  if (byPhone) return 'A customer with this phone number already exists.';
  return null;
}

async function listCustomers(req, res, next) {
  try {
    await ensureCustomerStatusEnumInDb();
    const company = await getCompanyIdForAdmin(req.admin._id);
    if (!company?._id) {
      return res.status(400).json({ message: 'Complete company setup to manage customers.' });
    }
    const rows = await Customer.find({ companyId: company._id }).sort({ createdAt: -1 });
    const items = rows.map((r) => normalizeStoredCustomer(r));
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
}

async function getCustomerById(req, res, next) {
  try {
    await ensureCustomerStatusEnumInDb();
    const company = await getCompanyIdForAdmin(req.admin._id);
    if (!company?._id) {
      return res.status(400).json({ message: 'Complete company setup to manage customers.' });
    }
    const cust = await Customer.findOne({ _id: req.params.id, companyId: company._id });
    if (!cust) {
      return res.status(404).json({ message: 'Customer not found.' });
    }
    return res.json(normalizeStoredCustomer(cust));
  } catch (error) {
    return next(error);
  }
}

async function getCustomerTimeline(req, res, next) {
  try {
    await ensureCustomerStatusEnumInDb();
    const company = await getCompanyIdForAdmin(req.admin._id);
    if (!company?._id) {
      return res.status(400).json({ message: 'Complete company setup to manage customers.' });
    }
    const cust = await Customer.findOne({ _id: req.params.id, companyId: company._id }).lean();
    if (!cust) {
      return res.status(404).json({ message: 'Customer not found.' });
    }
    const cid = cust._id;
    const tasks = await Task.find({ customerId: cid })
      .sort({ updatedAt: -1 })
      .limit(100)
      .populate('assignedTo', 'name email')
      .lean();
    const timeline = tasks.map((t) => ({
      type: 'task',
      at: t.updatedAt || t.createdAt,
      taskId: t._id,
      taskCode: t.taskCode,
      title: t.taskName || t.taskTitle || t.title,
      status: t.status,
      assignedTo: t.assignedTo,
    }));
    return res.json({ customer: normalizeStoredCustomer(cust), timeline });
  } catch (error) {
    return next(error);
  }
}

async function createCustomer(req, res, next) {
  try {
    await ensureCustomerStatusEnumInDb();
    const company = await getCompanyIdForAdmin(req.admin._id);
    if (!company?._id) {
      return res.status(400).json({ message: 'Complete company setup to manage customers.' });
    }

    const body = { ...req.body };
    if (!body.companyName?.trim() && company.name) {
      body.companyName = company.name;
    }

    const v = validateCustomerPayload(body);
    if (!v.ok) {
      return res.status(400).json({ message: v.errors.join(' ') });
    }

    const uniqueErr = await assertCustomerUnique(company._id, v.payload, null);
    if (uniqueErr) {
      return res.status(409).json({ message: uniqueErr });
    }

    const tags = Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 30) : [];
    const geo =
      body.geoLocation && body.geoLocation.lat != null && body.geoLocation.lng != null
        ? { lat: Number(body.geoLocation.lat), lng: Number(body.geoLocation.lng) }
        : undefined;
    const geoPoint =
      geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)
        ? { type: 'Point', coordinates: [Number(geo.lng), Number(geo.lat)] }
        : undefined;
    const segment = ['lead', 'active', 'inactive'].includes(body.segment) ? body.segment : 'lead';

    const customerStatus = parseCustomerStatus(body, 'create');

    const item = await Customer.create({
      ...v.payload,
      adminId: req.admin._id,
      companyId: company._id,
      tags,
      geoLocation: geo,
      geoPoint,
      segment,
      customerStatus,
    });
    return res.status(201).json({ item: normalizeStoredCustomer(item) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A customer with this mobile number already exists.' });
    }
    return next(error);
  }
}

async function updateCustomer(req, res, next) {
  try {
    await ensureCustomerStatusEnumInDb();
    const company = await getCompanyIdForAdmin(req.admin._id);
    if (!company?._id) {
      return res.status(400).json({ message: 'Complete company setup to manage customers.' });
    }

    const body = { ...req.body };
    if (!body.companyName?.trim() && company.name) {
      body.companyName = company.name;
    }

    const v = validateCustomerPayload(body);
    if (!v.ok) {
      return res.status(400).json({ message: v.errors.join(' ') });
    }

    const uniqueErr = await assertCustomerUnique(company._id, v.payload, req.params.id);
    if (uniqueErr) {
      return res.status(409).json({ message: uniqueErr });
    }

    const existing = await Customer.findOne({ _id: req.params.id, companyId: company._id });
    if (!existing) {
      return res.status(404).json({ message: 'Customer not found for this company.' });
    }

    Object.assign(existing, v.payload);
    if (Array.isArray(body.tags)) {
      existing.tags = body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 30);
    }
    if (body.segment && ['lead', 'active', 'inactive'].includes(body.segment)) {
      existing.segment = body.segment;
    }
    if (body.geoLocation && body.geoLocation.lat != null && body.geoLocation.lng != null) {
      existing.geoLocation = { lat: Number(body.geoLocation.lat), lng: Number(body.geoLocation.lng) };
      if (Number.isFinite(existing.geoLocation.lat) && Number.isFinite(existing.geoLocation.lng)) {
        existing.geoPoint = {
          type: 'Point',
          coordinates: [Number(existing.geoLocation.lng), Number(existing.geoLocation.lat)],
        };
      }
    }
    if (body.appendNote && String(body.appendNote).trim()) {
      existing.notes = existing.notes || [];
      existing.notes.push({ text: String(body.appendNote).trim(), createdAt: new Date() });
    }
    if (Array.isArray(body.newAttachments)) {
      const add = body.newAttachments
        .filter((a) => a && String(a.url || '').trim())
        .map((a) => ({
          name: String(a.name || 'file').trim(),
          url: String(a.url).trim(),
          uploadedAt: new Date(),
        }));
      existing.attachments = [...(existing.attachments || []), ...add].slice(-50);
    }
    const nextStatus = parseCustomerStatus(body, 'update');
    if (nextStatus != null) {
      existing.customerStatus = nextStatus;
    }
    await existing.save();
    return res.json({ item: normalizeStoredCustomer(existing) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A customer with this mobile number already exists.' });
    }
    return next(error);
  }
}

async function nearbyCustomers(req, res, next) {
  try {
    await ensureCustomerStatusEnumInDb();
    const company = await getCompanyIdForAdmin(req.admin._id);
    if (!company?._id) {
      return res.status(400).json({ message: 'Complete company setup to manage customers.' });
    }
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const maxDistance = Math.max(50, Math.min(Number(req.query.maxDistance) || 2000, 100000));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: 'lat and lng query params are required.' });
    }
    const rows = await Customer.find({
      companyId: company._id,
      geoPoint: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: maxDistance,
        },
      },
    })
      .limit(100)
      .lean();
    return res.json({ items: rows.map((r) => normalizeStoredCustomer(r)) });
  } catch (error) {
    return next(error);
  }
}

async function deleteCustomer(req, res, next) {
  try {
    const company = await getCompanyIdForAdmin(req.admin._id);
    if (!company?._id) {
      return res.status(400).json({ message: 'Complete company setup to manage customers.' });
    }
    const deleted = await Customer.findOneAndDelete({ _id: req.params.id, companyId: company._id });
    if (!deleted) {
      return res.status(404).json({ message: 'Customer not found for this company.' });
    }
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listCustomers,
  getCustomerById,
  getCustomerTimeline,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  nearbyCustomers,
};
