const mongoose = require('mongoose');

const fieldTaskSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    assignedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    location: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending',
    },
  },
  { timestamps: true },
);

fieldTaskSchema.index({ adminId: 1, assignedUser: 1, status: 1 });

module.exports = mongoose.model('FieldTask', fieldTaskSchema);
