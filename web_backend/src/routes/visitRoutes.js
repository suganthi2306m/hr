const express = require('express');
const { checkIn, checkOut, activeVisits, agentRoute } = require('../controllers/visitController');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');

const router = express.Router();

// Mobile app writes (secured by x-mobile-key if MOBILE_INGEST_KEY is configured)
router.post('/checkin', checkIn);
router.post('/checkout', checkOut);

// Dashboard/admin reads
router.get('/active', auth, authorizeRole('admin'), activeVisits);
router.get('/route', auth, authorizeRole('admin'), agentRoute);

module.exports = router;
