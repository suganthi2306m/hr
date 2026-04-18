const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  createCustomer,
  getAllCustomers,
  getNearbyCustomers,
  getCustomerById,
  updateCustomer,
} = require('../controllers/customerController');
const router = express.Router();

router.get('/', protect, getAllCustomers);
// Must be before /:id or "nearby" is captured as an ObjectId param.
router.get('/nearby', protect, getNearbyCustomers);
router.get('/:id', protect, getCustomerById);
router.post('/', protect, createCustomer);
router.patch('/:id', protect, updateCustomer);
router.put('/:id', protect, updateCustomer);

module.exports = router;