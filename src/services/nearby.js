const { getJson } = require("../lib/http");
const { describe, kind } = require("../lib/wmo");

/**
 * Current weather around a point: the point itself plus two rings of
 * sample points, returned as a GeoJSON FeatureCollection so the map can
 * draw an animated icon on each. Open-Meteo accepts comma-separated
 * coordinates, so all points cost ONE upstream request.
 */
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const KM_PER_DEG_LAT = 111.32;

// [ring radius in km, number of points on the ring]
const RINGS = [
  [5, 6],
  [12, 8],
];

/** Points around (lat, lon). Bearings are offset per ring so the rings don't line up. */
function samplePoints(lat, lon, rings = RINGS) {
  const points = [{ lat, lon, ring: 0, bearing: null }];
  rings.forEach(([km, count], r) => {
    for (let i = 0; i < count; i++) {
      const bearing = (360 / count) * i + (r % 2 ? 180 / count : 0);
      const rad = (bearing * Math.PI) / 180;
      const dLat = (km * Math.cos(rad)) / KM_PER_DEG_LAT;
      const dLon = (km * Math.sin(rad)) / (KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
      points.push({
        lat: round(lat + dLat),
        lon: round(wrapLon(lon + dLon)),
        ring: r + 1,
        bearing: Math.round(bearing),
      });
    }
  });
  return points;
}

const round = (n) => Math.round(n * 10000) / 10000;
const wrapLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

function toFeatureCollection(points, bodies) {
  const list = Array.isArray(bodies) ? bodies : [bodies];
  return {
    type: "FeatureCollection",
    features: points.map((p, i) => {
      const current = (list[i] && list[i].current) || {};
      const isDay = current.is_day !== 0;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] }, // GeoJSON order: [lon, lat]
        properties: {
          ring: p.ring,
          bearing: p.bearing,
          temperature: current.temperature_2m == null ? null : Math.round(current.temperature_2m * 10) / 10,
          precipitation: current.precipitation == null ? null : current.precipitation,
          isDay,
          kind: kind(current.weather_code, isDay),
          ...describe(current.weather_code, isDay),
        },
      };
    }),
  };
}

function createNearby({ fetchImpl, cache } = {}) {
  return async function nearby(lat, lon) {
    const key = `nearby:${lat.toFixed(2)},${lon.toFixed(2)}`;
    const cached = cache && cache.get(key);
    if (cached) return cached;

    const points = samplePoints(lat, lon);
    const params = new URLSearchParams({
      latitude: points.map((p) => p.lat).join(","),
      longitude: points.map((p) => p.lon).join(","),
      current: "temperature_2m,weather_code,is_day,precipitation",
      timezone: "auto",
    });
    const body = await getJson(`${FORECAST_URL}?${params}`, { fetchImpl });
    const geojson = toFeatureCollection(points, body);
    if (cache) cache.set(key, geojson);
    return geojson;
  };
}

module.exports = { createNearby, samplePoints, toFeatureCollection, RINGS };
