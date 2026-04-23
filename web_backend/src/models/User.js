const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: undefined },
    /** ObjectId string of Company.orgSetup.shifts[] entry, or empty. */
    shiftId: { type: mongoose.Schema.Types.ObjectId, default: undefined },
    /** Optional staff / payroll code shown in HR-style UIs. */
    employeeCode: { type: String, trim: true, default: '' },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, select: false },
    phone: { type: String, trim: true },
    /** Dashboard hierarchy: admin | manager | field_agent (legacy: field_user → field_agent) */
    role: { type: String, default: 'field_agent' },
    permissions: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    kycStatus: { type: String, trim: true, default: '' },
    kycNotes: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
    /** When true, attendance punch-in must be inside assigned branch geofence radius. */
    attendanceGeofenceEnabled: { type: Boolean, default: true },
    /**
     * Extended employee / onboarding fields (HR-style). Shape is flexible; web sends structured JSON.
     * Use `custom` for values keyed by [Company.employeeCustomFieldDefs].key
     */
    employeeProfile: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true },
);

userSchema.pre('validate', function () {
  for (const key of ['branchId', 'shiftId', 'companyId']) {
    const v = this.get(key);
    if (v === '' || (typeof v === 'string' && v.trim() === '')) {
      this.set(key, undefined);
    }
  }
});

module.exports = mongoose.model('User', userSchema);
