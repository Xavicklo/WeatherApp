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

    if (!address && !hasCoords) {
      return { status: 400, body: { error: "Please provide a location to search." } };
    }
    if (address.length > MAX_ADDRESS_LENGTH) {
      return { status: 400, body: { error: `Location must be under ${MAX_ADDRESS_LENGTH} characters.` } };
    }
    if (hasCoords && (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon))) {
      return { status: 400, body: { error: "lat and lon must be valid coordinates." } };
    }

    try {
      let place;
      let weather;
      if (hasCoords) {
        // Name lookup and forecast don't depend on each other, so run them in parallel.
        const fallback = { location: "Selected location", country: null, region: null };
        const [name, wx] = await Promise.all([
          reverseGeocode ? reverseGeocode(lat, lon) : fallback,
          forecast(lat, lon),
        ]);
        place = { latitude: lat, longitude: lon, ...name };
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
      const message = status === 500 ? "Something went wrong. Please try again." : err.message;
      return { status, body: { error: message } };
    }
  };
}

module.exports = { createWeatherController };
