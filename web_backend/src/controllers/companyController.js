const mongoose = require('mongoose');
const Company = require('../models/Company');
const Admin = require('../models/Admin');
const User = require('../models/User');
const GeoFence = require('../models/GeoFence');
const { assertCompanyEmailPhoneUnique } = require('../utils/contactUniqueness');

const MAX_BRANCHES = 3;
const DEFAULT_ID_GENERATION = {
  employee: { enabled: false, prefix: 'EMP', startNumber: 1, nextNumber: 1, padLength: 4 },
  branch: { enabled: false, prefix: 'BR', startNumber: 1, nextNumber: 1, padLength: 0 },
};

async function syncAttendanceGeofences(companyId, branches) {
  const list = Array.isArray(branches) ? branches : [];
  const branchObjectIds = list.map((b) => b._id).filter(Boolean);
  if (branchObjectIds.length) {
    await GeoFence.deleteMany({
      companyId,
      branchId: { $nin: branchObjectIds },
    });
  } else {
    await GeoFence.deleteMany({ companyId });
  }
  for (const b of list) {
    if (!b._id) continue;
    const bid = b._id;
    const g = b.geofence && typeof b.geofence === 'object' ? b.geofence : {};
    const lat = g.lat != null ? Number(g.lat) : NaN;
    const lng = g.lng != null ? Number(g.lng) : NaN;
    const enabled = g.enabled !== false && Number.isFinite(lat) && Number.isFinite(lng);
    await GeoFence.deleteMany({ companyId, branchId: bid });
    if (!enabled) continue;
    const radiusM = Math.max(10, Math.round(Number(g.radiusM) || 150));
    const name = `${String(b.name || 'Branch').trim()} — Attendance`;
    await GeoFence.create({
      companyId,
      branchId: bid,
      name,
      lat,
      lng,
      radiusM,
      alertOnEntry: true,
      alertOnExit: true,
      isActive: true,
    });
  }
}

