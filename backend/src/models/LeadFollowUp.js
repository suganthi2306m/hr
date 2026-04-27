const mongoose = require('mongoose');

/**
 * Same collection as web_backend (`followupLead`). Read/write compatible with web admin CRM.
 * strict: false tolerates extra fields from web without schema updates.
 */
const leadFollowUpSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    note: { type: String, trim: true, default: '' },
    actionType: { type: String, enum: ['call', 'visit', 'message', 'other'], default: 'call' },
    nextFollowUpAt: { type: Date, default: null },
    statusAfter: { type: String, default: null },
    createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedToUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    history: { type: Array, default: [] },
  },
  { timestamps: true, strict: false },
);

module.exports = mongoose.model('LeadFollowUp', leadFollowUpSchema, 'followupLead');
