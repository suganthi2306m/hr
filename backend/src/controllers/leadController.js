const mongoose = require('mongoose');
const { Lead, LEAD_STATUSES } = require('../models/Lead');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Company = require('../models/Company');

const FINAL_STATUSES = new Set(['won', 'dropped', 'customer']);

function normalizeStatus(value, fallback = 'new') {
  const s = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return LEAD_STATUSES.includes(s) ? s : fallback;
}

function hasPrivilegedRole(role) {
  const r = String(role || '').trim().toLowerCase();
  return ['admin', 'manager', 'supervisor'].includes(r);
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

async function validateAssignee(businessId, userId) {
  const id = String(userId || '').trim();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
  const row = await User.findOne({ _id: id, companyId: businessId }).select('_id').lean();
  return row ? row._id : null;
}

function ensureContactProvided(emailId, phoneNumber) {
  return Boolean(String(emailId || '').trim() || String(phoneNumber || '').trim());
}

function tenantId(req) {
  return req.user?.companyId || req.user?.businessId || req.companyId || null;
}

async function resolveCompanyAdminContext(businessId) {
  const out = { companyId: null, adminId: null };
  const idStr = String(businessId || '').trim();
  if (!idStr || !mongoose.Types.ObjectId.isValid(idStr) || idStr.length !== 24) return out;
  const companyId = new mongoose.Types.ObjectId(idStr);
  out.companyId = companyId;
  try {
    const db = Company.db;
    const modelColl = Company.collection.collectionName;
    const candidates = [modelColl, 'companies', 'businesses'];
    const seen = new Set();
    for (const collName of candidates) {
      if (!collName || seen.has(collName)) continue;
      seen.add(collName);
      try {
        const doc = await db.collection(collName).findOne({ _id: companyId }, { projection: { adminId: 1 } });
        if (!doc) continue;
        const raw = doc.adminId;
        if (raw && mongoose.Types.ObjectId.isValid(String(raw)) && String(raw).length === 24) {
          out.adminId = new mongoose.Types.ObjectId(String(raw));
        }
        break;
      } catch (_) {}
    }
  } catch (_) {}
  return out;
}

exports.listLeads = async (req, res) => {
  try {
    const businessId = tenantId(req);
    if (!businessId) return res.status(200).json({ items: [] });
    const filter = { businessId };
    // Core CRM rule: converted/customer leads should not appear in Leads list.
    const includeConverted = String(req.query.includeConverted || '').toLowerCase() === 'true';
    if (!includeConverted) {
      filter.convertedToCustomer = { $ne: true };
      filter.status = { $ne: 'customer' };
    }
    /** Mobile CRM: show leads created by me OR assigned to me. */
    filter.$or = [{ assignedTo: req.user?._id }, { createdBy: req.user?._id }];
    const status = normalizeStatus(req.query.status, '');
    if (status) filter.status = status;
    const search = String(req.query.search || '').trim();
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ companyName: rx }, { phoneNumber: rx }, { emailId: rx }, { leadName: rx }];
    }
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }
    const items = await Lead.find(filter).sort({ createdAt: -1 }).populate('assignedTo', 'name email').lean();
    return res.status(200).json({ items });
  } catch (e) {
    return res.status(500).json({ message: e.message || 'Failed to fetch leads.' });
  }
};

exports.getLeadById = async (req, res) => {
  try {
    const businessId = tenantId(req);
    if (!businessId) return res.status(404).json({ message: 'Lead not found.' });
    const filter = { _id: req.params.id, businessId };
    const row = await Lead.findOne(filter)
      .populate('assignedTo', 'name email')
      .populate('assignmentLogs.fromUserId', 'name email')
      .populate('assignmentLogs.toUserId', 'name email')
      .populate('followUps.createdByUserId', 'name email')
      .populate('followUps.assignedToUserId', 'name email')
      .lean();
    if (!row) return res.status(404).json({ message: 'Lead not found.' });
    if (!hasPrivilegedRole(req.user?.role) && String(row.assignedTo?._id || row.assignedTo || '') !== String(req.user?._id || '')) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    return res.status(200).json({ item: row });
  } catch (e) {
    return res.status(500).json({ message: e.message || 'Failed to fetch lead.' });
  }
};