function geoNum(v) {
  if (v == null || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** If the client omits lat/lng on an existing branch, keep stored coordinates (avoids wiping pins on partial payloads). */
function mergeGeofenceCoordsFromExisting(gf, existingBranch) {
  let lat = geoNum(gf.lat);
  let lng = geoNum(gf.lng);
  const prevG = existingBranch?.geofence && typeof existingBranch.geofence === 'object' ? existingBranch.geofence : {};
  if (!Number.isFinite(lat)) lat = geoNum(prevG.lat);
  if (!Number.isFinite(lng)) lng = geoNum(prevG.lng);
  return { lat, lng };
}

function normalizeBranchesInput(items, existingBranches = [], maxBranchCap = MAX_BRANCHES) {
  const cap = Math.max(1, Math.min(500, Math.floor(Number(maxBranchCap) || MAX_BRANCHES)));
  const existingById = new Map(
    (Array.isArray(existingBranches) ? existingBranches : [])
      .filter((br) => br && br._id)
      .map((br) => [String(br._id), br]),
  );

  const raw = (Array.isArray(items) ? items : [])
    .filter((b) => b && String(b.name || '').trim())
    .slice(0, cap);

  for (const b of raw) {
    if (!String(b.code || '').trim()) {
      const err = new Error('Each branch must have a branch code.');
      err.status = 400;
      throw err;
    }
    const gf = b.geofence && typeof b.geofence === 'object' ? b.geofence : {};
    const enabled = gf.enabled !== false;
    const prev = b._id && existingById.get(String(b._id));
    const { lat, lng } = mergeGeofenceCoordsFromExisting(gf, prev);
    if (enabled && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
      const err = new Error(
        `Branch "${String(b.name).trim()}" needs an attendance zone: drop a pin on the map (latitude & longitude).`,
      );
      err.status = 400;
      throw err;
    }
  }

  let rows = raw.map((b) => {
    const gf = b.geofence && typeof b.geofence === 'object' ? b.geofence : {};
    const enabled = gf.enabled !== false;
    const prev = b._id && existingById.get(String(b._id));
    const { lat, lng } = mergeGeofenceCoordsFromExisting(gf, prev);
    const radiusM = Math.max(10, Math.round(Number(gf.radiusM) || 150));
    const addr = String(gf.address || b.address || '').trim();
    const row = {
      name: String(b.name).trim(),
      code: String(b.code || '').trim(),
      address: String(b.address || '').trim(),
      city: String(b.city || '').trim(),
      state: String(b.state || '').trim(),
      country: String(b.country || '').trim(),
      pincode: String(b.pincode || '').trim(),
      phone: String(b.phone || '').trim(),
      isHeadOffice: Boolean(b.isHeadOffice),
      geofence: {
        enabled,
        radiusM,
        address: addr,
      },
    };
    if (Number.isFinite(lat)) row.geofence.lat = lat;
    if (Number.isFinite(lng)) row.geofence.lng = lng;
    if (b._id && mongoose.Types.ObjectId.isValid(String(b._id))) {
      return { ...row, _id: new mongoose.Types.ObjectId(String(b._id)) };
    }
    return row;
  });

  if (rows.length && !rows.some((r) => r.isHeadOffice)) {
    rows = rows.map((r, i) => (i === 0 ? { ...r, isHeadOffice: true } : { ...r, isHeadOffice: false }));
  }
  const hoCount = rows.filter((r) => r.isHeadOffice).length;
  if (hoCount > 1) {
    const first = rows.findIndex((r) => r.isHeadOffice);
    rows = rows.map((r, i) => ({ ...r, isHeadOffice: i === first }));
  }

  return rows;
}

function asNonNegativeInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function normalizeIdGenerationOne(raw, defaults) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const d = defaults && typeof defaults === 'object' ? defaults : {};
  const startNumber = asNonNegativeInt(
    Object.prototype.hasOwnProperty.call(src, 'startNumber') ? src.startNumber : d.startNumber,
    d.startNumber,
  );
  const nextNumber = asNonNegativeInt(src.nextNumber, startNumber);
  const padLength = Math.min(
    12,
    asNonNegativeInt(
      Object.prototype.hasOwnProperty.call(src, 'padLength') ? src.padLength : d.padLength,
      d.padLength,
    ),
  );
  const enabled = Object.prototype.hasOwnProperty.call(src, 'enabled')
    ? Boolean(src.enabled)
    : Boolean(d.enabled);
  return {
    enabled,
    prefix: String(src.prefix != null ? src.prefix : d.prefix).trim(),
    startNumber,
    nextNumber: Math.max(nextNumber, startNumber),
    padLength,
  };
}

function normalizeIdGeneration(raw, prevRaw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const prev = prevRaw && typeof prevRaw === 'object' ? prevRaw : {};
  return {
    employee: normalizeIdGenerationOne(
      src.employee,
      normalizeIdGenerationOne(prev.employee, DEFAULT_ID_GENERATION.employee),
    ),
    branch: normalizeIdGenerationOne(src.branch, normalizeIdGenerationOne(prev.branch, DEFAULT_ID_GENERATION.branch)),
  };
}

function formatGeneratedCode(prefix, numberValue, padLength) {
  const n = Math.max(0, Math.floor(Number(numberValue) || 0));
  const numText = String(n).padStart(Math.max(0, Math.floor(Number(padLength) || 0)), '0');
  return `${String(prefix || '').trim()}${numText}`;
}

function applyBranchCodeGeneration(branches, idGenerationBranch) {
  const cfg = idGenerationBranch && typeof idGenerationBranch === 'object' ? idGenerationBranch : DEFAULT_ID_GENERATION.branch;
  if (!cfg.enabled) return { branches, nextNumber: cfg.nextNumber };
  let next = Math.max(asNonNegativeInt(cfg.nextNumber, cfg.startNumber), asNonNegativeInt(cfg.startNumber, 1));
  const out = branches.map((row) => {
    if (String(row.code || '').trim()) return row;
    const code = formatGeneratedCode(cfg.prefix, next, cfg.padLength);
    next += 1;
    return { ...row, code };
  });
  return { branches: out, nextNumber: next };
}

function withOptionalSubId(row, id) {
  if (id && mongoose.Types.ObjectId.isValid(String(id))) {
    return { ...row, _id: new mongoose.Types.ObjectId(String(id)) };
  }
  return row;
}

function normalizeLeaveTypes(items) {
  return (Array.isArray(items) ? items : [])
    .filter((x) => x && String(x.name || '').trim())
    .map((x) =>
      withOptionalSubId(
        {
          name: String(x.name).trim(),
          annualDays: Math.max(0, Number(x.annualDays) || 0),
          carryForward: Boolean(x.carryForward),
          paidLeave: x.paidLeave !== false,
          applicableTo: String(x.applicableTo || 'All').trim() || 'All',
          isActive: x.isActive !== false,
        },
        x._id,
      ),
    );
}

function normalizeNamedToggle(items) {
  return (Array.isArray(items) ? items : [])
    .filter((x) => x && String(x.name || '').trim())
    .map((x) =>
      withOptionalSubId(
        {
          name: String(x.name).trim(),
          isActive: x.isActive !== false,
        },
        x._id,
      ),
    );
}

function normalizeEmploymentTypes(items) {
  return (Array.isArray(items) ? items : [])
    .filter((x) => x && String(x.name || '').trim())
    .map((x) =>
      withOptionalSubId(
        {
          name: String(x.name).trim(),
          description: String(x.description || '').trim(),
          isActive: x.isActive !== false,
        },
        x._id,
      ),
    );
}

function normalizeExpenseCategories(items) {
  return (Array.isArray(items) ? items : [])
    .filter((x) => x && String(x.name || '').trim())
    .map((x) =>
      withOptionalSubId(
        {
          name: String(x.name).trim(),
          budgetAmount: Math.max(0, Number(x.budgetAmount) || 0),
          iconKey: String(x.iconKey || 'receipt').trim() || 'receipt',
          isActive: x.isActive !== false,
        },
        x._id,
      ),
    );
}

function emptyWeekRule() {
  return { all: false, first: false, second: false, third: false, fourth: false, fifth: false };
}

function normalizeWeekRule(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    all: Boolean(r.all),
    first: Boolean(r.first),
    second: Boolean(r.second),
    third: Boolean(r.third),
    fourth: Boolean(r.fourth),
    fifth: Boolean(r.fifth),
  };
}

