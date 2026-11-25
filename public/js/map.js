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

  function createBaseLayers() {
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
        const target = map.getContainer().closest(".map-card") || map.getContainer();
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
    span.className = "city-pin";
    span.textContent = `${props.name} ${props.icon} ${WeatherFormat.formatTemp(props.temperature, unit)}`;
    return L.divIcon({ className: "city-pin-wrap", html: span.outerHTML, iconSize: null });
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

  function init(containerId, { onPick, getUnit }) {
    const map = L.map(containerId, { zoomControl: true, worldCopyJump: true }).setView(TAIWAN, 7);
    const bases = createBaseLayers();
    bases.衛星影像.addTo(map); // satellite by default: closest to remote-sensing imagery
    const labels = createLabelsLayer().addTo(map);

    const cities = createCityLayer(getUnit).addTo(map);
    const refreshLabels = () => applyMinZoom(map, cities);
    map.on("zoomend", refreshLabels);
    cities.on("layeradd", refreshLabels);
    map.on("overlayadd", refreshLabels);
    const radar = createRadarLayer();
    L.control
      .layers(bases, { 地名與行政界線: labels, 城市即時氣溫: cities, 雷達回波: radar }, { collapsed: window.innerWidth < 900 })
      .addTo(map);
    new FullscreenControl().addTo(map);
    if (window.ImageryCompare) window.ImageryCompare.attach(map); // 災前災後比對（swipe）
    L.control.scale({ imperial: false }).addTo(map);

    let marker = null;

    map.on("click", (e) => {
      const { lat, lng } = e.latlng.wrap(); // keep longitude in -180..180 after panning around the globe
      onPick(lat, lng);
    });

    return {
      show(lat, lon, content) {
        const latlng = [lat, lon];
        if (!marker) marker = L.marker(latlng).addTo(map);
        else marker.setLatLng(latlng);
        marker.bindPopup(content, { maxWidth: 320, minWidth: 240 }).openPopup();
        map.flyTo(latlng, Math.max(map.getZoom(), 9), { duration: 0.8 });
      },
      refreshUnits() {
        cities.refreshUnits();
        refreshLabels();
      },
      invalidateSize() {
        map.invalidateSize();
      },
    };
  }

  window.WeatherMap = { init };
})();
