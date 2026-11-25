const test = require("node:test");
const assert = require("node:assert/strict");

const TTLCache = require("../src/lib/cache");
const { describe: wmo } = require("../src/lib/wmo");
const { createGeocoder, parseQuery } = require("../src/services/geocode");
const { createForecaster, normalize, currentHourIndex } = require("../src/services/forecast");
const { getJson } = require("../src/lib/http");
const { createCityLayer, CITIES } = require("../src/services/cities");
const { createReverseGeocoder, formatAddress } = require("../src/services/reverseGeocode");
const { geocodeParis, forecastBody, fakeFetch } = require("./fixtures");

const GEO = "https://geocoding-api.open-meteo.com";
const WX = "https://api.open-meteo.com";

test("TTLCache expires entries and evicts the oldest", () => {
  let now = 0;
  const cache = new TTLCache({ ttlMs: 100, maxEntries: 2, now: () => now });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3); // evicts "a"
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), 2);
  now = 150;
  assert.equal(cache.get("b"), undefined);
});

test("wmo codes map to text and a day/night icon", () => {
  assert.deepEqual(wmo(0, true), { text: "晴朗", icon: "☀️" });
  assert.deepEqual(wmo(0, false), { text: "晴朗", icon: "🌙" });
  assert.equal(wmo(999).text, "未知");
});

test("parseQuery splits a place from its region hints", () => {
  assert.deepEqual(parseQuery(" Paris , Texas "), { name: "Paris", hints: ["texas"] });
  assert.deepEqual(parseQuery("Taipei"), { name: "Taipei", hints: [] });
});

test("geocoder picks the candidate that matches the hint", async () => {
  const fetchImpl = fakeFetch({ [GEO]: geocodeParis });
  const geocode = createGeocoder({ fetchImpl });
  const texas = await geocode("Paris, Texas");
  assert.equal(texas.location, "Paris, Texas, United States");
  const france = await geocode("Paris");
  assert.equal(france.country, "France");
  assert.match(fetchImpl.calls[0], /name=Paris&/);
});

test("geocoder returns 404 for unknown places and caches hits", async () => {
  const cache = new TTLCache();
  const empty = createGeocoder({ fetchImpl: fakeFetch({ [GEO]: {} }), cache });
  await assert.rejects(empty("Nowhereville"), { status: 404 });

  const fetchImpl = fakeFetch({ [GEO]: geocodeParis });
  const geocode = createGeocoder({ fetchImpl, cache });
  await geocode("Paris");
  await geocode("paris");
  assert.equal(fetchImpl.calls.length, 1, "second lookup should come from the cache");
});

test("currentHourIndex finds the slot for the current hour", () => {
  const times = ["2026-11-24T18:00", "2026-11-24T19:00", "2026-11-24T20:00"];
  assert.equal(currentHourIndex(times, "2026-11-24T19:15"), 1);
  assert.equal(currentHourIndex(times, "2030-01-01T00:00"), 0);
});

test("normalize reshapes Open-Meteo data for the UI", () => {
  const data = normalize(forecastBody);
  assert.equal(data.current.temperature, 21.4);
  assert.equal(data.current.isDay, false);
  assert.equal(data.current.text, "陰天");
  assert.equal(data.current.visibility, 24.1);
  assert.equal(data.current.uvIndex, 4.4);
  assert.equal(data.hourly.length, 24);
  assert.equal(data.hourly[0].time, "2026-11-24T19:00");
  assert.equal(data.daily.length, 7);
  assert.equal(data.daily[2].text, "中雨");
});

test("forecaster caches by rounded coordinates", async () => {
  const fetchImpl = fakeFetch({ [WX]: forecastBody });
  const forecast = createForecaster({ fetchImpl, cache: new TTLCache() });
  const first = await forecast(25.0330, 121.5654);
  const second = await forecast(25.0331, 121.5651);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(fetchImpl.calls.length, 1);
  assert.match(fetchImpl.calls[0], /latitude=25\.03&longitude=121\.57/);
});

test("getJson turns network failures and bad statuses into 5xx errors", async () => {
  await assert.rejects(getJson("x", { fetchImpl: fakeFetch({ x: new Error("ECONNRESET") }) }), { status: 502 });
  const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
  await assert.rejects(getJson("x", { fetchImpl: fakeFetch({ x: timeout }) }), { status: 504 });
  await assert.rejects(getJson("x", { fetchImpl: fakeFetch({ x: { status: 500, body: {} } }) }), { status: 502 });
});

