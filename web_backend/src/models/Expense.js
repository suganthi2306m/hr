const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    category: { type: String, trim: true, default: 'general' },
    amount: { type: Number, required: true },
    currency: { type: String, trim: true, default: 'INR' },
    paymentMethod: { type: String, enum: ['cash', 'digital', 'other'], default: 'digital' },
    notes: { type: String, trim: true, default: '' },
    collectionForCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Expense', expenseSchema);
