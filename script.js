/* =========================================================
   Static site template
   script.js — content data + UI logic
   ========================================================= */

"use strict";

/* ----------------------------------------------------------------------
   1. CONTENT  ◀━━ EDIT THIS BLOCK
   ----------------------------------------------------------------------
   This SITE object is the only thing you need to touch to make the site
   yours: brand name, section text, projects, contact details, the map,
   and the list of background images. Everything below this block is
   layout/logic and can be left alone.
---------------------------------------------------------------------- */
let SITE = {
  // OPTIONAL: point this at a JSON endpoint to load content from your own
  // backend instead of editing this file. Any keys the JSON returns override
  // the defaults below; anything it omits falls back to what's here. Leave it
  // null to use the inline content as-is. Example: "/api/site.json"
  dataUrl: null,

  brand: "Company",

  nav: [
    { id: "home", label: "Home" },
    { id: "services", label: "Services" },
    { id: "find-me", label: "Where to find me" },
    { id: "projects", label: "Projects" },
    { id: "contact", label: "Contact" },
  ],

  intro: {
    eyebrow: "Company",
    // <em>…</em> renders in the accent color
    title: "Lorem ipsum <em>dolor sit</em> amet consectetur.",
    lead: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.",
  },

  services: {
    title: "Services",
    items: [
      { title: "Lorem ipsum", body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt." },
      { title: "Dolor sit amet", body: "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip." },
      { title: "Consectetur", body: "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore." },
    ],
  },

  findMe: {
    title: "Where to find me",
    blurb: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor.",
    // Replace with your own location embed URL from Google Maps → Share → Embed a map.
    mapEmbed:
      "https://www.google.com/maps?q=Times+Square,New+York,NY&output=embed",
    mapLabel: "Map showing our location",
  },

  projects: {
    title: "Projects",
    items: [
      { title: "Lorem ipsum", body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.", meta: "Lorem", url: "#" },
      { title: "Dolor sit", body: "Sed do eiusmod tempor incididunt ut labore et dolore magna.", meta: "Ipsum", url: "#" },
      { title: "Consectetur", body: "Ut enim ad minim veniam, quis nostrud exercitation ullamco.", meta: "Dolor", url: "#" },
    ],
  },

  contact: {
    title: "Contact",
    blurb: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.",
    items: [
      { label: "Email", handle: "name@example.com", url: "mailto:name@example.com" },
      { label: "Phone", handle: "+1 (000) 000-0000", url: "tel:+10000000000" },
    ],
  },

  footer: {
    note: "Lorem ipsum dolor sit amet.",
    year: new Date().getFullYear(),
  },

  /* Background images — just add files here and to assets/background/. */
  backgrounds: [
    "assets/background/background.jpg",
    "assets/background/background_2.jpg",
    "assets/background/background_3.jpg",
  ],
};

/* ----------------------------------------------------------------------
   2. SMALL HELPERS
---------------------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, html = "") => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  if (html) node.innerHTML = html;
  return node;
};

/* ----------------------------------------------------------------------
   3. RENDER NAVIGATION
---------------------------------------------------------------------- */
function renderNav() {
  const desktop = $("#navDesktop");
  const mobile = $("#navMobile");
  $("#brand").textContent = SITE.brand;

  desktop.setAttribute("role", "tablist");

  SITE.nav.forEach((item) => {
    const make = () =>
      el(
        "a",
        {
          href: `#${item.id}`,
          "data-nav": item.id,
          role: "tab",
          id: `tab-${item.id}`,
          "aria-controls": item.id,
          "aria-selected": "false",
        },
        item.label
      );
    desktop.appendChild(make());
    mobile.appendChild(make());
  });
}

/* ----------------------------------------------------------------------
   4. RENDER CONTENT SECTIONS
---------------------------------------------------------------------- */
function renderContent() {
  const main = $("#main");

  // Intro
  const intro = el("section", {
    id: "home",
    class: "section intro",
    role: "tabpanel",
    "aria-labelledby": "tab-home",
  });
  intro.append(
    el("p", { class: "intro__eyebrow" }, SITE.intro.eyebrow),
    el("h1", { class: "intro__title" }, SITE.intro.title),
    el("p", { class: "intro__lead" }, SITE.intro.lead)
  );
  main.appendChild(intro);

  // Services
  main.appendChild(
    cardSection("services", SITE.services.title, SITE.services.items)
  );

  // Where to find me
  const findMe = el("section", {
    id: "find-me",
    class: "section",
    role: "tabpanel",
    "aria-labelledby": "tab-find-me",
  });
  findMe.appendChild(el("h2", { class: "section__title" }, SITE.findMe.title));
  if (SITE.findMe.blurb) {
    findMe.appendChild(
      el("div", { class: "prose" }, `<p>${SITE.findMe.blurb}</p>`)
    );
  }
  if (SITE.findMe.mapEmbed) {
    const wrap = el("div", { class: "map-embed" });
    const iframe = el("iframe", {
      src: SITE.findMe.mapEmbed,
      title: SITE.findMe.mapLabel || "Location map",
      loading: "lazy",
      referrerpolicy: "no-referrer-when-downgrade",
      allowfullscreen: "",
    });
    wrap.appendChild(iframe);
    findMe.appendChild(wrap);
  }
  main.appendChild(findMe);

  // Projects
  main.appendChild(
    cardSection("projects", SITE.projects.title, SITE.projects.items, true)
  );

  // Contact
  const contact = el("section", {
    id: "contact",
    class: "section",
    role: "tabpanel",
    "aria-labelledby": "tab-contact",
  });
  contact.appendChild(el("h2", { class: "section__title" }, SITE.contact.title));
  contact.appendChild(
    el("div", { class: "prose" }, `<p>${SITE.contact.blurb}</p>`)
  );
  contact.appendChild(buildLinkList(SITE.contact.items));
  main.appendChild(contact);
}

function cardSection(id, title, items, linked = false) {
  const section = el("section", {
    id,
    class: "section",
    role: "tabpanel",
    "aria-labelledby": `tab-${id}`,
  });
  section.appendChild(el("h2", { class: "section__title" }, title));
  const grid = el("div", { class: "card-grid" });

  items.forEach((it) => {
    const inner = `
      <h3>${it.title}</h3>
      <p>${it.body}</p>
      ${it.meta ? `<span class="card__meta">${it.meta}</span>` : ""}`;
    if (linked && it.url) {
      const a = el("a", { class: "card card__link", href: it.url }, inner);
      grid.appendChild(a);
    } else {
      grid.appendChild(el("article", { class: "card" }, inner));
    }
  });

  section.appendChild(grid);
  return section;
}

function buildLinkList(items) {
  const ul = el("ul", { class: "link-list" });
  items.forEach((it) => {
    const external = /^https?:/.test(it.url);
    const attrs = { href: it.url };
    if (external) {
      attrs.target = "_blank";
      attrs.rel = "noopener noreferrer";
    }
    const a = el(
      "a",
      attrs,
      `<span class="label">${it.label}</span><span class="handle">${it.handle}</span>`
    );
    const li = el("li");
    li.appendChild(a);
    ul.appendChild(li);
  });
  return ul;
}

function renderFooter() {
  const f = $("#siteFooter");
  f.append(
    el("span", {}, `© ${SITE.footer.year} ${SITE.brand}`),
    el("span", {}, SITE.footer.note)
  );
}

/* ----------------------------------------------------------------------
   5. THEME (light / dark + localStorage)
---------------------------------------------------------------------- */
const THEME_KEY = "theme-preference";

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  const toggle = $("#themeToggle");
  toggle.setAttribute("aria-pressed", String(theme === "light"));
  const meta = $('meta[name="theme-color"]');
  if (meta) {
    // Pull the browser-chrome color straight from the active theme's tokens,
    // so there's nothing to keep in sync if you re-theme styles.css.
    const bg = getComputedStyle(document.body)
      .getPropertyValue("--bg-base")
      .trim();
    if (bg) meta.setAttribute("content", bg);
  }
}

function initTheme() {
  const stored = getStoredTheme();
  const prefersLight =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  const theme = stored || (prefersLight ? "light" : "dark");
  applyTheme(theme);

  $("#themeToggle").addEventListener("click", () => {
    const next = document.body.getAttribute("data-theme") === "light" ? "dark" : "light";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable — fail silently */
    }
  });
}

