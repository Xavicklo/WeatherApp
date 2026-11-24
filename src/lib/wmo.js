/**
 * WMO weather interpretation codes, as used by Open-Meteo.
 * https://open-meteo.com/en/docs (see "WMO Weather interpretation codes")
 */
const CODES = {
  0: { text: "Clear sky", day: "☀️", night: "🌙" },
  1: { text: "Mainly clear", day: "🌤️", night: "🌙" },
  2: { text: "Partly cloudy", day: "⛅", night: "☁️" },
  3: { text: "Overcast", day: "☁️" },
  45: { text: "Fog", day: "🌫️" },
  48: { text: "Freezing fog", day: "🌫️" },
  51: { text: "Light drizzle", day: "🌦️", night: "🌧️" },
  53: { text: "Drizzle", day: "🌦️", night: "🌧️" },
  55: { text: "Heavy drizzle", day: "🌧️" },
  56: { text: "Freezing drizzle", day: "🌧️" },
  57: { text: "Heavy freezing drizzle", day: "🌧️" },
  61: { text: "Light rain", day: "🌦️", night: "🌧️" },
  63: { text: "Rain", day: "🌧️" },
  65: { text: "Heavy rain", day: "🌧️" },
  66: { text: "Freezing rain", day: "🌧️" },
  67: { text: "Heavy freezing rain", day: "🌧️" },
  71: { text: "Light snow", day: "🌨️" },
  73: { text: "Snow", day: "🌨️" },
  75: { text: "Heavy snow", day: "❄️" },
  77: { text: "Snow grains", day: "🌨️" },
  80: { text: "Light showers", day: "🌦️", night: "🌧️" },
  81: { text: "Showers", day: "🌧️" },
  82: { text: "Violent showers", day: "⛈️" },
  85: { text: "Snow showers", day: "🌨️" },
  86: { text: "Heavy snow showers", day: "❄️" },
  95: { text: "Thunderstorm", day: "⛈️" },
  96: { text: "Thunderstorm with hail", day: "⛈️" },
  99: { text: "Thunderstorm with heavy hail", day: "⛈️" },
};

function describe(code, isDay = true) {
  const entry = CODES[code];
  if (!entry) return { text: "Unknown", icon: "🌡️" };
  return { text: entry.text, icon: (!isDay && entry.night) || entry.day };
}

module.exports = { describe, CODES };
