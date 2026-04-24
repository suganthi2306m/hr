const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const CustomerFollowUp = require('../models/CustomerFollowUp');
const User = require('../models/User');
const { haversineMeters } = require('../utils/haversine');
const { forwardGeocodeAddress } = require('../services/geocodingService');

/** When customers have no geoLocation yet, try geocoding address (max per request). */
const NEARBY_MAX_ADDRESS_GEOCODE = 12;

const MSG_DUP_PHONE = 'Customer already exists with this phone number.';
const MSG_DUP_EMAIL = 'Customer already exists with this email address.';
const MSG_DUP_GENERIC = 'Customer already exists with this email or phone number.';

function normalizeCustomerNumber(value) {
  if (value == null || value === '') return '';
  return String(value).replace(/\D/g, '').trim();
}

function normalizeEmailId(value) {
  if (value == null || value === '') return '';
  return String(value).trim().toLowerCase();
}

/** User-friendly messages for create/update failures (avoid opaque "Server Error"). */
function customerSaveErrorResponse(error) {
  const code = error?.code;
  const name = error?.name;

  const msgStr = String(error?.message || '');
  if (code === 11000 || msgStr.includes('E11000') || msgStr.includes('duplicate key')) {
    const key = error.keyPattern || error.keyValue || {};
    const fields = Object.keys(key);
    if (fields.includes('customerNumber') || msgStr.includes('customerNumber')) {
      return { status: 409, body: { success: false, message: MSG_DUP_PHONE } };
    }
    if (fields.includes('emailId') || msgStr.includes('emailId')) {
      return { status: 409, body: { success: false, message: MSG_DUP_EMAIL } };
    }
    return { status: 409, body: { success: false, message: MSG_DUP_GENERIC } };
  }

  if (name === 'ValidationError' && error.errors) {
    return { status: 400, body: { success: false, message: validationErrorUserMessage(error) } };
  }

  return null;
}

function validationErrorUserMessage(error) {
  const fieldLabels = {
    customerName: 'customer name',
    customerNumber: 'phone number',
    emailId: 'email',
    address: 'address',
    city: 'city',
    pincode: 'pincode',
    addedBy: 'account',
    businessId: 'company',
  };
  for (const [path, err] of Object.entries(error.errors)) {
    const label = fieldLabels[path] || path.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    if (err?.kind === 'required' || /required/i.test(String(err?.message || ''))) {
      return `Please enter ${label}.`;
    }
    if (err?.kind === 'enum') {
      return `Please choose a valid option for ${label}.`;
    }
  }
  return 'Please check the form and try again.';
}

/**
 * @returns {Promise<{ message: string } | null>}
 */
async function findDuplicateCustomerConflict({ businessId, customerNumber, emailId, excludeCustomerId }) {
  const phone = normalizeCustomerNumber(customerNumber);
  const email = normalizeEmailId(emailId);
  if (phone) {
    const q = { businessId, customerNumber: phone };
    if (excludeCustomerId) q._id = { $ne: excludeCustomerId };
    const byPhone = await Customer.findOne(q).select('_id').lean();
    if (byPhone) return { message: MSG_DUP_PHONE };
  }
  if (email) {
    const q = { businessId, emailId: email };
    if (excludeCustomerId) q._id = { $ne: excludeCustomerId };
    const byEmail = await Customer.findOne(q).select('_id').lean();
    if (byEmail) return { message: MSG_DUP_EMAIL };
  }
  return null;
}

function extractObjectId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    if (value._id) return value._id.toString();
    if (value.$oid) return value.$oid.toString();
  }
  return value.toString();
}

function resolveBusinessIdFromRequest(req) {
  return (
    extractObjectId(req.user?.companyId) ||
    extractObjectId(req.user?.businessId) ||
    extractObjectId(req.companyId) ||
    null
  );
}

/**
 * Tenant id on customer may be stored as businessId (app API) or companyId (imports / other clients).
 * companyId is not on the Mongoose schema, so query values must be ObjectId to match BSON ObjectIds.
 */
function tenantScopeFilter(businessId) {
  if (!businessId) return {};
  const s = String(businessId).trim();
  if (mongoose.Types.ObjectId.isValid(s) && s.length === 24) {
    const oid = new mongoose.Types.ObjectId(s);
    return { $or: [{ businessId: oid }, { companyId: oid }] };
  }
  return { $or: [{ businessId: s }, { companyId: s }] };
}

function parseFollowDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfDayFollow(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

async function validateUserInBusiness(businessId, userId) {
  const id = String(userId || '').trim();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
  const oid = new mongoose.Types.ObjectId(id);
  const bid =
    mongoose.Types.ObjectId.isValid(String(businessId).trim()) && String(businessId).trim().length === 24
      ? new mongoose.Types.ObjectId(String(businessId).trim())
      : null;
  if (!bid) return null;
  const row = await User.findOne({ _id: oid, companyId: bid }).select('_id').lean();
  return row ? row._id : null;
}

exports.createCustomer = async (req, res) => {
  try {
    const businessId = resolveBusinessIdFromRequest(req);
    const addedBy = req.user?._id;
    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'Company information is missing. Please log in again or contact support.',
      });
    }
    if (!addedBy) {
      return res.status(400).json({
        success: false,
        message: 'Could not resolve your account. Please log in again.',
      });
    }
    const payload = {
      ...req.body,
      businessId,
      addedBy: addedBy || req.body.addedBy,
      source: 'app',
    };
    if (payload.customerNumber != null && String(payload.customerNumber).trim() !== '') {
      payload.customerNumber = normalizeCustomerNumber(payload.customerNumber);
    }
    if (payload.emailId != null && String(payload.emailId).trim() !== '') {
      payload.emailId = normalizeEmailId(payload.emailId);
    }

    const duplicate = await findDuplicateCustomerConflict({
      businessId,
      customerNumber: payload.customerNumber,
      emailId: payload.emailId,
      excludeCustomerId: null,
    });
    if (duplicate) {
      return res.status(409).json({ success: false, message: duplicate.message });
    }

    const newCustomer = new Customer(payload);
    await newCustomer.save();
    res.status(201).json(newCustomer.toObject ? newCustomer.toObject() : newCustomer);
  } catch (error) {
    console.error('Error creating customer:', error);
    const mapped = customerSaveErrorResponse(error);
    if (mapped) {
      return res.status(mapped.status).json(mapped.body);
    }
    res.status(500).json({
      success: false,
      message: 'Could not save customer. Please try again.',
    });
  }
};

exports.getAllCustomers = async (req, res) => {
  try {
    const businessId = resolveBusinessIdFromRequest(req);
    if (!businessId) {
      console.log('[Customers] GET /customers - no businessId on user, returning empty');
      return res.status(200).json([]);
    }

    const filter = { ...tenantScopeFilter(businessId) };

    console.log('[Customers] GET /customers - fetching with filter:', {
      businessId: businessId.toString?.() || String(businessId),
      userId: req.user?._id?.toString?.() || null,
    });

    const customers = await Customer.find(filter).sort({ customerName: 1 }).lean();
    console.log('[Customers] Fetched', customers.length, 'customer(s)');
    res.status(200).json(customers);
  } catch (error) {
    console.error('[Customers] Error fetching customers:', error);
    res.status(500).json({
      success: false,
      message: 'Could not load customers. Please try again.',
    });
  }
};

/**
 * GET /customers/nearby?lat=&lng=&maxDistance=
 * Returns customers in the user's company within maxDistance (meters).
 * Any user in the company may see nearby sites (not restricted by customer usersIds).
 * Uses stored geoLocation when set; otherwise geocodes address+city+pincode once,
 * persists geoLocation on the customer, then includes them if within range.
 */
