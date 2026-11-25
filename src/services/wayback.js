const { getJson } = require("../lib/http");

/**
 * Esri World Imagery Wayback: every archived release of the World Imagery
 * basemap since 2014, each one a complete tile pyramid addressed by its
 * release number. The catalog is a single JSON file; we turn it into a
 * short, date-sorted list the browser can show in a drop-down.
 */
const CONFIG_URL = "https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json";
const TILE_URL =
  "https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/{release}/{z}/{y}/{x}";

/** { "3692": { itemTitle: "World Imagery (Wayback 2026-11-18)", ... } } -> [{ release: 3692, date: "2026-11-18" }] */
function toReleases(config) {
  if (!config || typeof config !== "object") return [];
  return Object.entries(config)
    .map(([key, item]) => {
      const match = /(\d{4}-\d{2}-\d{2})/.exec((item && item.itemTitle) || "");
      const release = Number(key);
      return match && Number.isInteger(release) ? { release, date: match[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first
}

function createWaybackCatalog({ fetchImpl, cache } = {}) {
  return async function waybackReleases() {
    const cached = cache && cache.get("wayback");
    if (cached) return cached;
    const body = { tileUrl: TILE_URL, releases: toReleases(await getJson(CONFIG_URL, { fetchImpl })) };
    if (cache) cache.set("wayback", body);
    return body;
  };
}

module.exports = { createWaybackCatalog, toReleases, CONFIG_URL, TILE_URL };
