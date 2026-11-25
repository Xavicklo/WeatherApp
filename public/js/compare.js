/* global L */
/**
 * 災前災後比對（swipe）：把兩期衛星影像疊在一起，中間一條可拖曳的分隔線，
 * 左邊顯示「災前」、右邊顯示「災後」。
 *
 * 做法：兩期影像各放在自己的 map pane，依分隔線位置用 CSS clip 裁切。
 * clip 的座標是 pane 自己的座標（layer point），地圖平移後 pane 會跟著位移，
 * 所以每次 move / zoom / resize 都要用 containerPointToLayerPoint 重新換算。
 *
 * 影像來源（都不用 API key）：
 *  - NASA GIBS · HLS（Harmonized Landsat Sentinel-2）：每日、30 m，適合看特定事件前後
 *  - EOX Sentinel-2 cloudless：每年一張無雲合成圖、10 m
 *  - Esri World Imagery Wayback：歷年的高解析底圖版本（版本清單由後端 /api/imagery/wayback 提供）
 */
(function () {
  "use strict";
  if (typeof L === "undefined") return;

  const HLS_URL =
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/HLS_S30_Nadir_BRDF_Adjusted_Reflectance/default/{date}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png";
  const S2_URL = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-{year}_3857/default/g/{z}/{y}/{x}.jpg";
  const S2_YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

  const SOURCES = {
    hls: { label: "NASA HLS 每日影像（30 m）" },
    s2: { label: "Sentinel-2 年度無雲圖（10 m）" },
    wayback: { label: "Esri 歷史高解析影像" },
  };

  /** 預設案例：日期都先確認過當天雲量少、看得出差異。 */
  const PRESETS = [
    {
      id: "mataian-lake",
      name: "馬太鞍溪：崩塌與堰塞湖形成（2025）",
      note: "7 月薇帕颱風外圍環流引發大規模崩塌，堵住河道形成堰塞湖。右側是 9/11（溢流前 12 天）的藍綠色湖面。",
      center: [23.703, 121.295],
      zoom: 13,
      left: { source: "hls", value: "2025-06-15" },
      right: { source: "hls", value: "2025-09-11" },
    },
    {
      id: "mataian-flood",
      name: "馬太鞍溪：堰塞湖溢流後的下游（2025）",
      note: "9/23 堰塞湖溢流，洪水夾帶土石沖向光復鄉，河道明顯變寬、出現大片泥沙。",
      center: [23.675, 121.405],
      zoom: 13,
      left: { source: "hls", value: "2025-06-15" },
      right: { source: "hls", value: "2025-10-11" },
    },
    {
      id: "la-altadena",
      name: "洛杉磯 Eaton 大火：Altadena 住宅區（2025）",
      note: "2025 年 1 月的 Eaton 大火燒毀 Altadena 大片住宅。Esri 高解析影像（約 30 cm）可以看到一棟棟房子：左邊是 2022 年，右邊是 2025 年 8 月，只剩空地。",
      center: [34.195, -118.15],
      zoom: 16,
      left: { source: "wayback", value: "51127" },
      right: { source: "wayback", value: "13192" },
      labels: ["Esri 高解析 · 2022", "Esri 高解析 · 2025-08"],
      // Esri only updated the detailed levels (~30 cm, zoom 16+); below that both releases show the
      // same older imagery. So keep the map at 15+ and draw level 15 from scaled-down level-16 tiles.
      minZoom: 15,
      minNativeZoom: 16,
    },
    {
      id: "au-longwood",
      name: "澳洲維多利亞州 Longwood 森林大火（2026）",
      note: "2026 年 1 月熱浪引發的森林大火，Longwood 附近燒了將近 15 萬公頃。右側灰紫色的大片區域就是燒毀範圍（1/4 對 1/24）。",
      center: [-37.08, 145.62],
      zoom: 11,
      left: { source: "hls", value: "2026-01-04" },
      right: { source: "hls", value: "2026-01-24" },
    },
    {
      id: "taiwan-s2",
      name: "全台：Sentinel-2 年度比對（2018 ↔ 2025）",
      note: "可以移到任何地方，比較城市開發、河道、海岸線的長期變化。",
      center: [23.7, 121],
      zoom: 8,
      left: { source: "s2", value: "2018" },
      right: { source: "s2", value: "2025" },
    },
  ];

  let waybackPromise = null;
  let foldOnMapClick = () => false; // set by attach(); true when comparison mode handled the click
  let openCompare = () => {};
  let closeCompare = () => {};
  function loadWayback() {
    if (!waybackPromise) {
      waybackPromise = fetch("/api/imagery/wayback")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
        .catch((err) => {
          waybackPromise = null; // allow a retry next time
          throw err;
        });
    }
    return waybackPromise;
  }

  /** Builds the tile layer for one side. */
  function makeLayer(spec, pane, wayback, minNativeZoom) {
    const common = { pane, maxZoom: 19 };
    if (spec.source === "hls") {
      return L.tileLayer(HLS_URL.replace("{date}", spec.value), {
        ...common,
        maxNativeZoom: 12,
        attribution: 'NASA GIBS · <a href="https://www.earthdata.nasa.gov/data/projects/hls" target="_blank">HLS</a>',
      });
    }
    if (spec.source === "s2") {
      return L.tileLayer(S2_URL.replace("{year}", spec.value), {
        ...common,
        maxNativeZoom: 15,
        attribution: `<a href="https://s2maps.eu" target="_blank">Sentinel-2 cloudless ${spec.value}</a> by EOX (Contains modified Copernicus Sentinel data)`,
      });
    }
    return L.tileLayer(wayback.tileUrl.replace("{release}", spec.value), {
      ...common,
      maxNativeZoom: 19,
      // Drawing lower zooms from detailed tiles: allow it ONE level down only (4x the tiles).
      // Without minZoom the layer would fetch level-16 tiles for a whole country view and hang the page.
      ...(minNativeZoom ? { minNativeZoom, minZoom: minNativeZoom - 1 } : {}),
      attribution: 'Imagery &copy; Esri <a href="https://livingatlas.arcgis.com/wayback/" target="_blank">Wayback</a>',
    });
  }

  function describe(spec, wayback) {
    if (spec.source === "wayback") {
      const r = wayback && wayback.releases.find((x) => String(x.release) === String(spec.value));
      return `Esri ${r ? r.date : spec.value}`;
    }
    return spec.source === "s2" ? `Sentinel-2 ${spec.value}` : `HLS ${spec.value}`;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /** The draggable divider plus the two corner labels. */
  function createSwipe(map, onMove) {
    const container = map.getContainer();
    const root = el("div", "swipe");
    const line = el("div", "swipe-line");
    const handle = el("button", "swipe-handle");
    handle.type = "button";
    // A drawn double arrow (↔), so it sits exactly in the middle whatever the font
    handle.innerHTML =
      '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18M7 7l-4 5 4 5M17 7l4 5-4 5"/></svg>';
    handle.setAttribute("aria-label", "拖曳比較災前與災後，也可以用左右方向鍵");
    const leftTag = el("span", "swipe-tag swipe-tag-left");
    const rightTag = el("span", "swipe-tag swipe-tag-right");
    line.appendChild(handle);
    root.append(line, leftTag, rightTag);
    container.appendChild(root);

    let ratio = 0.5;
    const place = () => {
      const x = Math.round(map.getSize().x * ratio);
      line.style.left = `${x}px`;
      onMove(x);
    };
    const setFromClientX = (clientX) => {
      const rect = container.getBoundingClientRect();
      ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      place();
    };

    // Keep map drag / click-to-get-weather from firing while the divider is used.
    L.DomEvent.disableClickPropagation(root);
    L.DomEvent.disableScrollPropagation(root);

    let dragging = false;
    handle.addEventListener("pointerdown", (e) => {
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      map.dragging.disable();
      e.preventDefault();
    });
    handle.addEventListener("pointermove", (e) => {
      if (dragging) setFromClientX(e.clientX);
    });
    const stop = (e) => {
      if (!dragging) return;
      dragging = false;
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
      map.dragging.enable();
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
    handle.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 0.1 : 0.03;
      if (e.key === "ArrowLeft") ratio = Math.max(0, ratio - step);
      else if (e.key === "ArrowRight") ratio = Math.min(1, ratio + step);
      else return;
      e.preventDefault();
      place();
    });

    return {
      place,
      setLabels(left, right) {
        leftTag.textContent = `◀ 災前 · ${left}`;
        rightTag.textContent = `災後 · ${right} ▶`;
      },
      reset() {
        ratio = 0.5;
        place();
      },
      remove() {
        root.remove();
      },
    };
  }

  /** One side's picker: source + date/year/release. */
  function createSidePicker(title, onChange) {
    const box = el("fieldset", "cmp-side");
    box.appendChild(el("legend", null, title));
    const source = el("select", "cmp-source");
    source.setAttribute("aria-label", `${title}影像來源`);
    for (const [key, s] of Object.entries(SOURCES)) {
      const opt = el("option", null, s.label);
      opt.value = key;
      source.appendChild(opt);
    }
    const date = el("input", "cmp-value");
    date.type = "date";
    date.min = "2015-12-01";
    date.max = new Date().toISOString().slice(0, 10);
    date.setAttribute("aria-label", `${title}日期`);
    const select = el("select", "cmp-value");
    select.setAttribute("aria-label", `${title}版本`);
    box.append(source, date, select);

    let wayback = null;
    const fillSelect = (items, value) => {
      select.replaceChildren(
        ...items.map(([v, label]) => {
          const opt = el("option", null, label);
          opt.value = String(v);
          return opt;
        })
      );
      if (value != null) select.value = String(value);
    };

    async function set(spec) {
      source.value = spec.source;
      date.hidden = spec.source !== "hls";
      select.hidden = spec.source === "hls";
      if (spec.source === "hls") date.value = spec.value;
      else if (spec.source === "s2") fillSelect(S2_YEARS.map((y) => [y, `${y} 年`]), spec.value);
      else {
        fillSelect([["", "載入中…"]]);
        wayback = await loadWayback();
        fillSelect(wayback.releases.map((r) => [r.release, r.date]), spec.value || wayback.releases[0].release);
      }
    }

    function get() {
      const s = source.value;
      return { source: s, value: s === "hls" ? date.value : select.value };
    }

    source.addEventListener("change", async () => {
      const s = source.value;
      try {
        await set({ source: s, value: s === "hls" ? date.value || "2025-06-15" : s === "s2" ? "2025" : null });
        onChange();
      } catch {
        fillSelect([["", "清單載入失敗"]]);
      }
    });
    date.addEventListener("change", onChange);
    select.addEventListener("change", onChange);

    return { el: box, set, get };
  }

  /** The 🛰️ button and panel; owns the two layers and the swipe while comparing. */
  function attach(map) {
    const left = map.createPane("compareLeft");
    const right = map.createPane("compareRight");
    left.style.zIndex = 250; // above base tiles (200), below the place-name overlay (400)
    right.style.zIndex = 260;

    let layers = [];
    let swipe = null;
    let active = false;
    let clipX = 0;

    function clip() {
      if (!active) return;
      const size = map.getSize();
      const nw = map.containerPointToLayerPoint([0, 0]);
      const se = map.containerPointToLayerPoint(size);
      const cut = map.containerPointToLayerPoint([clipX, 0]).x;
      // CSS clip: rect(top, right, bottom, left), in the pane's own coordinates
      left.style.clip = `rect(${nw.y}px, ${cut}px, ${se.y}px, ${nw.x}px)`;
      right.style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${cut}px)`;
    }

    const Control = L.Control.extend({
      options: { position: "bottomright" }, // a round floating button, bottom-right
      onAdd() {
        const wrap = el("div", "leaflet-control cmp-control");
        const button = el("a", "cmp-button", "🛰️");
        button.href = "#";
        button.title = "災前災後比對（比對中再按一次可收合面板）";
        button.setAttribute("role", "button");
        button.setAttribute("aria-label", "災前災後比對");
        button.setAttribute("aria-expanded", "false");
        wrap.appendChild(button);

        const panel = el("div", "cmp-panel");
        panel.hidden = true;
        const head = el("div", "cmp-head");
        const fold = el("button", "cmp-fold", "✕");
        fold.type = "button";
        fold.title = "收起面板（比對會繼續）";
        fold.setAttribute("aria-label", "收起面板，繼續比對");
        head.append(el("h3", null, "災前災後比對"), fold);
        panel.appendChild(head);

        const presetSelect = el("select", "cmp-preset");
        presetSelect.setAttribute("aria-label", "預設案例");
        for (const p of PRESETS) {
          const opt = el("option", null, p.name);
          opt.value = p.id;
          presetSelect.appendChild(opt);
        }
        const custom = el("option", null, "自訂（保留目前範圍）");
        custom.value = "custom";
        presetSelect.appendChild(custom);
        const note = el("p", "cmp-note");

        const status = el("p", "cmp-status");
        status.setAttribute("role", "status");
        // On phones the panel covers most of the map, so it folds itself after a choice.
        const foldOnPhone = () => {
          if (window.innerWidth <= 640) setPanel(false);
        };
        const leftPicker = createSidePicker("左：災前", () => update(true).then(foldOnPhone));
        const rightPicker = createSidePicker("右：災後", () => update(true).then(foldOnPhone));
        const close = el("button", "cmp-close", "關閉比對");
        close.type = "button";

        const tip = el("p", "cmp-tip", "點地圖任一處可收起面板，拖曳中間的拉桿比較；再按 🛰️ 可打開面板。");
        panel.append(presetSelect, note, leftPicker.el, rightPicker.el, status, tip, close);
        wrap.appendChild(panel);

        L.DomEvent.disableClickPropagation(wrap);
        L.DomEvent.disableScrollPropagation(wrap);

        // Esri Wayback releases usually differ only at the detailed zoom levels.
        let currentPreset = null;
        let usesWayback = false;
        let hlsNote = "";
        const WAYBACK_DETAIL_ZOOM = 16;
        function setPreset(p) {
          currentPreset = p;
          map.setMinZoom(0);
        }
        function updateHint() {
          if (!active) return;
          const far = usesWayback && !currentPreset && map.getZoom() < WAYBACK_DETAIL_ZOOM;
          status.textContent = far ? `Esri 歷史影像的新舊差異通常只在放大後（約 ${WAYBACK_DETAIL_ZOOM} 級以上）才看得到，請放大地圖。` : hlsNote;
        }
        map.on("zoomend", updateHint);

        async function update(markCustom) {
          if (markCustom) {
            presetSelect.value = "custom";
            note.textContent = "";
            setPreset(null);
          }
          const l = leftPicker.get();
          const r = rightPicker.get();
          if (!l.value || !r.value) return;
          let wayback = null;
          if (l.source === "wayback" || r.source === "wayback") {
            try {
              wayback = await loadWayback();
            } catch {
              status.textContent = "Esri 歷史影像清單載入失敗，請改用其他來源。";
              return;
            }
          }
          usesWayback = l.source === "wayback" || r.source === "wayback";
          hlsNote = l.source === "hls" || r.source === "hls" ? "HLS 是單日影像，有雲或缺資料的地方會透出底圖。" : "";
          updateHint();
          layers.forEach((layer) => layer.remove());
          const nativeMin = currentPreset && currentPreset.minNativeZoom;
          layers = [
            makeLayer(l, "compareLeft", wayback, nativeMin).addTo(map),
            makeLayer(r, "compareRight", wayback, nativeMin).addTo(map),
          ];
          swipe.setLabels(describe(l, wayback), describe(r, wayback));
          clip();
        }

        async function applyPreset(id) {
          const p = PRESETS.find((x) => x.id === id);
          if (!p) return;
          presetSelect.value = p.id;
          note.textContent = p.note;
          setPreset(null); // lift the previous preset's zoom limit before flying away
          currentPreset = p;
          await Promise.all([leftPicker.set(p.left), rightPicker.set(p.right)]);
          map.flyTo(p.center, p.zoom, { duration: 1 });
          if (p.minZoom) map.once("moveend", () => currentPreset === p && map.setMinZoom(p.minZoom));
          await update(false);
          if (p.labels) swipe.setLabels(p.labels[0], p.labels[1]); // say when the imagery was taken, not the release date
          swipe.reset();
        }

        function open(presetId) {
          if (active) {
            if (presetId) {
              setPanel(true);
              applyPreset(presetId);
            }
            return;
          }
          active = true;
          panel.hidden = false;
          button.setAttribute("aria-expanded", "true");
          map.getContainer().classList.add("comparing");
          swipe = createSwipe(map, (x) => {
            clipX = x;
            clip();
          });
          map.on("move zoom zoomend resize viewreset", clip);
          swipe.place();
          map.closePopup();
          document.dispatchEvent(new CustomEvent("compare:change", { detail: { active: true } }));
          applyPreset(presetId || (presetSelect.value === "custom" ? PRESETS[0].id : presetSelect.value));
        }

        function shut() {
          if (!active) return;
          active = false;
          panel.hidden = true;
          button.setAttribute("aria-expanded", "false");
          map.getContainer().classList.remove("comparing");
          map.off("move zoom zoomend resize viewreset", clip);
          layers.forEach((layer) => layer.remove());
          layers = [];
          swipe.remove();
          swipe = null;
          left.style.clip = right.style.clip = "";
          setPreset(null);
          document.dispatchEvent(new CustomEvent("compare:change", { detail: { active: false } }));
        }
        openCompare = open;
        closeCompare = shut;

        // 🛰️ starts the comparison; while comparing it only folds the panel away so the map is visible.
        L.DomEvent.on(button, "click", (e) => {
          L.DomEvent.preventDefault(e);
          if (!active) return open();
          setPanel(panel.hidden);
        });
        close.addEventListener("click", shut);
        const setPanel = (show) => {
          panel.hidden = !show;
          button.setAttribute("aria-expanded", String(show));
        };
        fold.addEventListener("click", () => setPanel(false));
        // While comparing, a click on the map just folds the panel away (map.js asks first).
        // In comparison mode the map doesn't look up weather: a click only folds the panel away.
        foldOnMapClick = () => {
          if (!active) return false;
          if (!panel.hidden) setPanel(false);
          return true;
        };
        presetSelect.addEventListener("change", () => {
          if (presetSelect.value !== "custom") applyPreset(presetSelect.value).then(foldOnPhone);
        });
        return wrap;
      },
    });

    new Control().addTo(map);
  }

  window.ImageryCompare = {
    attach,
    PRESETS,
    handleMapClick: () => foldOnMapClick(),
    open: (presetId) => openCompare(presetId), // optionally straight to one preset
    close: () => closeCompare(),
  };
})();
