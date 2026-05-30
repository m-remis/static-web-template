/* =========================================================
   Static site template
   script.js — content data + UI logic
   ========================================================= */

"use strict";

/* ----------------------------------------------------------------------
   1. CONTENT ◀━━ EDIT THIS BLOCK

   This SITE object is the only thing you need to touch to make the site
   yours: brand name, section text, projects, contact details, the map,
   and the list of background images. Everything below this block is
   layout/logic and can be left alone.

   IMPORTANT: section text intentionally supports small trusted inline HTML,
   for example <em>…</em> in the hero title. Do not feed this template
   user-generated or untrusted HTML unless you sanitize it first.
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
        // <em>…</em> renders in the accent color.
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

        // Embedded map. Displayed on desktop and mobile.
        // On touch/mobile devices, CSS makes the iframe non-interactive so
        // Firefox/Android does not hijack taps and open the Maps app randomly.
        mapEmbed: "https://maps.google.com/maps?q=Times+Square,New+York,NY&z=15&output=embed",

        // Normal map link used by the explicit "Open in Maps" button.
        mapUrl: "https://www.google.com/maps/search/?api=1&query=Times%20Square%2C%20New%20York%2C%20NY",

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

    // Background images — just add files here and to assets/background/.
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
        if (v === false || v === null || v === undefined) continue;
        if (k === "class") node.className = v;
        else node.setAttribute(k, v === true ? "" : String(v));
    }

    if (html) node.innerHTML = html;
    return node;
};

const isExternalUrl = (url = "") => /^https?:\/\//i.test(url);

/* ----------------------------------------------------------------------
   3. RENDER NAVIGATION
---------------------------------------------------------------------- */

function renderNav() {
    const desktop = $("#navDesktop");
    const mobile = $("#navMobile");
    const brand = $("#brand");

    if (!desktop || !mobile || !brand) return;

    brand.textContent = SITE.brand;
    desktop.setAttribute("role", "tablist");
    desktop.setAttribute("aria-label", "Main sections");

    SITE.nav.forEach((item) => {
        // Desktop nav is the real ARIA tablist. These IDs are unique.
        desktop.appendChild(
            el(
                "a",
                {
                    href: `#${item.id}`,
                    "data-nav": item.id,
                    role: "tab",
                    id: `tab-${item.id}`,
                    "aria-controls": item.id,
                    "aria-selected": "false",
                    tabindex: "-1",
                },
                item.label
            )
        );

        // Mobile nav is plain navigation. Do not duplicate desktop tab IDs.
        mobile.appendChild(
            el(
                "a",
                {
                    href: `#${item.id}`,
                    "data-nav": item.id,
                },
                item.label
            )
        );
    });
}

/* ----------------------------------------------------------------------
   4. RENDER CONTENT SECTIONS
---------------------------------------------------------------------- */

function renderContent() {
    const main = $("#main");
    if (!main) return;

    main.innerHTML = "";

    // Intro
    const intro = el("section", {
        id: "home",
        class: "section intro",
        role: "tabpanel",
        "aria-labelledby": "tab-home",
        tabindex: "-1",
    });

    intro.append(
        el("p", { class: "intro__eyebrow" }, SITE.intro.eyebrow),
        el("h1", { class: "intro__title" }, SITE.intro.title),
        el("p", { class: "intro__lead" }, SITE.intro.lead)
    );

    main.appendChild(intro);

    // Services
    main.appendChild(cardSection("services", SITE.services.title, SITE.services.items));

    // Where to find me
    const findMe = el("section", {
        id: "find-me",
        class: "section",
        role: "tabpanel",
        "aria-labelledby": "tab-find-me",
        tabindex: "-1",
    });

    findMe.appendChild(el("h2", { class: "section__title" }, SITE.findMe.title));

    if (SITE.findMe.blurb) {
        findMe.appendChild(el("div", { class: "prose" }, `<p>${SITE.findMe.blurb}</p>`));
    }

    if (SITE.findMe.mapEmbed) {
        const wrap = el("div", { class: "map-embed" });

        const iframe = el("iframe", {
            src: SITE.findMe.mapEmbed,
            title: SITE.findMe.mapLabel || "Location map",
            loading: "lazy",
            referrerpolicy: "no-referrer-when-downgrade",
            allowfullscreen: true,
        });

        wrap.appendChild(iframe);
        findMe.appendChild(wrap);

        const mapHref = SITE.findMe.mapUrl || SITE.findMe.mapEmbed;

        findMe.appendChild(
            el(
                "p",
                { class: "map-open-row" },
                `<a href="${mapHref}" target="_blank" rel="noopener noreferrer">Open in Maps</a>`
            )
        );
    }

    main.appendChild(findMe);

    // Projects
    main.appendChild(cardSection("projects", SITE.projects.title, SITE.projects.items, true));

    // Contact
    const contact = el("section", {
        id: "contact",
        class: "section",
        role: "tabpanel",
        "aria-labelledby": "tab-contact",
        tabindex: "-1",
    });

    contact.appendChild(el("h2", { class: "section__title" }, SITE.contact.title));

    if (SITE.contact.blurb) {
        contact.appendChild(el("div", { class: "prose" }, `<p>${SITE.contact.blurb}</p>`));
    }

    contact.appendChild(buildLinkList(SITE.contact.items));
    main.appendChild(contact);
}

