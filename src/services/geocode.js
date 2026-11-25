const { getJson } = require("../lib/http");

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
// Open-Meteo knows few Chinese district names (e.g. 土城, 中山區), so Chinese queries go to
// OpenStreetMap Nominatim first, and each geocoder is the other's fallback.
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "WeatherApp-demo/2.0 (https://github.com/Xavicklo/WeatherApp)";
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

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

/** Nominatim search result -> our place shape ("土城區, 新北市, 臺灣"). */
function fromNominatim(r) {
  const a = r.address || {};
  // "土城" often matches the MRT station; show its district ("土城區") instead.
  const district = [a.suburb, a.city_district, a.town].find((x) => x && r.name && x.startsWith(r.name));
  const local = district || r.name || a.suburb || a.city_district || a.town || a.city || a.county;
  const region = [a.city, a.county, a.state].find((x) => x && x !== local) || null;
  return {
    latitude: Number(r.lat),
    longitude: Number(r.lon),
    location: [local, region, a.country].filter(Boolean).join(", "),
    country: a.country || null,
    countryCode: a.country_code ? a.country_code.toUpperCase() : null,
    region,
    timezone: null,
  };
}

function fromOpenMeteo(best) {
  return {
    latitude: best.latitude,
    longitude: best.longitude,
    location: formatPlace(best),
    country: best.country || null,
    countryCode: best.country_code || null,
    region: best.admin1 || null,
    timezone: best.timezone || null,
  };
}

function createGeocoder({ fetchImpl, cache, language = "en" } = {}) {
  async function openMeteo(name, hints) {
    const url = `${GEOCODE_URL}?name=${encodeURIComponent(name)}&count=10&language=${language}&format=json`;
    const body = await getJson(url, { fetchImpl });
    return body.results && body.results.length ? fromOpenMeteo(pickBest(body.results, hints)) : null;
  }

  /** Nominatim, trying Taiwan first for Chinese names; never throws (it is a helper source). */
  async function nominatim(address, preferTaiwan) {
    const search = async (countrycodes) => {
      const params = new URLSearchParams({ q: address, format: "jsonv2", limit: "1", addressdetails: "1", "accept-language": "zh-TW" });
      if (countrycodes) params.set("countrycodes", countrycodes);
      const body = await getJson(`${NOMINATIM_SEARCH_URL}?${params}`, {
        fetchImpl,
        timeoutMs: 5000,
        headers: { "User-Agent": USER_AGENT },
      });
      return Array.isArray(body) && body.length ? fromNominatim(body[0]) : null;
    };
    try {
      return (preferTaiwan && (await search("tw"))) || (await search(null));
    } catch {
      return null;
    }
  }

  return async function geocode(address) {
    const { name, hints } = parseQuery(address);
    const chinese = CJK.test(name);
    if (name.length < (chinese ? 1 : 2)) {
      throw new NotFoundError("請至少輸入 2 個字。");
    }

    const cacheKey = `geo:${language}:${name.toLowerCase()}|${hints.join("|")}`;
    const cached = cache && cache.get(cacheKey);
    if (cached) return cached;

    const place = chinese
      ? (await nominatim(address, !hints.length)) || (await openMeteo(name, hints))
      : (await openMeteo(name, hints)) || (await nominatim(address, false));

    if (!place) {
      throw new NotFoundError(`找不到「${address}」，請換個地名試試，例如「土城區」或 Taipei。`);
    }
    if (cache) cache.set(cacheKey, place);
    return place;
  };
}

module.exports = { createGeocoder, parseQuery, pickBest, formatPlace, fromNominatim, NotFoundError };
