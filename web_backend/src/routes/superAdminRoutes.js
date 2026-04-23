const express = require('express');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const {
  listPlans,
  createPlan,
  updatePlan,
  listLicenses,
  getLicense,
  createLicense,
  patchLicense,
  listCompanies,
  getCompany,
  createCompany,
  updateCompany,
  getIntegrations,
  patchIntegrations,
  listPayments,
  dashboard,
  listSuperAdmins,
  createSuperAdmin,
  getPartnerSuperAdminPortfolio,
  patchSuperAdmin,
} = require('../controllers/superAdminController');

const router = express.Router();

router.use(auth, authorizeRole('superadmin', 'mainsuperadmin'));

router.get('/dashboard', dashboard);
router.get('/plans', listPlans);
router.post('/plans', createPlan);
router.patch('/plans/:id', updatePlan);
router.get('/licenses', listLicenses);
router.get('/licenses/:id', getLicense);
router.post('/licenses', createLicense);
router.patch('/licenses/:id', patchLicense);
router.get('/companies', listCompanies);
router.get('/companies/:id', getCompany);
router.post('/companies', createCompany);
router.patch('/companies/:id', updateCompany);
router.get('/integrations', getIntegrations);
router.patch('/integrations', patchIntegrations);
router.get('/payments', listPayments);
router.get('/partners/superadmins', listSuperAdmins);
router.post('/partners/superadmins', createSuperAdmin);
router.get('/partners/superadmins/:id/portfolio', getPartnerSuperAdminPortfolio);
router.patch('/partners/superadmins/:id', patchSuperAdmin);

module.exports = router;
