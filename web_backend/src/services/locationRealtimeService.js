const Location = require('../models/Location');
const { getLatestLocations, resolveUserIdFromLocation } = require('./locationService');

let changeStream;

async function emitLatestForUser(io, userId) {
  if (!userId) return;
  const latest = await getLatestLocations({ userId, limit: 100 });
  const entry = latest.find((item) => String(item.userId) === String(userId));
  if (entry) {
    io.emit('location:update', entry);
  }
}

function startLocationRealtime(io) {
  if (!io || changeStream) return;

  try {
    changeStream = Location.watch([], { fullDocument: 'updateLookup' });
    changeStream.on('change', async (change) => {
      try {
        if (!['insert', 'update', 'replace'].includes(change.operationType)) return;
        const userId = resolveUserIdFromLocation(change.fullDocument || {});
        await emitLatestForUser(io, userId);
      } catch (error) {
        console.error('[location-stream] emit error:', error.message);
      }
    });
    changeStream.on('error', (error) => {
      console.error('[location-stream] stream error:', error.message);
    });
    console.log('[location-stream] watching locations collection');
  } catch (error) {
    console.error('[location-stream] start failed:', error.message);
  }
}

module.exports = {
  startLocationRealtime,
};
