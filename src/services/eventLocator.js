const { getJson, getText } = require("../lib/http");

/**
 * Event locator: turns free text ("2025 洛杉磯大火") or a news link into a before/after
 * satellite comparison: WHAT happened (disaster type), WHEN (date) and WHERE (coordinates),
 * then picks clear-sky satellite dates on both sides of the event.
 *
 * A small text-to-map pipeline in the spirit of geoAI Maker, built only on free, keyless sources:
 *   1. News link -> the page's title, description and publish date (Open Graph / meta tags)
 *   2. Rules     -> disaster type and dates from the words ("森林大火", "2025年1月7日", "Jan 7, 2025")
 *   3. Knowledge -> Wikipedia search -> Wikidata: coordinates (P625) and dates (P585 / P580 / P582)
 *   4. Geocoding -> place names left in the text, if the knowledge base had no coordinates
 *   5. Imagery   -> NASA CMR catalogue: the nearest HLS (Sentinel-2) scenes with <= 20% cloud
 * Every step is reported back, so the panel can show how the answer was reached.
 */

const USER_AGENT = "WeatherApp-demo/2.0 (https://github.com/Xavicklo/WeatherApp)";
const CMR_URL = "https://cmr.earthdata.nasa.gov/search/granules.json";
const HLS_FIRST_DAY = "2015-12-01";

class EventError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.name = "EventError";
    this.status = status;
  }
}

// ---------- 1. disaster type ----------
const TYPES = [
  { type: "fire", label: "野火 / 森林大火", icon: "🔥", zoom: 11, re: /(大火|野火|山火|森林火|火災|wildfire|bushfire|forest fire|fire)/i },
  { type: "landslide", label: "崩塌 / 堰塞湖", icon: "⛰️", zoom: 13, re: /(堰塞湖|土石流|崩塌|山崩|走山|landslide|mudslide|debris flow)/i },
  { type: "flood", label: "洪水 / 淹水", icon: "🌊", zoom: 12, re: /(洪水|淹水|水災|潰堤|豪雨|水患|flood)/i },
  { type: "quake", label: "地震", icon: "🫨", zoom: 13, re: /(地震|強震|earthquake|quake)/i },
  { type: "storm", label: "颱風 / 颶風", icon: "🌀", zoom: 11, re: /(颱風|颶風|熱帶氣旋|typhoon|hurricane|cyclone)/i },
  { type: "volcano", label: "火山爆發", icon: "🌋", zoom: 12, re: /(火山|volcan|eruption)/i },
];

function detectType(text) {
  return TYPES.find((t) => t.re.test(text)) || null;
}

// ---------- 2. dates ----------
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const validDay = (y, m, d) => y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;

/**
 * The first date written in the text. precision: "day" | "month" | "year".
 * "2025年1月7日", "2025/1/7", "2025-01-07", "Jan 7, 2025", "7 January 2025", "2025年1月", "2025"
 */
function parseDate(text) {
  const s = String(text);
  const tries = [
    [/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日號号]?/, (m) => [m[1], m[2], m[3]]],
    [/(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/, (m) => [m[1], m[2], m[3]]],
    [/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/, (m) => [m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], m[2]]],
    [/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/, (m) => [m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], m[1]]],
  ];
  for (const [re, pick] of tries) {
    const m = re.exec(s);
    if (!m) continue;
    const [y, mo, d] = pick(m).map(Number);
    if (validDay(y, mo, d)) return { date: iso(y, mo, d), precision: "day" };
  }
  const ym = /(\d{4})\s*年\s*(\d{1,2})\s*月/.exec(s) || /(\d{4})[/-](\d{1,2})(?![\d/-])/.exec(s);
  if (ym && validDay(+ym[1], +ym[2], 1)) return { date: iso(+ym[1], +ym[2], 15), precision: "month" };
  const md = /(?<!\d)(\d{1,2})\s*月\s*(\d{1,2})\s*[日號号]/.exec(s);
  const y = /(?<!\d)(19|20)\d{2}(?!\d)/.exec(s);
  if (md && y && validDay(+y[0], +md[1], +md[2])) return { date: iso(+y[0], +md[1], +md[2]), precision: "day" };
  if (y) return { date: `${y[0]}-07-01`, precision: "year" };
  return null;
}

const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---------- built-in cases (already checked by hand: clear skies, visible change) ----------
const PRESET_RULES = [
  { id: "mataian-flood", re: /(馬太鞍|光復鄉|光復|mataian)/i, also: /(溢流|洪水|下游|淹|泥)/ },
  { id: "mataian-lake", re: /(馬太鞍|堰塞湖.*花蓮|花蓮.*堰塞湖|mataian)/i },
  { id: "la-altadena", re: /(洛杉磯|洛杉矶|los angeles|altadena|eaton|伊頓)/i },
  { id: "au-longwood", re: /(澳洲|澳大利亞|澳大利亚|australia|維多利亞|victoria|longwood)/i, also: /(火|fire)/i },
];

function matchPreset(text) {
  const rule = PRESET_RULES.find((r) => r.re.test(text) && (!r.also || r.also.test(text)));
  return rule ? rule.id : null;
}

