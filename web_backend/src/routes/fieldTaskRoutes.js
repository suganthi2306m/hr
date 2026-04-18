const express = require('express');
const {
  listFieldTasks,
  createFieldTask,
  bulkCreateFieldTasks,
  verifyTaskOtp,
  updateFieldTask,
  deleteFieldTask,
  getFieldTaskDetails,
} = require('../controllers/fieldTaskController');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');

const router = express.Router();

router.get('/', auth, authorizeRole('admin'), listFieldTasks);
router.post('/bulk', auth, authorizeRole('admin'), bulkCreateFieldTasks);
router.get('/:id/details', auth, authorizeRole('admin'), getFieldTaskDetails);
router.post('/:id/verify-otp', auth, authorizeRole('admin'), verifyTaskOtp);
router.post('/', auth, authorizeRole('admin'), createFieldTask);
router.put('/:id', auth, authorizeRole('admin'), updateFieldTask);
router.delete('/:id', auth, authorizeRole('admin'), deleteFieldTask);

module.exports = router;
