const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    customerName: { type: String, trim: true },
    customerNumber: { type: String, trim: true },
    companyName: { type: String, trim: true },
    emailId: { type: String, lowercase: true, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    pincode: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true },
    countryCode: { type: String, trim: true },
    /** @deprecated legacy web fields — migrated in pre('validate') */
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    location: { type: String, trim: true },
    tags: { type: [String], default: [] },
    notes: {
      type: [
        {
          text: { type: String, trim: true },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    attachments: {
      type: [
        {
          name: { type: String, trim: true },
          url: { type: String, trim: true },
          uploadedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    geoLocation: {
      lat: { type: Number },
      lng: { type: Number },
    },
    // GeoJSON point for geospatial queries (keeps legacy geoLocation untouched).
    geoPoint: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number], // [lng, lat]
      },
    },
    /** CRM segment for quick filters */
    segment: { type: String, enum: ['lead', 'active', 'inactive'], default: 'lead' },
    /** Operational lifecycle (separate from CRM segment) */
    customerStatus: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true },
);

/** Sync `pre('validate')` — do not use a `next` callback (not provided in Mongoose 9). */
customerSchema.pre('validate', function syncFromLegacy() {
  if ((!this.customerName || !String(this.customerName).trim()) && this.name) {
    this.customerName = String(this.name).trim();
  }
  if ((!this.customerNumber || !String(this.customerNumber).trim()) && this.phone) {
    this.customerNumber = String(this.phone).replace(/\D/g, '');
  }
  if ((!this.address || !String(this.address).trim()) && this.location) {
    this.address = String(this.location).trim();
  }
  if (
    this.geoLocation &&
    typeof this.geoLocation.lat === 'number' &&
    typeof this.geoLocation.lng === 'number'
  ) {
    this.geoPoint = {
      type: 'Point',
      coordinates: [Number(this.geoLocation.lng), Number(this.geoLocation.lat)],
    };
  }
});

customerSchema.index({ companyId: 1, customerNumber: 1 }, { unique: true });
customerSchema.index({ geoPoint: '2dsphere' });

module.exports = mongoose.model('Customer', customerSchema);
