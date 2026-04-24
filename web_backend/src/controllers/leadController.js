const mongoose = require('mongoose');
const Company = require('../models/Company');
const User = require('../models/User');
const Customer = require('../models/Customer');
const { Lead, LEAD_STATUSES } = require('../models/Lead');
const LeadFollowUp = require('../models/LeadFollowUp');

const FINAL_STATUSES = new Set(['won', 'dropped', 'customer']);

function normalizeStatus(value, fallback = 'new') {
  const s = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return LEAD_STATUSES.includes(s) ? s : fallback;
}

function ensureContactProvided(emailId, phoneNumber) {
  return Boolean(String(emailId || '').trim() || String(phoneNumber || '').trim());
}

async function getCompanyForAdmin(adminId) {
  return Company.findOne({ adminId }).select('_id name').lean();
}

async function validateAssignee(companyId, userId) {
  const id = String(userId || '').trim();
  if (!id) return null;
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const row = await User.findOne({ _id: id, companyId }).select('_id name').lean();
  return row ? row._id : null;
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

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toListItem(row) {
  return {
    _id: row._id,
    leadName: row.leadName,
    companyName: row.companyName,
    emailId: row.emailId || '',
    phoneNumber: row.phoneNumber || '',
    source: row.source || '',
    status: row.status,
    assignedTo: row.assignedTo || null,
    convertedToCustomer: row.convertedToCustomer === true,
    isLocked: row.isLocked === true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    address: row.address || { text: '', lat: null, lng: null },
  };
}

function emitLeadEvent(req, event, payload) {
  try {
    const io = req.app?.get?.('io');
    if (io) io.emit(event, payload);
  } catch {
    /* noop */
  }
}

async function createLead(req, res, next) {
  try {
    const company = await getCompanyForAdmin(req.admin._id);
    if (!company?._id) return res.status(400).json({ message: 'Complete company setup first.' });

    const leadName = String(req.body.leadName || '').trim();
    const companyName = String(req.body.companyName || '').trim();
    const emailId = String(req.body.emailId || '').trim().toLowerCase();
    const phoneNumber = String(req.body.phoneNumber || '').trim();
    if (!leadName || !companyName) {
      return res.status(400).json({ message: 'Lead name and company name are required.' });
    }
    if (!ensureContactProvided(emailId, phoneNumber)) {
      return res.status(400).json({ message: 'At least one contact is required: email or phone.' });
    }
    const assignedTo = await validateAssignee(company._id, req.body.assignedTo);
    const status = normalizeStatus(req.body.status, 'new');
    const row = await Lead.create({
      companyId: company._id,
      adminId: req.admin._id,
      leadName,
      companyName,
      emailId,
      phoneNumber,
      source: String(req.body.source || '').trim(),
      status,
      assignedTo,
      convertedToCustomer: false,
      isLocked: false,
      address: {
        text: String(req.body.address?.text || req.body.address || '').trim(),
        lat: req.body.address?.lat != null ? Number(req.body.address.lat) : null,
        lng: req.body.address?.lng != null ? Number(req.body.address.lng) : null,
      },
      assignmentLogs: assignedTo
        ? [{ fromUserId: null, toUserId: assignedTo, changedByAdminId: req.admin._id, changedAt: new Date() }]
        : [],
      statusLogs: [{ fromStatus: 'new', toStatus: status, changedByAdminId: req.admin._id, changedAt: new Date() }],
    });
    const populated = await Lead.findById(row._id).populate('assignedTo', 'name email').lean();
    emitLeadEvent(req, 'lead_created', { item: toListItem(populated) });
    return res.status(201).json({ item: toListItem(populated) });
  } catch (e) {
    return next(e);
  }
}

async function listLeads(req, res, next) {
  try {
    const company = await getCompanyForAdmin(req.admin._id);
    if (!company?._id) return res.json({ items: [] });
    const q = { companyId: company._id };
    const includeConverted = String(req.query.includeConverted || '').toLowerCase() === 'true';
    if (!includeConverted) {
      q.convertedToCustomer = { $ne: true };
      q.status = { $ne: 'customer' };
    }
    const search = String(req.query.search || '').trim();
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      q.$or = [{ companyName: rx }, { phoneNumber: rx }, { emailId: rx }, { leadName: rx }];
    }
    const status = normalizeStatus(req.query.status, '');
    if (status) q.status = status;
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    if (from || to) {
      q.createdAt = {};
      if (from) q.createdAt.$gte = from;
      if (to) q.createdAt.$lte = to;
    }
    const items = await Lead.find(q).sort({ createdAt: -1 }).populate('assignedTo', 'name email').lean();
    return res.json({ items: items.map(toListItem) });
  } catch (e) {
    return next(e);
  }
}

