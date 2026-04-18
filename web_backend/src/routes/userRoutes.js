const express = require('express');
const { listUsers, createUser, updateUser, deleteUser } = require('../controllers/userController');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');

const router = express.Router();

router.get('/', auth, authorizeRole('admin'), listUsers);
router.post('/', auth, authorizeRole('admin'), createUser);
router.put('/:id', auth, authorizeRole('admin'), updateUser);
router.delete('/:id', auth, authorizeRole('admin'), deleteUser);

module.exports = router;
