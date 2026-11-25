const express = require("express");
const path = require("path");
const hbs = require("hbs");

const TTLCache = require("./lib/cache");
const { createGeocoder } = require("./services/geocode");
const { createForecaster } = require("./services/forecast");
const { createReverseGeocoder } = require("./services/reverseGeocode");
const { createCityLayer } = require("./services/cities");
const { createWeatherController } = require("./controllers/weather");
const { createWaybackCatalog } = require("./services/wayback");
const { createNearby } = require("./services/nearby");

const AUTHOR = "Xavick Lo";

/**
 * Builds the Express app. Services can be injected (tests pass fakes);
 * by default it uses Open-Meteo with a 10-minute in-memory cache.
 */
function createApp(deps = {}) {
  const cache = deps.cache || new TTLCache({ ttlMs: 10 * 60 * 1000 });
  const geocode = deps.geocode || createGeocoder({ cache });
  const forecast = deps.forecast || createForecaster({ cache });
  const reverseGeocode = deps.reverseGeocode || createReverseGeocoder({ cache });
  const cityLayer = deps.cityLayer || createCityLayer({ cache });
  const waybackReleases = deps.waybackReleases || createWaybackCatalog({ cache });
  const nearby = deps.nearby || createNearby({ cache });
  const handleWeather = createWeatherController({ geocode, forecast, reverseGeocode, logger: deps.logger });

  const app = express();
  app.disable("x-powered-by");

  // Views
  app.set("views", path.join(__dirname, "../templates/views"));
  app.set("view engine", "hbs");
  hbs.registerPartials(path.join(__dirname, "../templates/partials"));
  hbs.registerHelper("eq", (a, b) => a === b);

  // Basic security headers (no extra dependency needed)
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    next();
  });

  // Cache static files in production only, so code changes show up immediately during development.
  const isProd = process.env.NODE_ENV === "production";
  app.use(express.static(path.join(__dirname, "../public"), { maxAge: isProd ? "1h" : 0 }));

  // Values every page uses
  app.use((req, res, next) => {
    res.locals.name = AUTHOR;
    res.locals.year = new Date().getFullYear();
    res.locals.path = req.path;
    next();
  });

  // Pages
  app.get("/", (req, res) => res.render("index", { title: "WeatherApp" }));
  app.get("/about", (req, res) => res.render("about", { title: "關於" }));
  app.get("/help", (req, res) => res.render("help", { title: "使用說明" }));

  // API
  const weatherRoute = async (req, res) => {
    const { status, body } = await handleWeather(req.query);
    res.status(status).json(body);
  };
  app.get("/api/weather", weatherRoute);
  app.get("/weather", weatherRoute); // kept for backwards compatibility

  // GeoJSON point layer of Taiwanese cities with their current temperature
  app.get("/api/cities", async (req, res) => {
    try {
      res.type("application/geo+json").send(JSON.stringify(await cityLayer()));
    } catch (err) {
      res.status(err.status || 500).json({ error: "城市溫度圖層暫時無法使用。" });
    }
  });

  // Current weather at a point and around it (GeoJSON), for the animated map icons
  app.get("/api/nearby", async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (req.query.lat == null || req.query.lon == null || !(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) {
      return res.status(400).json({ error: "lat 和 lon 必須是有效的座標。" });
    }
    try {
      res.type("application/geo+json").send(JSON.stringify(await nearby(lat, lon)));
    } catch (err) {
      res.status(err.status || 500).json({ error: "附近天氣暫時無法使用。" });
    }
  });

  // Archived satellite-imagery releases for the before/after swipe comparison
  app.get("/api/imagery/wayback", async (req, res) => {
    try {
      res.json(await waybackReleases());
    } catch (err) {
      res.status(err.status || 500).json({ error: "歷史衛星影像清單暫時無法使用。" });
    }
  });

  app.get("/healthz", (req, res) => res.json({ status: "ok", uptime: Math.round(process.uptime()) }));

  // 404s: JSON for the API, a page for everything else
  app.use("/api", (req, res) => res.status(404).json({ error: "找不到這個 API。" }));
  app.use((req, res) => {
    res.status(404).render("404", {
      title: "404",
      errorMessage: req.path.startsWith("/help/") ? "找不到這篇說明。" : "找不到這個頁面。",
    });
  });

  // Last-resort error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "發生錯誤，請稍後再試。" });
  });

  return app;
}

module.exports = { createApp };
