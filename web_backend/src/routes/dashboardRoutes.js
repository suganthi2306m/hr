const express = require('express');
const { dashboardSummary } = require('../controllers/dashboardController');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');

const router = express.Router();

router.get('/summary', auth, authorizeRole('admin'), dashboardSummary);

module.exports = router;
