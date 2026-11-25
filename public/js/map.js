/* global L */
/**
 * Leaflet map: base-layer switcher, a GeoJSON city-temperature layer,
 * an optional rain-radar overlay, and click-to-get-weather.
 * Exposes window.WeatherMap; app.js works without it if Leaflet fails to load.
 */
(function () {
  "use strict";
  if (typeof L === "undefined") return;

  const TAIWAN = [23.7, 121];

  /**
   * Mapbox styles drawn as raster tiles, so they plug straight into Leaflet like any other
   * base map (Leaflet only displays tiles; where they come from is up to us).
   * 512px tiles with zoomOffset -1 is Mapbox's recommended setup for Leaflet.
   */
  function mapboxLayer(style, token) {
    return L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/512/{z}/{x}/{y}@2x?access_token=${token}`, {
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: 20,
      attribution:
        '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
  }

  function createBaseLayers(mapboxToken) {
    const mapbox = mapboxToken
      ? {
          // The two Mapbox styles closest to 瑞竣's work: imagery with labels, and a quiet base for data
          "Mapbox 衛星混合圖": mapboxLayer("satellite-streets-v12", mapboxToken),
          "Mapbox 淺色底圖": mapboxLayer("light-v11", mapboxToken),
        }
      : {};
    return {
      街道圖: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }),
      淺色底圖: L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 16, attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors" }
      ),
      地形圖: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
        maxZoom: 17,
        attribution: 'Map data &copy; OpenStreetMap contributors, SRTM | Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
      }),
      衛星影像: L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 18, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics" }
      ),
      ...mapbox,
    };
  }

  /** Place names and boundaries drawn on top of the imagery (a "hybrid" satellite map). */
  function createLabelsLayer() {
    return L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 18, pane: "overlayPane", attribution: "Labels &copy; Esri" }
    );
  }

  /** A map button that toggles browser full screen, handy for demos. */
  const FullscreenControl = L.Control.extend({
    options: { position: "topleft" },
    onAdd(map) {
      const container = L.DomUtil.create("div", "leaflet-bar leaflet-control");
      const button = L.DomUtil.create("a", "fullscreen-button", container);
      button.href = "#";
      button.title = "全螢幕";
      button.setAttribute("role", "button");
      button.setAttribute("aria-label", "全螢幕");
      button.textContent = "⛶";
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(button, "click", (e) => {
        L.DomEvent.preventDefault(e);
        const target = document.documentElement; // the whole app, so the floating panel stays visible
        if (document.fullscreenElement) document.exitFullscreen();
        else if (target.requestFullscreen) target.requestFullscreen();
      });
      document.addEventListener("fullscreenchange", () => {
        button.title = document.fullscreenElement ? "離開全螢幕" : "全螢幕";
        setTimeout(() => map.invalidateSize(), 100);
      });
      return container;
    },
  });

  /** City temperatures (GeoJSON from /api/cities) drawn as labelled points. */
  function createCityLayer(getUnit) {
    const layer = L.geoJSON(null, {
      pointToLayer(feature, latlng) {
        return L.marker(latlng, { icon: cityIcon(feature.properties, getUnit()), keyboard: false });
      },
      onEachFeature(feature, marker) {
        marker.bindTooltip(`${feature.properties.name} · ${feature.properties.text}`, { direction: "top", offset: [0, -14] });
      },
    });
    layer.refreshUnits = () =>
      layer.eachLayer((m) => m.setIcon(cityIcon(m.feature.properties, getUnit())));

    fetch("/api/cities")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((geojson) => layer.addData(geojson))
      .catch(() => {
        /* layer simply stays empty */
      });
    return layer;
  }

  function cityIcon(props, unit) {
    const span = document.createElement("span");
    span.className = "city-pin wx-still"; // 14 always-visible pins: keep them static to save CPU
    if (window.WxIcons) span.insertAdjacentHTML("afterbegin", WxIcons.svg(props.kind, 26)); // trusted, fixed markup
    else span.append(`${props.icon} `);
    span.append(`${props.name} ${WeatherFormat.formatTemp(props.temperature, unit)}`);
    return L.divIcon({ className: "city-pin-wrap", html: span.outerHTML, iconSize: null });
  }

  /**
   * Animated weather pin: the icon plus a label. Built from DOM nodes because
   * place names come from third parties (no HTML strings with their text).
   */
  function wxIcon({ kind, temperature, name, main, ring }, unit) {
    const root = document.createElement("div");
    // Only the searched place and the nearest ring animate; the outer ring stays still (less CPU).
    root.className = `wx-pin${main ? " wx-main" : ""}${ring > 1 ? " wx-still" : ""}`;
    if (main) root.appendChild(Object.assign(document.createElement("span"), { className: "wx-halo" }));
    if (window.WxIcons) root.insertAdjacentHTML("beforeend", WxIcons.svg(kind, main ? 66 : 46));
    const label = document.createElement("span");
    label.className = "wx-label";
    if (name) label.appendChild(Object.assign(document.createElement("span"), { className: "wx-name", textContent: name }));
    label.appendChild(Object.assign(document.createElement("b"), { textContent: WeatherFormat.formatTemp(temperature, unit) }));
    root.appendChild(label);
    const w = main ? 66 : 46;
    return L.divIcon({ className: "wx-pin-wrap", html: root, iconSize: [w, w], iconAnchor: [w / 2, w / 2], popupAnchor: [0, -w / 2] });
  }

  /** District name for a point (BigDataCloud's free client-side reverse geocoder, no key). */
  const nameCache = new Map();
  function placeName(lat, lon, signal) {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (nameCache.has(key)) return Promise.resolve(nameCache.get(key));
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`;
    return fetch(url, { signal })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => {
        const name = (d && (d.locality || d.city)) || "";
        nameCache.set(key, name);
        return name;
      })
      .catch(() => "");
  }

  let pinClick = () => {}; // set in init(): a click on a nearby pin

  /** Animated icons around the searched place (GeoJSON from /api/nearby). */
  function createNearbyLayer(map, getUnit) {
    const layer = L.layerGroup();
    let controller = null;

    function draw(marker) {
      marker.setIcon(wxIcon(marker.wx, getUnit()));
    }

    async function load(lat, lon, centreName) {
      if (controller) controller.abort();
      controller = new AbortController();
      const { signal } = controller;
      layer.clearLayers();
      let geo;
      try {
        const r = await fetch(`/api/nearby?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, { signal });
        if (!r.ok) return;
        geo = await r.json();
      } catch {
        return;
      }
      const markers = geo.features.slice(1).map((f) => {
        const [x, y] = f.geometry.coordinates;
        const m = L.marker([y, x], { keyboard: false, zIndexOffset: f.properties.ring === 1 ? 100 : 0 });
        m.wx = { ...f.properties, name: "" };
        m.bindTooltip(`${f.properties.text}`, { direction: "top", offset: [0, -22] });
        m.on("click", () => pinClick(m.getLatLng())); // same rules as a map click
        draw(m);
        layer.addLayer(m);
        return m;
      });
      // Names arrive afterwards; show each district name once, closest ring first.
      const names = await Promise.all(markers.map((m) => placeName(m.getLatLng().lat, m.getLatLng().lng, signal)));
      if (signal.aborted) return;
      const seen = new Set([centreName]);
      markers.forEach((m, i) => {
        const name = names[i];
        if (name && !seen.has(name)) {
          seen.add(name);
          m.wx.name = name;
          m.setTooltipContent(`${name} · ${m.wx.text}`);
          draw(m);
        }
      });
    }

    layer.load = load;
    layer.refreshUnits = () => layer.eachLayer(draw);
    return layer;
  }

  /** RainViewer radar tiles (free, no key). The newest frame is looked up at runtime. */
  function createRadarLayer() {
    const group = L.layerGroup();
    let loaded = false;
    group.on("add", () => {
      if (loaded) return;
      loaded = true;
      fetch("https://api.rainviewer.com/public/weather-maps.json")
        .then((r) => r.json())
        .then((data) => {
          const frames = data.radar && data.radar.past;
          if (!frames || !frames.length) return;
          const latest = frames[frames.length - 1];
          L.tileLayer(`${data.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`, {
            opacity: 0.6,
            maxNativeZoom: 7,
            maxZoom: 19,
            attribution: '<a href="https://www.rainviewer.com/" target="_blank">RainViewer</a>',
          }).addTo(group);
        })
        .catch(() => {
          loaded = false;
        });
    });
    return group;
  }

  /** Hide city labels whose minZoom is above the current zoom (simple label-collision control). */
  function applyMinZoom(map, cityLayer) {
    const zoom = map.getZoom();
    cityLayer.eachLayer((m) => {
      const el = m.getElement();
      if (el) el.style.display = zoom >= (m.feature.properties.minZoom || 0) ? "" : "none";
    });
  }

  function init(containerId, { onPick, getUnit, onDismiss }) {
    const map = L.map(containerId, { zoomControl: true, worldCopyJump: true }).setView(TAIWAN, 7);
    const mapboxToken = document.getElementById(containerId)?.dataset.mapboxToken || "";
    const bases = createBaseLayers(mapboxToken);
    bases.衛星影像.addTo(map); // satellite by default: closest to remote-sensing imagery
    const labels = createLabelsLayer().addTo(map);
    // Mapbox styles carry their own place names: hide the Esri label overlay on them, bring it back on 衛星影像.
    map.on("baselayerchange", (e) => {
      if (e.name.startsWith("Mapbox")) labels.remove();
      else if (e.name === "衛星影像" && !map.hasLayer(labels)) labels.addTo(map);
    });

    const cities = createCityLayer(getUnit).addTo(map);
    const refreshLabels = () => applyMinZoom(map, cities);
    map.on("zoomend", refreshLabels);
    cities.on("layeradd", refreshLabels);
    map.on("overlayadd", refreshLabels);
    const radar = createRadarLayer();
    const nearby = createNearbyLayer(map, getUnit).addTo(map);
    // Fewer pins when zoomed out, so the animated icons don't pile up
    const thinOut = () => {
      const z = map.getZoom();
      map.getContainer().classList.toggle("wx-hide-outer", z < 11);
      map.getContainer().classList.toggle("wx-hide-all", z < 9);
    };
    map.on("zoomend", thinOut);
    thinOut();
    L.control
      .layers(bases, { 地名與行政界線: labels, 城市即時氣溫: cities, 附近天氣動畫: nearby, 雷達回波: radar }, { collapsed: true }) // an icon, so it never covers popups or the drawer
      .addTo(map);
    new FullscreenControl().addTo(map);
    if (window.ImageryCompare) window.ImageryCompare.attach(map); // 災前災後比對（swipe）
    L.control.scale({ imperial: false }).addTo(map);

    let marker = null;

    // A click while a popup is open only closes it (Leaflet closes it on "preclick"),
    // so browsing the map never looks up a place by accident.
    let popupOpen = false;
    let swallowClick = false;
    map.on("popupopen", () => (popupOpen = true));
    map.on("popupclose", () => (popupOpen = false));
    map.on("preclick", () => (swallowClick = popupOpen));

    map.on("click", (e) => {
      // The before/after panel folds away first, so the swipe divider can be dragged.
      if (window.ImageryCompare && window.ImageryCompare.handleMapClick()) {
        swallowClick = false;
        return;
      }
      if (swallowClick) {
        swallowClick = false;
        if (onDismiss) onDismiss(); // e.g. also fold the forecast drawer away
        return;
      }
      const { lat, lng } = e.latlng.wrap(); // keep longitude in -180..180 after panning around the globe
      onPick(lat, lng);
    });
    pinClick = (latlng) => {
      if (popupOpen) {
        map.closePopup();
        if (onDismiss) onDismiss();
        return;
      }
      onPick(latlng.lat, latlng.lng);
    };

    return {
      /** info: { kind, temperature, name } of the searched place, for its animated pin. */
      show(lat, lon, content, info) {
        const latlng = [lat, lon];
        if (!marker) marker = L.marker(latlng, { zIndexOffset: 1000 }).addTo(map);
        else marker.setLatLng(latlng);
        marker.wx = { ...(info || {}), main: true };
        marker.setIcon(info ? wxIcon(marker.wx, getUnit()) : new L.Icon.Default());
        // Keep the popup clear of the floating search panel (top-left; the whole top on phones).
        const phone = window.innerWidth <= 640;
        const headH = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--head-h"), 10) || 0;
        marker.bindPopup(content, {
          maxWidth: 320,
          minWidth: 240,
          autoPanPaddingTopLeft: L.point(phone ? 10 : 440, phone ? headH + 20 : 20),
          autoPanPaddingBottomRight: L.point(20, phone ? 70 : 20),
        });
        // Open the popup once the map has stopped moving, so its auto-pan can keep it
        // clear of the search panel (opening it first lets flyTo push it under the header).
        let opened = false;
        const openNow = () => {
          if (opened) return;
          opened = true;
          // On phones the forecast sheet already shows this place; don't stack the popup on it.
          if (phone && document.body.classList.contains("drawer-open")) return;
          marker.openPopup();
        };
        map.once("moveend", openNow);
        setTimeout(openNow, 1500); // in case the map didn't need to move at all
        map.flyTo(latlng, Math.max(map.getZoom(), 11), { duration: 0.8 });
        nearby.load(lat, lon, info && info.name);
      },
      refreshUnits() {
        cities.refreshUnits();
        nearby.refreshUnits();
        if (marker && marker.wx && marker.wx.kind) marker.setIcon(wxIcon(marker.wx, getUnit()));
        refreshLabels();
      },
      invalidateSize() {
        map.invalidateSize();
      },
      closePopup() {
        map.closePopup();
      },
      flyTo(lat, lon, zoom) {
        map.flyTo([lat, lon], zoom, { duration: 1 });
      },
    };
  }

  window.WeatherMap = { init };
})();
