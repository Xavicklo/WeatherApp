const { getJson } = require("../lib/http");
const { describe, kind } = require("../lib/wmo");

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const CURRENT = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "is_day",
  "precipitation",
  "weather_code",
  "surface_pressure",
  "wind_speed_10m",
  "wind_direction_10m",
];
const HOURLY = ["temperature_2m", "precipitation_probability", "weather_code", "visibility", "is_day"];
const DAILY = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_probability_max",
  "sunrise",
  "sunset",
  "uv_index_max",
];

const round = (n, digits = 0) => (n == null ? null : Number(Number(n).toFixed(digits)));

/** Index of the hourly slot for the current hour (hourly times look like "2026-11-24T19:00"). */
function currentHourIndex(hourlyTimes, currentTime) {
  const hourKey = String(currentTime).slice(0, 13); // "2026-11-24T19"
  const idx = hourlyTimes.findIndex((t) => t.slice(0, 13) >= hourKey);
  return idx === -1 ? 0 : idx;
}

/** Turn Open-Meteo's column-style arrays into a clean, UI-friendly shape. */
function normalize(body, hoursAhead = 24) {
  const c = body.current;
  const h = body.hourly;
  const d = body.daily;
  const start = currentHourIndex(h.time, c.time);
  const isDay = c.is_day === 1;

  const hourly = h.time.slice(start, start + hoursAhead).map((time, i) => {
    const j = start + i;
    return {
      time,
      temperature: round(h.temperature_2m[j], 1),
      precipitationProbability: h.precipitation_probability[j],
      ...describe(h.weather_code[j], !h.is_day || h.is_day[j] !== 0),
      kind: kind(h.weather_code[j], !h.is_day || h.is_day[j] !== 0),
    };
  });

  const daily = d.time.map((date, i) => ({
    date,
    max: round(d.temperature_2m_max[i], 1),
    min: round(d.temperature_2m_min[i], 1),
    precipitationProbability: d.precipitation_probability_max[i],
    sunrise: d.sunrise[i],
    sunset: d.sunset[i],
    uvIndex: round(d.uv_index_max[i], 1),
    ...describe(d.weather_code[i]),
    kind: kind(d.weather_code[i]),
  }));

  const visibilityM = h.visibility ? h.visibility[start] : null;

  return {
    current: {
      time: c.time,
      isDay,
      temperature: round(c.temperature_2m, 1),
      feelsLike: round(c.apparent_temperature, 1),
      humidity: c.relative_humidity_2m,
      precipitation: c.precipitation,
      pressure: round(c.surface_pressure),
      windSpeed: round(c.wind_speed_10m, 1),
      windDirection: c.wind_direction_10m,
      visibility: visibilityM == null ? null : round(visibilityM / 1000, 1),
      uvIndex: daily[0] ? daily[0].uvIndex : null,
      ...describe(c.weather_code, isDay),
      kind: kind(c.weather_code, isDay),
    },
    hourly,
    daily,
    timezone: body.timezone,
    latitude: body.latitude,
    longitude: body.longitude,
    units: { temperature: "°C", windSpeed: "km/h", pressure: "hPa", visibility: "km", precipitation: "mm" },
  };
}

function createForecaster({ fetchImpl, cache } = {}) {
  return async function forecast(latitude, longitude) {
    // Round to ~1 km so nearby lookups share a cache entry.
    const lat = Number(latitude).toFixed(2);
    const lon = Number(longitude).toFixed(2);
    const cacheKey = `wx:${lat},${lon}`;
    const cached = cache && cache.get(cacheKey);
    if (cached) return { ...cached, cached: true };

    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      current: CURRENT.join(","),
      hourly: HOURLY.join(","),
      daily: DAILY.join(","),
      timezone: "auto",
      forecast_days: "7",
    });
    const body = await getJson(`${FORECAST_URL}?${params}`, { fetchImpl });
    const data = normalize(body);
    if (cache) cache.set(cacheKey, data);
    return { ...data, cached: false };
  };
}

module.exports = { createForecaster, normalize, currentHourIndex };
