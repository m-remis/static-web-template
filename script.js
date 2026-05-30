/* =========================================================
   Static site template
   script.js — content data + UI logic
   ========================================================= */

"use strict";

/* ----------------------------------------------------------------------
   1. CONTENT ◀━━ EDIT THIS BLOCK

   This SITE object is the only thing you need to touch to make the site
   yours: brand name, section text, projects, contact details, the map,
   social links, and the list of background images. Everything below this
   block is layout/logic and can be left alone.

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
        {id: "home", label: "Home"},
        {id: "services", label: "Services"},
        {id: "find-me", label: "Where to find me"},
        {id: "projects", label: "Projects"},
        {id: "contact", label: "Contact"},
    ],

    intro: {
        eyebrow: "Company",
        // <em>…</em> renders in the accent color.
        title: "Lorem ipsum <em>dolor sit</em> amet consectetur.",
        lead: "This is just a simple demo for a template I created — it should work on desktop and mobile. Tested on Chromium, Firefox and Safari. Want a website? Contact me at <a href=\"https://michal-remis.com/\" target=\"_blank\" rel=\"noopener noreferrer\">michal-remis.com</a>.",
    },

    services: {
        title: "Services",
        items: [
            {
                title: "Lorem ipsum",
                body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt."
            },
            {
                title: "Dolor sit amet",
                body: "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip."
            },
            {
                title: "Consectetur",
                body: "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore."
            },
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
            {
                title: "Lorem ipsum",
                body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
                meta: "Lorem",
                url: "#"
            },
            {
                title: "Dolor sit",
                body: "Sed do eiusmod tempor incididunt ut labore et dolore magna.",
                meta: "Ipsum",
                url: "#"
            },
            {
                title: "Consectetur",
                body: "Ut enim ad minim veniam, quis nostrud exercitation ullamco.",
                meta: "Dolor",
                url: "#"
            },
        ],
    },

    contact: {
        title: "Contact",
        blurb: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.",
        items: [
            {label: "Email", handle: "name@example.com", url: "mailto:name@example.com"},
            {label: "Phone", handle: "+1 (000) 000-0000", url: "tel:+10000000000"},
        ],
    },

    footer: {
        note: "Lorem ipsum dolor sit amet.",
        year: new Date().getFullYear(),
    },

    // Social links, shown next to the brand in the header as a colored icon
    // plus a visible label. Swap these URLs and labels for your real ones.
    // `icon` must match a key in the SOCIAL_ICONS map further down; to add a
    // new platform, add an SVG there and a matching color rule in styles.css
    // (.socials__link--<icon> svg), then reference the key here.
    socials: [
        {label: "Instagram 1", icon: "instagram", url: "https://instagram.com/"},
        {label: "Instagram 2", icon: "instagram", url: "https://instagram.com/"},
        {label: "YouTube 1", icon: "youtube", url: "https://youtube.com/"},
    ],

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

/* Inline SVG icons — no icon library (keeps the no-deps rule). Each uses
   fill="currentColor" so it inherits the surrounding text color and re-themes
   automatically. Add a new key here to support a new social platform. */
const SOCIAL_ICONS = {
    instagram:
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">' +
        '<path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 1.62c-3.15 0-3.52.01-4.76.07-.9.04-1.39.19-1.71.32-.43.17-.74.37-1.06.69-.32.32-.52.63-.69 1.06-.13.32-.28.81-.32 1.71-.06 1.24-.07 1.61-.07 4.76s.01 3.52.07 4.76c.04.9.19 1.39.32 1.71.17.43.37.74.69 1.06.32.32.63.52 1.06.69.32.13.81.28 1.71.32 1.24.06 1.61.07 4.76.07s3.52-.01 4.76-.07c.9-.04 1.39-.19 1.71-.32.43-.17.74-.37 1.06-.69.32-.32.52-.63.69-1.06.13-.32.28-.81.32-1.71.06-1.24.07-1.61.07-4.76s-.01-3.52-.07-4.76c-.04-.9-.19-1.39-.32-1.71a2.85 2.85 0 0 0-.69-1.06 2.85 2.85 0 0 0-1.06-.69c-.32-.13-.81-.28-1.71-.32-1.24-.06-1.61-.07-4.76-.07zm0 2.76a5.3 5.3 0 1 1 0 10.6 5.3 5.3 0 0 1 0-10.6zm0 1.62a3.68 3.68 0 1 0 0 7.36 3.68 3.68 0 0 0 0-7.36zm5.48-2.96a1.24 1.24 0 1 1 0 2.48 1.24 1.24 0 0 1 0-2.48z"/>' +
        "</svg>",
    youtube:
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">' +
        '<path d="M23.5 6.5a3 3 0 0 0-2.11-2.12C19.5 3.87 12 3.87 12 3.87s-7.5 0-9.39.51A3 3 0 0 0 .5 6.5C0 8.4 0 12 0 12s0 3.6.5 5.5a3 3 0 0 0 2.11 2.12c1.89.51 9.39.51 9.39.51s7.5 0 9.39-.51A3 3 0 0 0 23.5 17.5C24 15.6 24 12 24 12s0-3.6-.5-5.5zM9.6 15.6V8.4l6.27 3.6-6.27 3.6z"/>' +
        "</svg>",
};