function cardSection(id, title, items, linked = false) {
    const section = el("section", {
        id,
        class: "section",
        role: "tabpanel",
        "aria-labelledby": `tab-${id}`,
        tabindex: "-1",
    });

    section.appendChild(el("h2", { class: "section__title" }, title));

    const grid = el("div", { class: "card-grid" });

    items.forEach((it) => {
        const inner = `
            <h3>${it.title}</h3>
            <p>${it.body}</p>
            ${it.meta ? `<span class="card__meta">${it.meta}</span>` : ""}
        `;

        if (linked && it.url) {
            const attrs = { class: "card card__link", href: it.url };

            if (isExternalUrl(it.url)) {
                attrs.target = "_blank";
                attrs.rel = "noopener noreferrer";
            }

            grid.appendChild(el("a", attrs, inner));
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
        const attrs = { href: it.url };

        if (isExternalUrl(it.url)) {
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
    if (!f) return;

    f.innerHTML = "";
    f.append(
        el("span", {}, `© ${SITE.footer.year} ${SITE.brand}`),
        el("span", {}, SITE.footer.note)
    );
}

/* ----------------------------------------------------------------------
   5A. INPUT MODE

   Mobile Firefox can keep tapped links/buttons in a fake focused/hovered
   state. We only show focus rings after real keyboard navigation.
---------------------------------------------------------------------- */

function initInputMode() {
    const keyboardKeys = new Set([
        "Tab",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        "Enter",
        " ",
    ]);

    const enableKeyboardMode = (e) => {
        if (keyboardKeys.has(e.key)) {
            document.body.classList.add("keyboard-nav");
        }
    };

    const disableKeyboardMode = () => {
        document.body.classList.remove("keyboard-nav");
    };

    window.addEventListener("keydown", enableKeyboardMode, true);
    window.addEventListener("pointerdown", disableKeyboardMode, true);
    window.addEventListener("mousedown", disableKeyboardMode, true);
    window.addEventListener("touchstart", disableKeyboardMode, true);
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
    if (toggle) toggle.setAttribute("aria-pressed", String(theme === "light"));

    const meta = $('meta[name="theme-color"]');
    if (meta) {
        // Pull the browser-chrome color straight from the active theme's tokens,
        // so there's nothing to keep in sync if you re-theme styles.css.
        const bg = getComputedStyle(document.body).getPropertyValue("--bg-base").trim();
        if (bg) meta.setAttribute("content", bg);
    }
}

function initTheme() {
    const toggle = $("#themeToggle");
    if (!toggle) return;

    const stored = getStoredTheme();
    const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    const theme = stored || (prefersLight ? "light" : "dark");

    applyTheme(theme);

    toggle.addEventListener("click", () => {
        const next = document.body.getAttribute("data-theme") === "light" ? "dark" : "light";
        applyTheme(next);

        try {
            localStorage.setItem(THEME_KEY, next);
        } catch {
            // storage unavailable — fail silently
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

    if (!toggle || !nav || !scrim) return;

    let closeTimer = null;

    const open = () => {
        if (closeTimer) clearTimeout(closeTimer);

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
        closeTimer = setTimeout(() => {
            scrim.hidden = true;
        }, 220);
    };

    toggle.addEventListener("click", () => (nav.classList.contains("is-open") ? close() : open()));
    scrim.addEventListener("click", close);

    // Close on link tap.
    nav.addEventListener("click", (e) => {
        if (e.target.closest("a")) close();
    });

    // Close on Escape.
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && nav.classList.contains("is-open")) {
            close();
            toggle.focus();
        }
    });

    // If resized up to desktop, make sure menu is closed.
    const mq = window.matchMedia("(min-width: 641px)");
    const onDesktop = (e) => {
        if (e.matches) close();
    };

    if (mq.addEventListener) mq.addEventListener("change", onDesktop);
    else mq.addListener(onDesktop);
}

/* ----------------------------------------------------------------------
   7. TABS

   Each section is a tab panel; only one is shown at a time. The URL hash
   drives the active tab, so direct links and browser navigation work.
---------------------------------------------------------------------- */

function initTabs() {
    const links = Array.from(document.querySelectorAll("[data-nav]"));
    const desktopTabs = Array.from(document.querySelectorAll("#navDesktop [role='tab']"));
    const panels = SITE.nav.map((n) => document.getElementById(n.id)).filter(Boolean);
    const ids = SITE.nav.map((n) => n.id);
    const defaultId = ids[0];

    const normalize = (id) => (ids.includes(id) ? id : defaultId);

    const setActiveLink = (link, id) => {
        const active = link.getAttribute("data-nav") === id;
        const isTab = link.getAttribute("role") === "tab";

        link.classList.toggle("is-active", active);

        if (isTab) {
            link.setAttribute("aria-selected", String(active));
            link.tabIndex = active ? 0 : -1;
        } else if (active) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    };

    const show = (rawId, { focusPanel = false, push = true, scrollTop = true } = {}) => {
        const id = normalize(rawId);

        panels.forEach((p) => {
            const active = p.id === id;
            p.hidden = !active;
            p.classList.toggle("section--active", active);
        });

        links.forEach((link) => setActiveLink(link, id));

        if (push && location.hash.slice(1) !== id) {
            history.pushState(null, "", `#${id}`);
        }

        if (scrollTop) {
            // Avoid scrollIntoView(): on iOS Safari it can align to a child and
            // skip past the title. A plain top scroll is more predictable.
            const toTop = () => window.scrollTo(0, 0);
            toTop();
            requestAnimationFrame(toTop);
        }

        if (focusPanel) {
            const panel = document.getElementById(id);
            if (panel) panel.focus({ preventScroll: true });
        }
    };

    // Click / tap.
    links.forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            show(link.getAttribute("data-nav"));

            // Drop focus after a tap so no focus ring lingers on mobile.
            // Keyboard users are unaffected.
            if (e.detail !== 0) link.blur();
        });
    });

    // Keyboard arrows on the desktop tablist only.
    const desktop = $("#navDesktop");
    if (desktop) {
        desktop.addEventListener("keydown", (e) => {
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
    }

    // Brand click → home tab.
    const brand = $("#brand");
    if (brand) {
        brand.addEventListener("click", (e) => {
            e.preventDefault();
            show(defaultId);
        });
    }

    // React to manual hash edits and browser back/forward.
    window.addEventListener("hashchange", () => {
        show(location.hash.slice(1) || defaultId, { push: false });
    });

    window.addEventListener("popstate", () => {
        show(location.hash.slice(1) || defaultId, { push: false });
    });

    // Initial tab from hash, or default. Do not force-scroll on first paint.
    show(location.hash.slice(1) || defaultId, { push: false, scrollTop: false });
}

/* ----------------------------------------------------------------------
   8. BACKGROUND

   Picks one image at random, preloads it, then fades it in. Falls back
   gracefully if no image is present.
---------------------------------------------------------------------- */

function initBackground() {
    const bg = $("#bg");
    const list = SITE.backgrounds;

    if (!bg || !list || !list.length) return;

    const src = list[Math.floor(Math.random() * list.length)];
    const img = new Image();

    img.onload = () => {
        bg.style.backgroundImage = `url("${src}")`;
        bg.classList.add("is-loaded");
    };

    img.onerror = () => {
        // image missing — leave plain background, no error shown
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

        out[key] = b && typeof b === "object" && !Array.isArray(b) &&
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
        const res = await fetch(SITE.dataUrl, {
            headers: { Accept: "application/json" },
        });

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
    initInputMode();
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