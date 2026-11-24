# 🌤️ WeatherApp

A full-stack weather app with an interactive **Web GIS map**. You can search any place or click anywhere on the map to get current conditions, a 24-hour trend and a 7-day forecast.

Built with **Node.js + Express + Handlebars** on the server and **plain JavaScript + Leaflet** in the browser. No API keys are needed.

## Features

- **Search by place name**, with region hints to tell places apart (`Paris, Texas` vs `Paris, France`)
- **Interactive map (Leaflet)**
  - Click any point to get its weather. The point is reverse-geocoded to a place name with OpenStreetMap Nominatim.
  - Base-layer switcher: Streets (OSM), Light (CARTO) or Satellite (Esri)
  - **GeoJSON point layer** showing the current temperature in 14 Taiwanese cities (`/api/cities`), fetched with a single multi-location upstream request
  - Rain-radar overlay (RainViewer tiles) and a metric scale bar
- Current conditions, a **24-hour temperature chart** (hand-drawn SVG) and a **7-day forecast** with temperature-range bars
- °C / °F toggle, 📍 browser geolocation, and recent searches (saved in localStorage)
- Shareable URLs (`/?q=Taipei`)
- The background changes with the weather. The layout is responsive and accessible (ARIA live regions, keyboard focus styles, reduced motion).

## Architecture

```
Browser ──► Express (src/app.js)
             ├─ GET /                 Handlebars pages (SSR)
             ├─ GET /api/weather      ─► controllers/weather.js
             │                              ├─ services/geocode.js         (Open-Meteo geocoding)
             │                              ├─ services/reverseGeocode.js  (Nominatim, coords → name)
             │                              └─ services/forecast.js        (Open-Meteo forecast)
             ├─ GET /api/cities       ─► services/cities.js → GeoJSON FeatureCollection
             └─ GET /healthz
           lib/cache.js  in-memory TTL cache (10 min) shared by all services
           lib/http.js   fetch with an 8 s timeout and consistent 502/504 errors
```

Design notes:

- **Layered:** route → controller → service → HTTP client. The controller is a plain function (`query → {status, body}`), so it can be unit-tested without Express.
- **Dependency injection:** `createApp({ geocode, forecast, ... })` lets the tests swap in fakes instead of calling real APIs.
- **Proper HTTP semantics:** 400 for bad input, 404 for an unknown place, 502 or 504 when the upstream fails. Internal error details are never sent to the client.
- **Parallel I/O:** for map clicks, reverse geocoding and the forecast run with `Promise.all`.
- **Resilience:** if Leaflet or the reverse geocoder is unavailable, search and the forecast still work.
- **Security:** no secrets in the repo, no `x-powered-by` header, basic security headers, and only `textContent` and DOM nodes for third-party strings (no XSS through place names).

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/weather?address=Taipei` | Geocode a place and return its forecast |
| `GET /api/weather?lat=25.03&lon=121.56` | Forecast for coordinates (reverse-geocoded name) |
| `GET /api/cities` | GeoJSON of Taiwanese cities with their current temperature |
| `GET /healthz` | Health check |

`/weather?address=` still works for backwards compatibility.

## Run locally

Requires Node.js 18.17 or later (it uses the built-in `fetch`).

```bash
npm install
npm test        # node:test, no network needed
npm run dev     # restarts on changes
# or
npm start       # http://localhost:3000
```

## Deploy

`render.yaml` is included: on [Render](https://render.com), choose **New → Blueprint**, then pick this repo.

## Data sources

[Open-Meteo](https://open-meteo.com/) (forecast and geocoding) · [OpenStreetMap Nominatim](https://nominatim.org/) (reverse geocoding) · [Leaflet](https://leafletjs.com/) · map tiles © OpenStreetMap contributors, © CARTO, © Esri · radar © [RainViewer](https://www.rainviewer.com/)
