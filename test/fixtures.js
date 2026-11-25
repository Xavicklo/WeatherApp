// Trimmed-down copies of real Open-Meteo responses, used to fake fetch().

const geocodeParis = {
  results: [
    { name: "Paris", latitude: 48.85341, longitude: 2.3488, country: "France", country_code: "FR", admin1: "Île-de-France", timezone: "Europe/Paris" },
    { name: "Paris", latitude: 33.66094, longitude: -95.55551, country: "United States", country_code: "US", admin1: "Texas", timezone: "America/Chicago" },
  ],
};

function hours(start, count, fn) {
  return Array.from({ length: count }, (_, i) => fn(i, start));
}

const forecastBody = {
  latitude: 25.04,
  longitude: 121.56,
  timezone: "Asia/Taipei",
  current: {
    time: "2026-11-24T19:15",
    temperature_2m: 21.36,
    relative_humidity_2m: 78,
    apparent_temperature: 22.1,
    is_day: 0,
    precipitation: 0,
    weather_code: 3,
    surface_pressure: 1015.6,
    wind_speed_10m: 9.4,
    wind_direction_10m: 45,
  },
  hourly: {
    time: hours(0, 48, (i) => {
      const day = 24 + Math.floor(i / 24);
      return `2026-11-${day}T${String(i % 24).padStart(2, "0")}:00`;
    }),
    temperature_2m: hours(0, 48, (i) => 18 + (i % 24) / 4),
    precipitation_probability: hours(0, 48, (i) => (i % 5) * 10),
    weather_code: hours(0, 48, () => 2),
    visibility: hours(0, 48, () => 24140),
  },
  daily: {
    time: ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30"],
    weather_code: [3, 61, 63, 2, 0, 1, 95],
    temperature_2m_max: [24.1, 22, 20.5, 23, 25.2, 24, 21],
    temperature_2m_min: [18, 17.2, 16, 17, 18.4, 19, 17.5],
    precipitation_probability_max: [10, 70, 90, 20, 0, 5, 80],
    sunrise: ["2026-11-24T06:21"],
    sunset: ["2026-11-24T17:04"],
    uv_index_max: [4.36, 2, 1, 5, 6, 5, 2],
  },
};

/** A fetch() stand-in that serves canned bodies by URL prefix and records calls. */
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const match = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    if (!match) throw new Error("Unexpected URL " + url);
    const route = routes[match];
    if (route instanceof Error) throw route;
    const { status = 200, body } = route.status ? route : { body: route };
    return { ok: status < 400, status, json: async () => body };
  };
  impl.calls = calls;
  return impl;
}

module.exports = { geocodeParis, forecastBody, fakeFetch };
