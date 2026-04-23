const express = require('express');
const {
  getPlans,
  getCurrent,
  listMyPayments,
  getMyPayment,
  refreshMyPaymentStatus,
  initiatePaysharp,
  initiateRazorpay,
} = require('../controllers/subscriptionController');

const router = express.Router();

router.get('/plans', getPlans);
router.get('/current', getCurrent);
router.get('/payments', listMyPayments);
router.get('/payments/:id', getMyPayment);
router.post('/payments/:id/refresh', refreshMyPaymentStatus);
router.post('/initiate', initiatePaysharp);
router.post('/initiate-razorpay', initiateRazorpay);

module.exports = router;