/* Build the row of social links shown next to the brand: a colored icon plus
   its visible label. Routes through el() and isExternalUrl() so external links
   get target=_blank + rel=noopener for free, same as every other link. */
function buildSocials(items) {
    const wrap = el("div", {class: "socials"});

    items.forEach((it) => {
        const icon = SOCIAL_ICONS[it.icon] || "";

        const attrs = {
            class: `socials__link socials__link--${it.icon}`,
            href: it.url,
            "aria-label": it.label,
        };

        if (isExternalUrl(it.url)) {
            attrs.target = "_blank";
            attrs.rel = "noopener noreferrer";
        }

        wrap.appendChild(
            el("a", attrs, `${icon}<span class="socials__label">${it.label}</span>`)
        );
    });

    return wrap;
}

/* ----------------------------------------------------------------------
   3. RENDER NAVIGATION
---------------------------------------------------------------------- */

function renderNav() {
    const desktop = $("#navDesktop");
    const mobile = $("#navMobile");
    const brand = $("#brand");

    if (!desktop || !mobile || !brand) return;

    brand.textContent = SITE.brand;

    // Social links next to the brand in the header. Shown on desktop; below the
    // mobile breakpoint the whole header row collapses to the hamburger and a
    // copy of these links is placed inside the mobile drawer instead (below).
    // The #brand element keeps its id and click handler — it's just moved into
    // a flex wrapper alongside the links.
    if (SITE.socials && SITE.socials.length) {
        const brandWrap = el("div", {class: "brand-wrap"});
        brand.replaceWith(brandWrap);
        brandWrap.appendChild(brand);
        brandWrap.appendChild(buildSocials(SITE.socials));
    }

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

    // A copy of the social links at the bottom of the mobile drawer, so they're
    // reachable when the header collapses to the hamburger on narrow screens.
    if (SITE.socials && SITE.socials.length) {
        mobile.appendChild(buildSocials(SITE.socials));
    }
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
        el("p", {class: "intro__eyebrow"}, SITE.intro.eyebrow),
        el("h1", {class: "intro__title"}, SITE.intro.title),
        el("p", {class: "intro__lead"}, SITE.intro.lead)
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

    findMe.appendChild(el("h2", {class: "section__title"}, SITE.findMe.title));

    if (SITE.findMe.blurb) {
        findMe.appendChild(el("div", {class: "prose"}, `<p>${SITE.findMe.blurb}</p>`));
    }

    if (SITE.findMe.mapEmbed) {
        const wrap = el("div", {class: "map-embed"});

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
                {class: "map-open-row"},
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

    contact.appendChild(el("h2", {class: "section__title"}, SITE.contact.title));

    if (SITE.contact.blurb) {
        contact.appendChild(el("div", {class: "prose"}, `<p>${SITE.contact.blurb}</p>`));
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

    section.appendChild(el("h2", {class: "section__title"}, title));

    const grid = el("div", {class: "card-grid"});

    items.forEach((it) => {
        const inner = `
            <h3>${it.title}</h3>
            <p>${it.body}</p>
            ${it.meta ? `<span class="card__meta">${it.meta}</span>` : ""}
        `;

        if (linked && it.url) {
            const attrs = {class: "card card__link", href: it.url};

            if (isExternalUrl(it.url)) {
                attrs.target = "_blank";
                attrs.rel = "noopener noreferrer";
            }

            grid.appendChild(el("a", attrs, inner));
        } else {
            grid.appendChild(el("article", {class: "card"}, inner));
        }
    });

    section.appendChild(grid);
    return section;
}

function buildLinkList(items) {
    const ul = el("ul", {class: "link-list"});

    items.forEach((it) => {
        const attrs = {href: it.url};

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
    // Content is rendered by JS after load, so the browser's automatic scroll
    // restoration runs before the content exists and anchors to a nearby element
    // — on mobile this looks like a "pre-scroll" to a random item on refresh.
    // We own scroll position ourselves, so opt out of the browser's restoration.
    if ("scrollRestoration" in history) {
        history.scrollRestoration = "manual";
    }

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

    const show = (rawId, {focusPanel = false, push = true, scrollTop = true, forceTop = false} = {}) => {
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

            // On initial load, iOS Safari restores its old scroll position on a
            // later tick — after our render and even after scrollRestoration is
            // set to "manual", which iOS only partially honors. Re-assert the top
            // across a few frames and once more after load so its restoration and
            // any late layout shift (map iframe, background image) can't win.
            if (forceTop) {
                requestAnimationFrame(() => requestAnimationFrame(toTop));
                setTimeout(toTop, 0);
                setTimeout(toTop, 120);
                window.addEventListener("load", toTop, {once: true});
            }
        }

        if (focusPanel) {
            const panel = document.getElementById(id);
            if (panel) panel.focus({preventScroll: true});
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
        show(location.hash.slice(1) || defaultId, {push: false});
    });

    window.addEventListener("popstate", () => {
        show(location.hash.slice(1) || defaultId, {push: false});
    });

    // Initial tab from hash, or default. Force the top on first paint and hold
    // it across later frames so iOS Safari's scroll restoration can't drag the
    // page down to a nearby item on refresh.
    show(location.hash.slice(1) || defaultId, {push: false, forceTop: true});
}

/* ----------------------------------------------------------------------
   8B. HEADER FIT

   CSS can't detect when two flex items are about to touch, so we measure it.
   If the desktop nav + brand/socials + toggles don't fit the header on one
   row, add .force-mobile-nav (which hides the nav and the header socials and
   shows the hamburger). Re-checked on resize. Simple and reversible: when the
   window grows back, the class comes off and the desktop layout returns.
---------------------------------------------------------------------- */

function initHeaderFit() {
    const header = $(".site-header");
    const brandWrap = $(".brand-wrap");
    const nav = $("#navDesktop");

    if (!header || !brandWrap || !nav) return;

    // Switch to mobile once the gap between the rightmost social and the first
    // tab shrinks below this many pixels. Bump it up for more breathing room.
    const BUFFER = 24;

    const apply = () => {
        // Measure with the desktop layout shown, so the nav and socials are in
        // their real positions. (force-mobile-nav hides them, so drop it first.)
        header.classList.remove("force-mobile-nav");

        // Below the CSS breakpoint the media query already owns mobile mode.
        if (window.innerWidth <= 640) return;

        // The rightmost social link (the last one in the row) and the first tab.
        const socials = brandWrap.querySelectorAll(".socials__link");
        const firstTab = nav.querySelector("a");

        if (!socials.length || !firstTab) return;

        const socialRight = socials[socials.length - 1].getBoundingClientRect().right;
        const tabLeft = firstTab.getBoundingClientRect().left;

        // gap = horizontal space between the socials and the nav.
        const gap = tabLeft - socialRight;

        if (gap < BUFFER) {
            header.classList.add("force-mobile-nav");
        } else {
            // Back to desktop layout: close any drawer left open in mobile mode.
            const mobileNav = $("#navMobile");
            if (mobileNav && mobileNav.classList.contains("is-open")) {
                const menuToggle = $("#menuToggle");
                const scrim = $("#navScrim");
                mobileNav.classList.remove("is-open");
                mobileNav.setAttribute("aria-hidden", "true");
                document.body.classList.remove("menu-open");
                if (menuToggle) {
                    menuToggle.setAttribute("aria-expanded", "false");
                    menuToggle.setAttribute("aria-label", "Open menu");
                }
                if (scrim) {
                    scrim.classList.remove("is-visible");
                    scrim.hidden = true;
                }
            }
        }
    };

    apply();
    window.addEventListener("resize", apply);

    // Re-measure once web fonts load, since text widths shift when they swap in.
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(apply).catch(() => {
        });
    }
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

    const out = {...base};

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
            headers: {Accept: "application/json"},
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
    initHeaderFit();
    initTabs();
    initBackground();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}