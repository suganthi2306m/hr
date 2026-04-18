const mongoose = require('mongoose');
const Task = require('../models/Task');
const User = require('../models/User');
const Company = require('../models/Company');
const Customer = require('../models/Customer');
const Location = require('../models/Location');
const {
  TASK_TYPES,
  TASK_PRIORITIES,
  normalizeStatus,
  applyStatusTimestamps,
} = require('../constants/taskLifecycle');
const { createInternalNotification } = require('./notificationController');
const { logActivity } = require('../services/activityLogService');

function generateTaskCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand = () => chars[Math.floor(Math.random() * chars.length)];
  return `TASK-${Array(8).fill(0).map(() => rand()).join('')}`;
}

function randomOtp() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function getCompanyIdForAdmin(adminId) {
  const company = await Company.findOne({ adminId }).select('_id');
  return company?._id || null;
}

function toTaskDto(taskDoc) {
  const task = taskDoc?.toObject ? taskDoc.toObject() : taskDoc;
  const st = normalizeStatus(task.status);
  const due = task.completionDate ? new Date(task.completionDate).getTime() : null;
  const delayed = due && due < Date.now() && !['completed', 'verified'].includes(st);
  return {
    _id: task._id,
    taskCode: task.taskCode || null,
    title: task.taskName || task.taskTitle || task.title || '',
    taskName: task.taskName || task.taskTitle || task.title || '',
    description: task.description || '',
    taskType: task.taskType || 'visit',
    priority: task.priority || 'medium',
    branchId: task.branchId || '',
    assignedUser: task.assignedTo
      ? {
          _id: task.assignedTo._id || task.assignedTo,
          name: task.assignedTo.name || 'Unknown',
          email: task.assignedTo.email || '',
        }
      : null,
    location:
      task.locations?.destination?.address ||
      task.locations?.destination?.fullAddress ||
      task.location ||
      '',
    destinationLocation: task.locations?.destination || null,
    sourceLocation: task.locations?.source || null,
    arrivalLocation: task.locations?.arrival || null,
    status: task.status || 'assigned',
    statusNormalized: st,
    completionDate: task.completionDate || null,
    delayed: Boolean(delayed),
    customerId: task.customerId ? String(task.customerId) : '',
    geofence: task.geofence || null,
    statusTimestamps: task.statusTimestamps || {},
    otp: task.otp || null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function buildTaskFullDetails(taskDoc) {
  const task = taskDoc?.toObject ? taskDoc.toObject() : taskDoc;
  return {
    _id: task._id,
    taskCode: task.taskCode || null,
    taskName: task.taskName || task.taskTitle || task.title || '',
    description: task.description || '',
    taskType: task.taskType || 'visit',
    priority: task.priority || 'medium',
    status: task.status || 'assigned',
    assignedTo: task.assignedTo
      ? {
          _id: task.assignedTo._id || task.assignedTo,
          name: task.assignedTo.name || 'Unknown',
          email: task.assignedTo.email || '',
        }
      : null,
    assignedBy: task.assignedBy || null,
    customerId: task.customerId || null,
    companyId: task.companyId || task.businessId || null,
    assignedDate: task.assignedDate || null,
    completionDate: task.completionDate || task.expectedCompletionDate || null,
    completedAt: task.completedAt || task.completedDate || null,
    locations: task.locations || {},
    destinations: task.destinations || [],
    changedLocationHistory: task.destinations || [],
    arrivalLocation: task.locations?.arrival || task.arrivalLocation || null,
    travel: task.travel || {
      distanceKm: task.tripDistanceKm || null,
      durationSeconds: task.tripDurationSeconds || null,
      activityDuration: task.travelActivityDuration || null,
    },
    photoDetails: task.photoDetails || {
      url: task.photoProofUrl || null,
      uploadedAt: task.photoProofUploadedAt || null,
      description: task.photoProofDescription || null,
      lat: task.photoProofLat || null,
      lng: task.photoProofLng || null,
      address: task.photoProofAddress || null,
    },
    signatureDataUrl: task.signatureDataUrl || '',
    proofAttachments: task.proofAttachments || [],
    otp: task.otp || {
      code: task.otpCode || null,
      sentAt: task.otpSentAt || null,
      verifiedAt: task.otpVerifiedAt || null,
      location: {
        lat: task.otpVerifiedLat || null,
        lng: task.otpVerifiedLng || null,
        address: task.otpVerifiedAddress || null,
      },
    },
    progress: task.progress || task.progressSteps || {},
    exitHistory: task.exitHistory || task.exit || task.tasks_exit || [],
    resumedHistory: task.resumedHistory || task.restarted || task.tasks_restarted || [],
    approval: task.approval || {
      approvedAt: task.approvedAt || null,
      approvedBy: task.approvedBy || null,
      rejectedAt: task.rejectedAt || null,
      rejectedBy: task.rejectedBy || null,
    },
    geofence: task.geofence || null,
    statusTimestamps: task.statusTimestamps || {},
    plannedRoute: task.plannedRoute || [],
    source: task.source || null,
    createdAt: task.createdAt || null,
    updatedAt: task.updatedAt || null,
  };
}

async function listFieldTasks(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) {
      return res.status(400).json({ message: 'Complete company setup to manage tasks.' });
    }

    const companyUsers = await User.find({ companyId }).select('_id').lean();
    const companyUserIds = companyUsers.map((u) => u._id);
    const filter = {
      $or: [
        { companyId },
        ...(companyUserIds.length ? [{ assignedTo: { $in: companyUserIds } }] : []),
      ],
    };

    const items = await Task.find(filter)
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 });

    return res.json({ items: items.map(toTaskDto) });
  } catch (error) {
    return next(error);
  }
}

