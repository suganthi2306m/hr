const express = require('express');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../controllers/companyProductController');

const router = express.Router();

router.get('/', auth, authorizeRole('admin'), listProducts);
router.post('/', auth, authorizeRole('admin'), createProduct);
router.put('/:id', auth, authorizeRole('admin'), updateProduct);
router.delete('/:id', auth, authorizeRole('admin'), deleteProduct);

module.exports = router;
