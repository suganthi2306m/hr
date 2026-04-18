const express = require('express');
const { ingestLocation, latestLocations, userHistory, userRoute } = require('../controllers/locationController');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');

const router = express.Router();

router.post('/ingest', ingestLocation);
router.get('/latest', auth, authorizeRole('admin'), latestLocations);
router.get('/history/:userId', auth, authorizeRole('admin'), userHistory);
router.get('/route/:userId', auth, authorizeRole('admin'), userRoute);

module.exports = router;
