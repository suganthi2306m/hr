const express = require('express');
const {
  listCustomers,
  getCustomerById,
  getCustomerTimeline,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  nearbyCustomers,
  listCustomerFollowUps,
  addCustomerFollowUp,
} = require('../controllers/customerController');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');

const router = express.Router();

router.get('/', auth, authorizeRole('admin'), listCustomers);
router.get('/nearby', auth, authorizeRole('admin'), nearbyCustomers);
router.get('/:id/followups', auth, authorizeRole('admin'), listCustomerFollowUps);
router.post('/:id/followups', auth, authorizeRole('admin'), addCustomerFollowUp);
router.get('/:id/timeline', auth, authorizeRole('admin'), getCustomerTimeline);
router.get('/:id', auth, authorizeRole('admin'), getCustomerById);
router.post('/', auth, authorizeRole('admin'), createCustomer);
router.put('/:id', auth, authorizeRole('admin'), updateCustomer);
router.delete('/:id', auth, authorizeRole('admin'), deleteCustomer);

module.exports = router;