exports.createLead = async (req, res) => {
  try {
    const privileged = hasPrivilegedRole(req.user?.role);
    const businessId = tenantId(req);
    if (!businessId) return res.status(400).json({ message: 'Company missing on account.' });
    const leadName = String(req.body.leadName || '').trim();
    const companyName = String(req.body.companyName || '').trim();
    const emailId = String(req.body.emailId || '').trim().toLowerCase();
    const phoneNumber = String(req.body.phoneNumber || '').trim();
    if (!leadName || !companyName) return res.status(400).json({ message: 'Lead name and company name are required.' });
    if (!ensureContactProvided(emailId, phoneNumber)) {
      return res.status(400).json({ message: 'At least one contact is required: email or phone.' });
    }
    let assignedTo = await validateAssignee(businessId, req.body.assignedTo);
    if (!privileged) {
      if (assignedTo && String(assignedTo) !== String(req.user._id)) {
        return res.status(403).json({ message: 'You can only assign new leads to yourself.' });
      }
      if (!assignedTo) assignedTo = req.user._id;
    }
    const status = normalizeStatus(req.body.status, 'new');
    const tenantCtx = await resolveCompanyAdminContext(businessId);
    const row = await Lead.create({
      businessId,
      companyId: tenantCtx.companyId,
      adminId: tenantCtx.adminId,
      createdBy: req.user._id,
      leadName,
      companyName,
      emailId,
      phoneNumber,
      source: String(req.body.source || '').trim(),
      status,
      assignedTo,
      address: {
        text: String(req.body.address?.text || req.body.address || '').trim(),
        lat: req.body.address?.lat != null ? Number(req.body.address.lat) : null,
        lng: req.body.address?.lng != null ? Number(req.body.address.lng) : null,
      },
      assignmentLogs: assignedTo
        ? [{ fromUserId: null, toUserId: assignedTo, changedByUserId: req.user._id, changedAt: new Date() }]
        : [],
      statusLogs: [{ fromStatus: 'new', toStatus: status, changedByUserId: req.user._id, changedAt: new Date() }],
    });
    return res.status(201).json({ item: row });
  } catch (e) {
    return res.status(500).json({ message: e.message || 'Failed to create lead.' });
  }
};

exports.updateLead = async (req, res) => {
  try {
    const businessId = tenantId(req);
    if (!businessId) return res.status(404).json({ message: 'Lead not found.' });
    const row = await Lead.findOne({ _id: req.params.id, businessId });
    if (!row) return res.status(404).json({ message: 'Lead not found.' });
    const privileged = hasPrivilegedRole(req.user?.role);
    const assignedToCurrent = String(row.assignedTo || '') === String(req.user?._id || '');
    if (!privileged && !assignedToCurrent) return res.status(403).json({ message: 'Access denied.' });
    if (row.isLocked) return res.status(403).json({ message: 'Converted lead is locked.' });

    if (privileged) {
      if (req.body.leadName != null) row.leadName = String(req.body.leadName).trim();
      if (req.body.companyName != null) row.companyName = String(req.body.companyName).trim();
      if (req.body.emailId != null) row.emailId = String(req.body.emailId).trim().toLowerCase();
      if (req.body.phoneNumber != null) row.phoneNumber = String(req.body.phoneNumber).trim();
      if (!row.leadName || !row.companyName) return res.status(400).json({ message: 'Lead name and company name are required.' });
      if (!ensureContactProvided(row.emailId, row.phoneNumber)) {
        return res.status(400).json({ message: 'At least one contact is required: email or phone.' });
      }
      if (req.body.assignedTo !== undefined) {
        const nextAssignee = await validateAssignee(businessId, req.body.assignedTo);
        const oldId = String(row.assignedTo || '');
        const newId = String(nextAssignee || '');
        if (oldId !== newId) {
          row.assignmentLogs.push({
            fromUserId: row.assignedTo || null,
            toUserId: nextAssignee || null,
            changedByUserId: req.user._id,
            changedAt: new Date(),
          });
          row.assignedTo = nextAssignee;
        }
      }
      if (req.body.address != null) {
        if (typeof req.body.address === 'object') {
          row.address = {
            text: String(req.body.address.text || '').trim(),
            lat: req.body.address.lat != null ? Number(req.body.address.lat) : null,
            lng: req.body.address.lng != null ? Number(req.body.address.lng) : null,
          };
        } else {
          row.address = { ...(row.address || {}), text: String(req.body.address || '').trim() };
        }
      }
    }

    if (req.body.status !== undefined) {
      const nextStatus = normalizeStatus(req.body.status, row.status);
      if (FINAL_STATUSES.has(row.status) && nextStatus !== row.status) {
        return res.status(400).json({ message: 'Final status cannot be changed.' });
      }
      if (!privileged && ['won', 'dropped', 'customer'].includes(nextStatus)) {
        return res.status(403).json({ message: 'Only admin/manager can set final status.' });
      }
      if (nextStatus !== row.status) {
        row.statusLogs.push({
          fromStatus: row.status,
          toStatus: nextStatus,
          changedByUserId: req.user._id,
          note: String(req.body.statusNote || '').trim(),
          changedAt: new Date(),
        });
        row.status = nextStatus;
      }
    }

    await row.save();
    return res.status(200).json({ item: row });
  } catch (e) {
    return res.status(500).json({ message: e.message || 'Failed to update lead.' });
  }
};

