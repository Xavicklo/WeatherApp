/**
 * Search-as-you-type suggestions (like a Places Autocomplete box).
 *
 * Source: Photon (photon.komoot.io), an OpenStreetMap geocoder built for autocomplete.
 * It knows Chinese names of Taiwanese landmarks and districts (政治大學, 台北101, 土城區),
 * needs no key and allows browser (CORS) requests. Nominatim's usage policy forbids
 * autocomplete, and Mapbox's geocoders returned poor matches for Chinese queries.
 *
 * Suggest.attach({ input, list, onPick, getBias }) — onPick({ name, label, lat, lon }).
 */
(function () {
  "use strict";

  const PHOTON = "https://photon.komoot.io/api/";
  const DELAY_MS = 250;
  const MAX = 6;
  const CJK = /[㐀-鿿]/;
  // Transit stops repeat the same name many times; stations and everything else stay.
  const SKIP = new Set(["stop", "bus_stop", "platform", "stop_position", "halt"]);

  const ICONS = {
    university: "🎓", college: "🎓", school: "🏫",
    station: "🚉", train_station: "🚉", subway: "🚇",
    city: "🏙️", town: "🏘️", village: "🏘️", suburb: "🏘️", district: "🏘️", county: "🗺️", state: "🗺️", country: "🌏",
    attraction: "⭐", museum: "🏛️", park: "🌳", peak: "⛰️", airport: "✈️", aerodrome: "✈️", hospital: "🏥",
  };

  function attach({ input, list, onPick, getBias }) {
    let items = [];
    let active = -1;
    let timer = null;
    let controller = null;
    const cache = new Map();

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", list.id);
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("autocomplete", "off");

    function close() {
      list.hidden = true;
      list.replaceChildren();
      items = [];
      active = -1;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }

    function highlight(i) {
      active = i;
      [...list.children].forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
      if (i >= 0) input.setAttribute("aria-activedescendant", list.children[i].id);
      else input.removeAttribute("aria-activedescendant");
    }

    function pick(i) {
      const item = items[i];
      if (!item) return;
      input.value = item.name;
      close();
      onPick(item);
    }

    function render(results) {
      items = results;
      if (!items.length) return close();
      list.replaceChildren(
        ...items.map((item, i) => {
          // DOM nodes and textContent only: names come from a third party
          const li = document.createElement("li");
          li.id = `${list.id}-${i}`;
          li.setAttribute("role", "option");
          li.setAttribute("aria-selected", "false");
          const icon = document.createElement("span");
          icon.className = "sg-icon";
          icon.setAttribute("aria-hidden", "true");
          icon.textContent = item.icon;
          const text = document.createElement("span");
          text.className = "sg-text";
          const name = document.createElement("strong");
          name.textContent = item.name;
          const where = document.createElement("small");
          where.textContent = item.context;
          text.append(name, where);
          li.append(icon, text);
          // mousedown (not click) so the input's blur doesn't close the list first
          li.addEventListener("mousedown", (e) => {
            e.preventDefault();
            pick(i);
          });
          li.addEventListener("mousemove", () => active !== i && highlight(i));
          return li;
        })
      );
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      active = -1;
    }

    function toItem(f) {
      const p = f.properties || {};
      const [lon, lat] = f.geometry.coordinates;
      const context = [p.district, p.city !== p.name ? p.city : null, p.state !== p.city ? p.state : null, p.country]
        .filter((x, i, arr) => x && x !== p.name && arr.indexOf(x) === i)
        .join(", ");
      return {
        name: p.name,
        context,
        label: [p.name, context].filter(Boolean).join(", "),
        lat,
        lon,
        icon: ICONS[p.osm_value] || ICONS[p.type] || "📍",
      };
    }

    async function search(q) {
      if (cache.has(q)) return render(cache.get(q));
      if (controller) controller.abort();
      controller = new AbortController();
      const bias = (getBias && getBias()) || { lat: 23.7, lon: 121 };
      const params = new URLSearchParams({ q, limit: "15", lat: bias.lat.toFixed(3), lon: bias.lon.toFixed(3) });
      // Photon has no Traditional Chinese option; for Latin queries English names read better
      if (!CJK.test(q)) params.set("lang", "en");
      try {
        const r = await fetch(`${PHOTON}?${params}`, { signal: controller.signal });
        if (!r.ok) return close();
        const data = await r.json();
        const seen = new Set();
        const results = (data.features || [])
          .filter((f) => f.properties && f.properties.name && !SKIP.has(f.properties.osm_value))
          .map(toItem)
          .filter((it) => !seen.has(it.label) && seen.add(it.label))
          .slice(0, MAX);
        cache.set(q, results);
        if (input.value.trim() === q) render(results);
      } catch (err) {
        if (err.name !== "AbortError") close();
      }
    }

    input.addEventListener("input", () => {
      clearTimeout(timer);
      const q = input.value.trim();
      // one CJK character is already a word (土, 政); Latin needs two letters
      if (!q || (!CJK.test(q) && q.length < 2)) return close();
      if (/^https?:\/\//i.test(q) || q.length > 40) return close(); // a pasted URL or paragraph, not a place name
      timer = setTimeout(() => search(q), DELAY_MS);
    });

    input.addEventListener("keydown", (e) => {
      if (list.hidden) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        highlight((active + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        highlight(active <= 0 ? items.length - 1 : active - 1);
      } else if (e.key === "Enter" && active >= 0) {
        e.preventDefault(); // pick the highlighted suggestion instead of submitting the text
        pick(active);
      } else if (e.key === "Escape") {
        close();
      }
    });

    input.addEventListener("blur", () => setTimeout(close, 120));
    // The typed text is being submitted as-is: the list is no longer needed
    input.form && input.form.addEventListener("submit", close);

    return { close };
  }

  window.Suggest = { attach };
})();
