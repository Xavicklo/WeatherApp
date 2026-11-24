const { getJson } = require("../lib/http");

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
    this.status = 404;
  }
}

/**
 * Open-Meteo's geocoder matches on the place name only, so "Paris, France"
 * finds nothing. Search by the first part, then use the rest
 * ("France", "Texas"...) to choose between candidates.
 */
function parseQuery(address) {
  const parts = String(address)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return { name: parts[0] || "", hints: parts.slice(1).map((h) => h.toLowerCase()) };
}

function pickBest(results, hints) {
  if (!hints.length) return results[0];
  const matches = (r) =>
    hints.every((hint) =>
      [r.country, r.country_code, r.admin1, r.admin2]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(hint))
    );
  return results.find(matches) || results[0];
}

function formatPlace(r) {
  return [r.name, r.admin1 !== r.name ? r.admin1 : null, r.country].filter(Boolean).join(", ");
}

function createGeocoder({ fetchImpl, cache, language = "en" } = {}) {
  return async function geocode(address) {
    const { name, hints } = parseQuery(address);
    if (name.length < 2) {
      throw new NotFoundError("請至少輸入 2 個字。");
    }

    const cacheKey = `geo:${language}:${name.toLowerCase()}|${hints.join("|")}`;
    const cached = cache && cache.get(cacheKey);
    if (cached) return cached;

    const url = `${GEOCODE_URL}?name=${encodeURIComponent(name)}&count=10&language=${language}&format=json`;
    const body = await getJson(url, { fetchImpl });

    if (!body.results || body.results.length === 0) {
      throw new NotFoundError(`找不到「${address}」，請換個地名試試（英文地名較準確，例如 Taipei）。`);
    }

    const best = pickBest(body.results, hints);
    const place = {
      latitude: best.latitude,
      longitude: best.longitude,
      location: formatPlace(best),
      country: best.country || null,
      countryCode: best.country_code || null,
      region: best.admin1 || null,
      timezone: best.timezone || null,
    };
    if (cache) cache.set(cacheKey, place);
    return place;
  };
}

module.exports = { createGeocoder, parseQuery, pickBest, formatPlace, NotFoundError };
