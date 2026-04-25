const express = require('express');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const {
  listPlans,
  createPlan,
  updatePlan,
  listLicenses,
  lookupLicenseForCompanyForm,
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
  patchMySuperAdminOrgProfile,
} = require('../controllers/superAdminController');
const {
  listProducts: listCompanyProductsForSuper,
  createProduct: createCompanyProductForSuper,
  updateProduct: updateCompanyProductForSuper,
  deleteProduct: deleteCompanyProductForSuper,
} = require('../controllers/companyProductSuperAdminController');

const router = express.Router();

router.use(auth, authorizeRole('superadmin', 'mainsuperadmin'));

router.patch('/me/org-profile', patchMySuperAdminOrgProfile);
router.get('/dashboard', dashboard);
router.get('/plans', listPlans);
router.post('/plans', createPlan);
router.patch('/plans/:id', updatePlan);
router.get('/licenses', listLicenses);
router.get('/licenses/lookup', lookupLicenseForCompanyForm);
router.get('/licenses/:id', getLicense);
router.post('/licenses', createLicense);
router.patch('/licenses/:id', patchLicense);
router.get('/companies', listCompanies);
router.get('/products', listCompanyProductsForSuper);
router.post('/products', createCompanyProductForSuper);
router.put('/products/:id', updateCompanyProductForSuper);
router.delete('/products/:id', deleteCompanyProductForSuper);
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
