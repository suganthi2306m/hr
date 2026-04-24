const mongoose = require('mongoose');

const leadFollowUpSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    note: { type: String, trim: true, required: true },
    actionType: { type: String, enum: ['call', 'visit', 'message', 'other'], default: 'call' },
    nextFollowUpAt: { type: Date, default: null, index: true },
    statusAfter: { type: String, default: null },
    createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    history: {
      type: [
        {
          note: { type: String, trim: true, default: '' },
          actionType: { type: String, enum: ['call', 'visit', 'message', 'other'], default: 'call' },
          nextFollowUpAt: { type: Date, default: null },
          statusAfter: { type: String, default: null },
          changedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
          changedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

leadFollowUpSchema.index({ companyId: 1, leadId: 1, createdAt: -1 });
leadFollowUpSchema.index({ companyId: 1, nextFollowUpAt: 1 });

module.exports = mongoose.model('LeadFollowUp', leadFollowUpSchema, 'followupLead');
