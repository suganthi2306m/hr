const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const cloudinaryAtt = require('../services/cloudinaryAttendanceUpload');

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function normalizeStoredAddress(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  return s.length > 500 ? s.slice(0, 500) : s;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** After checkout: full / half day thresholds; shorter app punches stay PENDING (not ABSENT). */
function statusFromDuration(minutes) {
  if (minutes >= 8 * 60) return 'PRESENT';
  if (minutes >= 4 * 60) return 'HALF_DAY';
  return 'PENDING';
}

/** Open session: no mobile checkout and no web checkout. */
function noOpenCheckoutClause() {
  return {
    $and: [
      {
        $or: [
          { checkOutTime: null },
          { checkOutTime: { $exists: false } },
          { checkOutTime: '' },
        ],
      },
      {
        $or: [
          { checkOutAt: null },
          { checkOutAt: { $exists: false } },
          { checkOutAt: '' },
        ],
      },
    ],
  };
}

/** Resolve punch-in instant for duration (mobile checkInTime, web checkInAt, legacy punchIn). */
function resolveCheckInDate(att) {
  if (!att || typeof att !== 'object') return null;
  const raw = att.checkInTime ?? att.checkInAt ?? att.punchIn;
  if (raw == null || raw === '') return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  const t = d.getTime();
  return Number.isFinite(t) && t > 0 ? d : null;
}

/** Cloudinary `https://...` only — attendance selfies are not stored on disk long-term. */
function attendanceStorageError(message, code, httpStatus = 503) {
  const e = new Error(message);
  e.attendanceCode = code;
  e.attendanceHttpStatus = httpStatus;
  return e;
}

async function resolveAttendanceSelfieUrl(file, user, label) {
  if (!cloudinaryAtt.isConfigured()) {
    throw attendanceStorageError(
      'Attendance image storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET on the server.',
      'CLOUDINARY_NOT_CONFIGURED',
      503,
    );
  }
  // Use company id for folder naming — avoids an extra Mongo round-trip before upload.
  const companyName = user.companyId ? String(user.companyId) : 'unknown_company';
  const userName = user.name || user.email || 'user';
  try {
    const url = await cloudinaryAtt.uploadAttendanceSelfie(file.path, {
      companyName,
      userName,
      label,
    });
    cloudinaryAtt.safeUnlink(file.path);
    return url;
  } catch (e) {
    console.error('[attendance] Cloudinary upload failed:', e.message);
    throw attendanceStorageError(
      e.message || 'Could not upload attendance image to Cloudinary. Try again.',
      'CLOUDINARY_UPLOAD_FAILED',
      503,
    );
  }
}

exports.checkIn = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Selfie image is required' });
    }
    const user = req.user;
    if (!user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const now = new Date();
    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);

    const [approvedLeave, existingOpen, todayRecord] = await Promise.all([
      LeaveRequest.findOne({
        userId: user._id,
        status: 'APPROVED',
        fromDate: { $lte: endOfDay(now) },
        toDate: { $gte: startOfDay(now) },
      })
        .select('_id')
        .lean(),
      Attendance.findOne({
        userId: user._id,
        companyId: user.companyId,
        ...noOpenCheckoutClause(),
      })
        .sort({ checkInTime: -1, checkInAt: -1, punchIn: -1 })
        .lean(),
      Attendance.findOne({
        userId: user._id,
        companyId: user.companyId,
        attendanceDate: { $gte: dayStart, $lte: dayEnd },
      })
        .sort({ checkInTime: -1, checkInAt: -1, punchIn: -1 })
        .lean(),
    ]);

    if (approvedLeave) {
      return res.status(400).json({
        success: false,
        message: 'Cannot check in: approved leave exists for today',
        code: 'APPROVED_LEAVE',
      });
    }
    if (existingOpen) {
      return res.status(400).json({
        success: false,
        message: 'Already checked in. Please check out first.',
      });
    }
    if (todayRecord && (todayRecord.checkInTime || todayRecord.checkInAt)) {
      return res.status(400).json({
        success: false,
        message: 'Attendance is already marked for today.',
        code: 'ALREADY_MARKED_TODAY',
      });
    }

    const lat = Number(req.body.lat ?? req.body.latitude);
    const lng = Number(req.body.lng ?? req.body.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ success: false, message: 'Valid location (lat,lng) required' });
    }

    const accuracy = Number(req.body.accuracy);
    const isMocked = String(req.body.isMocked || '').toLowerCase() === 'true';
    if (isMocked) {
      return res.status(400).json({
        success: false,
        message: 'Mock location detected. Check-in blocked.',
        code: 'MOCK_LOCATION',
      });
    }

    const office = user.officeLocation || {};
    const officeLat = Number(office.latitude);
    const officeLng = Number(office.longitude);
    // If office location is not configured, allow check-in using live lat/lng only.
    if (Number.isFinite(officeLat) && Number.isFinite(officeLng)) {
      const parsedRadius = Number(office.radius);
      const radius = Number.isFinite(parsedRadius) && parsedRadius > 0 ? parsedRadius : 100;
      const dist = haversineMeters(lat, lng, officeLat, officeLng);
      if (dist > radius) {
        return res.status(400).json({
          success: false,
          message: `You are outside allowed radius (${Math.round(dist)}m > ${radius}m)`,
          code: 'OUT_OF_RADIUS',
        });
      }
    }

    const checkInTime = now;
    const checkInSource =
      String(req.body?.source || req.body?.checkInSource || req.body?.metaSource || '')
        .trim()
        .toLowerCase() || 'manual';
    const checkInImageUrl = await resolveAttendanceSelfieUrl(req.file, user, 'checkin');
    const addressIn = normalizeStoredAddress(req.body.address);
    const attendance = await Attendance.create({
      userId: user._id,
      companyId: user.companyId,
      attendanceDate: startOfDay(checkInTime),
      checkInTime,
      checkInImageUrl,
      checkInLocation: {
        lat,
        lng,
        address: addressIn,
        accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
        isMocked,
      },
      status: 'PENDING',
    });

    const companyLabel = user.companyName || user.company?.name || String(user.companyId || 'unknown_company');
    const webNotificationPayload = {
      type: 'attendance_checked_in',
      title: 'User checked in',
      message: `${user.name || 'User'} checked in at ${companyLabel}`,
      companyName: companyLabel,
      companyId: user.companyId ? String(user.companyId) : null,
      userId: String(user._id),
      userName: user.name || user.email || String(user._id),
      source: checkInSource,
      checkedInAt: checkInTime.toISOString(),
      attendanceId: String(attendance._id),
    };
    console.log('[Attendance] check-in event:', JSON.stringify(webNotificationPayload));
    const io = req.app.get('io');
    if (io) {
      io.to('admin:attendance').emit('attendance:checked-in', webNotificationPayload);
      io.to('admin:notifications').emit('notification:new', webNotificationPayload);
      if (user.companyId) {
        io.to(`admin:company:${String(user.companyId)}`).emit('attendance:checked-in', webNotificationPayload);
      }
    } else {
      console.log('[Attendance] socket io not attached; check-in event emitted to logs only');
    }

    return res.status(201).json({
      success: true,
      message: 'Checked in successfully',
      attendance,
      info: {
        checkedInAt: checkInTime,
        locationVerified: true,
      },
    });
  } catch (error) {
    if (error.attendanceHttpStatus) {
      return res.status(error.attendanceHttpStatus).json({
        success: false,
        message: error.message,
        code: error.attendanceCode,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Check-in failed',
      error: error.message,
    });
  }
};

