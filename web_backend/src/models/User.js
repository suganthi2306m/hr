const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    branchId: { type: String, trim: true, default: '' },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, select: false },
    phone: { type: String, trim: true },
    /** Dashboard hierarchy: admin | manager | field_agent (legacy: field_user → field_agent) */
    role: { type: String, default: 'field_agent' },
    permissions: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    kycStatus: { type: String, trim: true, default: '' },
    kycNotes: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('User', userSchema);
