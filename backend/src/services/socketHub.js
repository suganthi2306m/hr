/** Holds Socket.IO server instance after HTTP server starts. */

let io = null;

function setIo(serverIo) {
  io = serverIo;
}

function getIo() {
  return io;
}

/**
 * Emit to all dashboard sockets joined for this company (room `company:<id>`).
 */
function emitToCompany(companyIdStr, event, payload) {
  if (!io || !companyIdStr) return;
  io.to(`company:${companyIdStr}`).emit(event, payload);
}

module.exports = {
  setIo,
  getIo,
  emitToCompany,
};
