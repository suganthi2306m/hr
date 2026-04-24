const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  listHomeProducts,
  listCatalogProducts,
  getProductById,
} = require('../controllers/companyProductController');

const router = express.Router();

router.get('/home', protect, listHomeProducts);
router.get('/', protect, listCatalogProducts);
router.get('/:id', protect, getProductById);

module.exports = router;
