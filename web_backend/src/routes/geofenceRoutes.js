const express = require('express');
const {
  listGeoFences,
  createGeoFence,
  updateGeoFence,
  deleteGeoFence,
} = require('../controllers/geofenceController');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');

const router = express.Router();

router.get('/', auth, authorizeRole('admin'), listGeoFences);
router.post('/', auth, authorizeRole('admin'), createGeoFence);
router.put('/:id', auth, authorizeRole('admin'), updateGeoFence);
router.delete('/:id', auth, authorizeRole('admin'), deleteGeoFence);

module.exports = router;
