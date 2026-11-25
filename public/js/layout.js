/**
 * Full-window layout: the floating side panel (desktop) and the bottom sheet (phone).
 * Exposes window.Layout so app.js can open the details after a search.
 */
(function () {
  "use strict";

  const panel = document.getElementById("panel");
  if (!panel) return;
  const head = panel.querySelector(".panel-head");
  const body = document.getElementById("panel-body");
  const toggle = document.getElementById("panel-toggle");
  const handle = document.getElementById("sheet-handle");
  const label = document.getElementById("sheet-label");
  const phone = window.matchMedia("(max-width: 640px)");

  // Leaflet controls sit below the floating header on phones, so publish its height to CSS.
  const publishHeight = () => document.documentElement.style.setProperty("--head-h", `${head.offsetHeight}px`);
  if ("ResizeObserver" in window) new ResizeObserver(publishHeight).observe(head);
  publishHeight();

  // ---------- desktop: fold the panel down to its header ----------
  function setCollapsed(collapsed) {
    panel.classList.toggle("collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", collapsed ? "展開面板" : "收起面板");
  }
  toggle.addEventListener("click", () => {
    if (phone.matches) setSheet(!panel.classList.contains("sheet-open"));
    else setCollapsed(!panel.classList.contains("collapsed"));
  });

  // ---------- phone: bottom sheet ----------
  function setSheet(open) {
    panel.classList.toggle("sheet-open", open);
    handle.setAttribute("aria-expanded", String(open));
    label.textContent = open ? "收起 · 往下滑" : label.dataset.peek || "天氣詳情 · 往上滑查看";
  }
  handle.addEventListener("click", () => setSheet(!panel.classList.contains("sheet-open")));

  // A small swipe on the handle: up opens, down closes.
  let startY = null;
  handle.addEventListener("pointerdown", (e) => {
    startY = e.clientY;
  });
  handle.addEventListener("pointerup", (e) => {
    if (startY == null) return;
    const dy = e.clientY - startY;
    startY = null;
    if (Math.abs(dy) > 30) {
      setSheet(dy < 0);
      handle.dataset.swiped = "1"; // the click that follows should not toggle back
    }
  });
  handle.addEventListener(
    "click",
    (e) => {
      if (handle.dataset.swiped) {
        delete handle.dataset.swiped;
        e.stopImmediatePropagation();
      }
    },
    true
  );

  window.Layout = {
    /** Show the forecast: unfold the panel (desktop) or open the sheet (phone). */
    reveal(target) {
      if (phone.matches) setSheet(true);
      else setCollapsed(false);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    /** One-line summary shown on the closed sheet, e.g. "臺北 ⛅ 21°C". */
    peek(text) {
      label.dataset.peek = `${text} · 往上滑看預報`;
      if (!panel.classList.contains("sheet-open")) label.textContent = label.dataset.peek;
    },
    isPhone: () => phone.matches,
  };
})();
