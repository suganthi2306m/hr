const { Server } = require('socket.io');
const {
  parseCorsOrigins,
  isDevLocalFrontendOrigin,
  isAllowedVercelProjectOrigin,
} = require('../utils/corsAllowlist');

function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        const list = parseCorsOrigins();
        if (list.includes(origin)) return callback(null, true);
        if (isAllowedVercelProjectOrigin(origin)) return callback(null, true);
        if (isDevLocalFrontendOrigin(origin)) return callback(null, true);
        return callback(null, false);
      },
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

module.exports = initSocketServer;
