const mongoose = require('mongoose');
const CompanyVisit = require('../models/CompanyVisit');
const Customer = require('../models/Customer');
const User = require('../models/User');
const { haversineMeters } = require('../utils/haversine');
const {
  notifyCompanyVisitCheckIn,
  notifyCompanyVisitCheckOut,
} = require('../services/companyVisitDashboardNotify');

/** Slightly above app 50m radius to absorb GPS noise. */
const MAX_SERVER_CHECKIN_RADIUS_M = 55;

/**
 * Reporting anchor for `visitDate`: UTC midnight of the Gregorian calendar day
 * that contains [checkInUtc] in a zone where (local − UTC) = offsetMinutes
 * (same sign as Dart `DateTime.timeZoneOffset.inMinutes`, e.g. IST = +330).
 * If offset is omitted / invalid, uses 0 (UTC civil day of the instant).
 */
function visitDateAnchorForCheckIn(checkInUtc, offsetMinutes) {
  const off = Number.isFinite(offsetMinutes) ? offsetMinutes : 0;
  const shifted = checkInUtc.getTime() + off * 60 * 1000;
  const u = new Date(shifted);
  const y = u.getUTCFullYear();
  const m = u.getUTCMonth();
  const d = u.getUTCDate();
  return new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
}

function readDeviceTimeZoneOffsetMinutes(body) {
  if (!body || typeof body !== 'object') return 0;
  const raw = body.timeZoneOffsetMinutes ?? body.timezoneOffsetMinutes;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n) || n < -840 || n > 840) return 0;
  return n;
}