function normalizeWeeklyOff(value, prevValue) {
  const dayKeyMap = {
    Sunday: 'sunday',
    Monday: 'monday',
    Tuesday: 'tuesday',
    Wednesday: 'wednesday',
    Thursday: 'thursday',
    Friday: 'friday',
    Saturday: 'saturday',
  };
  const fromPrev = prevValue && typeof prevValue === 'object' ? prevValue : {};
  const fromValue = value && typeof value === 'object' ? value : {};
  const daysSrc = fromValue.days && typeof fromValue.days === 'object' ? fromValue.days : fromPrev.days || {};

  const out = {
    name: String(fromValue.name != null ? fromValue.name : fromPrev.name || '').trim(),
    days: {
      sunday: normalizeWeekRule(daysSrc.sunday),
      monday: normalizeWeekRule(daysSrc.monday),
      tuesday: normalizeWeekRule(daysSrc.tuesday),
      wednesday: normalizeWeekRule(daysSrc.wednesday),
      thursday: normalizeWeekRule(daysSrc.thursday),
      friday: normalizeWeekRule(daysSrc.friday),
      saturday: normalizeWeekRule(daysSrc.saturday),
    },
  };

  // Backward compatibility: old payload could be just a day string.
  const legacy = String(value || '').trim();
  if (legacy && dayKeyMap[legacy]) {
    const dk = dayKeyMap[legacy];
    out.name = out.name || 'Weekly Off';
    out.days[dk] = { ...emptyWeekRule(), all: true };
  }
  return out;
}

