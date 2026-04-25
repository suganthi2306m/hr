const mongoose = require('mongoose');

const branchGeofenceSchema = new mongoose.Schema(
  {
    lat: { type: Number },
    lng: { type: Number },
    radiusM: { type: Number, min: 10, default: 150 },
    address: { type: String, trim: true, default: '' },
    enabled: { type: Boolean, default: true },
  },
  { _id: false },
);

const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },
    pincode: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    /** Exactly one branch per company should be true (enforced in API). */
    isHeadOffice: { type: Boolean, default: false },
    /** Attendance check-in/out zone for this branch (synced to GeoFence collection). */
    geofence: { type: branchGeofenceSchema, default: () => ({}) },
  },
  { _id: true, id: true },
);

const orgLeaveTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    annualDays: { type: Number, default: 0 },
    carryForward: { type: Boolean, default: false },
    paidLeave: { type: Boolean, default: true },
    applicableTo: { type: String, trim: true, default: 'All' },
    isActive: { type: Boolean, default: true },
  },
  { _id: true, id: true },
);

const orgNamedToggleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: true, id: true },
);

const orgEmploymentTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { _id: true, id: true },
);

const orgExpenseCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    budgetAmount: { type: Number, default: 0 },
    iconKey: { type: String, trim: true, default: 'receipt' },
    isActive: { type: Boolean, default: true },
  },
  { _id: true, id: true },
);

/** Work shifts for attendance expectations (assigned per user via User.shiftId). */
const orgShiftSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Single-letter badge in UI (e.g. G for General). */
    letter: { type: String, trim: true, default: '', maxlength: 1 },
    /** 24h HH:mm */
    startTime: { type: String, trim: true, default: '09:00' },
    endTime: { type: String, trim: true, default: '18:00' },
    createdByName: { type: String, trim: true, default: '' },
    updatedByName: { type: String, trim: true, default: '' },
  },
  { _id: true, id: true, timestamps: true },
);

const weekDayRuleSchema = new mongoose.Schema(
  {
    all: { type: Boolean, default: false },
    first: { type: Boolean, default: false },
    second: { type: Boolean, default: false },
    third: { type: Boolean, default: false },
    fourth: { type: Boolean, default: false },
    fifth: { type: Boolean, default: false },
  },
  { _id: false },
);

const orgWeeklyOffSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    days: {
      sunday: { type: weekDayRuleSchema, default: () => ({}) },
      monday: { type: weekDayRuleSchema, default: () => ({}) },
      tuesday: { type: weekDayRuleSchema, default: () => ({}) },
      wednesday: { type: weekDayRuleSchema, default: () => ({}) },
      thursday: { type: weekDayRuleSchema, default: () => ({}) },
      friday: { type: weekDayRuleSchema, default: () => ({}) },
      saturday: { type: weekDayRuleSchema, default: () => ({}) },
    },
  },
  { _id: false },
);

const idGenerationSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    prefix: { type: String, trim: true, default: '' },
    startNumber: { type: Number, min: 0, default: 1 },
    nextNumber: { type: Number, min: 0, default: 1 },
    padLength: { type: Number, min: 0, max: 12, default: 0 },
  },
  { _id: false },
);

/** Company-wide calendar holidays (YYYY-MM-DD, inclusive). Empty branchIds = all branches. */
const orgCompanyHolidaySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    startDate: { type: String, required: true, trim: true },
    endDate: { type: String, required: true, trim: true },
    branchIds: [{ type: mongoose.Schema.Types.ObjectId }],
  },
  { _id: true, id: true, timestamps: true },
);

const orgSetupSchema = new mongoose.Schema(
  {
    leaveTypes: { type: [orgLeaveTypeSchema], default: [] },
    designations: { type: [orgNamedToggleSchema], default: [] },
    departments: { type: [orgNamedToggleSchema], default: [] },
    employmentTypes: { type: [orgEmploymentTypeSchema], default: [] },
    expenseCategories: { type: [orgExpenseCategorySchema], default: [] },
    shifts: { type: [orgShiftSchema], default: [] },
    holidays: { type: [orgCompanyHolidaySchema], default: [] },
    /** Single weekly-off configuration for the company. */
    weeklyOff: { type: orgWeeklyOffSchema, default: () => ({}) },
    idGeneration: {
      employee: { type: idGenerationSchema, default: () => ({ enabled: false, prefix: 'EMP', startNumber: 1, nextNumber: 1, padLength: 4 }) },
      branch: { type: idGenerationSchema, default: () => ({ enabled: false, prefix: 'BR', startNumber: 1, nextNumber: 1, padLength: 0 }) },
    },
  },
  { _id: false, id: false },
);

const customFieldOptionSchema = new mongoose.Schema(
  {
    value: { type: String, trim: true, default: '' },
    label: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

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

const customFieldDefSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    category: { type: String, trim: true, default: 'General' },
    fieldType: { type: String, enum: CUSTOM_FIELD_TYPES, default: 'text' },
    /** For dropdown, radio, and multi-checkbox. Single checkbox uses an empty options list. */
    options: { type: [customFieldOptionSchema], default: [] },
    /** When false, field is hidden from employee forms but kept for existing data. */
    isActive: { type: Boolean, default: true },
    /** When true, active fields must have a value before employee record save (web onboarding). */
    isRequired: { type: Boolean, default: false },
  },
  { _id: false },
);

const companySubscriptionSchema = new mongoose.Schema(
  {
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', default: null },
    planCode: { type: String, trim: true, default: '' },
    planName: { type: String, trim: true, default: '' },
    licenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'License', default: null },
    licenseKey: { type: String, trim: true, default: '' },
    maxUsers: { type: Number, default: null },
    maxBranches: { type: Number, default: null },
    expiresAt: { type: Date, default: null },
    /** Mirrors the active license: trial vs paid (for UI / clients). */
    isTrial: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    /** Tenant-visible notes (e.g. renewal terms, PO number). */
    renewalDetails: { type: String, trim: true, default: '' },
    /** When the subscription was last renewed (admin-maintained). */
    lastRenewedAt: { type: Date, default: null },
  },
  { _id: false },
);

const companySchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, unique: true },
    /** Partner superadmin who created this tenant (null for legacy/main-owned). */
    createdBySuperAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null, index: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    /** Subscription + license snapshot for enforcement and superadmin CRM views. */
    subscription: { type: companySubscriptionSchema, default: () => ({}) },
    branches: { type: [branchSchema], default: [] },
    orgSetup: { type: orgSetupSchema, default: () => ({}) },
    /** Admin-defined extra fields for employee profiles (values live under User.employeeProfile.custom[key]). */
    employeeCustomFieldDefs: { type: [customFieldDefSchema], default: [] },
    /** Optional extra fields for company profile screens (values can be stored client-side or extended later). */
    companyCustomFieldDefs: { type: [customFieldDefSchema], default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Company', companySchema);
