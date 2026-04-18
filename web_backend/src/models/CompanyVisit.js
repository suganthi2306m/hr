const mongoose = require('mongoose');

/**
 * Staff visits to a customer site (company visit), separate from HR attendance.
 * Collection name: companyVisits (shared with mobile app backend).
 */
const companyVisitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    companyName: { type: String, trim: true },
    customerName: { type: String, trim: true },
    checkInLatitude: { type: Number, required: true },
    checkInLongitude: { type: Number, required: true },
    checkInTime: { type: Date, required: true, index: true },
    visitDate: { type: Date, required: true, index: true },
    checkOutLatitude: { type: Number },
    checkOutLongitude: { type: Number },
    checkOutTime: { type: Date, index: true },
    durationMinutes: { type: Number },
    status: {
      type: String,
      enum: ['open', 'completed'],
      default: 'open',
      index: true,
    },
    source: { type: String, default: 'smart_visit_sync', trim: true },
  },
  { timestamps: true, collection: 'companyVisits' },
);

companyVisitSchema.index({ userId: 1, status: 1 });
companyVisitSchema.index({ businessId: 1, visitDate: -1 });

module.exports = mongoose.model('CompanyVisit', companyVisitSchema);
