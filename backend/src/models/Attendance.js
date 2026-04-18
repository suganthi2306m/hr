const mongoose = require('mongoose');

const geoPointSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String },
    accuracy: { type: Number },
    isMocked: { type: Boolean, default: false },
  },
  { _id: false },
);

const attendanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    /** Calendar day (local server midnight) for the shift; same document holds check-in + check-out for that day. */
    attendanceDate: { type: Date, index: true },
    checkInTime: { type: Date, required: true, index: true },
    checkOutTime: { type: Date },
    checkInImageUrl: { type: String, required: true },
    checkOutImageUrl: { type: String },
    checkInLocation: { type: geoPointSchema, required: true },
    checkOutLocation: { type: geoPointSchema },
    duration: { type: Number, default: 0 }, // minutes
    status: {
      type: String,
      enum: ['PENDING', 'PRESENT', 'HALF_DAY', 'ABSENT'],
      default: 'PENDING',
      index: true,
    },
    checkInDeniedReason: { type: String },
  },
  { timestamps: true },
);

attendanceSchema.index({ userId: 1, checkInTime: -1 });
attendanceSchema.index({ userId: 1, attendanceDate: -1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