async function getLeadById(req, res, next) {
  try {
    const company = await getCompanyForAdmin(req.admin._id);
    if (!company?._id) return res.status(400).json({ message: 'Complete company setup first.' });
    const row = await Lead.findOne({ _id: req.params.id, companyId: company._id })
      .populate('assignedTo', 'name email')
      .populate('assignmentLogs.fromUserId', 'name email')
      .populate('assignmentLogs.toUserId', 'name email')
      .lean();
    if (!row) return res.status(404).json({ message: 'Lead not found.' });
    const followUps = await LeadFollowUp.find({ companyId: company._id, leadId: row._id })
      .sort({ createdAt: -1 })
      .populate('createdByAdminId', 'name email')
      .populate('createdByUserId', 'name email')
      .lean();
    row.followUps = followUps.map((f) => ({
      _id: f._id,
      note: f.note || '',
      actionType: f.actionType || 'call',
      nextFollowUpAt: f.nextFollowUpAt || null,
      statusAfter: f.statusAfter || null,
      createdByAdminId: f.createdByAdminId || null,
      createdByUserId: f.createdByUserId || null,
      createdAt: f.createdAt || null,
      updatedAt: f.updatedAt || null,
      history: Array.isArray(f.history) ? f.history : [],
    }));
    return res.json({ item: row });
  } catch (e) {
    return next(e);
  }
}

async function updateLead(req, res, next) {
  try {
    const company = await getCompanyForAdmin(req.admin._id);
    if (!company?._id) return res.status(400).json({ message: 'Complete company setup first.' });
    const row = await Lead.findOne({ _id: req.params.id, companyId: company._id });
    if (!row) return res.status(404).json({ message: 'Lead not found.' });
    if (row.isLocked) return res.status(403).json({ message: 'Converted lead is locked.' });

    const nextLeadName = req.body.leadName != null ? String(req.body.leadName).trim() : row.leadName;
    const nextCompanyName = req.body.companyName != null ? String(req.body.companyName).trim() : row.companyName;
    const nextEmail = req.body.emailId != null ? String(req.body.emailId).trim().toLowerCase() : row.emailId;
    const nextPhone = req.body.phoneNumber != null ? String(req.body.phoneNumber).trim() : row.phoneNumber;
    if (!nextLeadName || !nextCompanyName) {
      return res.status(400).json({ message: 'Lead name and company name are required.' });
    }
    if (!ensureContactProvided(nextEmail, nextPhone)) {
      return res.status(400).json({ message: 'At least one contact is required: email or phone.' });
    }

    row.leadName = nextLeadName;
    row.companyName = nextCompanyName;
    row.emailId = nextEmail;
    row.phoneNumber = nextPhone;
    if (req.body.source != null) row.source = String(req.body.source).trim();
    if (req.body.address != null) {
      if (typeof req.body.address === 'object') {
        row.address = {
          text: String(req.body.address.text || '').trim(),
          lat: req.body.address.lat != null ? Number(req.body.address.lat) : null,
          lng: req.body.address.lng != null ? Number(req.body.address.lng) : null,
        };
      } else {
        row.address = { ...(row.address || {}), text: String(req.body.address).trim() };
      }
    }
    if (req.body.assignedTo !== undefined) {
      const oldUserId = row.assignedTo ? String(row.assignedTo) : null;
      const nextUser = await validateAssignee(company._id, req.body.assignedTo);
      const nextUserId = nextUser ? String(nextUser) : null;
      if (oldUserId !== nextUserId) {
        row.assignmentLogs.push({
          fromUserId: row.assignedTo || null,
          toUserId: nextUser || null,
          changedByAdminId: req.admin._id,
          changedAt: new Date(),
        });
        row.assignedTo = nextUser;
      }
    }
    if (req.body.status !== undefined) {
      const nextStatus = normalizeStatus(req.body.status, row.status);
      if (FINAL_STATUSES.has(row.status) && nextStatus !== row.status) {
        return res.status(400).json({ message: 'Final status cannot be changed.' });
      }
      if (nextStatus !== row.status) {
        row.statusLogs.push({
          fromStatus: row.status,
          toStatus: nextStatus,
          changedByAdminId: req.admin._id,
          note: String(req.body.statusNote || '').trim(),
          changedAt: new Date(),
        });
        row.status = nextStatus;
      }
    }
    await row.save();
    const populated = await Lead.findById(row._id).populate('assignedTo', 'name email').lean();
    emitLeadEvent(req, 'lead_updated', { item: toListItem(populated) });
    return res.json({ item: toListItem(populated) });
  } catch (e) {
    return next(e);
  }
}

