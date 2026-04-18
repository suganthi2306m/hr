const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    taskCode: String,
    taskName: String,
    taskTitle: String,
    description: String,
    taskType: { type: String, trim: true, default: 'visit' },
    priority: { type: String, trim: true, default: 'medium' },
    branchId: { type: String, trim: true, default: '' },
    status: String,
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    customerId: mongoose.Schema.Types.ObjectId,
    companyId: mongoose.Schema.Types.ObjectId,
    completionDate: Date,
    completedAt: Date,
    statusTimestamps: {
      acceptedAt: Date,
      inProgressAt: Date,
      completedAt: Date,
      verifiedAt: Date,
    },
    geofence: {
      name: String,
      lat: Number,
      lng: Number,
      radiusM: Number,
    },
    otp: mongoose.Schema.Types.Mixed,
    photoDetails: mongoose.Schema.Types.Mixed,
    signatureDataUrl: { type: String, default: '' },
    proofAttachments: {
      type: [
        {
          name: String,
          url: String,
          uploadedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    plannedRoute: [{ lat: Number, lng: Number }],
    routeDeviationAlertedAt: Date,
    idleAlertedAt: Date,
    locations: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
    strict: false,
    collection: process.env.TASK_COLLECTION || 'fielsTasks',
  },
);

module.exports = mongoose.model('Task', taskSchema);