test("reverse geocoder formats Nominatim addresses and falls back on errors", async () => {
  assert.equal(
    formatAddress({ address: { city: "Taipei", state: "Taiwan Province", country: "Taiwan" } }),
    "Taipei, Taiwan Province, Taiwan"
  );
  const NOM = "https://nominatim.openstreetmap.org";
  const ok = createReverseGeocoder({ fetchImpl: fakeFetch({ [NOM]: { address: { town: "Zhonghe", state: "New Taipei", country: "Taiwan" } } }) });
  assert.equal((await ok(25.0, 121.5)).location, "Zhonghe, New Taipei, Taiwan");

  const down = createReverseGeocoder({ fetchImpl: fakeFetch({ [NOM]: new Error("ECONNRESET") }) });
  assert.equal((await down(25.0, 121.5)).location, "地圖選取位置");
});

test("city layer is valid GeoJSON built from one multi-location request", async () => {
  const bodies = CITIES.map((c, i) => ({ current: { temperature_2m: 20 + i, weather_code: 0, is_day: 1 } }));
  const fetchImpl = fakeFetch({ [WX]: bodies });
  const layer = await createCityLayer({ fetchImpl })();
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(layer.type, "FeatureCollection");
  assert.equal(layer.features.length, CITIES.length);
  const taipei = layer.features.find((f) => f.properties.name === "臺北");
  assert.deepEqual(taipei.geometry.coordinates, [121.5654, 25.033], "GeoJSON is [lon, lat]");
  assert.equal(taipei.properties.icon, "☀️");
});

const { createWaybackCatalog, toReleases, CONFIG_URL } = require("../src/services/wayback");

test("toReleases turns the Wayback catalog into a newest-first list", () => {
  const list = toReleases({
    10: { itemTitle: "World Imagery (Wayback 2024-03-07)" },
    20: { itemTitle: "World Imagery (Wayback 2026-11-18)" },
    bad: { itemTitle: "World Imagery (Wayback 2025-01-01)" },
    30: { itemTitle: "no date here" },
  });
  assert.deepEqual(list, [
    { release: 20, date: "2026-11-18" },
    { release: 10, date: "2024-03-07" },
  ]);
  assert.deepEqual(toReleases(null), []);
});

test("wayback catalog is fetched once and then served from the cache", async () => {
  const fetchImpl = fakeFetch({ [CONFIG_URL]: { 3692: { itemTitle: "World Imagery (Wayback 2026-11-18)" } } });
  const releases = createWaybackCatalog({ fetchImpl, cache: new TTLCache() });
  const first = await releases();
  const second = await releases();
  assert.equal(first.releases[0].release, 3692);
  assert.match(first.tileUrl, /\{release\}\/\{z\}\/\{y\}\/\{x\}$/);
  assert.equal(second, first);
  assert.equal(fetchImpl.calls.length, 1);
});

const { kind: wmoKind } = require("../src/lib/wmo");
const { createNearby, samplePoints } = require("../src/services/nearby");

test("wmo kind groups codes for the animated icons", () => {
  assert.equal(wmoKind(0, true), "clear");
  assert.equal(wmoKind(1, false), "clear-night");
  assert.equal(wmoKind(61), "rain");
  assert.equal(wmoKind(65), "heavy");
  assert.equal(wmoKind(95), "thunder");
  assert.equal(wmoKind(3, false), "cloudy");
  assert.equal(wmoKind(999), "unknown");
});

test("samplePoints puts the centre first and two rings around it", () => {
  const pts = samplePoints(25.06, 121.53);
  assert.equal(pts.length, 1 + 6 + 8);
  assert.deepEqual([pts[0].lat, pts[0].lon, pts[0].ring], [25.06, 121.53, 0]);
  // the first ring-1 point is due north, about 5 km away
  assert.ok(Math.abs(pts[1].lat - (25.06 + 5 / 111.32)) < 1e-3);
  assert.equal(pts[1].lon, 121.53);
  assert.ok(samplePoints(0, 179.99).every((p) => p.lon >= -180 && p.lon <= 180));
});

test("nearby makes one upstream call and returns GeoJSON with kinds", async () => {
  const one = (code, t) => ({ current: { temperature_2m: t, weather_code: code, is_day: 1, precipitation: 0.4 } });
  const fetchImpl = fakeFetch({ [WX]: Array.from({ length: 15 }, (_, i) => one(i === 0 ? 63 : 0, 20 + i)) });
  const geo = await createNearby({ fetchImpl, cache: new TTLCache() })(25.06, 121.53);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(geo.type, "FeatureCollection");
  assert.equal(geo.features.length, 15);
  assert.deepEqual(geo.features[0].geometry.coordinates, [121.53, 25.06]);
  assert.equal(geo.features[0].properties.kind, "heavy");
  assert.equal(geo.features[0].properties.text, "中雨");
  assert.equal(geo.features[1].properties.kind, "clear");
});

