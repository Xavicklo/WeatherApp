/**
 * Animated weather icons (inline SVG + CSS animation, no images).
 * WxIcons.svg(kind) returns markup for one of the kinds produced by the
 * server (src/lib/wmo.js → kind): clear, clear-night, partly, partly-night,
 * cloudy, fog, drizzle, rain, heavy, thunder, snow, unknown.
 * Only fixed, trusted strings go into the markup.
 */
(function () {
  "use strict";

  // A three-puff cloud; the older single-arc shape looked like a rounded polygon at 40 px.
  const CLOUD = "M14.5 38A6.5 6.5 0 0 1 13 25.2 8.5 8.5 0 0 1 28.8 20.5 7.5 7.5 0 0 1 36.6 26.4 6 6 0 0 1 35.5 38z";
  // Smaller copies of the same shape (wrapped in a <g transform>, so CSS animations on the path still work)
  const SMALL = "translate(8.5 11) scale(0.74)";
  const BACK = "translate(17 1.6) scale(0.62)";

  const sun = (cx, cy, r) => {
    const rays = [];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const x1 = cx + Math.cos(a) * (r + 3);
      const y1 = cy + Math.sin(a) * (r + 3);
      const x2 = cx + Math.cos(a) * (r + 7);
      const y2 = cy + Math.sin(a) * (r + 7);
      rays.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
    }
    return `<g class="wx-rays" style="transform-origin:${cx}px ${cy}px">${rays.join("")}</g><circle class="wx-sun" cx="${cx}" cy="${cy}" r="${r}"/>`;
  };
  const moon = (cx, cy) =>
    `<path class="wx-moon" d="M${cx + 4} ${cy - 11}a11 11 0 1 0 8 17 9 9 0 0 1-8-17z"/>` +
    `<path class="wx-star" d="M${cx + 12} ${cy - 12}l1.2 2.6 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4z"/>`;
  const cloud = (cls = "wx-cloud", transform = "") =>
    transform ? `<g transform="${transform}"><path class="${cls}" d="${CLOUD}"/></g>` : `<path class="${cls}" d="${CLOUD}"/>`;
  const drops = (n, cls) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const x = 15 + (i * 22) / Math.max(1, n - 1);
      out.push(`<line class="${cls}" x1="${x.toFixed(1)}" y1="41" x2="${(x - 2).toFixed(1)}" y2="46" style="animation-delay:${(i * 0.23).toFixed(2)}s"/>`);
    }
    return out.join("");
  };
  const flakes = () =>
    [16, 25, 34]
      .map((x, i) => `<text class="wx-flake" x="${x}" y="46" style="animation-delay:${(i * 0.5).toFixed(1)}s">❄</text>`)
      .join("");

  const ART = {
    clear: () => sun(24, 24, 9),
    "clear-night": () => moon(22, 26),
    partly: () => `<g transform="translate(-4 -6)">${sun(20, 20, 7)}</g>${cloud("wx-cloud wx-drift", SMALL)}`,
    "partly-night": () => `<g transform="translate(-5 -8) scale(.8)">${moon(22, 26)}</g>${cloud("wx-cloud wx-drift", SMALL)}`,
    cloudy: () => `${cloud("wx-cloud wx-back wx-drift-slow", BACK)}${cloud("wx-cloud wx-drift")}`,
    fog: () =>
      `${cloud("wx-cloud wx-grey")}<g class="wx-fog"><line x1="8" y1="42" x2="34" y2="42"/><line x1="14" y1="46" x2="40" y2="46"/></g>`,
    drizzle: () => `${cloud("wx-cloud wx-grey")}${drops(3, "wx-drop wx-slow")}`,
    rain: () => `${cloud("wx-cloud wx-grey")}${drops(4, "wx-drop")}`,
    heavy: () => `${cloud("wx-cloud wx-dark")}${drops(6, "wx-drop wx-fast")}`,
    thunder: () => `${cloud("wx-cloud wx-dark")}${drops(4, "wx-drop wx-fast")}<path class="wx-bolt" d="M25 30l-6 10h5l-3 8 9-12h-5l3-6z"/>`,
    snow: () => `${cloud("wx-cloud")}${flakes()}`,
    unknown: () => cloud("wx-cloud wx-grey"),
  };

  function svg(kind, size = 48) {
    const draw = ART[kind] || ART.unknown;
    return `<svg class="wx-svg wx-k-${ART[kind] ? kind : "unknown"}" viewBox="0 0 48 52" width="${size}" height="${size}" aria-hidden="true">${draw()}</svg>`;
  }

  window.WxIcons = { svg, kinds: Object.keys(ART) };
})();
