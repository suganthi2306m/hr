const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const paysharpSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    merchantId: { type: String, default: '' },
    apiKey: { type: String, default: '' },
    webhookSecret: { type: String, default: '' },
    apiBaseUrl: { type: String, default: '', trim: true },
    useSandbox: { type: Boolean, default: false },
  },
  { _id: false },
);

const paypalSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    clientId: { type: String, default: '' },
    clientSecret: { type: String, default: '' },
    mode: { type: String, enum: ['sandbox', 'live'], default: 'sandbox' },
  },
  { _id: false },
);

const razorpaySchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    keyId: { type: String, default: '' },
    keySecret: { type: String, default: '' },
    webhookSecret: { type: String, default: '' },
  },
  { _id: false },
);

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    /** `admin` = tenant org owner; `superadmin` = partner operator; `mainsuperadmin` = platform root operator. */
    role: { type: String, enum: ['admin', 'superadmin', 'mainsuperadmin'], default: 'admin' },
    isActive: { type: Boolean, default: true },
    companySetupCompleted: { type: Boolean, default: false },
    /** For partner superadmins: who provisioned this account. */
    createdByMainSuperAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    /** Partner limits enforced when creating companies/licenses. Null = unlimited. */
    maxCompanies: { type: Number, default: null },
    maxLicenses: { type: Number, default: null },
    /**
     * Public-facing org/contact details for super admins (main or partner).
     * Shown to tenant companies (Our products → contact) and to platform main on partner detail.
     */
    superAdminOrgProfile: {
      companyName: { type: String, trim: true, default: '' },
      companyEmail: { type: String, trim: true, lowercase: true, default: '' },
      companyPhone: { type: String, trim: true, default: '' },
      /** Public company website (https recommended). Shown to tenant admins with partner contact. */
      companyWebsiteUrl: { type: String, trim: true, default: '' },
      description: { type: String, trim: true, default: '' },
      address: { type: String, trim: true, default: '' },
      supportEmail: { type: String, trim: true, lowercase: true, default: '' },
      contactPersonName: { type: String, trim: true, default: '' },
      altPhone: { type: String, trim: true, default: '' },
    },
    /**
     * Payment gateways for subscription checkout (Paysharp / Razorpay / PayPal).
     * Each super admin (main or partner) configures their own; tenant companies pay with
     * the credentials of whoever created the company (`Company.createdBySuperAdminId`).
     */
    paymentIntegrations: {
      paysharp: { type: paysharpSchema, default: () => ({}) },
      paypal: { type: paypalSchema, default: () => ({}) },
      razorpay: { type: razorpaySchema, default: () => ({}) },
    },
  },
  { timestamps: true },
);

adminSchema.pre('save', async function preSave() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

adminSchema.methods.comparePassword = function comparePassword(value) {
  return bcrypt.compare(value, this.password);
};

module.exports = mongoose.model('Admin', adminSchema);
