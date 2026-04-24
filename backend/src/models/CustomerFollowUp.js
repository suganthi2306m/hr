const mongoose = require('mongoose');

const customerFollowUpSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    note: { type: String, trim: true, required: true },
    actionType: { type: String, enum: ['call', 'visit', 'message', 'other'], default: 'call' },
    nextFollowUpAt: { type: Date, default: null, index: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedToUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'followupCustomer' },
);

customerFollowUpSchema.index({ businessId: 1, customerId: 1, createdAt: -1 });
customerFollowUpSchema.index({ businessId: 1, assignedToUserId: 1, createdAt: -1 });

module.exports = mongoose.model('CustomerFollowUp', customerFollowUpSchema, 'followupCustomer');