exports.convertLeadToCustomer = async (req, res) => {
  try {
    const businessId = tenantId(req);
    if (!businessId) return res.status(404).json({ message: 'Lead not found.' });
    const row = await Lead.findOne({ _id: req.params.id, businessId });
    if (!row) return res.status(404).json({ message: 'Lead not found.' });
    const privileged = hasPrivilegedRole(req.user?.role);
    const assignedToCurrent = String(row.assignedTo || '') === String(req.user?._id || '');
    if (!privileged && !assignedToCurrent) return res.status(403).json({ message: 'Access denied.' });

    if (row.convertedToCustomer) {
      return res.status(200).json({ message: 'Lead already converted.' });
    }

    const fallbackPhone = `LD${String(row._id).slice(-8)}`;
    const customer = await Customer.create({
      customerName: row.leadName || row.companyName || 'Customer',
      customerNumber: String(row.phoneNumber || '').trim() || fallbackPhone,
      companyName: row.companyName || '',
      address: row.address?.text?.trim() || 'N/A',
      emailId: String(row.emailId || '').trim() || `lead-${String(row._id)}@example.com`,
      city: 'N/A',
      pincode: '000000',
      source: 'app',
      addedBy: req.user._id,
      businessId,
      companyId: row.companyId || businessId,
      adminId: row.adminId || null,
      geoLocation:
        row.address?.lat != null && row.address?.lng != null
          ? { lat: Number(row.address.lat), lng: Number(row.address.lng) }
          : undefined,
    });

    row.convertedToCustomer = true;
    row.isLocked = true;
    if (row.status !== 'customer') {
      row.statusLogs.push({
        fromStatus: row.status,
        toStatus: 'customer',
        changedByUserId: req.user._id,
        note: 'Converted to customer',
        changedAt: new Date(),
      });
      row.status = 'customer';
    }
    await row.save();
    return res.status(200).json({ message: 'Lead converted successfully.', customerId: customer._id, leadId: row._id });
  } catch (e) {
    return res.status(500).json({ message: e.message || 'Failed to convert lead.' });
  }
};

exports.addFollowUp = async (req, res) => {
  try {
    const businessId = tenantId(req);
    if (!businessId) return res.status(404).json({ message: 'Lead not found.' });
    const row = await Lead.findOne({ _id: req.params.id, businessId });
    if (!row) return res.status(404).json({ message: 'Lead not found.' });
    const privileged = hasPrivilegedRole(req.user?.role);
    const assignedToCurrent = String(row.assignedTo || '') === String(req.user?._id || '');
    if (!privileged && !assignedToCurrent) return res.status(403).json({ message: 'Access denied.' });
    const note = String(req.body.note || '').trim();
    if (!note) return res.status(400).json({ message: 'Follow-up note is required.' });
    const actionType = ['call', 'visit', 'message', 'other'].includes(String(req.body.actionType || '').toLowerCase())
      ? String(req.body.actionType).toLowerCase()
      : 'call';
    const statusAfter = req.body.statusAfter != null ? normalizeStatus(req.body.statusAfter, row.status) : null;
    if (!privileged && statusAfter && ['won', 'dropped', 'customer'].includes(statusAfter)) {
      return res.status(403).json({ message: 'Only admin/manager can set final status.' });
    }
    const nextFollowUpAt = parseDate(req.body.nextFollowUpAt);
    let followUpAssignee = null;
    if (req.body.assignedToUserId !== undefined) {
      followUpAssignee = await validateAssignee(businessId, req.body.assignedToUserId);
      if (String(req.body.assignedToUserId || '').trim() && !followUpAssignee) {
        return res.status(400).json({ message: 'Assigned follow-up user is invalid.' });
      }
    } else if (row.assignedTo) {
      // Default follow-up owner to current lead assignee when not explicitly chosen.
      followUpAssignee = row.assignedTo;
    }
    row.followUps.push({
      note,
      actionType,
      nextFollowUpAt,
      statusAfter,
      assignedToUserId: followUpAssignee,
      createdByUserId: req.user._id,
      createdAt: new Date(),
      updatedAt: new Date(),
      history: [
        {
          note,
          actionType,
          nextFollowUpAt,
          statusAfter,
          changedByUserId: req.user._id,
          changedAt: new Date(),
        },
      ],
    });
    if (statusAfter && statusAfter !== row.status) {
      row.statusLogs.push({
        fromStatus: row.status,
        toStatus: statusAfter,
        changedByUserId: req.user._id,
        note: 'Status changed via follow-up',
        changedAt: new Date(),
      });
      row.status = statusAfter;
    }
    await row.save();
    return res.status(201).json({ item: row });
  } catch (e) {
    return res.status(500).json({ message: e.message || 'Failed to add follow-up.' });
  }
};

