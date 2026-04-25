const mongoose = require('mongoose');

const LEAD_STATUSES = ['new', 'in_progress', 'follow_up', 'won', 'dropped', 'customer'];

const leadSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    /** Mirror key for web admin compatibility (same tenant as businessId). */
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    /** Optional owner admin id for cross-surface visibility with web admin tooling. */
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
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
    convertedToCustomer: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false },
    assignmentLogs: {
      type: [
        {
          fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
          toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
          changedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          changedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    statusLogs: {
      type: [
        {
          fromStatus: { type: String, enum: LEAD_STATUSES, required: true },
          toStatus: { type: String, enum: LEAD_STATUSES, required: true },
          changedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          note: { type: String, trim: true, default: '' },
          changedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    followUps: {
      type: [
        {
          note: { type: String, trim: true, required: true },
          actionType: { type: String, enum: ['call', 'visit', 'message', 'other'], default: 'call' },
          nextFollowUpAt: { type: Date, default: null },
          statusAfter: { type: String, enum: LEAD_STATUSES, default: null },
          assignedToUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
          createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          createdAt: { type: Date, default: Date.now },
          updatedAt: { type: Date, default: Date.now },
          history: {
            type: [
              {
                note: { type: String, trim: true, default: '' },
                actionType: { type: String, enum: ['call', 'visit', 'message', 'other'], default: 'call' },
                nextFollowUpAt: { type: Date, default: null },
                statusAfter: { type: String, enum: LEAD_STATUSES, default: null },
                changedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
                changedAt: { type: Date, default: Date.now },
              },
            ],
            default: [],
          },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

leadSchema.index({ businessId: 1, assignedTo: 1, status: 1, createdAt: -1 });
leadSchema.index({ businessId: 1, 'followUps.nextFollowUpAt': 1, status: 1 });
leadSchema.index({ companyId: 1, assignedTo: 1, status: 1, createdAt: -1 });

module.exports = { Lead: mongoose.model('Lead', leadSchema), LEAD_STATUSES };
