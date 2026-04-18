const mongoose = require('mongoose');

const taskDetailsSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', index: true, required: true },
  },
  {
    timestamps: true,
    strict: false,
    collection: 'task_details',
  }
);

module.exports = mongoose.model('TaskDetails', taskDetailsSchema);
/**
 * Compatibility layer:
 * TaskDetails model now proxies to tasks collection so the app/backend can
 * keep existing calls while data is stored only in "tasks".
 */
const Task = require('./Task');

module.exports = {
  findOne(query = {}) {
    if (query.taskId) {
      return Task.findById(query.taskId);
    }
    return Task.findOne(query);
  },

  findOneAndUpdate(query = {}, update = {}, options = {}) {
    const taskMongoId = query.taskId || query._id;
    if (!taskMongoId) {
      return Task.findOneAndUpdate(query, update, options);
    }

    // Never overwrite human-readable taskId (TASK-XXXX) with ObjectId.
    if (update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'taskId')) {
      delete update.$set.taskId;
    }
    if (update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'taskMongoId')) {
      delete update.$set.taskMongoId;
    }

    return Task.findByIdAndUpdate(taskMongoId, update, {
      new: options.new ?? true,
      upsert: false,
      runValidators: false,
    });
  },
};