async function createFieldTask(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) {
      return res.status(400).json({ message: 'Complete company setup to manage tasks.' });
    }

    const assignedTo = req.body.assignedTo || req.body.assignedUser;
    if (!assignedTo || !mongoose.Types.ObjectId.isValid(String(assignedTo))) {
      return res.status(400).json({ message: 'assigned user is required' });
    }

    const assignedUser = await User.findOne({ _id: assignedTo, companyId }).select('_id').lean();
    if (!assignedUser) {
      return res.status(400).json({ message: 'Selected user is not part of your company.' });
    }

    const destinationLocation =
      req.body.destinationLocation || req.body.locations?.destination || null;
    if (!destinationLocation || destinationLocation.lat == null || destinationLocation.lng == null) {
      return res.status(400).json({ message: 'Pin destination location is required.' });
    }
    const sourceLocation = req.body.sourceLocation || req.body.locations?.source || null;

    let resolvedCustomerId;
    if (req.body.customerId && mongoose.Types.ObjectId.isValid(String(req.body.customerId))) {
      const cust = await Customer.findOne({ _id: req.body.customerId, companyId }).select('_id').lean();
      if (cust) resolvedCustomerId = cust._id;
    }

    const taskType = TASK_TYPES.includes(req.body.taskType) ? req.body.taskType : 'visit';
    const priority = TASK_PRIORITIES.includes(req.body.priority) ? req.body.priority : 'medium';
    const branchId = req.body.branchId != null ? String(req.body.branchId).trim() : '';
    const geofence =
      req.body.geofence &&
      req.body.geofence.lat != null &&
      req.body.geofence.lng != null &&
      req.body.geofence.radiusM != null
        ? {
            name: String(req.body.geofence.name || 'Task zone').trim(),
            lat: Number(req.body.geofence.lat),
            lng: Number(req.body.geofence.lng),
            radiusM: Number(req.body.geofence.radiusM),
          }
        : undefined;

    let otpPayload;
    if (req.body.generateOtp || req.body.otpRequired) {
      const code = randomOtp();
      otpPayload = { code, sentAt: new Date(), verifiedAt: null };
    }

    const item = await Task.create({
      taskCode: req.body.taskCode || generateTaskCode(),
      taskName: req.body.taskName || req.body.title || 'Untitled Task',
      description: req.body.description || '',
      taskType,
      priority,
      branchId,
      status: normalizeStatus(req.body.status || 'assigned'),
      assignedTo: assignedUser._id,
      assignedBy: req.admin._id,
      companyId,
      ...(resolvedCustomerId ? { customerId: resolvedCustomerId } : {}),
      completionDate: req.body.completionDate ? new Date(req.body.completionDate) : undefined,
      locations: {
        ...(sourceLocation ? { source: sourceLocation } : {}),
        ...(destinationLocation ? { destination: destinationLocation } : {}),
      },
      statusTimestamps: applyStatusTimestamps({}, req.body.status || 'assigned'),
      ...(geofence ? { geofence } : {}),
      ...(otpPayload ? { otp: otpPayload } : {}),
      source: 'web',
    });

    const populated = await Task.findById(item._id).populate('assignedTo', 'name email');
    await createInternalNotification({
      companyId,
      adminId: req.admin._id,
      type: 'task',
      title: 'Task assigned',
      body: `${populated.taskName} → ${populated.assignedTo?.name || 'agent'}`,
      meta: { taskId: String(populated._id) },
    });
    await logActivity({
      companyId,
      adminId: req.admin._id,
      action: 'task.create',
      entity: 'Task',
      entityId: populated._id,
      details: { taskCode: populated.taskCode },
      ip: req.ip,
    });
    return res.status(201).json({ item: toTaskDto(populated) });
  } catch (error) {
    return next(error);
  }
}

