const mongoose = require('mongoose');

const emailSchema = new mongoose.Schema(
  {
    smtpHost: { type: String, default: '' },
    smtpPort: { type: Number, default: 587 },
    useTls: { type: Boolean, default: true },
    smtpUser: { type: String, default: '' },
    smtpPassword: { type: String, default: '' },
    fromEmail: { type: String, default: '' },
    fromName: { type: String, default: '' },
  },
  { _id: false },
);

const paysharpSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    merchantId: { type: String, default: '' },
    /** Dashboard API token (Bearer for Link Payment). Not webhookSecret. */
    apiKey: { type: String, default: '' },
    /** Inbound webhook verification only; never used as Bearer for Paysharp API. */
    webhookSecret: { type: String, default: '' },
    /** API host or full …/linkpayment URL from Paysharp dashboard (sandbox vs live). */
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
    /** Stored encrypted via superadmin PATCH (prefix enc:v1:). */
    keySecret: { type: String, default: '' },
    webhookSecret: { type: String, default: '' },
  },
  { _id: false },
);

const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'default' },
    email: { type: emailSchema, default: () => ({}) },
    paysharp: { type: paysharpSchema, default: () => ({}) },
    paypal: { type: paypalSchema, default: () => ({}) },
    razorpay: { type: razorpaySchema, default: () => ({}) },
  },
  { timestamps: true },
);

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);