async function addFollowUp(req, res, next) {
  try {
    const company = await getCompanyForAdmin(req.admin._id);
    if (!company?._id) return res.status(400).json({ message: 'Complete company setup first.' });
    const leadIdRaw = req.params.id || req.body.leadId;
    if (!leadIdRaw || !mongoose.Types.ObjectId.isValid(String(leadIdRaw))) {
      return res.status(400).json({ message: 'A valid lead id is required.' });
    }
    const row = await Lead.findOne({ _id: leadIdRaw, companyId: company._id });
    if (!row) return res.status(404).json({ message: 'Lead not found.' });
    if (row.convertedToCustomer || row.isLocked) {
      return res.status(403).json({ message: 'This lead was converted to a customer; add follow-ups under Customers.' });
    }
    const note = String(req.body.note || '').trim();
    if (!note) return res.status(400).json({ message: 'Follow-up note is required.' });
    const actionType = ['call', 'visit', 'message', 'other'].includes(String(req.body.actionType || '').toLowerCase())
      ? String(req.body.actionType).toLowerCase()
      : 'call';
    const nextFollowUpAt = parseDate(req.body.nextFollowUpAt);
    const statusAfter = req.body.statusAfter != null ? normalizeStatus(req.body.statusAfter, row.status) : null;
    const follow = await LeadFollowUp.create({
      companyId: company._id,
      leadId: row._id,
      note,
      actionType,
      nextFollowUpAt,
      statusAfter,
      createdByAdminId: req.admin._id,
      createdByUserId: null,
      history: [
        {
          note,
          actionType,
          nextFollowUpAt,
          statusAfter,
          changedByAdminId: req.admin._id,
          changedAt: new Date(),
        },
      ],
    });
    if (statusAfter && statusAfter !== row.status) {
      if (FINAL_STATUSES.has(row.status) && statusAfter !== row.status) {
        return res.status(400).json({ message: 'Final status cannot be changed.' });
      }
      row.statusLogs.push({
        fromStatus: row.status,
        toStatus: statusAfter,
        changedByAdminId: req.admin._id,
        note: 'Status changed via follow-up',
        changedAt: new Date(),
      });
      row.status = statusAfter;
    }
    await row.save();
    emitLeadEvent(req, 'lead_followup_added', { leadId: row._id });
    return res.status(201).json({ item: follow });
  } catch (e) {
    return next(e);
  }
}

