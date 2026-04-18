const mongoose = require('mongoose');
const Company = require('../models/Company');
const Expense = require('../models/Expense');

async function getCompanyIdForAdmin(adminId) {
  const company = await Company.findOne({ adminId }).select('_id');
  return company?._id || null;
}

async function listExpenses(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const items = await Expense.find({ companyId }).sort({ createdAt: -1 }).limit(300).lean();
    const totals = items.reduce(
      (acc, row) => {
        const k = row.paymentMethod || 'other';
        acc[k] = (acc[k] || 0) + Number(row.amount || 0);
        acc.all += Number(row.amount || 0);
        return acc;
      },
      { cash: 0, digital: 0, other: 0, all: 0 },
    );
    return res.json({ items, totals });
  } catch (e) {
    return next(e);
  }
}

async function createExpense(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const { amount, category, currency, paymentMethod, notes, userId, taskId, collectionForCustomerId } = req.body;
    if (amount == null || Number.isNaN(Number(amount))) {
      return res.status(400).json({ message: 'amount is required.' });
    }
    const item = await Expense.create({
      companyId,
      amount: Number(amount),
      category: category || 'general',
      currency: currency || 'INR',
      paymentMethod: ['cash', 'digital', 'other'].includes(paymentMethod) ? paymentMethod : 'digital',
      notes: notes || '',
      userId: userId && mongoose.Types.ObjectId.isValid(String(userId)) ? userId : undefined,
      taskId: taskId && mongoose.Types.ObjectId.isValid(String(taskId)) ? taskId : undefined,
      collectionForCustomerId:
        collectionForCustomerId && mongoose.Types.ObjectId.isValid(String(collectionForCustomerId))
          ? collectionForCustomerId
          : undefined,
    });
    return res.status(201).json({ item });
  } catch (e) {
    return next(e);
  }
}

async function deleteExpense(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    await Expense.findOneAndDelete({ _id: req.params.id, companyId });
    return res.status(204).send();
  } catch (e) {
    return next(e);
  }
}

module.exports = { listExpenses, createExpense, deleteExpense };
