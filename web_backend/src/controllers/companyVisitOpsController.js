const mongoose = require('mongoose');
const Company = require('../models/Company');
const CompanyVisit = require('../models/CompanyVisit');
const User = require('../models/User');

function startOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDayBounds(dayStr) {
  const s = String(dayStr || '').trim();
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : `${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return { $gte: startOfLocalDay(d), $lte: endOfLocalDay(d) };
}

function siteAddressFromCustomerLean(cust) {
  if (!cust || typeof cust !== 'object') return '';
  const line1 = String(cust.address || '').trim();
  const cityState = [cust.city, cust.state].filter(Boolean).join(', ').trim();
  const tail = [cust.pincode, cust.country].filter(Boolean).join(' ').trim();
  return [line1, cityState, tail].filter(Boolean).join(', ');
}

function shapeVisitDocForClient(doc) {
  const cust = doc.customerId;
  const plainCustomerId =
    cust && typeof cust === 'object' && cust._id != null ? cust._id : doc.customerId;
  const siteAddress = siteAddressFromCustomerLean(cust);
  return {
    ...doc,
    customerId: plainCustomerId,
    siteAddress,
  };
}

/**
 * GET /api/ops/company-visits
 * Web dashboard: visits for the signed-in admin's company (Company._id === visit.businessId).
 */
async function listCompanyVisitsForOps(req, res) {
  try {
    if (!req.admin?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const company = await Company.findOne({ adminId: req.admin._id }).select('_id').lean();
    if (!company?._id) {
      return res.status(200).json({
        success: true,
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });
    }
    const businessId = new mongoose.Types.ObjectId(String(company._id));

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    let limit = parseInt(String(req.query.limit || '20'), 10) || 20;
    if (limit < 1) limit = 20;
    if (limit > 100) limit = 100;
    const skip = (page - 1) * limit;

    const filter = { businessId };

    const userIdStr = String(req.query.userId || '').trim();
    if (userIdStr && mongoose.Types.ObjectId.isValid(userIdStr) && userIdStr.length === 24) {
      const uid = new mongoose.Types.ObjectId(userIdStr);
      const staff = await User.findOne({ _id: uid, companyId: businessId }).select('_id').lean();
      if (staff) {
        filter.userId = uid;
      }
    }

    const customerIdStr = String(req.query.customerId || '').trim();
    if (customerIdStr && mongoose.Types.ObjectId.isValid(customerIdStr) && customerIdStr.length === 24) {
      filter.customerId = new mongoose.Types.ObjectId(customerIdStr);
    }

    const st = String(req.query.status || '').toLowerCase();
    if (st === 'open' || st === 'completed') {
      filter.status = st;
    }

    const singleDay = req.query.date != null ? String(req.query.date).trim() : '';
    if (singleDay) {
      const bounds = parseDayBounds(singleDay);
      if (bounds) filter.visitDate = bounds;
    } else {
      const fromStr = req.query.dateFrom != null ? String(req.query.dateFrom).trim() : '';
      const toStr = req.query.dateTo != null ? String(req.query.dateTo).trim() : '';
      if (fromStr || toStr) {
        const range = {};
        if (fromStr) {
          const b = parseDayBounds(fromStr);
          if (b) range.$gte = b.$gte;
        }
        if (toStr) {
          const b = parseDayBounds(toStr);
          if (b) range.$lte = b.$lte;
        }
        if (Object.keys(range).length) filter.visitDate = range;
      }
    }

    const search = String(req.query.search || '').trim();
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ companyName: rx }, { customerName: rx }, { source: rx }];
    }

    const [total, rows] = await Promise.all([
      CompanyVisit.countDocuments(filter),
      CompanyVisit.find(filter)
        .sort({ checkInTime: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: 'userId', select: 'name email' })
        .populate({
          path: 'customerId',
          select: 'address city pincode state country companyName customerName',
        })
        .lean(),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return res.json({
      success: true,
      items: rows.map(shapeVisitDocForClient),
      total,
      page,
      limit,
      totalPages,
    });
  } catch (e) {
    console.error('[CompanyVisitOps] listCompanyVisitsForOps error:', e?.message || e);
    return res.status(500).json({
      success: false,
      message: 'Failed to list company visits',
      error: e.message,
    });
  }
}

/**
 * GET /api/ops/company-visits/:id
 * GET /api/company-visits/company/:id
 */
async function getCompanyVisitByIdForOps(req, res) {
  try {
    if (!req.admin?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const idStr = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(idStr) || idStr.length !== 24) {
      return res.status(400).json({ success: false, message: 'Invalid visit id' });
    }
    const company = await Company.findOne({ adminId: req.admin._id }).select('_id').lean();
    if (!company?._id) {
      return res.status(404).json({ success: false, message: 'Visit not found' });
    }
    const businessId = new mongoose.Types.ObjectId(String(company._id));
    const visitId = new mongoose.Types.ObjectId(idStr);

    const doc = await CompanyVisit.findOne({ _id: visitId, businessId })
      .populate({ path: 'userId', select: 'name email' })
      .populate({
        path: 'customerId',
        select: 'address city pincode state country companyName customerName',
      })
      .lean();

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Visit not found' });
    }
    return res.json({ success: true, item: shapeVisitDocForClient(doc) });
  } catch (e) {
    console.error('[CompanyVisitOps] getCompanyVisitByIdForOps error:', e?.message || e);
    return res.status(500).json({
      success: false,
      message: 'Failed to load visit',
      error: e.message,
    });
  }
}

module.exports = { listCompanyVisitsForOps, getCompanyVisitByIdForOps };