async function updateFollowUp(req, res, next) {
  try {
    const company = await getCompanyForAdmin(req.admin._id);
    if (!company?._id) return res.status(400).json({ message: 'Complete company setup first.' });
    const row = await Lead.findOne({ _id: req.params.id, companyId: company._id });
    if (!row) return res.status(404).json({ message: 'Lead not found.' });
    if (row.convertedToCustomer || row.isLocked) {
      return res.status(403).json({ message: 'This lead is locked after conversion; follow-ups cannot be edited here.' });
    }
    const follow = await LeadFollowUp.findOne({
      _id: req.params.followUpId,
      leadId: row._id,
      companyId: company._id,
    });
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
    if (req.body.nextFollowUpAt !== undefined) follow.nextFollowUpAt = parseDate(req.body.nextFollowUpAt);
    if (req.body.statusAfter !== undefined) follow.statusAfter = req.body.statusAfter == null ? null : normalizeStatus(req.body.statusAfter, row.status);
    follow.history = Array.isArray(follow.history) ? follow.history : [];
    follow.history.push({
      note: follow.note,
      actionType: follow.actionType,
      nextFollowUpAt: follow.nextFollowUpAt || null,
      statusAfter: follow.statusAfter || null,
      changedByAdminId: req.admin._id,
      changedAt: new Date(),
    });

    if (follow.statusAfter && follow.statusAfter !== row.status) {
      if (FINAL_STATUSES.has(row.status) && follow.statusAfter !== row.status) {
        return res.status(400).json({ message: 'Final status cannot be changed.' });
      }
      row.statusLogs.push({
        fromStatus: row.status,
        toStatus: follow.statusAfter,
        changedByAdminId: req.admin._id,
        note: 'Status changed via follow-up update',
        changedAt: new Date(),
      });
      row.status = follow.statusAfter;
    }
    await Promise.all([follow.save(), row.save()]);
    return res.status(200).json({ item: follow });
  } catch (e) {
    return next(e);
  }
}

async function listFollowUps(req, res, next) {
  try {
    const company = await getCompanyForAdmin(req.admin._id);
    if (!company?._id) return res.json({ items: [] });
    const leadFilter = { companyId: company._id, convertedToCustomer: { $ne: true }, status: { $ne: 'customer' } };
    const status = normalizeStatus(req.query.status, '');
    if (status) leadFilter.status = status;
    const search = String(req.query.search || '').trim();
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      leadFilter.$or = [{ companyName: rx }, { leadName: rx }];
    }
    const leadRows = await Lead.find(leadFilter).select('_id leadName companyName status').lean();
    const leadById = new Map(leadRows.map((x) => [String(x._id), x]));
    const leadIds = leadRows.map((x) => x._id);
    if (!leadIds.length) return res.json({ items: [] });

    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    const q = { companyId: company._id, leadId: { $in: leadIds } };
    if (from || to) {
      q.nextFollowUpAt = {};
      if (from) q.nextFollowUpAt.$gte = startOfDay(from);
      if (to) q.nextFollowUpAt.$lte = endOfDay(to);
    }

    const rows = await LeadFollowUp.find(q)
      .sort(from || to ? { nextFollowUpAt: 1, createdAt: -1 } : { createdAt: -1 })
      .populate('createdByAdminId', 'name email')
      .populate('createdByUserId', 'name email')
      .lean();
    const items = rows
      .map((f) => {
        const lead = leadById.get(String(f.leadId));
        if (!lead) return null;
        return {
          followUpId: f._id,
          leadId: lead._id,
          leadName: lead.leadName,
          companyName: lead.companyName,
          status: lead.status,
          followUpType: f.actionType || 'call',
          nextFollowUpDate: f.nextFollowUpAt || null,
          notes: f.note || '',
          notesPreview: String(f.note || '').slice(0, 120),
          createdBy: f.createdByUserId || f.createdByAdminId || null,
          createdAt: f.createdAt || null,
          updatedAt: f.updatedAt || null,
          statusAfter: f.statusAfter || null,
          history: Array.isArray(f.history) ? f.history : [],
        };
      })
      .filter(Boolean);
    return res.json({ items });
  } catch (e) {
    return next(e);
  }
}

