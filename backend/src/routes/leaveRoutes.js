const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  applyLeave,
  getLeaveStatus,
  updateLeaveStatus,
} = require('../controllers/leaveController');

const router = express.Router();

router.post('/apply', protect, applyLeave);
router.get('/status', protect, getLeaveStatus);
router.patch('/:id/status', protect, updateLeaveStatus);

module.exports = router;
