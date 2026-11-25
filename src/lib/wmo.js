/**
 * WMO weather interpretation codes, as used by Open-Meteo, with Traditional Chinese descriptions.
 * https://open-meteo.com/en/docs (see "WMO Weather interpretation codes")
 */
const CODES = {
  0: { text: "晴朗", day: "☀️", night: "🌙" },
  1: { text: "大致晴朗", day: "🌤️", night: "🌙" },
  2: { text: "局部多雲", day: "⛅", night: "☁️" },
  3: { text: "陰天", day: "☁️" },
  45: { text: "霧", day: "🌫️" },
  48: { text: "凍霧", day: "🌫️" },
  51: { text: "微毛雨", day: "🌦️", night: "🌧️" },
  53: { text: "毛毛雨", day: "🌦️", night: "🌧️" },
  55: { text: "濃毛雨", day: "🌧️" },
  56: { text: "凍毛雨", day: "🌧️" },
  57: { text: "強凍毛雨", day: "🌧️" },
  61: { text: "小雨", day: "🌦️", night: "🌧️" },
  63: { text: "中雨", day: "🌧️" },
  65: { text: "大雨", day: "🌧️" },
  66: { text: "凍雨", day: "🌧️" },
  67: { text: "強凍雨", day: "🌧️" },
  71: { text: "小雪", day: "🌨️" },
  73: { text: "中雪", day: "🌨️" },
  75: { text: "大雪", day: "❄️" },
  77: { text: "米雪", day: "🌨️" },
  80: { text: "小陣雨", day: "🌦️", night: "🌧️" },
  81: { text: "陣雨", day: "🌧️" },
  82: { text: "豪大陣雨", day: "⛈️" },
  85: { text: "陣雪", day: "🌨️" },
  86: { text: "強陣雪", day: "❄️" },
  95: { text: "雷雨", day: "⛈️" },
  96: { text: "雷雨伴隨冰雹", day: "⛈️" },
  99: { text: "強雷雨伴隨冰雹", day: "⛈️" },
};

function describe(code, isDay = true) {
  const entry = CODES[code];
  if (!entry) return { text: "未知", icon: "🌡️" };
  return { text: entry.text, icon: (!isDay && entry.night) || entry.day };
}

/**
 * Coarse category used to pick an animated map icon:
 * clear | partly | cloudy | fog | drizzle | rain | heavy | thunder | snow (+ "-night" for clear/partly at night).
 */
function kind(code, isDay = true) {
  const c = Number(code);
  let k;
  if (c === 0 || c === 1) k = "clear";
  else if (c === 2) k = "partly";
  else if (c === 3) k = "cloudy";
  else if (c === 45 || c === 48) k = "fog";
  else if (c >= 51 && c <= 57) k = "drizzle";
  else if (c === 61 || c === 80) k = "rain";
  else if ((c >= 63 && c <= 67) || c === 81 || c === 82) k = "heavy";
  else if ((c >= 71 && c <= 77) || c === 85 || c === 86) k = "snow";
  else if (c === 95 || c === 96 || c === 99) k = "thunder";
  else return "unknown";
  return !isDay && (k === "clear" || k === "partly") ? `${k}-night` : k;
}

module.exports = { describe, kind, CODES };