async function convertLeadToCustomer(req, res, next) {
  try {
    const company = await getCompanyForAdmin(req.admin._id);
    if (!company?._id) return res.status(400).json({ message: 'Complete company setup first.' });
    const row = await Lead.findOne({ _id: req.params.id, companyId: company._id });
    if (!row) return res.status(404).json({ message: 'Lead not found.' });
    if (row.convertedToCustomer && row.convertedCustomerId) {
      return res.json({ message: 'Already converted.', customerId: row.convertedCustomerId });
    }
    const customer = await Customer.create({
      companyId: company._id,
      adminId: req.admin._id,
      customerName: row.leadName,
      companyName: row.companyName,
      emailId: row.emailId || '',
      customerNumber: row.phoneNumber || '',
      address: row.address?.text || '',
      city: '',
      pincode: '',
      segment: 'active',
      customerStatus: 'active',
      geoLocation:
        row.address?.lat != null && row.address?.lng != null
          ? { lat: Number(row.address.lat), lng: Number(row.address.lng) }
          : undefined,
    });
    row.convertedToCustomer = true;
    row.convertedCustomerId = customer._id;
    row.isLocked = true;
    if (row.status !== 'customer') {
      row.statusLogs.push({
        fromStatus: row.status,
        toStatus: 'customer',
        changedByAdminId: req.admin._id,
        note: 'Converted to customer',
        changedAt: new Date(),
      });
      row.status = 'customer';
    }
    await row.save();
    emitLeadEvent(req, 'lead_converted', { leadId: row._id, customerId: customer._id });
    return res.json({ message: 'Lead converted successfully.', customerId: customer._id, leadId: row._id });
  } catch (e) {
    return next(e);
  }
}

async function getLeadReport(req, res, next) {
  try {
    const company = await getCompanyForAdmin(req.admin._id);
    if (!company?._id) return res.json({ metrics: {}, insights: {} });
    const rows = await Lead.find({ companyId: company._id }).select('status followUps createdAt').lean();
    const total = rows.length;
    const byStatus = {};
    let won = 0;
    let dropped = 0;
    const leadIds = rows.map((r) => r._id);
    rows.forEach((r) => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      if (r.status === 'won' || r.status === 'customer') won += 1;
      if (r.status === 'dropped') dropped += 1;
    });
    const [followUpsCount, followedLeadIds] = await Promise.all([
      LeadFollowUp.countDocuments({ companyId: company._id }),
      LeadFollowUp.distinct('leadId', { companyId: company._id, leadId: { $in: leadIds } }),
    ]);
    const leadsWithFollowUp = followedLeadIds.length;
    const conversionRate = total ? Number((((won / total) * 100) || 0).toFixed(1)) : 0;
    const followUpEffectiveness = total ? Number((((leadsWithFollowUp / total) * 100) || 0).toFixed(1)) : 0;
    return res.json({
      metrics: {
        totalLeads: total,
        byStatus,
        wonLeads: won,
        droppedLeads: dropped,
        totalFollowUps: followUpsCount,
      },
      insights: {
        conversionRate,
        followUpEffectiveness,
      },
    });
  } catch (e) {
    return next(e);
  }
}

async function listUpcomingFollowUps(req, res, next) {
  try {
    const company = await getCompanyForAdmin(req.admin._id);
    if (!company?._id) return res.json({ items: [] });
    const now = new Date();
    const leads = await Lead.find({
      companyId: company._id,
      convertedToCustomer: { $ne: true },
      status: { $ne: 'customer' },
    })
      .select('_id leadName companyName assignedTo status')
      .populate('assignedTo', 'name email')
      .lean();
    const leadById = new Map(leads.map((x) => [String(x._id), x]));
    const leadIds = leads.map((x) => x._id);
    const followRows = await LeadFollowUp.find({
      companyId: company._id,
      leadId: { $in: leadIds },
      nextFollowUpAt: { $gte: now },
    })
      .select('leadId note actionType nextFollowUpAt')
      .lean();
    const items = followRows
      .map((f) => {
        const lead = leadById.get(String(f.leadId));
        if (!lead) return null;
        return {
          leadId: lead._id,
          leadName: lead.leadName,
          companyName: lead.companyName,
          status: lead.status,
          assignedTo: lead.assignedTo || null,
          note: f.note,
          actionType: f.actionType,
          nextFollowUpAt: f.nextFollowUpAt,
        };
      })
      .filter(Boolean);
    items.sort((a, b) => new Date(a.nextFollowUpAt).getTime() - new Date(b.nextFollowUpAt).getTime());
    return res.json({ items });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  createLead,
  listLeads,
  getLeadById,
  updateLead,
  addFollowUp,
  convertLeadToCustomer,
  getLeadReport,
  listUpcomingFollowUps,
  listFollowUps,
  updateFollowUp,
};
