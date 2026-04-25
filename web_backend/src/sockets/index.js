const { Server } = require('socket.io');
const {
  normalizeBrowserOrigin,
  parseCorsOrigins,
  isLocalhostDevFrontendOrigin,
  isAllowedVercelProjectOrigin,
} = require('../utils/corsAllowlist');

function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        const list = parseCorsOrigins();
        const norm = normalizeBrowserOrigin(origin);
        if (list.includes(origin) || list.includes(norm)) return callback(null, true);
        if (isAllowedVercelProjectOrigin(origin)) return callback(null, true);
        if (isLocalhostDevFrontendOrigin(origin)) return callback(null, true);
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
