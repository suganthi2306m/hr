const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  login,
  me,
  changePassword,
  requestPasswordOtp,
  resetPasswordWithOtp,
} = require('../controllers/authController');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');

const router = express.Router();

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password reset attempts. Try again later.' },
});

router.post('/login', login);
router.post('/forgot-password/request-otp', forgotLimiter, requestPasswordOtp);
router.post('/forgot-password/reset', forgotLimiter, resetPasswordWithOtp);
/** Tenant admins and all super-admin variants need profile + password routes. */
router.get('/me', auth, authorizeRole('admin', 'superadmin', 'mainsuperadmin'), me);
router.put('/change-password', auth, authorizeRole('admin', 'superadmin', 'mainsuperadmin'), changePassword);

module.exports = router;
