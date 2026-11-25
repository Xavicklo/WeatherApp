/**
 * Full-window layout.
 *  - Left: the floating title/search panel.
 *  - Right (phone: bottom): the forecast drawer. Closed by default, slides
 *    out after a search, closes when the map is clicked. Its tab can be
 *    clicked or dragged (right-to-left on desktop, bottom-to-top on phones).
 * Exposes window.Layout for app.js.
 */
(function () {
  "use strict";

  const head = document.querySelector(".panel-head");
  const drawer = document.getElementById("drawer");
  if (!head || !drawer) return;
  const tab = document.getElementById("drawer-tab");
  const body = document.getElementById("drawer-body");
  const label = document.getElementById("drawer-label");
  const phone = window.matchMedia("(max-width: 640px)");
  const root = document.documentElement;

  // Leaflet controls sit below the floating header on phones, so publish its height to CSS.
  const publishHeight = () => root.style.setProperty("--head-h", `${head.offsetHeight}px`);
  if ("ResizeObserver" in window) new ResizeObserver(publishHeight).observe(head);
  publishHeight();

  let open = false;
  function setOpen(value) {
    open = value;
    drawer.classList.toggle("open", open);
    document.body.classList.toggle("drawer-open", open);
    tab.setAttribute("aria-expanded", String(open));
    tab.setAttribute("aria-label", open ? "收起天氣預報" : "展開天氣預報");
    drawer.style.transform = ""; // drop any position left over from a drag
  }

  // ---------- tab: click, or drag (x on desktop, y on phones) ----------
  let drag = null;
  tab.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: 0, rect: drawer.getBoundingClientRect() };
    tab.setPointerCapture(e.pointerId);
    drawer.classList.add("dragging");
  });
  tab.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (phone.matches) {
      const dy = e.clientY - drag.y;
      drag.moved = dy;
      const closedY = drag.rect.height - tab.offsetHeight;
      const base = open ? 0 : closedY;
      drawer.style.transform = `translateY(${Math.min(closedY, Math.max(0, base + dy))}px)`;
    } else {
      const dx = e.clientX - drag.x;
      drag.moved = dx;
      const closedX = drag.rect.width + 16;
      const base = open ? 0 : closedX;
      drawer.style.transform = `translateX(${Math.min(closedX, Math.max(0, base + dx))}px)`;
    }
  });
  const endDrag = (e) => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    drawer.classList.remove("dragging");
    if (tab.hasPointerCapture(e.pointerId)) tab.releasePointerCapture(e.pointerId);
    if (Math.abs(moved) > 40) {
      setOpen(moved < 0); // left / up opens, right / down closes
      tab.dataset.dragged = "1"; // the click that follows is not a toggle
    } else {
      drawer.style.transform = "";
    }
  };
  tab.addEventListener("pointerup", endDrag);
  tab.addEventListener("pointercancel", endDrag);
  tab.addEventListener("click", () => {
    if (tab.dataset.dragged) {
      delete tab.dataset.dragged;
      return;
    }
    setOpen(!open);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) setOpen(false);
  });

  window.Layout = {
    /** Slide the forecast out (and optionally scroll to a part of it). */
    open(target) {
      if (drawer.hidden) {
        drawer.hidden = false;
        void drawer.offsetWidth; // apply the closed position first so the slide-in animates
      }
      setOpen(true);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    close() {
      setOpen(false);
    },
    isOpen: () => open,
    /** Show the drawer's tab once there is something to show. */
    ready() {
      drawer.hidden = false;
    },
    /** One-line summary on the tab, e.g. "臺北 21°C". */
    peek(text) {
      label.textContent = text;
    },
    isPhone: () => phone.matches,
    body,
  };
})();
