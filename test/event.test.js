const test = require("node:test");
const assert = require("node:assert/strict");
const { createEventLocator, parseDate, detectType, matchPreset, readArticle, placeWords } = require("../src/services/eventLocator");

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => body });

test("dates in Chinese and English", () => {
  assert.deepEqual(parseDate("2025年1月7日 洛杉磯大火"), { date: "2025-01-07", precision: "day" });
  assert.deepEqual(parseDate("Eaton fire, Jan 7, 2025"), { date: "2025-01-07", precision: "day" });
  assert.deepEqual(parseDate("7 January 2025 wildfire"), { date: "2025-01-07", precision: "day" });
  assert.deepEqual(parseDate("2025/9/23 花蓮"), { date: "2025-09-23", precision: "day" });
  assert.deepEqual(parseDate("2024年4月 花蓮地震"), { date: "2024-04-15", precision: "month" });
  assert.deepEqual(parseDate("9月23日 馬太鞍溪 2025"), { date: "2025-09-23", precision: "day" });
  assert.equal(parseDate("2023 毛伊島大火").precision, "year");
  assert.equal(parseDate("沒有日期"), null);
});

test("disaster types and built-in cases", () => {
  assert.equal(detectType("2025澳洲大火").type, "fire");
  assert.equal(detectType("花蓮 堰塞湖").type, "landslide");
  assert.equal(detectType("Turkey earthquake").type, "quake");
  assert.equal(matchPreset("2025澳洲大火"), "au-longwood");
  assert.equal(matchPreset("2025 洛杉磯大火"), "la-altadena");
  assert.equal(matchPreset("馬太鞍溪堰塞湖溢流 光復鄉淹水"), "mataian-flood");
  assert.equal(matchPreset("2023 毛伊島大火"), null);
});

test("news page meta tags", () => {
  const html = `<html><head><title>x</title><meta property="og:title" content="毛伊島野火 &amp; 災情"><meta name="description" content="2023年8月8日 夏威夷"><meta property="article:published_time" content="2023-08-10T02:00:00Z"></head></html>`;
  assert.deepEqual(readArticle(html), { title: "毛伊島野火 & 災情", description: "2023年8月8日 夏威夷", published: "2023-08-10" });
  assert.equal(placeWords("2023 毛伊島大火 | 某某新聞"), "毛伊島");
});

test("free text -> Wikipedia/Wikidata place + clear NASA scenes", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("wikipedia.org")) {
      return ok({ query: { pages: [{ index: 1, title: "2023年茂宜島野火", pageprops: { wikibase_item: "Q1" } }] } });
    }
    if (url.includes("wikidata.org")) {
      return ok({ entities: { Q1: { claims: {
        P625: [{ mainsnak: { datavalue: { value: { latitude: 20.878, longitude: -156.677 } } } }],
        P580: [{ mainsnak: { datavalue: { value: { time: "+2023-08-08T00:00:00Z", precision: 11 } } } }],
      } } } });
    }
    if (url.includes("cmr.earthdata")) {
      const before = url.includes("sort_key=-start_date");
      return ok({ feed: { entry: [{ time_start: before ? "2023-07-30T21:00:00Z" : "2023-08-14T21:00:00Z", cloud_cover: before ? "3" : "11" }] } });
    }
    throw new Error("unexpected " + url);
  };
  const locate = createEventLocator({ fetchImpl, now: () => new Date("2026-01-01") });
  const out = await locate("2023 毛伊島大火");
  assert.equal(out.event.type, "fire");
  assert.deepEqual(out.event.center, [20.878, -156.677]);
  assert.equal(out.event.date, "2023-08-08");
  assert.deepEqual(out.event.left, { source: "hls", value: "2023-07-30" });
  assert.deepEqual(out.event.right, { source: "hls", value: "2023-08-14" });
  assert.ok(out.steps.some((s) => s.text.includes("Wikidata Q1")));
});

test("built-in case short-circuits without any network call", async () => {
  const locate = createEventLocator({ fetchImpl: async () => { throw new Error("no network"); } });
  const out = await locate("2025澳洲大火");
  assert.equal(out.preset, "au-longwood");
});

test("no place found -> a helpful 422", async () => {
  const locate = createEventLocator({ fetchImpl: async () => ok({ query: { pages: [] } }), geocode: async () => { throw new Error("nope"); } });
  await assert.rejects(locate("2024 大火"), (err) => err.status === 422 && /地點/.test(err.message));
});