async function innerCreateTaskRow(companyId, adminId, body) {
  const assignedTo = body.assignedTo || body.assignedUser;
  if (!assignedTo || !mongoose.Types.ObjectId.isValid(String(assignedTo))) {
    throw new Error('assigned user is required');
  }
  const assignedUser = await User.findOne({ _id: assignedTo, companyId }).select('_id').lean();
  if (!assignedUser) {
    throw new Error('User not in company');
  }
  const destinationLocation = body.destinationLocation || body.locations?.destination || null;
  if (!destinationLocation || destinationLocation.lat == null || destinationLocation.lng == null) {
    throw new Error('destination required');
  }
  const sourceLocation = body.sourceLocation || body.locations?.source || null;
  let resolvedCustomerId;
  if (body.customerId && mongoose.Types.ObjectId.isValid(String(body.customerId))) {
    const cust = await Customer.findOne({ _id: body.customerId, companyId }).select('_id').lean();
    if (cust) resolvedCustomerId = cust._id;
  }
  const taskType = TASK_TYPES.includes(body.taskType) ? body.taskType : 'visit';
  const priority = TASK_PRIORITIES.includes(body.priority) ? body.priority : 'medium';
  const item = await Task.create({
    taskCode: body.taskCode || generateTaskCode(),
    taskName: body.taskName || body.title || 'Untitled Task',
    description: body.description || '',
    taskType,
    priority,
    status: normalizeStatus(body.status || 'assigned'),
    assignedTo: assignedUser._id,
    assignedBy: adminId,
    companyId,
    ...(resolvedCustomerId ? { customerId: resolvedCustomerId } : {}),
    completionDate: body.completionDate ? new Date(body.completionDate) : undefined,
    locations: {
      ...(sourceLocation ? { source: sourceLocation } : {}),
      destination: destinationLocation,
    },
    statusTimestamps: applyStatusTimestamps({}, body.status || 'assigned'),
    source: 'web',
  });
  return Task.findById(item._id).populate('assignedTo', 'name email');
}

