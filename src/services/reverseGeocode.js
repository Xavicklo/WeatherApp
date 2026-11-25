const { getJson } = require("../lib/http");

/**
 * Reverse geocoding: coordinates -> place name, via OpenStreetMap Nominatim.
 * Nominatim's usage policy asks for an identifying User-Agent and at most
 * 1 request/second, so results are cached and failures fall back to a
 * generic label instead of failing the whole weather request.
 */
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT = "WeatherApp-demo/2.0 (https://github.com/Xavicklo/WeatherApp)";

function formatAddress(body) {
  const a = (body && body.address) || {};
  const local = a.city || a.town || a.village || a.municipality || a.suburb || a.county || body.name;
  const parts = [local, a.state && a.state !== local ? a.state : null, a.country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function createReverseGeocoder({ fetchImpl, cache, language = "zh-TW" } = {}) {
  return async function reverseGeocode(latitude, longitude) {
    const lat = Number(latitude).toFixed(3);
    const lon = Number(longitude).toFixed(3);
    const cacheKey = `rev:${lat},${lon}`;
    const cached = cache && cache.get(cacheKey);
    if (cached) return cached;

    let place;
    try {
      const params = new URLSearchParams({ lat, lon, format: "jsonv2", zoom: "10", "accept-language": language });
      const body = await getJson(`${NOMINATIM_URL}?${params}`, {
        fetchImpl,
        timeoutMs: 4000,
        headers: { "User-Agent": USER_AGENT },
      });
      const a = body.address || {};
      place = {
        location: formatAddress(body) || "地圖選取位置",
        country: a.country || null,
        region: a.state || null,
      };
    } catch (err) {
      // Rate limit or outage: still show the weather, and don't cache the fallback.
      return { location: "地圖選取位置", country: null, region: null };
    }

    if (cache) cache.set(cacheKey, place);
    return place;
  };
}

module.exports = { createReverseGeocoder, formatAddress };
