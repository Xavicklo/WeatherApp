/**
 * Text → disaster: a tiny "GeoAI"-style step that reads a keyword, a pasted
 * paragraph or a news article's title and decides which before/after
 * imagery preset it is about. Rule-based (keyword weights), so it is
 * explainable and testable; an LLM could replace match() later without
 * changing the API.
 *
 * Preset ids must match PRESETS in public/js/compare.js.
 */
const net = require("node:net");

const DISASTERS = [
  {
    id: "mataian-lake",
    name: "花蓮馬太鞍溪堰塞湖",
    keywords: { 馬太鞍: 3, 堰塞湖: 3, 崩塌: 1, 薇帕: 2, 萬榮: 1, mataian: 3, "landslide dam": 2, "barrier lake": 2 },
  },
  {
    id: "mataian-flood",
    name: "馬太鞍溪堰塞湖溢流（光復鄉）",
    keywords: { 光復: 3, 溢流: 3, 潰堤: 2, 洪水: 1, 泥流: 2, 樺加沙: 2, 馬太鞍溪橋: 2, guangfu: 3, ragasa: 2 },
  },
  {
    id: "la-altadena",
    name: "洛杉磯 Eaton 大火（Altadena）",
    keywords: {
      洛杉磯: 3, 加州: 2, 野火: 1, 山火: 1, eaton: 3, altadena: 3, pasadena: 2, palisades: 2,
      "los angeles": 3, california: 2, wildfire: 1, "la fire": 2,
    },
  },
  {
    id: "au-longwood",
    name: "澳洲維多利亞州 Longwood 森林大火",
    keywords: {
      澳洲: 3, 澳大利亞: 3, 維多利亞: 2, 墨爾本: 1, 森林大火: 1, 叢林大火: 2,
      australia: 3, australian: 3, victoria: 2, longwood: 3, bushfire: 2, bushfires: 2, melbourne: 1,
    },
  },
];

/** Best preset for a piece of text, or null. Ties go to the first entry. */
function match(text) {
  const t = String(text || "").toLowerCase();
  let best = null;
  for (const d of DISASTERS) {
    const score = Object.entries(d.keywords).reduce((sum, [k, w]) => sum + (t.includes(k) ? w : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { id: d.id, name: d.name, score };
  }
  // A bare "大火"/"fire" is too vague on its own: need at least one place-specific word (weight ≥ 2)
  return best && best.score >= 2 ? best : null;
}

// ---------- reading a news article's title (with SSRF guards) ----------
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;

function isPrivateIp(host) {
  const h = host.replace(/^\[|\]$/g, "");
  if (!net.isIP(h)) return false;
  if (net.isIPv6(h)) return /^(::1?$|fc|fd|fe80|::ffff:(127|10|192\.168|169\.254)\.)/i.test(h);
  const [a, b] = h.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Only public http(s) URLs; throws a 400-style error otherwise. */
function checkUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error("網址格式不正確。"), { status: 400 });
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || PRIVATE_HOST.test(url.hostname) || isPrivateIp(url.hostname)) {
    throw Object.assign(new Error("只能讀取公開的新聞網址。"), { status: 400 });
  }
  return url;
}

function pickTitle(html) {
  const meta = (prop) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i");
    const alt = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
    return (html.match(re) || html.match(alt) || [])[1];
  };
  const raw = meta("og:title") || (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
  const desc = meta("og:description") || meta("description") || "";
  const clean = (s) =>
    s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  return { title: clean(raw), description: clean(desc) };
}

/** Fetch at most 512 KB of the page (following up to 3 checked redirects) and return its title. */
async function readTitle(rawUrl, { fetchImpl = globalThis.fetch, timeoutMs = 6000 } = {}) {
  let url = checkUrl(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "Mozilla/5.0 (WeatherApp demo; +https://github.com/Xavicklo/WeatherApp)", Accept: "text/html" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = checkUrl(new URL(res.headers.get("location"), url).href); // re-check every hop
      continue;
    }
    if (!res.ok) throw Object.assign(new Error(`新聞網站回應 ${res.status}。`), { status: 502 });
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    while (size < 512 * 1024) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    return pickTitle(Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8"));
  }
  throw Object.assign(new Error("新聞網址轉址太多次。"), { status: 502 });
}

/**
 * q: keyword, pasted text or a news URL.
 * → { match: {id, name} | null, via: "keyword" | "news", title? }
 */
function createDisasterResolver({ fetchImpl, cache } = {}) {
  return async function resolve(q) {
    const text = String(q || "").trim().slice(0, 2000);
    if (!text) throw Object.assign(new Error("請輸入關鍵字或新聞網址。"), { status: 400 });
    if (!/^https?:\/\//i.test(text)) {
      const m = match(text);
      return { match: m && { id: m.id, name: m.name }, via: "keyword" };
    }
    const key = `news:${text}`;
    const cached = cache && cache.get(key);
    if (cached) return cached;
    // The URL itself often carries keywords (…/australia-bushfires-…); the title is read for the rest
    let title = "";
    let description = "";
    try {
      ({ title, description } = await readTitle(text, { fetchImpl }));
    } catch (err) {
      if (err.status === 400) throw err;
    }
    const m = match(`${title} ${description} ${decodeURIComponent(text)}`);
    const result = { match: m && { id: m.id, name: m.name }, via: "news", title: title || null };
    if (cache) cache.set(key, result);
    return result;
  };
}

module.exports = { createDisasterResolver, match, checkUrl, pickTitle, readTitle, DISASTERS };
