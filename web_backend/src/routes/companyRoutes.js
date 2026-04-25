const express = require('express');
const { getCompany, upsertCompany, getProvisioningPartnerContact } = require('../controllers/companyController');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');

const router = express.Router();

router.get('/', auth, authorizeRole('admin'), getCompany);
router.get('/provisioning-partner', auth, authorizeRole('admin'), getProvisioningPartnerContact);
router.post('/', auth, authorizeRole('admin'), upsertCompany);
router.put('/', auth, authorizeRole('admin'), upsertCompany);

module.exports = router;
