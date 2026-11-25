/**
 * Pure formatting helpers, shared by the browser and the Node tests.
 * They avoid the DOM and Date time zones: Open-Meteo already returns
 * times in the searched place's local time (e.g. "2026-11-24T19:00").
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WeatherFormat = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const WEEKDAYS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  const COMPASS = ["北風", "東北風", "東風", "東南風", "南風", "西南風", "西風", "西北風"];

  function toUnit(celsius, unit) {
    if (celsius == null) return null;
    return unit === "F" ? (celsius * 9) / 5 + 32 : celsius;
  }

  function formatTemp(celsius, unit) {
    const value = toUnit(celsius, unit);
    return value == null ? "–" : `${Math.round(value)}°`;
  }

  function compass(degrees) {
    if (degrees == null) return "";
    return COMPASS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
  }

  function formatCoord(lat, lon) {
    const ns = lat >= 0 ? "N" : "S";
    const ew = lon >= 0 ? "E" : "W";
    return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
  }

  /** "2026-11-24T19:00" -> "19:00" */
  function formatHour(isoLocal) {
    return String(isoLocal).slice(11, 16);
  }

  /** "2026-11-24" -> "今天" / "週二" (weekday computed in UTC so the browser's zone can't shift it) */
  function formatDay(isoDate, index) {
    if (index === 0) return "今天";
    const [y, m, d] = String(isoDate).split("-").map(Number);
    return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  }

  /** Position of one day's min–max inside the week's overall range, as percentages. */
  function rangeBar(min, max, weekMin, weekMax) {
    const span = weekMax - weekMin || 1;
    const left = ((min - weekMin) / span) * 100;
    const width = Math.max(((max - min) / span) * 100, 4);
    return { left: Math.max(0, Math.min(left, 100 - width)), width };
  }

  /**
   * Map values to SVG points within a width x height box (with vertical padding).
   * Returns [{x, y}] so callers can draw a line and place labels.
   */
  function chartPoints(values, width, height, padding = 20) {
    if (!values.length) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const step = values.length > 1 ? width / (values.length - 1) : 0;
    return values.map((v, i) => ({
      x: Number((i * step).toFixed(1)),
      y: Number((padding + (1 - (v - min) / span) * (height - padding * 2)).toFixed(1)),
    }));
  }

  /** SVG path through the points. Straight segments, so the line passes exactly through every data point. */
  function linePath(points) {
    return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  }

  function uvLabel(uv) {
    if (uv == null) return "";
    if (uv < 3) return "低量級";
    if (uv < 6) return "中量級";
    if (uv < 8) return "高量級";
    if (uv < 11) return "過量級";
    return "危險級";
  }

  return { toUnit, formatTemp, compass, formatCoord, formatHour, formatDay, rangeBar, chartPoints, linePath, uvLabel };
});
