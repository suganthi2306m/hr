const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
