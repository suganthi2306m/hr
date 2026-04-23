const mongoose = require('mongoose');

const timingSnapshotSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    checkInMinutes: { type: Number },
    checkOutMinutes: { type: Number },
    checkInEnabled: { type: Boolean },
    checkOutEnabled: { type: Boolean },
  },
  { _id: false },
);

/**
 * Per-user attendance reminder times (check-in / check-out).
 * Collection name: attendancealarms
 */
const attendanceAlarmSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    checkInEnabled: { type: Boolean, default: false },
    checkOutEnabled: { type: Boolean, default: false },
    /** Minutes from midnight (0–1439), local wall time on device matches company expectation. */
    checkInMinutes: { type: Number, default: 9 * 60 },
    checkOutMinutes: { type: Number, default: 18 * 60 },
    /** Last updates for auditing / “all timings” history (capped server-side). */
    timingsHistory: { type: [timingSnapshotSchema], default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model('AttendanceAlarm', attendanceAlarmSchema);