/* ----------------------------------------------------------------------
   6. MOBILE MENU
---------------------------------------------------------------------- */
function initMobileMenu() {
  const toggle = $("#menuToggle");
  const nav = $("#navMobile");
  const scrim = $("#navScrim");

  const open = () => {
    nav.classList.add("is-open");
    nav.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close menu");
    document.body.classList.add("menu-open");
    scrim.hidden = false;
    requestAnimationFrame(() => scrim.classList.add("is-visible"));
  };

  const close = () => {
    nav.classList.remove("is-open");
    nav.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
    document.body.classList.remove("menu-open");
    scrim.classList.remove("is-visible");
    setTimeout(() => { scrim.hidden = true; }, 220);
  };

  toggle.addEventListener("click", () =>
    nav.classList.contains("is-open") ? close() : open()
  );
  scrim.addEventListener("click", close);

  // Close on link tap
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) close();
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      close();
      toggle.focus();
    }
  });

  // If resized up to desktop, make sure menu is closed
  window.matchMedia("(min-width: 641px)").addEventListener("change", (e) => {
    if (e.matches) close();
  });
}

/* ----------------------------------------------------------------------
   7. TABS
   Each section is a tab panel; only one is shown at a time. The URL hash
   drives the active tab, so back/forward and direct links work.
---------------------------------------------------------------------- */
function initTabs() {
  const links = Array.from(document.querySelectorAll("[data-nav]"));
  const panels = SITE.nav
    .map((n) => document.getElementById(n.id))
    .filter(Boolean);

  const ids = SITE.nav.map((n) => n.id);
  const defaultId = ids[0];

  const show = (id, { focusPanel = false, push = true } = {}) => {
    if (!ids.includes(id)) id = defaultId;

    panels.forEach((p) => {
      const active = p.id === id;
      p.hidden = !active;
      if (active) p.classList.add("section--active");
      else p.classList.remove("section--active");
    });

    links.forEach((l) => {
      const active = l.getAttribute("data-nav") === id;
      l.classList.toggle("is-active", active);
      l.setAttribute("aria-selected", String(active));
      // Only the active desktop tab is in the tab order (roving tabindex)
      if (l.getAttribute("role") === "tab") {
        l.tabIndex = active ? 0 : -1;
      }
    });

    if (push && location.hash.slice(1) !== id) {
      history.pushState(null, "", `#${id}`);
    }

    // Scroll back to top of content on tab change
    const main = $("#main");
    if (main) main.scrollIntoView({ block: "start", behavior: "auto" });
    window.scrollTo({ top: 0, behavior: "auto" });

    if (focusPanel) {
      const panel = document.getElementById(id);
      if (panel) panel.focus({ preventScroll: true });
    }
  };

  // Click / tap
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      show(link.getAttribute("data-nav"));
    });
  });

  // Keyboard arrows on the desktop tablist (roving focus)
  const desktopTabs = links.filter((l) => l.getAttribute("role") === "tab");
  $("#navDesktop").addEventListener("keydown", (e) => {
    const current = desktopTabs.findIndex((t) => t === document.activeElement);
    if (current === -1) return;
    let next = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (current + 1) % desktopTabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (current - 1 + desktopTabs.length) % desktopTabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = desktopTabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    const tab = desktopTabs[next];
    tab.focus();
    show(tab.getAttribute("data-nav"));
  });

  // Brand click → home tab
  $("#brand").addEventListener("click", (e) => {
    e.preventDefault();
    show("home");
  });

  // React to hash changes (back/forward, manual edits, external links)
  window.addEventListener("hashchange", () => {
    show(location.hash.slice(1) || defaultId, { push: false });
  });

  // Initial tab from hash, or default
  show(location.hash.slice(1) || defaultId, { push: false });
}