async function bulkCreateFieldTasks(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) {
      return res.status(400).json({ message: 'Complete company setup to manage tasks.' });
    }
    const rows = Array.isArray(req.body.tasks) ? req.body.tasks : [];
    if (!rows.length) {
      return res.status(400).json({ message: 'Provide tasks[] array.' });
    }
    const items = [];
    const errors = [];
    for (let i = 0; i < rows.length; i += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const populated = await innerCreateTaskRow(companyId, req.admin._id, rows[i]);
        items.push(toTaskDto(populated));
      } catch (err) {
        errors.push({ index: i, message: err.message || 'failed' });
      }
    }
    await logActivity({
      companyId,
      adminId: req.admin._id,
      action: 'task.bulk',
      entity: 'Task',
      details: { count: items.length, errors: errors.length },
      ip: req.ip,
    });
    return res.status(201).json({ items, errors });
  } catch (e) {
    return next(e);
  }
}

async function verifyTaskOtp(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) {
      return res.status(400).json({ message: 'Complete company setup to manage tasks.' });
    }
    const task = await Task.findOne({
      _id: req.params.id,
      $or: [{ companyId }, { companyId: { $exists: false } }],
    });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    const expected = task.otp?.code || task.otpCode;
    if (!expected) return res.status(400).json({ message: 'No OTP on this task.' });
    if (String(req.body.code || '').trim() !== String(expected)) {
      return res.status(400).json({ message: 'Invalid OTP.' });
    }
    const otp = { ...(task.otp || {}), code: expected, verifiedAt: new Date() };
    await Task.updateOne(
      { _id: task._id },
      { $set: { otp, otpVerifiedAt: new Date() } },
    );
    await logActivity({
      companyId,
      adminId: req.admin._id,
      action: 'task.otp_verified',
      entity: 'Task',
      entityId: task._id,
      ip: req.ip,
    });
    const fresh = await Task.findById(task._id).populate('assignedTo', 'name email');
    return res.json({ item: toTaskDto(fresh) });
  } catch (e) {
    return next(e);
  }
}

async function updateFieldTask(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) {
      return res.status(400).json({ message: 'Complete company setup to manage tasks.' });
    }

    const existing = await Task.findOne({
      _id: req.params.id,
      $or: [{ companyId }, { companyId: { $exists: false } }],
    });
    if (!existing) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const payload = {};
    if (req.body.taskName || req.body.title) payload.taskName = req.body.taskName || req.body.title;
    if (req.body.description != null) payload.description = req.body.description;
    if (req.body.taskType && TASK_TYPES.includes(req.body.taskType)) payload.taskType = req.body.taskType;
    if (req.body.priority && TASK_PRIORITIES.includes(req.body.priority)) payload.priority = req.body.priority;
    if (req.body.branchId != null) payload.branchId = String(req.body.branchId).trim();

    if (req.body.status != null) {
      const nextSt = normalizeStatus(req.body.status);
      payload.status = nextSt;
      payload.statusTimestamps = applyStatusTimestamps(existing, nextSt);
    }
    if (req.body.completionDate) payload.completionDate = new Date(req.body.completionDate);

    if (req.body.photoDetails != null) payload.photoDetails = req.body.photoDetails;
    if (req.body.signatureDataUrl != null) payload.signatureDataUrl = String(req.body.signatureDataUrl).slice(0, 400000);
    if (Array.isArray(req.body.proofAttachments)) {
      payload.proofAttachments = req.body.proofAttachments
        .filter((a) => a && String(a.url || '').trim())
        .map((a) => ({
          name: String(a.name || 'file'),
          url: String(a.url).trim(),
          uploadedAt: new Date(),
        }))
        .slice(0, 20);
    }
    if (req.body.plannedRoute) payload.plannedRoute = req.body.plannedRoute;

    const assignedTo = req.body.assignedTo || req.body.assignedUser;
    if (assignedTo && mongoose.Types.ObjectId.isValid(String(assignedTo))) {
      const assignedUser = await User.findOne({ _id: assignedTo, companyId }).select('_id').lean();
      if (!assignedUser) {
        return res.status(400).json({ message: 'Selected user is not part of your company.' });
      }
      payload.assignedTo = assignedUser._id;
    }

    const destinationLocation =
      req.body.destinationLocation || req.body.locations?.destination;
    const sourceLocation = req.body.sourceLocation || req.body.locations?.source;
    if (destinationLocation || sourceLocation) {
      payload.locations = {
        ...(existing.locations || {}),
        ...(sourceLocation ? { source: sourceLocation } : {}),
        ...(destinationLocation ? { destination: destinationLocation } : {}),
      };
    }

    if (req.body.geofence && req.body.geofence.lat != null) {
      payload.geofence = {
        name: String(req.body.geofence.name || 'Task zone'),
        lat: Number(req.body.geofence.lat),
        lng: Number(req.body.geofence.lng),
        radiusM: Number(req.body.geofence.radiusM),
      };
    }

    if (req.body.customerId !== undefined) {
      const raw = req.body.customerId;
      if (!raw || !String(raw).trim()) {
        payload.customerId = null;
      } else if (mongoose.Types.ObjectId.isValid(String(raw))) {
        const cust = await Customer.findOne({ _id: raw, companyId }).select('_id').lean();
        if (cust) payload.customerId = cust._id;
      }
    }

    if (req.body.generateOtp) {
      payload.otp = { code: randomOtp(), sentAt: new Date(), verifiedAt: null };
    }

    const item = await Task.findByIdAndUpdate(existing._id, payload, { new: true })
      .populate('assignedTo', 'name email');
    await logActivity({
      companyId,
      adminId: req.admin._id,
      action: 'task.update',
      entity: 'Task',
      entityId: item._id,
      details: { status: item.status },
      ip: req.ip,
    });
    return res.json({ item: toTaskDto(item) });
  } catch (error) {
    return next(error);
  }
}

