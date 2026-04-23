const mongoose = require('mongoose');

const LEAD_STATUSES = [
  'new',
  'in_progress',
  'follow_up',
  'won',
  'dropped',
  'customer',
];

const assignmentLogSchema = new mongoose.Schema(
  {
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    changedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const statusLogSchema = new mongoose.Schema(
  {
    fromStatus: { type: String, enum: LEAD_STATUSES, required: true },
    toStatus: { type: String, enum: LEAD_STATUSES, required: true },
    changedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    note: { type: String, trim: true, default: '' },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const followUpSchema = new mongoose.Schema(
  {
    note: { type: String, trim: true, required: true },
    actionType: { type: String, enum: ['call', 'visit', 'message', 'other'], default: 'call' },
    nextFollowUpAt: { type: Date, default: null },
    statusAfter: { type: String, enum: LEAD_STATUSES, default: null },
    createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    history: {
      type: [
        {
          note: { type: String, trim: true, default: '' },
          actionType: { type: String, enum: ['call', 'visit', 'message', 'other'], default: 'call' },
          nextFollowUpAt: { type: Date, default: null },
          statusAfter: { type: String, enum: LEAD_STATUSES, default: null },
          changedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
          changedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { _id: true },
);

const leadSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    leadName: { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    emailId: { type: String, trim: true, lowercase: true, default: '' },
    phoneNumber: { type: String, trim: true, default: '' },
    source: { type: String, trim: true, default: '' },
    status: { type: String, enum: LEAD_STATUSES, default: 'new', index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    address: {
      text: { type: String, trim: true, default: '' },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    convertedToCustomer: { type: Boolean, default: false, index: true },
    convertedCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    isLocked: { type: Boolean, default: false, index: true },
    assignmentLogs: { type: [assignmentLogSchema], default: [] },
    statusLogs: { type: [statusLogSchema], default: [] },
    followUps: { type: [followUpSchema], default: [] },
  },
  { timestamps: true },
);

leadSchema.index({ companyId: 1, createdAt: -1 });
leadSchema.index({ companyId: 1, status: 1, assignedTo: 1 });
leadSchema.index({ companyId: 1, companyName: 1 });
leadSchema.index({ companyId: 1, phoneNumber: 1 });
leadSchema.index({ companyId: 1, emailId: 1 });
leadSchema.index({ companyId: 1, 'followUps.nextFollowUpAt': 1, status: 1 });

module.exports = { Lead: mongoose.model('Lead', leadSchema), LEAD_STATUSES };