exports.getNearbyCustomers = async (req, res) => {
  try {
    const businessId = resolveBusinessIdFromRequest(req);
    if (!businessId) {
      return res.status(200).json({ success: true, items: [] });
    }
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({
        success: false,
        message: 'Query parameters lat and lng are required numbers.',
        items: [],
      });
    }
    const maxDistance = Number(req.query.maxDistance);
    const maxM =
      Number.isFinite(maxDistance) && maxDistance > 0 && maxDistance <= 50000
        ? maxDistance
        : 2000;

    const items = [];
    const seen = new Set();

    const customersWithGeo = await Customer.find({
      ...tenantScopeFilter(businessId),
      'geoLocation.lat': { $exists: true, $ne: null },
      'geoLocation.lng': { $exists: true, $ne: null },
    })
      .select('_id customerName companyName geoLocation')
      .lean();

    for (const c of customersWithGeo) {
      const clat = Number(c.geoLocation?.lat);
      const clng = Number(c.geoLocation?.lng);
      if (!Number.isFinite(clat) || !Number.isFinite(clng)) continue;
      const d = haversineMeters(lat, lng, clat, clng);
      if (d > maxM) continue;
      const idStr = String(c._id);
      seen.add(idStr);
      items.push({
        _id: c._id,
        customerName: c.customerName,
        companyName: c.companyName,
        geoLocation: { lat: clat, lng: clng },
        distanceMeters: Math.round(d),
      });
    }

    const needGeo = await Customer.find({
      ...tenantScopeFilter(businessId),
      $or: [
        { geoLocation: { $exists: false } },
        { geoLocation: null },
        { 'geoLocation.lat': { $exists: false } },
        { 'geoLocation.lat': null },
        { 'geoLocation.lng': { $exists: false } },
        { 'geoLocation.lng': null },
      ],
    })
      .select('_id customerName companyName address city pincode')
      .limit(80)
      .lean();

    let geocodeAttempts = 0;
    for (const c of needGeo) {
      if (geocodeAttempts >= NEARBY_MAX_ADDRESS_GEOCODE) break;
      const idStr = String(c._id);
      if (seen.has(idStr)) continue;
      const addressLine = [c.address, c.city, c.pincode, c.customerName]
        .map((x) => (x == null ? '' : String(x).trim()))
        .filter((s) => s.length > 0)
        .join(', ');
      if (!addressLine) continue;

      geocodeAttempts += 1;
      const coords = await forwardGeocodeAddress(addressLine);
      if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
        continue;
      }

      await Customer.updateOne(
        { _id: c._id, ...tenantScopeFilter(businessId) },
        { $set: { geoLocation: { lat: coords.lat, lng: coords.lng } } },
      );
      console.log(
        '[Customers] nearby: persisted geoLocation from address for customer',
        idStr,
        coords.lat,
        coords.lng,
      );

      const d = haversineMeters(lat, lng, coords.lat, coords.lng);
      if (d > maxM) continue;
      seen.add(idStr);
      items.push({
        _id: c._id,
        customerName: c.customerName,
        companyName: c.companyName,
        geoLocation: { lat: coords.lat, lng: coords.lng },
        distanceMeters: Math.round(d),
        geocodedFromAddress: true,
      });
    }

    items.sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0));

    res.status(200).json({ success: true, items });
  } catch (error) {
    console.error('[Customers] Error in getNearbyCustomers:', error);
    res.status(500).json({ success: false, message: 'Could not load nearby customers.', items: [] });
  }
};

exports.getCustomerById = async (req, res) => {
  try {
    const customerId = req.params.id;
    const businessId = resolveBusinessIdFromRequest(req);

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'Company is not set on your account. Update your profile or log in again.',
      });
    }

    if (customerId === 'nearby') {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const idStr = String(customerId).trim();
    if (!mongoose.Types.ObjectId.isValid(idStr) || idStr.length !== 24) {
      return res.status(400).json({ success: false, message: 'Invalid customer id.' });
    }

    const oid = new mongoose.Types.ObjectId(idStr);
    // Same tenant rule as list/nearby: match businessId OR legacy companyId in MongoDB
    // (avoids false 404 when companyId exists in BSON but is not on the Mongoose schema path.)
    const customer = await Customer.findOne({
      _id: oid,
      ...tenantScopeFilter(businessId),
    }).lean();

    if (!customer) {
      console.log('[Customers] GET /customers/:id not found or outside tenant', {
        customerId: idStr,
        tenant: String(businessId),
      });
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    console.log('[Customers] Fetched customer:', customer.customerName || customerId);
    res.status(200).json(customer);
  } catch (error) {
    console.error('[Customers] Error fetching customer by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Could not load this customer. Please try again.',
    });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const customerId = req.params.id;
    const businessId = resolveBusinessIdFromRequest(req);
    const existing = await Customer.findById(customerId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    if (businessId && existing.businessId && existing.businessId.toString() !== businessId.toString()) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const updatePayload = { ...req.body };
    if (updatePayload.customerNumber != null && String(updatePayload.customerNumber).trim() !== '') {
      updatePayload.customerNumber = normalizeCustomerNumber(updatePayload.customerNumber);
    }
    if (updatePayload.emailId != null && String(updatePayload.emailId).trim() !== '') {
      updatePayload.emailId = normalizeEmailId(updatePayload.emailId);
    }
    const nextPhone =
      updatePayload.customerNumber !== undefined
        ? updatePayload.customerNumber
        : existing.customerNumber;
    const nextEmail =
      updatePayload.emailId !== undefined ? updatePayload.emailId : existing.emailId;

    const duplicate = await findDuplicateCustomerConflict({
      businessId: existing.businessId,
      customerNumber: nextPhone,
      emailId: nextEmail,
      excludeCustomerId: customerId,
    });
    if (duplicate) {
      return res.status(409).json({ success: false, message: duplicate.message });
    }

    const customer = await Customer.findByIdAndUpdate(customerId, updatePayload, {
      new: true,
      runValidators: true,
    }).lean();
    res.status(200).json(customer);
  } catch (error) {
    console.error('[Customers] Error updating customer:', error);
    const mapped = customerSaveErrorResponse(error);
    if (mapped) {
      return res.status(mapped.status).json(mapped.body);
    }
    res.status(500).json({
      success: false,
      message: 'Could not update customer. Please try again.',
    });
  }
};

