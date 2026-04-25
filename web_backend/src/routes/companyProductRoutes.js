const express = require('express');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const { listProducts } = require('../controllers/companyProductController');

const router = express.Router();

/** Company admins: read-only catalog (managed by super admin). */
router.get('/', auth, authorizeRole('admin'), listProducts);

module.exports = router;
