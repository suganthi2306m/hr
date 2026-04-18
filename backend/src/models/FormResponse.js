const mongoose = require('mongoose');

const formResponseSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', index: true, required: true },
  },
  {
    timestamps: true,
    strict: false,
    collection: 'formresponses',
  }
);

module.exports = mongoose.model('FormResponse', formResponseSchema);
