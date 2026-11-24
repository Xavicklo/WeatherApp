/* global WeatherFormat */
(function () {
  "use strict";

  const F = WeatherFormat;
  const RECENT_KEY = "weather:recent";
  const UNIT_KEY = "weather:unit";
  const MAX_RECENT = 5;

  const $ = (sel) => document.querySelector(sel);
  const els = {
    form: $("#search-form"),
    input: $("#search-input"),
    searchBtn: $("#search-button"),
    locateBtn: $("#locate-button"),
    unitBtns: document.querySelectorAll(".unit-toggle button"),
    recent: $("#recent"),
    status: $("#status"),
    result: $("#result"),
    skeleton: $("#skeleton"),
    place: $("#place"),
    placeMeta: $("#place-meta"),
    condition: $("#condition"),
    icon: $("#icon"),
    temp: $("#temp"),
    summary: $("#summary"),
    stats: $("#stats"),
    hourly: $("#hourly"),
    daily: $("#daily"),
  };

  // ---------- small storage helpers (localStorage can throw in private mode) ----------
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* ignore */
      }
    },
  };

  const state = {
    unit: store.get(UNIT_KEY, "C"),
    recent: store.get(RECENT_KEY, []),
    data: null,
    controller: null,
  };

  // ---------- DOM helper ----------
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "text") node.textContent = v;
      else if (k === "class") node.className = v;
      else if (k === "style") Object.assign(node.style, v);
      else node.setAttribute(k, v);
    });
    (children || []).forEach((c) => c && node.appendChild(c));
    return node;
  }

  // ---------- UI states ----------
  function setStatus(message, kind) {
    els.status.textContent = message || "";
    els.status.className = "status" + (kind ? " " + kind : "");
  }

  function setLoading(loading) {
    els.searchBtn.disabled = loading;
    els.locateBtn.disabled = loading;
    els.skeleton.hidden = !loading;
    if (loading) els.result.hidden = true;
  }

  // ---------- data ----------
  async function load(params, label) {
    // Cancel an in-flight request so a slow old response can't overwrite a newer one.
    if (state.controller) state.controller.abort();
    const controller = new AbortController();
    state.controller = controller;

    setLoading(true);
    setStatus(`Loading weather for ${label}…`);

    try {
      const res = await fetch("/api/weather?" + new URLSearchParams(params), { signal: controller.signal });
      const data = await res.json().catch(() => ({ error: "Unexpected response from server." }));
      if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);

      state.data = data;
      render();
      showOnMap(data);
      setStatus("");
      if (params.address) {
        addRecent(params.address);
        updateUrl(params.address);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      els.result.hidden = true;
      setStatus(err.message || "Something went wrong.", "error");
    } finally {
      if (state.controller === controller) {
        state.controller = null;
        setLoading(false);
        if (state.data && !els.status.classList.contains("error")) els.result.hidden = false;
      }
    }
  }

  function searchAddress(address) {
    const query = address.trim();
    if (!query) return;
    els.input.value = query;
    load({ address: query }, `"${query}"`);
  }

  function updateUrl(query) {
    const url = new URL(window.location.href);
    url.searchParams.set("q", query);
    history.replaceState(null, "", url);
  }

  // ---------- recent searches ----------
  function addRecent(query) {
    const lower = query.toLowerCase();
    state.recent = [query].concat(state.recent.filter((q) => q.toLowerCase() !== lower)).slice(0, MAX_RECENT);
    store.set(RECENT_KEY, state.recent);
    renderRecent();
  }

  function renderRecent() {
    els.recent.replaceChildren(
      ...state.recent.map((q) =>
        el("li", {}, [el("button", { type: "button", class: "chip", text: q, "data-query": q })])
      )
    );
  }

  // ---------- rendering ----------
  function applyTheme(current) {
    const code = current.text.toLowerCase();
    let theme = current.isDay ? "day" : "night";
    if (/thunder/.test(code)) theme = "storm";
    else if (/rain|drizzle|shower/.test(code)) theme = "rain";
    else if (/snow/.test(code)) theme = "snow";
    else if (/overcast|fog|cloudy/.test(code) && current.isDay) theme = "cloudy";
    document.body.dataset.theme = theme;
  }

  function stat(label, value, sub) {
    return el("div", { class: "stat" }, [
      el("span", { class: "stat-label", text: label }),
      el("span", { class: "stat-value", text: value }),
      sub ? el("span", { class: "stat-sub", text: sub }) : null,
    ]);
  }

  function render() {
    const d = state.data;
    if (!d) return;
    const u = state.unit;
    const c = d.current;
    const today = d.daily[0];

    applyTheme(c);
    document.title = `${F.formatTemp(c.temperature, u)} ${d.location} · Weather`;

    els.place.textContent = d.location;
    els.placeMeta.textContent = `${F.formatCoord(d.latitude, d.longitude)} · Local time ${c.time.replace("T", " ")}`;
    els.condition.textContent = c.text;
    els.icon.textContent = c.icon;
    els.temp.textContent = F.formatTemp(c.temperature, u);
    els.summary.textContent = today
      ? `Feels like ${F.formatTemp(c.feelsLike, u)} · High ${F.formatTemp(today.max, u)} · Low ${F.formatTemp(today.min, u)}`
      : `Feels like ${F.formatTemp(c.feelsLike, u)}`;

    els.stats.replaceChildren(
      stat("Humidity", `${c.humidity}%`),
      stat("Chance of rain", today ? `${today.precipitationProbability ?? 0}%` : "–"),
      stat("Wind", `${Math.round(c.windSpeed)} km/h`, F.compass(c.windDirection)),
      stat("UV index", c.uvIndex == null ? "–" : String(c.uvIndex), F.uvLabel(c.uvIndex)),
      stat("Visibility", c.visibility == null ? "–" : `${c.visibility} km`),
      stat("Pressure", `${c.pressure} hPa`),
      stat("Sunrise", today ? F.formatHour(today.sunrise) : "–"),
      stat("Sunset", today ? F.formatHour(today.sunset) : "–")
    );

    renderHourly(d.hourly, u);
    renderDaily(d.daily, u);
  }

  function renderHourly(hours, unit) {
    const colWidth = 56;
    const height = 120;
    const width = colWidth * (hours.length - 1);
    const values = hours.map((h) => F.toUnit(h.temperature, unit));
    const points = F.chartPoints(values, width, height, 24);

    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `-${colWidth / 2} 0 ${width + colWidth} ${height}`);
    svg.setAttribute("width", width + colWidth);
    svg.setAttribute("height", height);
    svg.setAttribute("class", "hourly-chart");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      `Temperature over the next 24 hours, from ${F.formatTemp(hours[0].temperature, unit)} to ${F.formatTemp(
        hours[hours.length - 1].temperature,
        unit
      )}`
    );

    const area = document.createElementNS(NS, "path");
    area.setAttribute("d", `${F.linePath(points)} L${width},${height} L0,${height} Z`);
    area.setAttribute("class", "chart-area");
    svg.appendChild(area);

    const line = document.createElementNS(NS, "path");
    line.setAttribute("d", F.linePath(points));
    line.setAttribute("class", "chart-line");
    svg.appendChild(line);

    points.forEach((p, i) => {
      const dot = document.createElementNS(NS, "circle");
      dot.setAttribute("cx", p.x);
      dot.setAttribute("cy", p.y);
      dot.setAttribute("r", i === 0 ? 4 : 2.5);
      dot.setAttribute("class", "chart-dot");
      svg.appendChild(dot);

      const label = document.createElementNS(NS, "text");
      label.setAttribute("x", p.x);
      label.setAttribute("y", p.y - 10);
      label.setAttribute("class", "chart-label");
      label.textContent = F.formatTemp(hours[i].temperature, unit);
      svg.appendChild(label);
    });

    const columns = el(
      "div",
      { class: "hourly-cols", style: { width: `${width + colWidth}px` } },
      hours.map((h, i) =>
        el("div", { class: "hour", style: { width: `${colWidth}px` } }, [
          el("span", { class: "hour-icon", text: h.icon, title: h.text }),
          el("span", { class: "hour-rain", text: h.precipitationProbability ? `💧${h.precipitationProbability}%` : "" }),
          el("span", { class: "hour-time", text: i === 0 ? "Now" : F.formatHour(h.time) }),
        ])
      )
    );

    els.hourly.replaceChildren(svg, columns);
  }

  function renderDaily(days, unit) {
    const weekMin = Math.min(...days.map((d) => d.min));
    const weekMax = Math.max(...days.map((d) => d.max));

    els.daily.replaceChildren(
      ...days.map((day, i) => {
        const bar = F.rangeBar(day.min, day.max, weekMin, weekMax);
        return el("li", { class: "day" }, [
          el("span", { class: "day-name", text: F.formatDay(day.date, i) }),
          el("span", { class: "day-icon", text: day.icon, title: day.text }),
          el("span", { class: "day-rain", text: day.precipitationProbability ? `💧${day.precipitationProbability}%` : "" }),
          el("span", { class: "day-min", text: F.formatTemp(day.min, unit) }),
          el("span", { class: "range" }, [
            el("span", { class: "range-fill", style: { left: `${bar.left}%`, width: `${bar.width}%` } }),
          ]),
          el("span", { class: "day-max", text: F.formatTemp(day.max, unit) }),
        ]);
      })
    );
  }

  // ---------- map ----------
  // The map is an enhancement: if Leaflet can't load, search still works.
  let map = null;
  try {
    if (window.WeatherMap) {
      map = window.WeatherMap.init("map", {
        getUnit: () => state.unit,
        onPick: (lat, lon) => load({ lat: lat.toFixed(4), lon: lon.toFixed(4) }, F.formatCoord(lat, lon)),
      });
    }
  } catch (err) {
    console.error("Map failed to start:", err);
  }
  if (!map) document.querySelector(".map-card").hidden = true;

  function showOnMap(data) {
    if (!map || !data.point) return;
    // Build the popup with DOM nodes, not an HTML string: place names come from a third party.
    const popup = el("div", { class: "map-popup" }, [
      el("strong", { text: data.location }),
      el("div", { text: `${data.current.icon} ${F.formatTemp(data.current.temperature, state.unit)} · ${data.current.text}` }),
      el("small", { text: F.formatCoord(data.point.latitude, data.point.longitude) }),
    ]);
    try {
      map.show(data.point.latitude, data.point.longitude, popup);
    } catch (err) {
      console.error(err);
    }
  }

  function setUnit(unit) {
    state.unit = unit;
    store.set(UNIT_KEY, unit);
    els.unitBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.unit === unit)));
    render();
    if (map) map.refreshUnits();
  }

  // ---------- events ----------
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    searchAddress(els.input.value);
  });

  els.recent.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-query]");
    if (btn) searchAddress(btn.dataset.query);
  });

  els.unitBtns.forEach((btn) => btn.addEventListener("click", () => setUnit(btn.dataset.unit)));

  els.locateBtn.addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      setStatus("Your browser doesn't support location.", "error");
      return;
    }
    setStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        load({ lat: latitude.toFixed(4), lon: longitude.toFixed(4) }, "your location");
      },
      (err) => {
        setStatus(
          err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Couldn't get your location.",
          "error"
        );
      },
      { timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  });

  // ---------- start ----------
  setUnit(state.unit);
  renderRecent();
  const initial = new URLSearchParams(window.location.search).get("q") || state.recent[0];
  if (initial) searchAddress(initial);
  else els.input.focus();
})();
