const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  // Task tracking rows have taskId; attendance presence rows intentionally use null.
  taskId: { type: mongoose.Schema.Types.Mixed, index: true, required: false, default: null },
  usersId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  staffId: { type: mongoose.Schema.Types.Mixed, index: true },
  staffName: { type: String },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now, index: true },
  time: { type: Date },
  batteryPercent: { type: Number },
  movementType: { type: String },
  presenceStatus: { type: String, index: true },
  appStatus: { type: String },
  accuracy: { type: Number },
  status: { type: String },
  exitStatus: { type: String },
  exitReason: { type: String },
  exitedAt: { type: Date },
  address: { type: String },
  fullAddress: { type: String },
  pincode: { type: String },
  city: { type: String },
  area: { type: String },
  destinationLat: { type: Number },
  destinationLng: { type: Number },
}, { timestamps: true, collection: 'locations' });

function toUserObjectId(value) {
  if (value == null) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  const s = String(value).trim();
  if (!mongoose.Types.ObjectId.isValid(s) || s.length !== 24) return null;
  try {
    return new mongoose.Types.ObjectId(s);
  } catch (_) {
    return null;
  }
}

// Mongoose 7+ document middleware: sync hooks run without a `next` callback; do not call next().
locationSchema.pre('validate', function syncLegacyIds() {
  const legacyUserId = this.userId;
  const legacyStaffId = this.staffId;
  if (!this.usersId) {
    const fromUser = toUserObjectId(legacyUserId);
    if (fromUser) this.usersId = fromUser;
  }
  if (!this.usersId) {
    const fromStaff = toUserObjectId(legacyStaffId);
    if (fromStaff) this.usersId = fromStaff;
  }
});

locationSchema.index({ usersId: 1, timestamp: -1 });
locationSchema.index({ taskId: 1, timestamp: 1 });

module.exports = mongoose.model('Location', locationSchema);
