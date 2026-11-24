const express = require("express");
const path = require("path");
const hbs = require("hbs");

const TTLCache = require("./lib/cache");
const { createGeocoder } = require("./services/geocode");
const { createForecaster } = require("./services/forecast");
const { createReverseGeocoder } = require("./services/reverseGeocode");
const { createCityLayer } = require("./services/cities");
const { createWeatherController } = require("./controllers/weather");

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

  app.use(express.static(path.join(__dirname, "../public"), { maxAge: "1h" }));

  // Values every page uses
  app.use((req, res, next) => {
    res.locals.name = AUTHOR;
    res.locals.year = new Date().getFullYear();
    res.locals.path = req.path;
    next();
  });

  // Pages
  app.get("/", (req, res) => res.render("index", { title: "Weather" }));
  app.get("/about", (req, res) => res.render("about", { title: "About" }));
  app.get("/help", (req, res) => res.render("help", { title: "Help" }));

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
      res.status(err.status || 500).json({ error: "City layer is unavailable right now." });
    }
  });

  app.get("/healthz", (req, res) => res.json({ status: "ok", uptime: Math.round(process.uptime()) }));

  // 404s: JSON for the API, a page for everything else
  app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));
  app.use((req, res) => {
    res.status(404).render("404", {
      title: "404",
      errorMessage: req.path.startsWith("/help/") ? "Help article not found." : "Page not found.",
    });
  });

  // Last-resort error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "Something went wrong." });
  });

  return app;
}

module.exports = { createApp };
