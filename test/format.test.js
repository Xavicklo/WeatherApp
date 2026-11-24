const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../public/js/format");

test("temperature conversion and formatting", () => {
  assert.equal(F.toUnit(100, "F"), 212);
  assert.equal(F.formatTemp(21.4, "C"), "21°");
  assert.equal(F.formatTemp(0, "F"), "32°");
  assert.equal(F.formatTemp(null, "C"), "–");
});

test("compass directions", () => {
  assert.equal(F.compass(0), "N");
  assert.equal(F.compass(45), "NE");
  assert.equal(F.compass(359), "N");
  assert.equal(F.compass(-90), "W");
});

test("coordinates use hemisphere letters, not negative numbers", () => {
  assert.equal(F.formatCoord(25.033, 121.5654), "25.03°N, 121.57°E");
  assert.equal(F.formatCoord(-33.8688, -70.6693), "33.87°S, 70.67°W");
});

test("hour and day labels", () => {
  assert.equal(F.formatHour("2026-11-24T07:00"), "07:00");
  assert.equal(F.formatDay("2026-11-24", 0), "Today");
  assert.equal(F.formatDay("2026-11-24", 1), "Tue");
});

test("rangeBar stays within 0–100%", () => {
  const bar = F.rangeBar(16, 25, 16, 25);
  assert.deepEqual(bar, { left: 0, width: 100 });
  const small = F.rangeBar(20, 20, 16, 25);
  assert.ok(small.left + small.width <= 100);
});

test("chartPoints puts the max at the top and min at the bottom", () => {
  const pts = F.chartPoints([10, 20, 15], 200, 100, 10);
  assert.deepEqual(pts.map((p) => p.x), [0, 100, 200]);
  assert.equal(pts[0].y, 90);
  assert.equal(pts[1].y, 10);
  assert.ok(F.linePath(pts).startsWith("M0,90"));
});
