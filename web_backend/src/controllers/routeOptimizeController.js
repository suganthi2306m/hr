const { orderStopsNearestNeighbor, totalRouteKm, haversineKm } = require('../utils/geo');

/**
 * POST body: { stops: [{ lat, lng, label? }], origin?: {lat,lng} }
 * Returns ordered stops + total km + rough ETA minutes (avg 25 km/h urban).
 */
function optimizeRoute(req, res) {
  const stops = Array.isArray(req.body.stops) ? req.body.stops : [];
  const origin = req.body.origin;
  let points = stops.map((s) => ({ lat: Number(s.lat), lng: Number(s.lng), label: s.label || '' }));
  if (origin && Number.isFinite(Number(origin.lat)) && Number.isFinite(Number(origin.lng))) {
    points = [{ lat: Number(origin.lat), lng: Number(origin.lng), label: 'origin' }, ...points];
  }
  const orderIdx = orderStopsNearestNeighbor(points);
  const ordered = orderIdx.map((i) => points[i]);
  const km = totalRouteKm(ordered);
  const etaMinutes = Math.round((km / 25) * 60);
  const legs = [];
  for (let i = 1; i < ordered.length; i += 1) {
    legs.push({
      from: ordered[i - 1].label || `stop-${i - 1}`,
      to: ordered[i].label || `stop-${i}`,
      km: Math.round(haversineKm(ordered[i - 1].lat, ordered[i - 1].lng, ordered[i].lat, ordered[i].lng) * 1000) / 1000,
    });
  }
  return res.json({
    orderedStops: ordered,
    totalKm: km,
    etaMinutesApprox: etaMinutes,
    legs,
    note: 'Heuristic order (nearest neighbor). Connect Google Directions API for driving ETA.',
  });
}

module.exports = { optimizeRoute };