exports.checkOut = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Selfie image is required' });
    }
    const user = req.user;
    if (!user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const lat = Number(req.body.lat ?? req.body.latitude);
    const lng = Number(req.body.lng ?? req.body.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ success: false, message: 'Valid location (lat,lng) required' });
    }

    const isMocked = String(req.body.isMocked || '').toLowerCase() === 'true';
    if (isMocked) {
      return res.status(400).json({
        success: false,
        message: 'Mock location detected. Checkout blocked.',
        code: 'MOCK_LOCATION',
      });
    }

    const attendance = await Attendance.findOne({
      userId: user._id,
      companyId: user.companyId,
      ...noOpenCheckoutClause(),
    })
      .sort({ checkInTime: -1, checkInAt: -1, punchIn: -1 })
      .lean();
    if (!attendance) {
      return res.status(400).json({
        success: false,
        message: 'No active check-in found for checkout',
      });
    }

    const checkInDate = resolveCheckInDate(attendance);
    if (!checkInDate) {
      return res.status(400).json({
        success: false,
        message: 'Attendance record has no check-in time; cannot check out.',
      });
    }

    const checkOutTime = new Date();
    const durationMinutes = Math.max(
      0,
      Math.round((checkOutTime.getTime() - checkInDate.getTime()) / 60000),
    );

    const checkOutImageUrl = await resolveAttendanceSelfieUrl(req.file, user, 'checkout');
    const addressOut = normalizeStoredAddress(req.body.address);
    const attendanceDate =
      attendance.attendanceDate != null
        ? attendance.attendanceDate
        : startOfDay(checkInDate);
    const status = statusFromDuration(durationMinutes);

    const update = {
      checkOutTime,
      checkOutAt: checkOutTime,
      checkOutImageUrl,
      checkOutLocation: {
        lat,
        lng,
        address: addressOut,
        accuracy: Number.isFinite(Number(req.body.accuracy))
          ? Number(req.body.accuracy)
          : undefined,
        isMocked: false,
      },
      attendanceDate,
      duration: durationMinutes,
      status,
    };

    const saved = await Attendance.findByIdAndUpdate(
      attendance._id,
      { $set: update },
      { new: true, runValidators: false },
    ).lean();

    return res.json({
      success: true,
      message: 'Checked out successfully',
      attendance: saved,
    });
  } catch (error) {
    if (error.attendanceHttpStatus) {
      return res.status(error.attendanceHttpStatus).json({
        success: false,
        message: error.message,
        code: error.attendanceCode,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Check-out failed',
      error: error.message,
    });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const user = req.user;
    if (!user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
    const page = Math.max(1, Number(req.query.page) || 1);
    const skip = (page - 1) * limit;
    const isAdmin =
      String(user?.role || '').toLowerCase() === 'admin' ||
      String(user?.role || '').toLowerCase() === 'superadmin';
    const query = isAdmin && String(req.query.all || '').toLowerCase() === 'true'
      ? {}
      : { userId: user._id };
    if (isAdmin && req.query.userId) {
      query.userId = req.query.userId;
    }

    if (req.query.from || req.query.to) {
      query.checkInTime = {};
      if (req.query.from) query.checkInTime.$gte = new Date(req.query.from);
      if (req.query.to) query.checkInTime.$lte = new Date(req.query.to);
    }

    const [items, total] = await Promise.all([
      Attendance.find(query).sort({ checkInTime: -1 }).skip(skip).limit(limit).lean(),
      Attendance.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance history',
      error: error.message,
    });
  }
};
