const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.Mixed, index: true },
    usersId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // legacy
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // legacy
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now, index: true },
    time: { type: Date },
    batteryPercent: Number,
    movementType: String,
    status: String,
    exitStatus: String,
    exitReason: String,
    exitedAt: Date,
    address: String,
    fullAddress: String,
    pincode: String,
    city: String,
    area: String,
    destinationLat: Number,
    destinationLng: Number,
  },
  { timestamps: true, collection: 'locations', strict: false },
);

locationSchema.index({ usersId: 1, timestamp: -1 });
locationSchema.index({ taskId: 1, timestamp: -1 });

module.exports = mongoose.model('Location', locationSchema);
