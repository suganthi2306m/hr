const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const controller = require('../controllers/companyVisitController');

const router = express.Router();

/** Company-wide paginated list (web dashboard); must be registered before `GET /`. */
router.get('/company', protect, controller.listCompanyVisitsForOps);
router.get('/', protect, controller.listMine);
router.post('/checkin', protect, controller.checkIn);
router.post('/checkout', protect, controller.checkOut);

module.exports = router;
