const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];

            // Sanitize token: Remove any surrounding quotes
            const rawToken = token;
            if (token.startsWith('"') || token.endsWith('"')) {
                token = token.replace(/^"|"$/g, '');
                console.log('DEBUG: AuthMiddleware - Token had quotes, sanitized');
            }

            console.log('DEBUG: AuthMiddleware - Raw token length:', rawToken.length);
            console.log('DEBUG: AuthMiddleware - Sanitized token length:', token.length);
            console.log('DEBUG: AuthMiddleware - Token preview:', token.substring(0, 20) + '...');

            // Ensure Secret matches Controller
            const secret = process.env.JWT_SECRET || 'secret';
            console.log('DEBUG: AuthMiddleware - Using secret source:', process.env.JWT_SECRET ? 'ENV' : 'DEFAULT');

            // Verify token
            console.log('DEBUG: AuthMiddleware - Verifying token...');
            const decoded = jwt.verify(token, secret);
            console.log('DEBUG: AuthMiddleware - Token decoded. ID:', decoded.id);

            // User-only auth flow.
            const user = await User.findById(decoded.id).select('-password');
            if (!user) {
                console.error('Auth Middleware: User not found for ID:', decoded.id);
                return res.status(401).json({ message: 'Not authorized, user not found' });
            }

            // Attach to req
            req.user = user;
            req.staff = null;
            req.companyId = user?.companyId;

            next();
        } catch (error) {
            console.error('Auth Middleware Verification Error:', error.message);
            // More descriptive error
            let msg = 'Not authorized, token failed';
            if (error.name === 'TokenExpiredError') {
                msg = 'Session expired, please login again';
            }
            res.status(401).json({ message: msg, error: error.message });
        }
    } else {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

module.exports = { protect };