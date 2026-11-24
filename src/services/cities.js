const { getJson } = require("../lib/http");
const { describe } = require("../lib/wmo");

/**
 * Current temperature for a fixed set of Taiwanese cities, returned as a
 * GeoJSON FeatureCollection so the map can draw it as a point layer.
 * Open-Meteo accepts comma-separated coordinates, so this is ONE upstream call.
 */
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const CITIES = [
  { name: "基隆", lat: 25.1276, lon: 121.7392, minZoom: 9 },
  { name: "臺北", lat: 25.033, lon: 121.5654 },
  { name: "中和", lat: 24.9994, lon: 121.4987, minZoom: 10 },
  { name: "桃園", lat: 24.9936, lon: 121.301, minZoom: 9 },
  { name: "新竹", lat: 24.8138, lon: 120.9675 },
  { name: "宜蘭", lat: 24.7021, lon: 121.7378 },
  { name: "臺中", lat: 24.1477, lon: 120.6736 },
  { name: "花蓮", lat: 23.9872, lon: 121.6015 },
  { name: "嘉義", lat: 23.4801, lon: 120.4491 },
  { name: "臺南", lat: 22.9999, lon: 120.227 },
  { name: "臺東", lat: 22.7583, lon: 121.1444 },
  { name: "高雄", lat: 22.6273, lon: 120.3014 },
  { name: "澎湖", lat: 23.5655, lon: 119.5862 },
  { name: "金門", lat: 24.4321, lon: 118.3171 },
];

function toFeatureCollection(cities, bodies) {
  const list = Array.isArray(bodies) ? bodies : [bodies];
  return {
    type: "FeatureCollection",
    features: cities.map((city, i) => {
      const current = (list[i] && list[i].current) || {};
      return {
        type: "Feature",
        // GeoJSON order is [longitude, latitude]
        geometry: { type: "Point", coordinates: [city.lon, city.lat] },
        properties: {
          name: city.name,
          minZoom: city.minZoom || 0, // smaller places only appear when zoomed in, so labels don't overlap
          temperature: current.temperature_2m == null ? null : Math.round(current.temperature_2m * 10) / 10,
          ...describe(current.weather_code, current.is_day !== 0),
        },
      };
    }),
  };
}

function createCityLayer({ fetchImpl, cache, cities = CITIES } = {}) {
  return async function cityLayer() {
    const cached = cache && cache.get("cities");
    if (cached) return cached;

    const params = new URLSearchParams({
      latitude: cities.map((c) => c.lat).join(","),
      longitude: cities.map((c) => c.lon).join(","),
      current: "temperature_2m,weather_code,is_day",
      timezone: "auto",
    });
    const body = await getJson(`${FORECAST_URL}?${params}`, { fetchImpl });
    const geojson = toFeatureCollection(cities, body);
    if (cache) cache.set("cities", geojson);
    return geojson;
  };
}

module.exports = { createCityLayer, toFeatureCollection, CITIES };
