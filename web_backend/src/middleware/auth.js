const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

async function auth(req, _res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      const error = new Error('Authentication required');
      error.status = 401;
      throw error;
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET || 'livetrack-secret');
    const admin = await Admin.findById(payload.sub).select('-password');
    if (!admin) {
      const error = new Error('Invalid token');
      error.status = 401;
      throw error;
    }
    if (admin.isActive === false) {
      const error = new Error('Account is inactive. Please contact support.');
      error.status = 403;
      throw error;
    }

    req.admin = admin;
    next();
  } catch (error) {
    error.status = 401;
    next(error);
  }
}

module.exports = auth;