/** Bounds for `visitDate` when the client sends `YYYY-MM-DD` (civil triplet, no TZ in string). */
function utcCalendarDayBoundsFromYmd(dayStr) {
  const s = String(dayStr || '').trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    return {
      $gte: new Date(Date.UTC(y, mo, d, 0, 0, 0, 0)),
      $lte: new Date(Date.UTC(y, mo, d, 23, 59, 59, 999)),
    };
  }
  const d = new Date(s.includes('T') ? s : `${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const day = d.getUTCDate();
  return {
    $gte: new Date(Date.UTC(y, mo, day, 0, 0, 0, 0)),
    $lte: new Date(Date.UTC(y, mo, day, 23, 59, 59, 999)),
  };
}

/**
 * Same sign as Dart `DateTime.timeZoneOffset.inMinutes` (e.g. IST +330).
 * When present on list queries, filters use `checkInTime` for the civil day so rows
 * match what the UI shows in local time (fixes legacy `visitDate` stored in UTC).
 */
function readFilterTzOffsetFromQuery(query) {
  if (!query || typeof query !== 'object') return null;
  const raw = query.filterTimeZoneOffsetMinutes ?? query.filterTimezoneOffsetMinutes;
  if (raw === undefined || raw === null) return null;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s === '') return null;
  const n = typeof s === 'string' ? parseInt(s, 10) : Number(s);
  if (!Number.isFinite(n) || n < -840 || n > 840) return null;
  return n;
}

/** Inclusive UTC instant range for civil calendar day `YYYY-MM-DD` in that offset. */
function checkInTimeBoundsForCivilYmd(dayStr, offsetMinutes) {
  const s = String(dayStr || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const off = offsetMinutes * 60 * 1000;
  return {
    $gte: new Date(Date.UTC(y, mo, d, 0, 0, 0, 0) - off),
    $lte: new Date(Date.UTC(y, mo, d, 23, 59, 59, 999) - off),
  };
}

function extractObjectId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (value._id) return value._id.toString();
    if (value.$oid) return value.$oid.toString();
  }
  return value.toString();
}

function resolveBusinessIdFromUser(user) {
  return extractObjectId(user?.companyId) || extractObjectId(user?.businessId) || null;
}

async function closeOpenVisitForOtherCustomer({ userId, keepCustomerId, lat, lng, now }) {
  const keepId = new mongoose.Types.ObjectId(String(keepCustomerId));
  const openOther = await CompanyVisit.findOne({
    userId,
    status: 'open',
    customerId: { $ne: keepId },
  });
  if (!openOther) return;
  openOther.checkOutTime = now;
  openOther.checkOutLatitude = lat;
  openOther.checkOutLongitude = lng;
  openOther.durationMinutes = Math.max(
    0,
    Math.round((now.getTime() - openOther.checkInTime.getTime()) / 60000),
  );
  openOther.status = 'completed';
  await openOther.save();
  console.log(
    '[CompanyVisit] auto-closed previous open visit',
    String(openOther._id),
    'for user',
    String(userId),
  );
}

/**
 * POST /api/company-visits/checkin
 * Body: { customerId, lat, lng }
 */
exports.checkIn = async (req, res) => {
  try {
    const user = req.user;
    console.log(
      '[CompanyVisit] POST /checkin (auto) raw:',
      JSON.stringify({
        userId: user?._id ? String(user._id) : null,
        customerId: req.body?.customerId,
        lat: req.body?.lat ?? req.body?.latitude,
        lng: req.body?.lng ?? req.body?.longitude,
        meta: req.body?.meta,
      }),
    );
    if (!user?._id) {
      console.log('[CompanyVisit] checkin reject: unauthorized');
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const businessIdRaw = resolveBusinessIdFromUser(user);
    if (!businessIdRaw) {
      console.log('[CompanyVisit] checkin reject: no company on user', String(user._id));
      return res.status(400).json({ success: false, message: 'Company not set on user account' });
    }
    const businessId = new mongoose.Types.ObjectId(String(businessIdRaw));

    const customerIdStr = String(req.body.customerId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(customerIdStr) || customerIdStr.length !== 24) {
      console.log('[CompanyVisit] checkin reject: bad customerId', customerIdStr);
      return res.status(400).json({ success: false, message: 'Valid customerId required' });
    }
    const customerId = new mongoose.Types.ObjectId(customerIdStr);

    const lat = Number(req.body.lat ?? req.body.latitude);
    const lng = Number(req.body.lng ?? req.body.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      console.log('[CompanyVisit] checkin reject: bad lat/lng', lat, lng);
      return res.status(400).json({ success: false, message: 'Valid lat and lng required' });
    }

    const customer = await Customer.findOne({
      _id: customerId,
      $or: [{ businessId }, { companyId: businessId }],
    }).lean();
    if (!customer) {
      console.log(
        '[CompanyVisit] checkin reject: customer not found',
        String(customerId),
        'businessId',
        String(businessId),
      );
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const geo = customer.geoLocation;
    const cLat = geo && Number(geo.lat);
    const cLng = geo && Number(geo.lng);
    if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) {
      console.log('[CompanyVisit] checkin reject: NO_CUSTOMER_GEO', String(customerId));
      return res.status(400).json({
        success: false,
        message: 'Customer has no geo location; set geoLocation on the customer for visit tracking',
        code: 'NO_CUSTOMER_GEO',
      });
    }

    const distM = haversineMeters(lat, lng, cLat, cLng);
    if (distM > MAX_SERVER_CHECKIN_RADIUS_M) {
      console.log(
        '[CompanyVisit] checkin reject: OUT_OF_VISIT_RADIUS',
        Math.round(distM),
        'm >',
        MAX_SERVER_CHECKIN_RADIUS_M,
        'customer',
        String(customerId),
      );
      return res.status(400).json({
        success: false,
        message: `Too far from customer site (${Math.round(distM)}m > ${MAX_SERVER_CHECKIN_RADIUS_M}m)`,
        code: 'OUT_OF_VISIT_RADIUS',
        distanceMeters: Math.round(distM),
      });
    }

    const openSame = await CompanyVisit.findOne({
      userId: user._id,
      customerId,
      status: 'open',
    });
    if (openSame) {
      console.log('[CompanyVisit] idempotent check-in (already open)', String(openSame._id));
      return res.status(200).json({
        success: true,
        message: 'Already checked in for this customer',
        item: openSame.toObject(),
      });
    }

    const now = new Date();
    const tzOffset = readDeviceTimeZoneOffsetMinutes(req.body);
    /** Multiple completed visits per customer per day are allowed after checkout; only an open visit blocks a new check-in (handled above). */

    await closeOpenVisitForOtherCustomer({
      userId: user._id,
      keepCustomerId: customerId,
      lat,
      lng,
      now,
    });

    const companyLabel =
      (customer.companyName && String(customer.companyName).trim()) ||
      (customer.customerName && String(customer.customerName).trim()) ||
      'Customer site';

    let visitSource = 'smart_visit_sync';
    if (req.body && req.body.meta && typeof req.body.meta === 'object' && req.body.meta.source) {
      visitSource = String(req.body.meta.source);
    } else if (req.body && req.body.source) {
      visitSource = String(req.body.source);
    }

    const visit = await CompanyVisit.create({
      userId: user._id,
      businessId,
      customerId,
      companyName: companyLabel,
      customerName: customer.customerName || undefined,
      checkInLatitude: lat,
      checkInLongitude: lng,
      checkInTime: now,
      visitDate: visitDateAnchorForCheckIn(now, tzOffset),
      status: 'open',
      source: visitSource.slice(0, 64),
    });

    console.log(
      '[CompanyVisit] check-in',
      JSON.stringify({
        visitId: String(visit._id),
        userId: String(user._id),
        customerId: String(customerId),
        companyName: companyLabel,
        distM: Math.round(distM),
      }),
    );

    void notifyCompanyVisitCheckIn({
      businessId,
      visit,
      siteLabel: companyLabel,
      actorName: user.name,
    }).catch((err) => {
      console.error('[CompanyVisit] dashboard notify check-in:', err?.message || err);
    });

    return res.status(201).json({
      success: true,
      message: 'Checked in',
      item: visit.toObject(),
    });
  } catch (e) {
    console.error('[CompanyVisit] checkIn error:', e?.message || e);
    return res.status(500).json({ success: false, message: 'Check-in failed', error: e.message });
  }
};

/**
 * POST /api/company-visits/checkout
 * Body: { visitId?, customerId?, lat, lng }
 */
exports.checkOut = async (req, res) => {
  try {
    const user = req.user;
    if (!user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const lat = Number(req.body.lat ?? req.body.latitude);
    const lng = Number(req.body.lng ?? req.body.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ success: false, message: 'Valid lat and lng required' });
    }

    let visit = null;
    const visitIdStr = req.body.visitId != null ? String(req.body.visitId).trim() : '';
    if (visitIdStr && mongoose.Types.ObjectId.isValid(visitIdStr) && visitIdStr.length === 24) {
      visit = await CompanyVisit.findOne({
        _id: new mongoose.Types.ObjectId(visitIdStr),
        userId: user._id,
        status: 'open',
      });
    }
    if (!visit) {
      const cid = String(req.body.customerId || '').trim();
      if (mongoose.Types.ObjectId.isValid(cid) && cid.length === 24) {
        visit = await CompanyVisit.findOne({
          userId: user._id,
          customerId: new mongoose.Types.ObjectId(cid),
          status: 'open',
        }).sort({ checkInTime: -1 });
      }
    }
    if (!visit) {
      return res.status(404).json({ success: false, message: 'No open visit found to check out' });
    }

    const now = new Date();
    visit.checkOutTime = now;
    visit.checkOutLatitude = lat;
    visit.checkOutLongitude = lng;
    visit.durationMinutes = Math.max(
      0,
      Math.round((now.getTime() - visit.checkInTime.getTime()) / 60000),
    );
    visit.status = 'completed';
    await visit.save();

    console.log(
      '[CompanyVisit] check-out',
      JSON.stringify({
        visitId: String(visit._id),
        userId: String(user._id),
        durationMinutes: visit.durationMinutes,
      }),
    );

    void notifyCompanyVisitCheckOut({
      businessId: visit.businessId,
      visit,
      actorName: user.name,
    }).catch((err) => {
      console.error('[CompanyVisit] dashboard notify check-out:', err?.message || err);
    });

    return res.status(200).json({
      success: true,
      message: 'Checked out',
      item: visit.toObject(),
    });
  } catch (e) {
    console.error('[CompanyVisit] checkOut error:', e?.message || e);
    return res.status(500).json({ success: false, message: 'Check-out failed', error: e.message });
  }
};

function siteAddressFromCustomerLean(cust) {
  if (!cust || typeof cust !== 'object') return '';
  const line1 = String(cust.address || '').trim();
  const cityState = [cust.city, cust.state].filter(Boolean).join(', ').trim();
  const tail = [cust.pincode, cust.country].filter(Boolean).join(' ').trim();
  return [line1, cityState, tail].filter(Boolean).join(', ');
}

/** Flatten populated customerId and attach formatted site address for clients. */
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
 * GET /api/company-visits
 * Query: date=YYYY-MM-DD, status=open|completed (optional),
 * filterTimeZoneOffsetMinutes (optional; same sign as Dart offset — when set, `date` filters `checkInTime` by civil day)
 */
exports.listMine = async (req, res) => {
  try {
    const user = req.user;
    if (!user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const q = { userId: user._id };
    const st = String(req.query.status || '').toLowerCase();
    if (st === 'open' || st === 'completed') {
      q.status = st;
    }
    const customerIdStr = String(req.query.customerId || '').trim();
    if (customerIdStr && mongoose.Types.ObjectId.isValid(customerIdStr) && customerIdStr.length === 24) {
      q.customerId = new mongoose.Types.ObjectId(customerIdStr);
    }
    const tzOff = readFilterTzOffsetFromQuery(req.query);
    const dayStr = req.query.date != null ? String(req.query.date).trim() : '';
    const fromStr = req.query.dateFrom != null ? String(req.query.dateFrom).trim() : '';
    const toStr = req.query.dateTo != null ? String(req.query.dateTo).trim() : '';
    if (dayStr.length > 0) {
      if (tzOff != null) {
        const b = checkInTimeBoundsForCivilYmd(dayStr, tzOff);
        if (b) q.checkInTime = b;
      } else {
        const bounds = utcCalendarDayBoundsFromYmd(dayStr);
        if (bounds) q.visitDate = bounds;
      }
    } else if (fromStr || toStr) {
      if (tzOff != null) {
        const range = {};
        if (fromStr) {
          const b = checkInTimeBoundsForCivilYmd(fromStr, tzOff);
          if (b) range.$gte = b.$gte;
        }
        if (toStr) {
          const b = checkInTimeBoundsForCivilYmd(toStr, tzOff);
          if (b) range.$lte = b.$lte;
        }
        if (Object.keys(range).length) q.checkInTime = range;
      } else {
        const range = {};
        if (fromStr) {
          const b = utcCalendarDayBoundsFromYmd(fromStr);
          if (b) range.$gte = b.$gte;
        }
        if (toStr) {
          const b = utcCalendarDayBoundsFromYmd(toStr);
          if (b) range.$lte = b.$lte;
        }
        if (Object.keys(range).length) q.visitDate = range;
      }
    }
    const raw = await CompanyVisit.find(q)
      .sort({ checkInTime: -1 })
      .populate({
        path: 'customerId',
        select: 'address city pincode state country companyName customerName',
      })
      .lean();
    const visits = raw.map(shapeVisitDocForClient);
    return res.json({ success: true, data: visits });
  } catch (e) {
    console.error('[CompanyVisit] listMine error:', e?.message || e);
    return res.status(500).json({
      success: false,
      message: 'Failed to list visits',
      error: e.message,
    });
  }
};

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDayBounds(dayStr) {
  return utcCalendarDayBoundsFromYmd(dayStr);
}

/**
 * GET /api/ops/company-visits
 * Web dashboard: all visits for the signed-in user's company (businessId on visit).
 * Query: page, limit, search, userId, customerId, status (open|completed), date, dateFrom, dateTo
 */
exports.listCompanyVisitsForOps = async (req, res) => {
  try {
    const user = req.user;
    if (!user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const businessIdRaw = resolveBusinessIdFromUser(user);
    if (!businessIdRaw) {
      return res.status(200).json({
        success: true,
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });
    }
    const businessId = new mongoose.Types.ObjectId(String(businessIdRaw));

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    let limit = parseInt(String(req.query.limit || '20'), 10) || 20;
    if (limit < 1) limit = 20;
    if (limit > 100) limit = 100;
    const skip = (page - 1) * limit;

    const filter = { businessId };

    const mineRaw = String(req.query.mine ?? '').toLowerCase();
    const mineOnly = mineRaw === '1' || mineRaw === 'true' || mineRaw === 'yes';
    if (mineOnly) {
      filter.userId = user._id;
    } else {
      const userIdStr = String(req.query.userId || '').trim();
      if (userIdStr && mongoose.Types.ObjectId.isValid(userIdStr) && userIdStr.length === 24) {
        const uid = new mongoose.Types.ObjectId(userIdStr);
        const staff = await User.findOne({ _id: uid, companyId: businessId }).select('_id').lean();
        if (staff) {
          filter.userId = uid;
        }
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

    const tzOff = readFilterTzOffsetFromQuery(req.query);
    const singleDay = req.query.date != null ? String(req.query.date).trim() : '';
    if (singleDay) {
      if (tzOff != null) {
        const b = checkInTimeBoundsForCivilYmd(singleDay, tzOff);
        if (b) filter.checkInTime = b;
      } else {
        const bounds = parseDayBounds(singleDay);
        if (bounds) filter.visitDate = bounds;
      }
    } else {
      const fromStr = req.query.dateFrom != null ? String(req.query.dateFrom).trim() : '';
      const toStr = req.query.dateTo != null ? String(req.query.dateTo).trim() : '';
      if (fromStr || toStr) {
        if (tzOff != null) {
          const range = {};
          if (fromStr) {
            const b = checkInTimeBoundsForCivilYmd(fromStr, tzOff);
            if (b) range.$gte = b.$gte;
          }
          if (toStr) {
            const b = checkInTimeBoundsForCivilYmd(toStr, tzOff);
            if (b) range.$lte = b.$lte;
          }
          if (Object.keys(range).length) filter.checkInTime = range;
        } else {
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
    console.error('[CompanyVisit] listCompanyVisitsForOps error:', e?.message || e);
    return res.status(500).json({
      success: false,
      message: 'Failed to list company visits',
      error: e.message,
    });
  }
};
