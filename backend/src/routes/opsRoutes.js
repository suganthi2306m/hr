const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  listOpsNotifications,
  markOpsNotificationRead,
} = require('../controllers/opsNotificationController');
const { listCompanyVisitsForOps } = require('../controllers/companyVisitController');

const router = express.Router();

router.get('/notifications', protect, listOpsNotifications);
router.patch('/notifications/:id/read', protect, markOpsNotificationRead);
router.get('/company-visits', protect, listCompanyVisitsForOps);

module.exports = router;