/** GET /customers/followups — follow-ups in followupCustomer linked to current user (mobile CRM). */
exports.listCustomerFollowUpsFeed = async (req, res) => {
  try {
    const businessId = resolveBusinessIdFromRequest(req);
    if (!businessId) return res.status(200).json({ items: [] });
    const bid =
      mongoose.Types.ObjectId.isValid(String(businessId).trim()) && String(businessId).trim().length === 24
        ? new mongoose.Types.ObjectId(String(businessId).trim())
        : businessId;
    const q = {
      businessId: bid,
      $or: [{ assignedToUserId: req.user._id }, { createdByUserId: req.user._id }],
    };
    const from = parseFollowDate(req.query.from);
    const to = parseFollowDate(req.query.to);
    if (from || to) {
      q.createdAt = {};
      if (from) q.createdAt.$gte = from;
      if (to) q.createdAt.$lte = endOfDayFollow(to);
    }
    const status = String(req.query.status || '').trim().toLowerCase();
    if (status === 'pending') {
      q.nextFollowUpAt = { $gt: new Date() };
    } else if (status === 'overdue') {
      q.nextFollowUpAt = { $lt: new Date(), $ne: null };
    }
    const rows = await CustomerFollowUp.find(q)
      .sort({ createdAt: -1 })
      .populate('customerId', 'customerName companyName')
      .populate('createdByUserId', 'name email')
      .populate('assignedToUserId', 'name email')
      .lean();
    const search = String(req.query.search || '').trim().toLowerCase();
    let items = rows.map((f) => {
      const cust = f.customerId;
      const cid = cust && typeof cust === 'object' && cust._id != null ? cust._id : f.customerId;
      return {
        followUpId: f._id,
        customerId: cid,
        customerName: cust?.customerName || '',
        companyName: cust?.companyName || '',
        followUpType: f.actionType || 'call',
        nextFollowUpDate: f.nextFollowUpAt || null,
        notes: f.note || '',
        notesPreview: String(f.note || '').slice(0, 120),
        createdBy: f.createdByUserId || null,
        assignedTo: f.assignedToUserId || null,
        createdAt: f.createdAt || null,
        updatedAt: f.updatedAt || null,
      };
    });
    if (search) {
      items = items.filter((x) => {
        const blob = `${x.customerName} ${x.companyName} ${x.notes}`.toLowerCase();
        return blob.includes(search);
      });
    }
    return res.status(200).json({ items });
  } catch (e) {
    console.error('[Customers] listCustomerFollowUpsFeed', e);
    return res.status(500).json({ message: e.message || 'Failed to fetch customer follow-ups.' });
  }
};

/** POST /customers/:id/followups */
exports.addCustomerFollowUp = async (req, res) => {
  try {
    const businessId = resolveBusinessIdFromRequest(req);
    if (!businessId) return res.status(400).json({ success: false, message: 'Company missing on account.' });
    const idStr = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(idStr) || idStr.length !== 24) {
      return res.status(400).json({ success: false, message: 'Invalid customer id.' });
    }
    const oid = new mongoose.Types.ObjectId(idStr);
    const customer = await Customer.findOne({ _id: oid, ...tenantScopeFilter(businessId) }).select('_id').lean();
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });
    const note = String(req.body.note || '').trim();
    if (!note) return res.status(400).json({ success: false, message: 'Follow-up note is required.' });
    const actionType = ['call', 'visit', 'message', 'other'].includes(String(req.body.actionType || '').toLowerCase())
      ? String(req.body.actionType).toLowerCase()
      : 'call';
    const nextFollowUpAt = parseFollowDate(req.body.nextFollowUpAt);
    let assignee = req.user._id;
    if (req.body.assignedToUserId != null && String(req.body.assignedToUserId).trim()) {
      const v = await validateUserInBusiness(businessId, req.body.assignedToUserId);
      if (!v) return res.status(400).json({ success: false, message: 'Invalid assignee.' });
      assignee = v;
    }
    const bid =
      mongoose.Types.ObjectId.isValid(String(businessId).trim()) && String(businessId).trim().length === 24
        ? new mongoose.Types.ObjectId(String(businessId).trim())
        : businessId;
    const row = await CustomerFollowUp.create({
      businessId: bid,
      customerId: oid,
      note,
      actionType,
      nextFollowUpAt,
      createdByUserId: req.user._id,
      assignedToUserId: assignee,
    });
    return res.status(201).json({ item: row });
  } catch (e) {
    console.error('[Customers] addCustomerFollowUp', e);
    return res.status(500).json({ success: false, message: e.message || 'Failed to add follow-up.' });
  }
};