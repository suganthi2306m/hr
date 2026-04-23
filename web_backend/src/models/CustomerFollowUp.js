const mongoose = require('mongoose');

const customerFollowUpSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    note: { type: String, trim: true, required: true },
    actionType: { type: String, enum: ['call', 'visit', 'message', 'other'], default: 'call' },
    nextFollowUpAt: { type: Date, default: null, index: true },
    createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    history: {
      type: [
        {
          note: { type: String, trim: true, default: '' },
          actionType: { type: String, enum: ['call', 'visit', 'message', 'other'], default: 'call' },
          nextFollowUpAt: { type: Date, default: null },
          changedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
          changedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

customerFollowUpSchema.index({ companyId: 1, customerId: 1, createdAt: -1 });
customerFollowUpSchema.index({ companyId: 1, nextFollowUpAt: 1 });

module.exports = mongoose.model('CustomerFollowUp', customerFollowUpSchema);
