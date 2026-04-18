// Backend/src/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, required: true }, // e.g., "Admin", "Developer"
    phone: { type: String },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    hierarchyLevel: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    resetPasswordOTP: { type: String },
    resetPasswordOTPExpiry: { type: Date },
    // Login 2FA OTP fields
    loginOTP: { type: String },
    loginOTPExpiry: { type: Date },
    avatar: { type: String },
    fcmToken: { type: String },
    officeLocation: {
        latitude: Number,
        longitude: Number,
        address: String,
        radius: { type: Number, default: 100 }
    }
}, { timestamps: true });

// Prevent "" from being stored on ObjectId refs (clients sometimes send empty string).
// Mongoose 9 document hooks may not pass `next`; use a sync hook (no callback).
userSchema.pre('validate', function () {
    for (const key of ['branchId', 'companyId', 'roleId']) {
        const v = this.get(key);
        if (v === '' || (typeof v === 'string' && v.trim() === '')) {
            this.set(key, undefined);
        }
    }
});

// Encrypt password before saving
// Encrypt password before saving
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
    if (!enteredPassword || !this.password) {
        return false;
    }
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);