const { fromNominatim } = require("../src/services/geocode");
const NOMI = "https://nominatim.openstreetmap.org/search";

test("Chinese names go to Nominatim first, preferring Taiwan", async () => {
  const tucheng = [{ lat: "24.97", lon: "121.44", name: "土城區", address: { suburb: "土城區", city: "新北市", country: "臺灣", country_code: "tw" } }];
  const fetchImpl = fakeFetch({ [NOMI]: tucheng });
  const place = await createGeocoder({ fetchImpl })("土城");
  assert.equal(place.location, "土城區, 新北市, 臺灣");
  assert.equal(place.latitude, 24.97);
  assert.match(fetchImpl.calls[0], /countrycodes=tw/);
});

test("Latin names fall back to Nominatim when Open-Meteo finds nothing", async () => {
  const fetchImpl = fakeFetch({ [GEO]: { results: [] }, [NOMI]: [{ lat: "1", lon: "2", name: "Somewhere", address: { country: "Nowhere" } }] });
  const place = await createGeocoder({ fetchImpl })("Somewhere");
  assert.equal(place.location, "Somewhere, Nowhere");
  assert.equal(fetchImpl.calls.length, 2);
});

test("fromNominatim does not repeat the place name as its region", () => {
  assert.equal(fromNominatim({ lat: "25", lon: "121", name: "臺北市", address: { city: "臺北市", country: "臺灣" } }).location, "臺北市, 臺灣");
});

test("fromNominatim prefers the district over a station with the same name", () => {
  const r = { lat: "24.97", lon: "121.44", name: "土城", address: { railway: "土城", suburb: "土城區", city: "新北市", country: "臺灣" } };
  assert.equal(fromNominatim(r).location, "土城區, 新北市, 臺灣");
});

const { match: matchDisaster, checkUrl, pickTitle, createDisasterResolver } = require("../src/services/disasters");

test("disaster matching reads keywords, text and URL slugs", () => {
  assert.equal(matchDisaster("澳洲森林大火").id, "au-longwood");
  assert.equal(matchDisaster("洛杉磯 Eaton 大火").id, "la-altadena");
  assert.equal(matchDisaster("馬太鞍溪堰塞湖水位降逾百公尺").id, "mataian-lake");
  assert.equal(matchDisaster("光復鄉溢流災情").id, "mataian-flood");
  assert.equal(matchDisaster("https://www.rnz.co.nz/news/world/583728/australia-bushfires-to-burn").id, "au-longwood");
  assert.equal(matchDisaster("大火"), null); // too vague
  assert.equal(matchDisaster("台北"), null);
});

test("news URLs must be public http(s)", () => {
  assert.ok(checkUrl("https://udn.com/news/story/7266/9142701"));
  for (const bad of ["ftp://x.com/a", "http://localhost:3000/", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/", "http://169.254.169.254/latest", "http://[::1]/", "not a url"]) {
    assert.throws(() => checkUrl(bad), (e) => e.status === 400, bad);
  }
});

test("pickTitle prefers og:title and decodes entities", () => {
  const html = '<title>x</title><meta property="og:title" content="馬太鞍溪堰塞湖 &amp; 光復">';
  assert.equal(pickTitle(html).title, "馬太鞍溪堰塞湖 & 光復");
  assert.equal(pickTitle("<title> LA fire </title>").title, "LA fire");
});

test("news resolver reads the title and follows only safe redirects", async () => {
  const page = (html) => ({ ok: true, status: 200, headers: new Map(), body: new Response(html).body });
  const fetchImpl = async (url) => {
    if (String(url).includes("short")) return { ok: false, status: 301, headers: new Map([["location", "https://news.example.com/a"]]) };
    return page('<meta property="og:title" content="Eaton fire destroys homes in Altadena">');
  };
  const resolve = createDisasterResolver({ fetchImpl });
  const r = await resolve("https://short.example.com/x");
  assert.equal(r.match.id, "la-altadena");
  assert.equal(r.title, "Eaton fire destroys homes in Altadena");
  const evil = async () => ({ ok: false, status: 302, headers: new Map([["location", "http://169.254.169.254/"]]) });
  await assert.rejects(createDisasterResolver({ fetchImpl: evil })("https://a.example.com/"), (e) => e.status === 400);
  assert.equal((await resolve("澳洲大火")).match.id, "au-longwood");
});