async function deleteFieldTask(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) {
      return res.status(400).json({ message: 'Complete company setup to manage tasks.' });
    }
    await Task.findOneAndDelete({
      _id: req.params.id,
      $or: [{ companyId }, { companyId: { $exists: false } }],
    });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

async function getFieldTaskDetails(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) {
      return res.status(400).json({ message: 'Complete company setup to view task details.' });
    }

    const task = await Task.findOne({
      _id: req.params.id,
      $or: [{ companyId }, { companyId: { $exists: false } }],
    }).populate('assignedTo', 'name email');
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const taskIdCandidates = [task._id, String(task._id), task.taskCode].filter(Boolean);

    const pathRaw = await Location.find({ taskId: { $in: taskIdCandidates } })
      .sort({ timestamp: 1, createdAt: 1 })
      .lean();

    const locations = pathRaw.map((p) => ({
      _id: p._id,
      taskId: p.taskId || null,
      usersId: p.usersId || p.userId || p.staffId || null,
      latitude: p.latitude != null ? Number(p.latitude) : null,
      longitude: p.longitude != null ? Number(p.longitude) : null,
      timestamp: p.timestamp || p.time || p.createdAt || null,
      movementType: p.movementType || null,
      status: p.status || null,
      exitStatus: p.exitStatus || null,
      exitReason: p.exitReason || null,
      batteryPercent: p.batteryPercent ?? null,
      address: p.address || p.fullAddress || null,
      pincode: p.pincode || null,
      city: p.city || null,
      area: p.area || null,
    }));

    const path = locations
      .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
      .map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        timestamp: p.timestamp,
        status: p.status,
        movementType: p.movementType,
        address: p.address,
      }));

    return res.json({
      item: toTaskDto(task),
      taskDetails: buildTaskFullDetails(task),
      locations,
      path,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listFieldTasks,
  createFieldTask,
  bulkCreateFieldTasks,
  verifyTaskOtp,
  updateFieldTask,
  deleteFieldTask,
  getFieldTaskDetails,
};
