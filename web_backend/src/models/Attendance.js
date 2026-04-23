const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    checkInAt: { type: Date, required: true },
    checkOutAt: { type: Date },
    checkInLat: Number,
    checkInLng: Number,
    checkOutLat: Number,
    checkOutLng: Number,
    method: { type: String, enum: ['manual', 'geo', 'auto'], default: 'manual' },
    minutesWorked: { type: Number, default: null },
    lateFlag: { type: Boolean, default: false },
    earlyExitFlag: { type: Boolean, default: false },
    attendanceDate: { type: Date, index: true },
    /** Calendar day for this row (YYYY-MM-DD from supervisor UI); one document per user per key. */
    attendanceDayKey: { type: String, index: true },
    dayStatus: {
      type: String,
      enum: ['PRESENT', 'ABSENT', 'LEAVE', 'HOLIDAY'],
      default: 'PRESENT',
      index: true,
    },
    /** Optional workflow field (e.g. app PENDING); kept in sync with dayStatus on ops /mark when possible. */
    status: { type: String, index: true },
    /** When dayStatus is LEAVE: paid | unpaid (validated in API). */
    leaveKind: { type: String },
    note: { type: String },
    /** Regularization approval workflow metadata. */
    approval: {
      status: {
        type: String,
        enum: ['none', 'pending', 'approved', 'rejected'],
        default: 'none',
        index: true,
      },
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
      decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
      decidedByName: { type: String, default: '' },
      decidedAt: { type: Date },
    },
  },
  { timestamps: true },
);

attendanceSchema.index(
  { companyId: 1, userId: 1, attendanceDayKey: 1 },
  {
    unique: true,
    partialFilterExpression: { attendanceDayKey: { $exists: true, $type: 'string' } },
  },
);

module.exports = mongoose.model('Attendance', attendanceSchema);
