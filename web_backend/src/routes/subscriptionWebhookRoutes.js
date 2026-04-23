const express = require('express');
const { razorpayWebhook, paysharpWebhook } = require('../controllers/subscriptionWebhookController');

const router = express.Router();

router.post('/razorpay', razorpayWebhook);
router.post('/paysharp', paysharpWebhook);

module.exports = router;