/* ----------------------------------------------------------------------
   8. BACKGROUND
   Picks one image at random, preloads, fades in. Falls back gracefully
   if no image is present (overlay + base color still look fine).
---------------------------------------------------------------------- */
function initBackground() {
  const bg = $("#bg");
  const list = SITE.backgrounds;
  if (!list || !list.length) return;

  const src = list[Math.floor(Math.random() * list.length)];
  const img = new Image();
  img.onload = () => {
    bg.style.backgroundImage = `url("${src}")`;
    bg.classList.add("is-loaded");
  };
  img.onerror = () => {
    /* image missing — leave plain background, no error shown */
  };
  img.src = src;
}

/* ----------------------------------------------------------------------
   9. BOOT
---------------------------------------------------------------------- */

/* Deep-merge plain objects (arrays and primitives are replaced wholesale).
   Used to overlay fetched JSON on top of the inline SITE defaults. */
function deepMerge(base, override) {
  if (Array.isArray(override) || typeof override !== "object" || override === null) {
    return override;
  }
  const out = { ...base };
  for (const key of Object.keys(override)) {
    const b = base ? base[key] : undefined;
    const o = override[key];
    out[key] =
      b && typeof b === "object" && !Array.isArray(b) &&
      o && typeof o === "object" && !Array.isArray(o)
        ? deepMerge(b, o)
        : o;
  }
  return out;
}

/* If SITE.dataUrl is set, fetch it and overlay it on the inline defaults.
   Any network/parse failure silently keeps the inline content, so the page
   never breaks just because the backend is down. */
async function loadContent() {
  if (!SITE.dataUrl) return SITE;
  try {
    const res = await fetch(SITE.dataUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return deepMerge(SITE, data);
  } catch (err) {
    console.warn("Content fetch failed, using inline defaults:", err);
    return SITE;
  }
}

async function init() {
  // Replace the module-level SITE with the merged result so every render
  // function (which all read SITE) picks up the fetched content.
  SITE = await loadContent();

  renderNav();
  renderContent();
  renderFooter();
  initTheme();
  initMobileMenu();
  initTabs();
  initBackground();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