exports.updateFollowUp = async (req, res) => {
  try {
    const businessId = tenantId(req);
    if (!businessId) return res.status(404).json({ message: 'Lead not found.' });
    const row = await Lead.findOne({ _id: req.params.id, businessId });
    if (!row) return res.status(404).json({ message: 'Lead not found.' });
    const privileged = hasPrivilegedRole(req.user?.role);
    const assignedToCurrent = String(row.assignedTo || '') === String(req.user?._id || '');
    if (!privileged && !assignedToCurrent) return res.status(403).json({ message: 'Access denied.' });

    const follow = (row.followUps || []).id(req.params.followUpId);
    if (!follow) return res.status(404).json({ message: 'Follow-up not found.' });

    if (req.body.note != null) {
      const nextNote = String(req.body.note || '').trim();
      if (!nextNote) return res.status(400).json({ message: 'Follow-up note is required.' });
      follow.note = nextNote;
    }
    if (req.body.actionType != null) {
      const nextType = String(req.body.actionType || '').toLowerCase();
      follow.actionType = ['call', 'visit', 'message', 'other'].includes(nextType) ? nextType : follow.actionType;
    }
    if (req.body.nextFollowUpAt !== undefined) {
      follow.nextFollowUpAt = parseDate(req.body.nextFollowUpAt);
    }
    if (req.body.statusAfter !== undefined) {
      const nextStatus = req.body.statusAfter == null ? null : normalizeStatus(req.body.statusAfter, row.status);
      if (!privileged && nextStatus && ['won', 'dropped', 'customer'].includes(nextStatus)) {
        return res.status(403).json({ message: 'Only admin/manager can set final status.' });
      }
      follow.statusAfter = nextStatus;
    }
    if (req.body.assignedToUserId !== undefined) {
      const followUpAssignee = await validateAssignee(businessId, req.body.assignedToUserId);
      if (String(req.body.assignedToUserId || '').trim() && !followUpAssignee) {
        return res.status(400).json({ message: 'Assigned follow-up user is invalid.' });
      }
      follow.assignedToUserId = followUpAssignee;
    }
    follow.updatedAt = new Date();
    follow.history = Array.isArray(follow.history) ? follow.history : [];
    follow.history.push({
      note: follow.note,
      actionType: follow.actionType,
      nextFollowUpAt: follow.nextFollowUpAt || null,
      statusAfter: follow.statusAfter || null,
      changedByUserId: req.user._id,
      changedAt: new Date(),
    });

    if (follow.statusAfter && follow.statusAfter !== row.status) {
      if (FINAL_STATUSES.has(row.status) && follow.statusAfter !== row.status) {
        return res.status(400).json({ message: 'Final status cannot be changed.' });
      }
      row.statusLogs.push({
        fromStatus: row.status,
        toStatus: follow.statusAfter,
        changedByUserId: req.user._id,
        note: 'Status changed via follow-up update',
        changedAt: new Date(),
      });
      row.status = follow.statusAfter;
    }

    await row.save();
    return res.status(200).json({ item: row });
  } catch (e) {
    return res.status(500).json({ message: e.message || 'Failed to update follow-up.' });
  }
};

