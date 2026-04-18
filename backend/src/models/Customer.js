const mongoose = require('mongoose');

// Align with customers collection / Customer.model.ts: businessId, addedBy, customerName, etc.
const customerSchema = new mongoose.Schema(
  {
    customerName: { type: String, required: true, trim: true },
    customerNumber: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true },
    address: { type: String, required: true, trim: true },
    emailId: { type: String, required: true, lowercase: true, trim: true },
    city: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    countryCode: { type: String, trim: true },
    email: { type: String }, // alias
    status: {
      type: String,
      enum: ['Not yet Started', 'Pending', 'In progress', 'Serving Today', 'Delayed Tasks', 'Completed Tasks', 'Reopened', 'Rejected', 'Hold'],
      default: 'Not yet Started'
    },
    completedDate: { type: Date },
    expectedCompletionDate: { type: Date },
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    source: { type: String, default: 'web' },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /**
     * Optional assigned user ids (e.g. CRM ownership). Nearby / company-visit auto check-in
     * uses company scope only; this list does not restrict those flows.
     */
    usersIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: undefined,
    },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    /** Customer site coordinates for company-visit / nearby detection (optional until set in admin). */
    geoLocation: {
      lat: { type: Number },
      lng: { type: Number },
    },
  },
  { timestamps: true }
);

customerSchema.index({ businessId: 1 });
customerSchema.index({ customerNumber: 1, businessId: 1 }, { unique: true });
customerSchema.index({ emailId: 1, businessId: 1 });
customerSchema.index({ addedBy: 1 });
customerSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Customer', customerSchema);
