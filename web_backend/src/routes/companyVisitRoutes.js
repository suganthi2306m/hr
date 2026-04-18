const express = require('express');
const { listCompanyVisitsForOps, getCompanyVisitByIdForOps } = require('../controllers/companyVisitOpsController');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');

const router = express.Router();

/** Mobile / list: same filters as GET /api/ops/company-visits (date, dateFrom/dateTo, customerId, …) */
router.get('/', auth, authorizeRole('admin'), listCompanyVisitsForOps);
router.get('/company/:id', auth, authorizeRole('admin'), getCompanyVisitByIdForOps);
/** Dashboard Visits page — same handler as GET /api/ops/company-visits */
router.get('/company', auth, authorizeRole('admin'), listCompanyVisitsForOps);

module.exports = router;
