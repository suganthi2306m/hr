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
    dayStatus: {
      type: String,
      enum: ['PRESENT', 'ABSENT', 'LEAVE', 'HOLIDAY'],
      default: 'PRESENT',
      index: true,
    },
    /** When dayStatus is LEAVE: paid | unpaid (validated in API). */
    leaveKind: { type: String },
    note: { type: String },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Attendance', attendanceSchema);
