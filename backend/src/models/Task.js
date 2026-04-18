const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  // Human-readable id
  taskCode: { type: String, required: true, unique: true },
  taskName: { type: String, required: true },
  description: { type: String, default: '' },
  status: {
    type: String,
    enum: [
      'assigned',
      'progress',
      'arrived',
      'completed',
      'rejected',
      'resumed',
      'hold',
      'exited',
    ],
    default: 'assigned',
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },

  assignedDate: { type: Date },
  completionDate: { type: Date, required: true },
  completedAt: { type: Date },

  locations: {
    source: {
      lat: Number,
      lng: Number,
      address: String,
      fullAddress: String,
      pincode: String,
      recordedAt: Date,
    },
    destination: {
      lat: Number,
      lng: Number,
      address: String,
      fullAddress: String,
      pincode: String,
      recordedAt: Date,
    },
    arrival: {
      lat: Number,
      lng: Number,
      address: String,
      fullAddress: String,
      pincode: String,
      time: Date,
      overridencustomerlocation: { type: Boolean, default: false },
      overridendestinationlocation: { type: Boolean, default: false },
    },
  },

  travel: {
    distanceKm: Number,
    durationSeconds: Number,
    activityDuration: {
      driveDuration: { type: Number, default: 0 },
      walkDuration: { type: Number, default: 0 },
      stopDuration: { type: Number, default: 0 },
    },
  },

  photoDetails: {
    url: String,
    uploadedAt: Date,
    description: String,
    lat: Number,
    lng: Number,
    address: String,
  },

  otp: {
    code: String,
    sentAt: Date,
    verifiedAt: Date,
    location: {
      lat: Number,
      lng: Number,
      address: String,
    },
  },

  progress: {
    reachedLocation: { type: Boolean, default: false },
    photoUploaded: { type: Boolean, default: false },
    otpVerified: { type: Boolean, default: false },
    formFilled: { type: Boolean, default: false },
  },

  exitHistory: [{
    status: { type: String, enum: ['hold', 'exited'] },
    reason: String,
    time: Date,
    location: {
      lat: Number,
      lng: Number,
      address: String,
      pincode: String,
    },
    batteryPercent: Number,
  }],

  resumedHistory: [{
    time: Date,
    note: String,
    location: {
      lat: Number,
      lng: Number,
      address: String,
      pincode: String,
    },
    batteryPercent: Number,
  }],

  approval: {
    approvedAt: Date,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: Date,
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },

  source: { type: String, default: 'app' },
}, { timestamps: true, strict: false, collection: 'fielsTasks' });

// Auto-generate task code
taskSchema.pre('save', function () {
  if (this.isNew && !this.taskCode) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const rand = () => chars[Math.floor(Math.random() * chars.length)];
    this.taskCode = `TASK-${Array(8).fill(0).map(() => rand()).join('')}`;
  }
});

taskSchema.index({ assignedTo: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ customerId: 1 });
taskSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Task', taskSchema);