// ---------- 1. news links ----------
const decodeEntities = (s) =>
  String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

function meta(html, ...names) {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${name}["']`,
      "i"
    );
    const m = re.exec(html);
    if (m) return decodeEntities(m[1] || m[2]).trim();
  }
  return null;
}

/** A news page -> { title, description, published } from its meta tags. */
function readArticle(html) {
  const titleTag = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  const ld = /"datePublished"\s*:\s*"([^"]+)"/.exec(html);
  return {
    title: meta(html, "og:title", "twitter:title") || (titleTag ? decodeEntities(titleTag[1]).trim() : ""),
    description: meta(html, "og:description", "description", "twitter:description") || "",
    published: (meta(html, "article:published_time", "pubdate", "publishdate", "date") || (ld && ld[1]) || "").slice(0, 10) || null,
  };
}

// ---------- 4. what is left of the text once the event words are gone ----------
const NOISE =
  /(\d{4}\s*年|\d{1,2}\s*月|\d{1,2}\s*[日號号]|\d+|最新|快訊|新聞|即時|災情|災後|災前|重創|延燒|爆發|發生|造成|引發|衛星|影像|空拍|比對|今年|去年|的|了|在|與|和|及|大|嚴重|特大|news|the|in|of|and|latest|update)/gi;

function placeWords(text) {
  let s = String(text).split(/[|｜–—-]\s/)[0]; // drop " | 媒體名稱" tails
  TYPES.forEach((t) => {
    s = s.replace(new RegExp(t.re.source, "gi"), " ");
  });
  return s
    .replace(NOISE, " ")
    .replace(/[^\p{L}\p{N}\s,]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createEventLocator({ fetchImpl, cache, geocode, now = () => new Date() } = {}) {
  const json = (url, opts = {}) => getJson(url, { fetchImpl, timeoutMs: 8000, headers: { "User-Agent": USER_AGENT }, ...opts });

  /** Wikipedia search -> the top article's Wikidata item, then its coordinates and dates. */
  async function lookupKnowledge(text) {
    const lang = /[㐀-鿿]/.test(text) ? "zh" : "en";
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: text,
      gsrlimit: "3",
      prop: "pageprops|coordinates",
      ppprop: "wikibase_item",
      redirects: "1",
      format: "json",
      formatversion: "2",
    });
    const body = await json(`https://${lang}.wikipedia.org/w/api.php?${params}`);
    const pages = ((body.query && body.query.pages) || []).sort((a, b) => (a.index || 0) - (b.index || 0));
    for (const page of pages) {
      const qid = page.pageprops && page.pageprops.wikibase_item;
      const fromWiki = page.coordinates && page.coordinates[0];
      let coords = fromWiki ? { lat: fromWiki.lat, lon: fromWiki.lon } : null;
      let dates = {};
      if (qid) {
        try {
          const data = await json(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
          const claims = (data.entities && data.entities[qid] && data.entities[qid].claims) || {};
          const value = (p) => claims[p] && claims[p][0] && claims[p][0].mainsnak.datavalue && claims[p][0].mainsnak.datavalue.value;
          const day = (p) => {
            const v = value(p);
            return v && v.time && v.precision >= 10 ? v.time.slice(1, 11).replace(/-00/g, "-01") : null;
          };
          const pos = value("P625");
          if (!coords && pos) coords = { lat: pos.latitude, lon: pos.longitude };
          dates = { start: day("P580") || day("P585"), end: day("P582") };
        } catch {
          /* the article alone is still useful */
        }
      }
      if (coords) {
        return {
          title: page.title,
          url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
          qid,
          coords,
          dates,
        };
      }
    }
    return null;
  }

  /** NASA CMR: the HLS Sentinel-2 scene nearest the event on one side, with little cloud. */
  async function clearScene(center, from, to, newestFirst) {
    const d = 0.05;
    const params = new URLSearchParams({
      short_name: "HLSS30",
      bounding_box: [center.lon - d, center.lat - d, center.lon + d, center.lat + d].map((x) => x.toFixed(4)).join(","),
      temporal: `${from}T00:00:00Z,${to}T23:59:59Z`,
      cloud_cover: "0,20",
      page_size: "20",
      sort_key: newestFirst ? "-start_date" : "start_date",
    });
    const body = await json(`${CMR_URL}?${params}`, { timeoutMs: 6000 });
    const entry = body.feed && body.feed.entry && body.feed.entry[0];
    return entry ? { date: entry.time_start.slice(0, 10), cloud: Number(entry.cloud_cover) } : null;
  }

  return async function locate(rawQuery) {
    const query = String(rawQuery || "").trim().slice(0, 500);
    if (query.length < 2) throw new EventError("請輸入事件名稱或貼上新聞連結。", 400);
    const steps = [];

    // 1. A link: read the article's headline, summary and date
    let text = query;
    let published = null;
    let source = null;
    if (/^https?:\/\//i.test(query)) {
      let html;
      try {
        html = await getText(query, { fetchImpl, timeoutMs: 8000, headers: { "User-Agent": USER_AGENT } });
      } catch {
        throw new EventError("讀不到這個新聞連結，可以改貼新聞標題試試。", 502);
      }
      const article = readArticle(html);
      if (!article.title) throw new EventError("這個網頁沒有可讀的標題，可以改貼新聞標題試試。");
      text = `${article.title} ${article.description}`;
      published = article.published;
      source = { kind: "news", title: article.title, url: query };
      steps.push({ icon: "📰", text: `讀取新聞：「${article.title}」${published ? `（${published}）` : ""}` });
    }

    // 2. Rules: what and when
    const kind = detectType(text);
    steps.push(kind ? { icon: kind.icon, text: `災害類型：${kind.label}` } : { icon: "❔", text: "沒看出災害類型，先當一般地點處理" });
    let when = parseDate(text);
    if (!when && published) when = { date: published, precision: "day", fromPublished: true };

    // Built-in, hand-checked cases come first: they are the most reliable for a demo
    const presetId = matchPreset(text);
    if (presetId && (!kind || ["fire", "landslide", "flood"].includes(kind.type))) {
      steps.push({ icon: "✅", text: "符合內建案例，直接套用已確認無雲的影像日期" });
      return { preset: presetId, steps, source };
    }

    // 3. Knowledge base: where (and when, if the text didn't say)
    let where = null;
    let knowledge = null;
    try {
      knowledge = await lookupKnowledge(source ? source.title : query);
    } catch {
      knowledge = null;
    }
    if (knowledge) {
      where = { lat: knowledge.coords.lat, lon: knowledge.coords.lon, name: knowledge.title };
      steps.push({ icon: "📚", text: `知識庫：Wikipedia「${knowledge.title}」${knowledge.qid ? `（Wikidata ${knowledge.qid}）` : ""}`, url: knowledge.url });
      if ((!when || when.precision !== "day") && knowledge.dates.start) {
        when = { date: knowledge.dates.start, precision: "day", end: knowledge.dates.end };
      } else if (when && knowledge.dates.end && knowledge.dates.end > when.date) {
        when.end = knowledge.dates.end;
      }
    }

    // 4. Geocoding: the place names left in the text
    if (!where && geocode) {
      const words = placeWords(source ? source.title : query);
      if (words) {
        try {
          const place = await geocode(words);
          where = { lat: place.latitude, lon: place.longitude, name: place.location };
        } catch {
          where = null;
        }
      }
    }
    if (!where) throw new EventError("找不到事件的地點。可以加上地名，例如「2025 洛杉磯大火」或「花蓮 堰塞湖」。");
    steps.push({ icon: "📍", text: `地點：${where.name}（${where.lat.toFixed(3)}, ${where.lon.toFixed(3)}）` });

    if (!when) throw new EventError("找不到事件的日期。可以加上年份或日期，例如「2025年1月 洛杉磯大火」。");
    steps.push({
      icon: "📅",
      text: `事件日期：${when.precision === "year" ? when.date.slice(0, 4) + " 年（只知道年份，日期可能不準）" : when.precision === "month" ? when.date.slice(0, 7) : when.date}${when.end ? ` ～ ${when.end}` : ""}${when.fromPublished ? "（新聞發布日）" : ""}`,
    });

    // 5. Imagery: clear scenes just before and just after
    const today = now().toISOString().slice(0, 10);
    const eventDay = when.date;
    const after0 = addDays(when.end || eventDay, 1);
    if (eventDay < addDays(HLS_FIRST_DAY, 20)) throw new EventError("每日衛星影像（NASA HLS）從 2016 年開始，這個事件太早了。");
    if (after0 > today) throw new EventError("事件還太新，災後的衛星影像還沒有。");
    const center = { lat: where.lat, lon: where.lon };
    let before = null;
    let after = null;
    try {
      [before, after] = await Promise.all([
        clearScene(center, addDays(eventDay, -60), addDays(eventDay, -1), true),
        clearScene(center, after0, [addDays(after0, 60), today].sort()[0], false),
      ]);
    } catch {
      /* the catalogue is a bonus: fall back to fixed offsets */
    }
    const left = before ? before.date : addDays(eventDay, -14);
    const right = after ? after.date : [addDays(after0, 10), today].sort()[0];
    steps.push({
      icon: "🛰️",
      text:
        before && after
          ? `NASA 衛星目錄：災前 ${left}（雲量 ${before.cloud}%）、災後 ${right}（雲量 ${after.cloud}%）`
          : `衛星目錄沒有找到雲量 20% 以下的影像，先用 ${left} 和 ${right}，有雲的話可以手動改日期`,
    });

    return {
      event: {
        name: `${kind ? kind.icon + " " : ""}${where.name}`,
        type: kind ? kind.type : null,
        date: eventDay,
        center: [Number(where.lat.toFixed(5)), Number(where.lon.toFixed(5))],
        zoom: kind ? kind.zoom : 12,
        left: { source: "hls", value: left },
        right: { source: "hls", value: right },
      },
      steps,
      source: source || (knowledge ? { kind: "wikipedia", title: knowledge.title, url: knowledge.url } : null),
    };
  };
}

module.exports = { createEventLocator, parseDate, detectType, matchPreset, readArticle, placeWords, addDays, EventError };
