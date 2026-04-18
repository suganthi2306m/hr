const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const User = require('../models/User');
const socketHub = require('../services/socketHub');

function allowSocketOrigin(origin) {
  if (!origin) return true;
  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
    return true;
  }
  const allowed = [
    'https://ehrms.askeva.net',
    'http://ehrms.askeva.net',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
  ];
  return allowed.includes(origin);
}

/**
 * @param {import('http').Server} httpServer
 */
function attachSocketIO(httpServer) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: (origin, callback) => {
        callback(null, allowSocketOrigin(origin));
      },
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const raw =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
        '';
      const token = String(raw).replace(/^"|"$/g, '').trim();
      if (!token) {
        return next(new Error('Unauthorized'));
      }
      const secret = process.env.JWT_SECRET || 'secret';
      const decoded = jwt.verify(token, secret);
      const user = await User.findById(decoded.id).select('companyId').lean();
      if (!user) {
        return next(new Error('Unauthorized'));
      }
      const cid = user.companyId;
      socket.userId = String(user._id);
      socket.companyId = cid ? String(cid) : null;
      return next();
    } catch (e) {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.companyId) {
      socket.join(`company:${socket.companyId}`);
    }
  });

  socketHub.setIo(io);
  return io;
}

module.exports = { attachSocketIO };