exports.listFollowUps = async (req, res) => {
  try {
    const businessId = tenantId(req);
    if (!businessId) return res.status(200).json({ items: [] });
    const leadFilter = {
      businessId,
      convertedToCustomer: { $ne: true },
      status: { $ne: 'customer' },
      $or: [{ assignedTo: req.user?._id }, { createdBy: req.user?._id }],
    };
    const status = normalizeStatus(req.query.status, '');
    if (status) leadFilter.status = status;
    const search = String(req.query.search || req.query.companyName || req.query.leadName || '').trim();
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      leadFilter.$or = [{ companyName: rx }, { phoneNumber: rx }, { emailId: rx }, { leadName: rx }];
    }
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    const leads = await Lead.find(leadFilter)
      .select('leadName companyName status followUps assignedTo createdBy')
      .populate('followUps.createdByUserId', 'name email')
      .populate('followUps.assignedToUserId', 'name email')
      .lean();

    const items = [];
    leads.forEach((l) => {
      (l.followUps || []).forEach((f) => {
        const createdAt = f.createdAt ? new Date(f.createdAt) : null;
        if (from && (!createdAt || createdAt < from)) return;
        if (to && (!createdAt || createdAt > endOfDay(to))) return;
        const isMine =
          String(f.createdByUserId?._id || f.createdByUserId || '') === String(req.user?._id || '') ||
          String(f.assignedToUserId?._id || f.assignedToUserId || '') === String(req.user?._id || '') ||
          String(l.assignedTo || '') === String(req.user?._id || '') ||
          String(l.createdBy || '') === String(req.user?._id || '');
        if (!isMine) return;
        items.push({
          followUpId: f._id,
          leadId: l._id,
          leadName: l.leadName,
          companyName: l.companyName,
          status: l.status,
          followUpType: f.actionType || 'call',
          nextFollowUpDate: f.nextFollowUpAt || null,
          notes: f.note || '',
          notesPreview: String(f.note || '').slice(0, 120),
          createdBy: f.createdByUserId || null,
          createdAt: f.createdAt || null,
          updatedAt: f.updatedAt || null,
          assignedTo: f.assignedToUserId || null,
          statusAfter: f.statusAfter || null,
          history: Array.isArray(f.history) ? f.history : [],
        });
      });
    });
    items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return res.status(200).json({ items });
  } catch (e) {
    return res.status(500).json({ message: e.message || 'Failed to fetch follow-ups.' });
  }
};

exports.listUpcomingFollowUps = async (req, res) => {
  try {
    const businessId = tenantId(req);
    if (!businessId) return res.status(200).json({ items: [] });
    const filter = {
      businessId,
      convertedToCustomer: { $ne: true },
      status: { $ne: 'customer' },
      'followUps.nextFollowUpAt': { $gte: new Date() },
    };
    filter.$or = [{ assignedTo: req.user._id }, { createdBy: req.user._id }];
    const leads = await Lead.find(filter)
      .select('leadName companyName status assignedTo createdBy followUps')
      .populate('assignedTo', 'name email')
      .populate('followUps.assignedToUserId', 'name email')
      .lean();
    const now = Date.now();
    const items = [];
    leads.forEach((l) => {
      (l.followUps || []).forEach((f) => {
        if (f.nextFollowUpAt && new Date(f.nextFollowUpAt).getTime() >= now) {
          const isMine =
            String(f.createdByUserId?._id || f.createdByUserId || '') === String(req.user?._id || '') ||
            String(f.assignedToUserId?._id || f.assignedToUserId || '') === String(req.user?._id || '') ||
            String(l.assignedTo?._id || l.assignedTo || '') === String(req.user?._id || '') ||
            String(l.createdBy || '') === String(req.user?._id || '');
          if (!isMine) return;
          items.push({
            leadId: l._id,
            leadName: l.leadName,
            companyName: l.companyName,
            status: l.status,
            assignedTo: l.assignedTo || null,
            followUpAssignedTo: f.assignedToUserId || null,
            note: f.note,
            actionType: f.actionType,
            nextFollowUpAt: f.nextFollowUpAt,
          });
        }
      });
    });
    items.sort((a, b) => new Date(a.nextFollowUpAt).getTime() - new Date(b.nextFollowUpAt).getTime());
    return res.status(200).json({ items });
  } catch (e) {
    return res.status(500).json({ message: e.message || 'Failed to fetch follow-up reminders.' });
  }
};
