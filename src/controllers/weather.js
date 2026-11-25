/**
 * The /api/weather handler as a plain function: query in, { status, body } out.
 * Keeping it free of Express makes it easy to unit-test with fake services.
 */
const MAX_ADDRESS_LENGTH = 100;

function parseCoordinate(value, limit) {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : NaN;
}

function createWeatherController({ geocode, forecast, reverseGeocode, logger = console }) {
  return async function handleWeather(query = {}) {
    const address = typeof query.address === "string" ? query.address.trim() : "";
    const lat = parseCoordinate(query.lat, 90);
    const lon = parseCoordinate(query.lon, 180);
    const hasCoords = lat !== null || lon !== null;
    // Optional display name for coordinates (e.g. picked from the search suggestions): skips reverse geocoding
    const name = typeof query.name === "string" ? query.name.trim().slice(0, MAX_ADDRESS_LENGTH) : "";

    if (!address && !hasCoords) {
      return { status: 400, body: { error: "請輸入要查詢的地點。" } };
    }
    if (address.length > MAX_ADDRESS_LENGTH) {
      return { status: 400, body: { error: `地點名稱請在 ${MAX_ADDRESS_LENGTH} 個字以內。` } };
    }
    if (hasCoords && (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon))) {
      return { status: 400, body: { error: "lat 和 lon 必須是有效的座標。" } };
    }

    try {
      let place;
      let weather;
      if (hasCoords) {
        // Name lookup and forecast don't depend on each other, so run them in parallel.
        const fallback = { location: "地圖選取位置", country: null, region: null };
        const known = name ? { location: name, country: null, region: null } : null;
        const [label, wx] = await Promise.all([
          known || (reverseGeocode ? reverseGeocode(lat, lon) : fallback),
          forecast(lat, lon),
        ]);
        place = { latitude: lat, longitude: lon, ...label };
        weather = wx;
      } else {
        place = await geocode(address);
        weather = await forecast(place.latitude, place.longitude);
      }

      return {
        status: 200,
        body: {
          location: place.location,
          country: place.country,
          region: place.region,
          query: address || `${lat},${lon}`,
          ...weather,
          point: { latitude: place.latitude, longitude: place.longitude },
        },
      };
    } catch (err) {
      const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
      if (status >= 500) logger.error("[weather]", err.message, err.cause ? `(${err.cause.message})` : "");
      const message = status === 500 && !err.status ? "發生錯誤，請稍後再試。" : err.message;
      return { status, body: { error: message } };
    }
  };
}

module.exports = { createWeatherController };
