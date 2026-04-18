function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in kilometres */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Nearest-neighbor ordering for multi-stop routes (returns indices) */
function orderStopsNearestNeighbor(points) {
  if (!points?.length) return [];
  const valid = points.map((p, i) => ({ i, lat: Number(p.lat), lng: Number(p.lng) })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!valid.length) return [];
  const remaining = [...valid];
  const order = [];
  let cur = remaining.shift();
  order.push(cur.i);
  while (remaining.length) {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let j = 0; j < remaining.length; j += 1) {
      const d = haversineKm(cur.lat, cur.lng, remaining[j].lat, remaining[j].lng);
      if (d < bestD) {
        bestD = d;
        bestIdx = j;
      }
    }
    cur = remaining.splice(bestIdx, 1)[0];
    order.push(cur.i);
  }
  return order;
}

function totalRouteKm(orderedPoints) {
  let sum = 0;
  for (let i = 1; i < orderedPoints.length; i += 1) {
    const a = orderedPoints[i - 1];
    const b = orderedPoints[i];
    if (
      Number.isFinite(a.lat) &&
      Number.isFinite(a.lng) &&
      Number.isFinite(b.lat) &&
      Number.isFinite(b.lng)
    ) {
      sum += haversineKm(a.lat, a.lng, b.lat, b.lng);
    }
  }
  return Math.round(sum * 1000) / 1000;
}

module.exports = { haversineKm, orderStopsNearestNeighbor, totalRouteKm };
