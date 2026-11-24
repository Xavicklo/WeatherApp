const test = require("node:test");
const assert = require("node:assert/strict");

const { createWeatherController } = require("../src/controllers/weather");
const { NotFoundError } = require("../src/services/geocode");
const { UpstreamError } = require("../src/lib/http");

const silent = { error() {} };
const place = { latitude: 25.03, longitude: 121.56, location: "Taipei, Taiwan", country: "Taiwan", region: "Taipei" };
const weather = { current: { temperature: 21 }, hourly: [], daily: [] };

function controller(overrides = {}) {
  return createWeatherController({
    geocode: async () => place,
    forecast: async () => weather,
    logger: silent,
    ...overrides,
  });
}

test("400 when no location is given", async () => {
  const res = await controller()({});
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test("400 for an overly long address or bad coordinates", async () => {
  assert.equal((await controller()({ address: "x".repeat(101) })).status, 400);
  assert.equal((await controller()({ lat: "95", lon: "10" })).status, 400);
  assert.equal((await controller()({ lat: "25" })).status, 400);
  assert.equal((await controller()({ lat: "abc", lon: "1" })).status, 400);
});

test("200 with location and forecast for an address", async () => {
  const res = await controller()({ address: "  Taipei " });
  assert.equal(res.status, 200);
  assert.equal(res.body.location, "Taipei, Taiwan");
  assert.equal(res.body.query, "Taipei");
  assert.equal(res.body.current.temperature, 21);
});

test("coordinates skip geocoding", async () => {
  let geocoded = false;
  const res = await controller({ geocode: async () => (geocoded = true) })({ lat: "25.03", lon: "121.56" });
  assert.equal(res.status, 200);
  assert.equal(geocoded, false);
  assert.equal(res.body.location, "地圖選取位置");
  assert.deepEqual(res.body.point, { latitude: 25.03, longitude: 121.56 });
});

test("service errors keep their status; unknown errors become a generic 500", async () => {
  const notFound = await controller({ geocode: async () => { throw new NotFoundError("nope"); } })({ address: "zz" });
  assert.deepEqual([notFound.status, notFound.body.error], [404, "nope"]);

  const upstream = await controller({ forecast: async () => { throw new UpstreamError("down", { status: 504 }); } })({ address: "Taipei" });
  assert.equal(upstream.status, 504);

  const bug = await controller({ forecast: async () => { throw new TypeError("secret internals"); } })({ address: "Taipei" });
  assert.equal(bug.status, 500);
  assert.doesNotMatch(bug.body.error, /secret/);
});

test("coordinates use the reverse geocoder for a place name, in parallel with the forecast", async () => {
  const started = [];
  const res = await controller({
    reverseGeocode: async () => { started.push("name"); return { location: "Zhongshan, Taipei, Taiwan", country: "Taiwan", region: "Taipei" }; },
    forecast: async () => { started.push("wx"); return weather; },
  })({ lat: "25.06", lon: "121.53" });
  assert.equal(res.body.location, "Zhongshan, Taipei, Taiwan");
  assert.deepEqual(started.sort(), ["name", "wx"]);
});
