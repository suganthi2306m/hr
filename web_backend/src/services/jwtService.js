const jwt = require('jsonwebtoken');

function signToken(admin) {
  return jwt.sign(
    {
      sub: admin._id.toString(),
      role: admin.role,
    },
    process.env.JWT_SECRET || 'livetrack-secret',
    { expiresIn: '1d' },
  );
}

module.exports = { signToken };
