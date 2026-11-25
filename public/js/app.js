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

  /** Animated SVG weather icon (falls back to the emoji if wxicons.js didn't load). */
  function wxIcon(className, item, size) {
    const span = el("span", { class: className, title: item.text });
    if (window.WxIcons && item.kind) span.innerHTML = window.WxIcons.svg(item.kind, size); // fixed, trusted markup
    else span.textContent = item.icon;
    return span;
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
  async function load(params, label, opts = {}) {
    // Cancel an in-flight request so a slow old response can't overwrite a newer one.
    if (state.controller) state.controller.abort();
    const controller = new AbortController();
    state.controller = controller;

    setLoading(true);
    setStatus(`正在查詢 ${label} 的天氣…`);

    try {
      const res = await fetch("/api/weather?" + new URLSearchParams(params), { signal: controller.signal });
      const data = await res.json().catch(() => ({ error: "伺服器回傳了無法辨識的資料。" }));
      if (!res.ok || data.error) throw new Error(data.error || `查詢失敗（${res.status}）`);

      state.data = data;
      render();
      showOnMap(data);
      setStatus("");
      if (params.address) {
        addRecent(params.address);
        updateUrl(params.address);
      }
      // A typed search (or "my location") slides the forecast drawer out; map clicks keep the map in view.
      if (opts.open && window.Layout) {
        window.Layout.foldPanel();
        window.Layout.open();
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      els.result.hidden = true;
      setStatus(err.message || "發生錯誤，請稍後再試。", "error");
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
    load({ address: query }, `「${query}」`, { open: true });
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
    const text = current.text;
    let theme = current.isDay ? "day" : "night";
    if (/雷/.test(text)) theme = "storm";
    else if (/雨/.test(text)) theme = "rain";
    else if (/雪/.test(text)) theme = "snow";
    else if (/陰|霧|多雲/.test(text) && current.isDay) theme = "cloudy";
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
    document.title = `${F.formatTemp(c.temperature, u)} ${d.location} · WeatherApp`;
    if (window.Layout) {
      window.Layout.peek(`${String(d.location).split(",")[0]} ${F.formatTemp(c.temperature, u)}`);
      window.Layout.ready();
    }

    els.place.textContent = d.location;
    els.placeMeta.textContent = `${F.formatCoord(d.latitude, d.longitude)} · 當地時間 ${c.time.replace("T", " ")}`;
    els.condition.textContent = c.text;
    if (window.WxIcons && c.kind) els.icon.innerHTML = window.WxIcons.svg(c.kind, 64); // fixed, trusted markup
    else els.icon.textContent = c.icon;
    els.temp.textContent = F.formatTemp(c.temperature, u);
    els.summary.textContent = today
      ? `體感 ${F.formatTemp(c.feelsLike, u)} · 最高 ${F.formatTemp(today.max, u)} · 最低 ${F.formatTemp(today.min, u)}`
      : `體感 ${F.formatTemp(c.feelsLike, u)}`;

    els.stats.replaceChildren(
      stat("相對濕度", `${c.humidity}%`),
      stat("降雨機率", today ? `${today.precipitationProbability ?? 0}%` : "–"),
      stat("風速", `${Math.round(c.windSpeed)} km/h`, F.compass(c.windDirection)),
      stat("紫外線指數", c.uvIndex == null ? "–" : String(c.uvIndex), F.uvLabel(c.uvIndex)),
      stat("能見度", c.visibility == null ? "–" : `${c.visibility} km`),
      stat("氣壓", `${c.pressure} hPa`),
      stat("日出", today ? F.formatHour(today.sunrise) : "–"),
      stat("日落", today ? F.formatHour(today.sunset) : "–")
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
      `未來 24 小時氣溫，從 ${F.formatTemp(hours[0].temperature, unit)} 到 ${F.formatTemp(
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
          wxIcon("hour-icon", h, 30),
          el("span", { class: "hour-rain", text: h.precipitationProbability ? `💧${h.precipitationProbability}%` : "" }),
          el("span", { class: "hour-time", text: i === 0 ? "現在" : F.formatHour(h.time) }),
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
          wxIcon("day-icon", day, 30),
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
        onDismiss: () => window.Layout && window.Layout.close(),
        onPick: (lat, lon) => {
          if (window.Layout && window.Layout.takeMapClick()) return; // that tap only folded the phone header
          // With the forecast drawer open, a click on the map just closes it.
          if (window.Layout && window.Layout.isOpen()) return window.Layout.close();
          load({ lat: lat.toFixed(4), lon: lon.toFixed(4) }, F.formatCoord(lat, lon));
        },
        onPin: (lat, lon, name) => {
          const params = { lat: lat.toFixed(4), lon: lon.toFixed(4) };
          if (name) params.name = name;
          load(params, name || F.formatCoord(lat, lon), { open: true });
        },
      });
    }
  } catch (err) {
    console.error("Map failed to start:", err);
  }
  if (!map) document.body.classList.add("no-map");
  else document.addEventListener("drawer:open", () => map.closePopup());


  function showOnMap(data) {
    if (!map || !data.point) return;
    // Build the popup with DOM nodes, not an HTML string: place names come from a third party.
    const c = data.current;
    const today = data.daily[0] || {};
    const u = state.unit;
    const row = (label, value) => el("div", { class: "popup-row" }, [el("span", { text: label }), el("b", { text: value })]);
    const more = el("button", { type: "button", class: "popup-more", text: "查看完整預報" });
    more.addEventListener("click", () => {
      if (window.Layout) window.Layout.open(els.result);
      else els.result.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    const popup = el("div", { class: "map-popup" }, [
      el("strong", { class: "popup-title", text: data.location }),
      el("div", { class: "popup-now" }, [
        wxIcon("popup-icon", c, 40),
        el("span", { class: "popup-temp", text: F.formatTemp(c.temperature, u) }),
        el("span", { class: "popup-cond", text: c.text }),
      ]),
      row("體感溫度", F.formatTemp(c.feelsLike, u)),
      row("今日高低溫", `${F.formatTemp(today.max, u)} / ${F.formatTemp(today.min, u)}`),
      row("降雨機率", `${today.precipitationProbability ?? 0}%`),
      row("相對濕度", `${c.humidity}%`),
      row("風速", `${Math.round(c.windSpeed)} km/h ${F.compass(c.windDirection)}`),
      el("small", { class: "popup-coord", text: `WGS84：${F.formatCoord(data.point.latitude, data.point.longitude)}` }),
      more,
    ]);
    try {
      map.show(data.point.latitude, data.point.longitude, popup, {
        kind: c.kind,
        temperature: c.temperature,
        name: String(data.location).split(",")[0],
      });
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
  // ---------- mode: weather ⇄ before/after imagery ----------
  const modeBtns = document.querySelectorAll(".mode-switch button");
  const isCompare = () => document.body.classList.contains("compare-mode");
  function setMode(compare) {
    document.body.classList.toggle("compare-mode", compare);
    modeBtns.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.mode === "compare") === compare)));
    els.input.placeholder = compare ? "搜尋地點，把地圖移過去比對" : "搜尋城市，例如 Taipei 或 Paris, France";
    if (compare && window.Layout) window.Layout.close();
    setStatus("");
  }
  modeBtns.forEach((b) =>
    b.addEventListener("click", () => {
      if (!window.ImageryCompare || !map) return;
      if (b.dataset.mode === "compare") window.ImageryCompare.open();
      else window.ImageryCompare.close();
    })
  );
  // compare.js reports every start/stop (also from its own 🛰️ and 關閉比對 buttons)
  document.addEventListener("compare:change", (e) => setMode(e.detail.active));

  /** In comparison mode a search only moves the map there (no weather, no markers). */
  async function flyToPlace(query) {
    setStatus(`正在尋找「${query}」…`);
    try {
      const res = await fetch("/api/weather?" + new URLSearchParams({ address: query }));
      const data = await res.json();
      if (!res.ok || data.error || !data.point) throw new Error(data.error || "找不到這個地點。");
      map.flyTo(data.point.latitude, data.point.longitude, 14);
      setStatus(`已移到 ${data.location}`);
    } catch (err) {
      setStatus(err.message, "error");
    }
  }

  /**
   * Comparison mode: keyword, pasted text or a news URL → the matching before/after preset
   * (a small text-to-place step, like a GeoAI tool). Anything else is treated as a place name.
   */
  async function findDisaster(query) {
    const isUrl = /^https?:\/\//i.test(query);
    setStatus(isUrl ? "正在讀取新聞標題…" : `正在判斷「${query}」…`);
    try {
      const res = await fetch("/api/disaster?" + new URLSearchParams({ q: query }));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "暫時無法判斷。");
      if (data.match) {
        window.ImageryCompare.open(data.match.id);
        const from = data.title ? `從新聞標題「${data.title}」判斷為：` : "判斷為：";
        setStatus(`${from}${data.match.name}`);
        return;
      }
      if (isUrl) {
        setStatus(data.title ? `新聞「${data.title}」沒有對應的災害案例。` : "讀不到這篇新聞的標題，也沒有對應的災害案例。", "error");
        return;
      }
      flyToPlace(query); // not a known disaster: just move the map there
    } catch (err) {
      setStatus(err.message, "error");
    }
  }

  document.querySelectorAll(".examples button").forEach((b) =>
    b.addEventListener("click", () => {
      els.input.value = b.dataset.example;
      if (window.Layout) window.Layout.foldPanel();
      findDisaster(b.dataset.example);
    })
  );

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (window.Layout) window.Layout.foldPanel();
    const query = els.input.value.trim();
    if (isCompare() && map) {
      if (query) findDisaster(query);
      return;
    }
    searchAddress(els.input.value);
  });

  // ---------- search suggestions (autocomplete) ----------
  if (window.Suggest) {
    window.Suggest.attach({
      input: els.input,
      list: document.getElementById("suggest"),
      // rank places near what the user is looking at first
      getBias: () => (map ? map.getCenter() : null),
      onPick(item) {
        if (window.Layout) window.Layout.foldPanel();
        if (isCompare() && map) {
          map.flyTo(item.lat, item.lon, 14);
          setStatus(`已移到 ${item.label}`);
          return;
        }
        addRecent(item.name);
        load({ lat: item.lat.toFixed(5), lon: item.lon.toFixed(5), name: item.label }, `「${item.name}」`, { open: true });
      },
    });
  }

  els.recent.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-query]");
    if (btn) searchAddress(btn.dataset.query);
  });

  els.unitBtns.forEach((btn) => btn.addEventListener("click", () => setUnit(btn.dataset.unit)));

  els.locateBtn.addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      setStatus("你的瀏覽器不支援定位功能。", "error");
      return;
    }
    setStatus("正在取得你的位置…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        load({ lat: latitude.toFixed(4), lon: longitude.toFixed(4) }, "你的位置", { open: true });
      },
      (err) => {
        setStatus(
          err.code === err.PERMISSION_DENIED ? "你拒絕了定位權限。" : "無法取得你的位置。",
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