function normalizeHm(v, fallback) {
  const m = String(v || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return fallback;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * @param {Array} prevShifts - existing lean shifts
 * @param {Array} items - incoming
 * @param {string} adminName
 */
function normalizeShifts(prevShifts, items, adminName) {
  const prevList = Array.isArray(prevShifts) ? prevShifts : [];
  const prevById = new Map(prevList.filter((s) => s && s._id).map((s) => [String(s._id), s]));
  const actor = String(adminName || 'Admin').trim() || 'Admin';
  const incoming = Array.isArray(items) ? items : [];

  return incoming
    .filter((x) => x && String(x.name || '').trim())
    .map((x) => {
      const name = String(x.name).trim();
      const letterRaw = String(x.letter != null ? x.letter : name.charAt(0) || '?')
        .trim()
        .slice(0, 1)
        .toUpperCase();
      const letter = letterRaw || '?';
      const startTime = normalizeHm(x.startTime, '09:00');
      const endTime = normalizeHm(x.endTime, '18:00');
      const idStr = x._id && mongoose.Types.ObjectId.isValid(String(x._id)) ? String(x._id) : null;
      const prev = idStr ? prevById.get(idStr) : null;
      const row = {
        name,
        letter,
        startTime,
        endTime,
        createdByName: prev && prev.createdByName ? String(prev.createdByName) : actor,
        updatedByName: actor,
      };
      // Always set a real ObjectId for nested orgSetup.shifts so findOneAndUpdate persists
      // new rows reliably (plain objects without _id can be dropped by casting in some paths).
      if (idStr) {
        return { ...row, _id: new mongoose.Types.ObjectId(idStr) };
      }
      return { ...row, _id: new mongoose.Types.ObjectId() };
    });
}

async function clearOrphanUserShifts(companyId, validShiftIdStrings) {
  const valid = new Set((validShiftIdStrings || []).filter(Boolean).map(String));
  const users = await User.find({ companyId }).select('_id shiftId').lean();
  for (const u of users) {
    const sid = u.shiftId != null ? String(u.shiftId).trim() : '';
    if (sid && !valid.has(sid)) {
      // eslint-disable-next-line no-await-in-loop
      await User.updateOne({ _id: u._id }, { $set: { shiftId: '' } });
    }
  }
}

const CUSTOM_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'radio',
  'checkbox',
  'dropdown',
  'image',
  'file',
];

function normalizeCustomFieldOptions(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .slice(0, 100)
    .filter((o) => o && (String(o.value || '').trim() || String(o.label || '').trim()))
    .map((o) => {
      const rawV = String(o.value ?? '').trim();
      const rawL = String(o.label ?? '').trim();
      const value = (rawV || rawL).slice(0, 500);
      const label = (rawL || rawV).slice(0, 500);
      return { value, label };
    });
}

function normalizeCustomFieldDefs(items) {
  return (Array.isArray(items) ? items : [])
    .filter((x) => x && String(x.key || '').trim() && String(x.label || '').trim())
    .map((x) => {
      const fieldType = CUSTOM_FIELD_TYPES.includes(x.fieldType) ? x.fieldType : 'text';
      const wantsOptions = fieldType === 'dropdown' || fieldType === 'radio' || fieldType === 'checkbox';
      const options = wantsOptions ? normalizeCustomFieldOptions(x.options) : [];
      return {
        key: String(x.key)
          .trim()
          .replace(/\s+/g, '_')
          .replace(/[^a-zA-Z0-9_]/g, '_'),
        label: String(x.label).trim(),
        category: String(x.category || 'General').trim() || 'General',
        fieldType,
        options,
        isActive: x.isActive !== false,
        isRequired: x.isRequired === true || x.isRequired === 'true' || x.isRequired === 1 || x.isRequired === '1',
      };
    });
}

const MAX_COMPANY_HOLIDAYS = 400;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeCompanyHolidays(incoming, prevHolidays, branches) {
  const validBranchIds = new Set(
    (Array.isArray(branches) ? branches : []).map((b) => (b._id ? String(b._id) : '')).filter(Boolean),
  );
  const list = Array.isArray(incoming) ? incoming : [];
  const prev = Array.isArray(prevHolidays) ? prevHolidays : [];
  const prevById = new Map(prev.map((h) => [String(h._id), h]));

  const out = [];
  for (const raw of list.slice(0, MAX_COMPANY_HOLIDAYS)) {
    if (!raw || typeof raw !== 'object') continue;
    const name = String(raw.name || '').trim().slice(0, 160);
    if (!name) continue;
    let startDate = String(raw.startDate || '').trim().slice(0, 10);
    let endDate = String(raw.endDate != null ? raw.endDate : raw.startDate || '').trim().slice(0, 10);
    if (!YMD_RE.test(startDate)) continue;
    if (!YMD_RE.test(endDate)) endDate = startDate;
    if (startDate > endDate) {
      const t = startDate;
      startDate = endDate;
      endDate = t;
    }
    const spanDays = Math.round(
      (new Date(`${endDate}T12:00:00.000Z`).getTime() - new Date(`${startDate}T12:00:00.000Z`).getTime()) /
        86400000,
    );
    if (!Number.isFinite(spanDays) || spanDays > 366) continue;

    const rawBranchIds = Array.isArray(raw.branchIds) ? raw.branchIds : [];
    const branchIds = rawBranchIds
      .map((id) => String(id))
      .filter((id) => mongoose.isValidObjectId(id) && validBranchIds.has(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const rid = raw._id != null ? String(raw._id) : '';
    const _id =
      rid && mongoose.isValidObjectId(rid) && prevById.has(rid)
        ? new mongoose.Types.ObjectId(rid)
        : new mongoose.Types.ObjectId();

    out.push({ _id, name, startDate, endDate, branchIds });
  }
  return out;
}

async function getCompany(req, res, next) {
  try {
    const company = await Company.findOne({ adminId: req.admin._id }).lean();
    return res.json({ company });
  } catch (error) {
    return next(error);
  }
}

async function upsertCompany(req, res, next) {
  try {
    const existing = await Company.findOne({ adminId: req.admin._id }).lean();

    const core = {};
    for (const k of ['name', 'address', 'phone', 'email']) {
      if (req.body[k] !== undefined) core[k] = req.body[k];
      else if (existing && existing[k] != null) core[k] = existing[k];
    }

    if (!existing) {
      const missing = ['name', 'address', 'phone', 'email'].filter((k) => !String(core[k] || '').trim());
      if (missing.length) {
        return res.status(400).json({
          message: 'Company name, address, phone, and email are required for first-time setup.',
          missing,
        });
      }
    }

    if (!existing || req.body.email !== undefined || req.body.phone !== undefined) {
      try {
        await assertCompanyEmailPhoneUnique(existing?._id, core.email, core.phone);
      } catch (e) {
        if (e.status) return res.status(e.status).json({ message: e.message });
        throw e;
      }
    }

    const update = { ...core, adminId: req.admin._id };
    const incomingOrgSetup = req.body.orgSetup != null && typeof req.body.orgSetup === 'object' ? req.body.orgSetup : null;
    const incomingIdGeneration = incomingOrgSetup && incomingOrgSetup.idGeneration !== undefined ? incomingOrgSetup.idGeneration : undefined;
    const resolvedIdGeneration = normalizeIdGeneration(incomingIdGeneration, existing?.orgSetup?.idGeneration);

    if (Array.isArray(req.body.branches)) {
      try {
        const maxBranchCap =
          existing?.subscription?.maxBranches != null
            ? Math.min(500, Math.max(1, Number(existing.subscription.maxBranches) || 1))
            : MAX_BRANCHES;
        // Generate missing branch codes *before* normalizeBranchesInput, which requires a code per branch.
        const rawIncoming = (Array.isArray(req.body.branches) ? req.body.branches : [])
          .filter((b) => b && String(b.name || '').trim())
          .slice(0, maxBranchCap);
        const withGeneratedCodes = applyBranchCodeGeneration(rawIncoming, resolvedIdGeneration.branch);
        const normalizedBranches = normalizeBranchesInput(
          withGeneratedCodes.branches,
          existing?.branches || [],
          maxBranchCap,
        );
        update.branches = normalizedBranches;
        resolvedIdGeneration.branch.nextNumber = withGeneratedCodes.nextNumber;
      } catch (e) {
        if (e.status) return res.status(e.status).json({ message: e.message });
        throw e;
      }
    }

    if (req.body.orgSetup != null && typeof req.body.orgSetup === 'object') {
      const prev = (existing && existing.orgSetup) || {};
      const incoming = req.body.orgSetup;
      const next = { ...prev };
      if (incoming.leaveTypes !== undefined) next.leaveTypes = normalizeLeaveTypes(incoming.leaveTypes);
      if (incoming.designations !== undefined) next.designations = normalizeNamedToggle(incoming.designations);
      if (incoming.departments !== undefined) next.departments = normalizeNamedToggle(incoming.departments);
      if (incoming.employmentTypes !== undefined) {
        next.employmentTypes = normalizeEmploymentTypes(incoming.employmentTypes);
      }
      if (incoming.expenseCategories !== undefined) {
        next.expenseCategories = normalizeExpenseCategories(incoming.expenseCategories);
      }
      if (incoming.shifts !== undefined) {
        const adminName = String(req.admin?.name || 'Admin').trim() || 'Admin';
        next.shifts = normalizeShifts(prev.shifts, incoming.shifts, adminName);
      }
      if (incoming.weeklyOff !== undefined) {
        next.weeklyOff = normalizeWeeklyOff(incoming.weeklyOff, prev.weeklyOff);
      }
      if (incoming.holidays !== undefined) {
        const branchesForHolidayValidation =
          update.branches !== undefined ? update.branches : existing?.branches || [];
        next.holidays = normalizeCompanyHolidays(incoming.holidays, prev.holidays, branchesForHolidayValidation);
      }
      if (incoming.idGeneration !== undefined || prev.idGeneration !== undefined) {
        next.idGeneration = resolvedIdGeneration;
      }
      update.orgSetup = next;
    }
    if (Array.isArray(req.body.branches) && !update.orgSetup) {
      update.orgSetup = {
        ...((existing && existing.orgSetup) || {}),
        idGeneration: resolvedIdGeneration,
      };
    }

    if (Array.isArray(req.body.employeeCustomFieldDefs)) {
      update.employeeCustomFieldDefs = normalizeCustomFieldDefs(req.body.employeeCustomFieldDefs);
    }
    if (Array.isArray(req.body.companyCustomFieldDefs)) {
      update.companyCustomFieldDefs = normalizeCustomFieldDefs(req.body.companyCustomFieldDefs);
    }

    if (req.body.subscription != null && typeof req.body.subscription === 'object') {
      const prevSub =
        existing && existing.subscription && typeof existing.subscription === 'object'
          ? { ...existing.subscription }
          : {};
      const inc = req.body.subscription;
      const nextSub = { ...prevSub };
      if (Object.prototype.hasOwnProperty.call(inc, 'renewalDetails')) {
        nextSub.renewalDetails = String(inc.renewalDetails ?? '').trim().slice(0, 2000);
      }
      if (Object.prototype.hasOwnProperty.call(inc, 'lastRenewedAt')) {
        const raw = inc.lastRenewedAt;
        if (raw === '' || raw == null) {
          nextSub.lastRenewedAt = null;
        } else {
          const d = new Date(raw);
          nextSub.lastRenewedAt = Number.isNaN(d.getTime()) ? prevSub.lastRenewedAt ?? null : d;
        }
      }
      update.subscription = nextSub;
    }

    const company = await Company.findOneAndUpdate({ adminId: req.admin._id }, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });

    if (Array.isArray(req.body.branches)) {
      await syncAttendanceGeofences(company._id, company.branches || []);
    }

    if (req.body.orgSetup != null && typeof req.body.orgSetup === 'object' && req.body.orgSetup.shifts !== undefined) {
      const ids = (company.orgSetup?.shifts || []).map((s) => (s._id ? String(s._id) : '')).filter(Boolean);
      await clearOrphanUserShifts(company._id, ids);
    }

    await Admin.findByIdAndUpdate(req.admin._id, { companySetupCompleted: true });
    return res.json({ company });
  } catch (error) {
    return next(error);
  }
}

function buildProvisioningPartnerPayload(saLean) {
  if (!saLean) return null;
  const prof = saLean.superAdminOrgProfile && typeof saLean.superAdminOrgProfile === 'object' ? saLean.superAdminOrgProfile : {};
  return {
    accountName: saLean.name || '',
    accountEmail: saLean.email || '',
    profile: {
      companyName: prof.companyName || '',
      companyEmail: prof.companyEmail || '',
      companyPhone: prof.companyPhone || '',
      companyWebsiteUrl: prof.companyWebsiteUrl || '',
      description: prof.description || '',
      address: prof.address || '',
      supportEmail: prof.supportEmail || '',
      contactPersonName: prof.contactPersonName || '',
      altPhone: prof.altPhone || '',
    },
  };
}

/** Tenant company: who provisioned them + public org/contact fields for "Our products" support. */
async function getProvisioningPartnerContact(req, res, next) {
  try {
    const company = await Company.findOne({ adminId: req.admin._id }).select('createdBySuperAdminId').lean();
    if (!company) {
      return res.status(404).json({ message: 'Company not found.' });
    }
    let partner = null;
    if (company.createdBySuperAdminId) {
      partner = await Admin.findById(company.createdBySuperAdminId).select('name email role superAdminOrgProfile').lean();
    }
    if (!partner || !['superadmin', 'mainsuperadmin'].includes(partner.role)) {
      partner = await Admin.findOne({ role: 'mainsuperadmin' }).sort({ createdAt: 1 }).select('name email role superAdminOrgProfile').lean();
    }
    if (!partner) {
      return res.json({ partner: null });
    }
    return res.json({ partner: buildProvisioningPartnerPayload(partner) });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  getCompany,
  upsertCompany,
  getProvisioningPartnerContact,
};
