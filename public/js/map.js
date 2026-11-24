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
      Streets: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }),
      Light: L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 16, attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors" }
      ),
      Topo: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
        maxZoom: 17,
        attribution: 'Map data &copy; OpenStreetMap contributors, SRTM | Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
      }),
      Satellite: L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 18, attribution: "Tiles &copy; Esri" }
      ),
    };
  }

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
    span.textContent = `${props.icon} ${WeatherFormat.formatTemp(props.temperature, unit)}`;
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

  function init(containerId, { onPick, getUnit }) {
    const map = L.map(containerId, { zoomControl: true, worldCopyJump: true }).setView(TAIWAN, 7);
    const bases = createBaseLayers();
    bases.Streets.addTo(map);

    const cities = createCityLayer(getUnit).addTo(map);
    const radar = createRadarLayer();
    L.control.layers(bases, { "City temperatures": cities, "Rain radar": radar }, { collapsed: true }).addTo(map);
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
        marker.bindPopup(content).openPopup();
        map.flyTo(latlng, Math.max(map.getZoom(), 9), { duration: 0.8 });
      },
      refreshUnits() {
        cities.refreshUnits();
      },
      invalidateSize() {
        map.invalidateSize();
      },
    };
  }

  window.WeatherMap = { init };
})();
