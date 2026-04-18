const express = require('express');
const router = express.Router();
const { protect } = require('../../src/middleware/authMiddleware');
const controller = require('./trackingController');

router.post('/presence/store', protect, controller.storePresenceTracking);
router.get('/presence/status', protect, controller.getPresenceTrackingStatus);
router.get('/presence', protect, controller.getPresenceTrackingData);

router.post('/store', protect, controller.storeTracking);
router.get('/data', protect, controller.getTrackingData);
router.post('/exit', protect, controller.exitTracking);
router.post('/restart', protect, controller.restartTracking);
router.post('/arrived', protect, controller.arrivedTracking);
router.post('/start', protect, controller.startTracking);

module.exports = router;
