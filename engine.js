/* =========================================================
   Static site template
   engine.js - runtime engine + UI logic (content lives in site-spec.json)

   SECTION INDEX - search for the "N. TITLE" line to jump to a section.
     1. CONTENT (the spec shape)         16. RENDER CONTENT SECTIONS (+ warm-up)
     2. I18N (locales, UI strings, t())  17. RENDER FOOTER
     3. RENDER LIFECYCLE (teardown)      18. RENDER THEME
     4. SMALL HELPERS                    19. RENDER DOCUMENT HEAD
     5. SINGLE SOURCE OF TRUTH           20. STRUCTURED DATA (JSON-LD)
     6. SAFE INLINE HTML                 21. INPUT MODE
     7. SPEC ACCESSORS, SOCIAL ICONS     22. THEME
     8. BLOCK BUILDERS                   23. LANGUAGE (switchLocale, initLang)
     9. FAQ / ACCORDION                  24. MOBILE MENU
    10. LIGHTBOX + SLIDESHOW             25. TABS
    11. GALLERY / PHOTO                  26. HEADER FIT
    12. OPENING HOURS                    27. BACKGROUND
    13. REVIEW + VIDEO                   28. CONTENT LOADING
    14. BLOCK DISPATCH                   29. ERROR SCREEN
    15. RENDER NAVIGATION                30. BOOT (renderSite, init)
   Adding a section? Keep the numbers in one sequence and add it here.
   ========================================================= */

// Pure, DOM-free logic shared with the dev tools (dev/generate-static.mjs,
// dev/launch-check.js) so the runtime, the static mirror and the validator can't
// drift: the spec→JSON-LD derivation, URL helpers, YouTube id parsing.
import {
    isExternalUrl, absoluteUrl, buildBusinessJsonLd, youtubeVideoId, youtubePlaylistId,
} from "./business-jsonld.mjs";

/* ----------------------------------------------------------------------
   1. CONTENT (the spec shape)

   There is NO inline content. All content lives in an external JSON file -
   one per locale (LOCALE_SPECS in the I18N section below; the default locale's
   file is site-spec.json). The site loads the active locale's file on boot; if
   it can't be loaded or parsed, or contains no usable sections, the visitor
   sees the error screen instead. JSON is the single source of truth.

   site-spec.json SHAPE (full field list: docs/spec-format.md + site-spec.schema.json)
   --------------------
   {
     "$schema": "site-spec.schema.json", "schemaVersion": "…",
     "brand": "Company",
     "brandImage": "assets/logo/….png", // optional; replaces header brand text
     "meta": { … },                // <head> metadata - see renderHead()
     "theme": { … },               // optional brand tokens - see renderTheme()
     "business": { … },            // SSOT contact/legal data - see getBusiness()
     "sections": [                 // ORDERED - order IS the nav + page order
       {
         "id": "home",             // unique; used in the URL hash
         "label": "Domov",         // text shown in the nav tab
         "title": "Optional",      // (optional) heading at top of the section
         "blocks": [ ... ]         // ordered content blocks
       }
     ],
     "socials": [ { "label", "headerLabel"?, "icon", "url" } ],
     "footer":  { "note": "...", "year": 2026 },   // year optional; JS fills it
     "backgrounds": [ "assets/background/bg.jpg", ... ]
   }

   BLOCK TYPES (each block is an object with a "type"):
     { "type": "hero", "eyebrow", "title", "lead" }
     { "type": "text", "name"?, "text": "Paragraph. Inline <em>…</em> and <a …> ok.", "format": "html"|"markdown"|"plain" }   // name = optional serif block heading
     { "type": "cards", "linked": false, "items": [ { "title","body","meta","url","icon" } ] }
     { "type": "links", "layout": "rows"|"grid", "use": ["phone","email",…], "items": [ { "label","handle","url","icon","kind" } ] }
     { "type": "map", "mode": "embed", "embed","url","label","address" }
     { "type": "slideshow", "name","blurb", "slides": [ { "src","title","caption","text" } ] }
     { "type": "table", "name","blurb", "headings": [...], "rows": [ [...], ... ], "accentValue": false, "offerCatalog": true, "collapsible": true }   // collapsible: true = collapsed behind its name (needs name); accentValue: false = no price styling on the last column; offerCatalog: true = exported as a JSON-LD OfferCatalog by business-jsonld.mjs (ignored by this builder)
     { "type": "faq", "name","blurb", "items": [ { "q","a" } ] }
     { "type": "gallery", "name","blurb","columns","perPage", "images": [ { "src","thumb","title","caption","text" } ] }
     { "type": "photo", "name","blurb", "src","thumb","title","caption","text" }
     { "type": "hours", "name","blurb" }   // reads SITE.business.hours
     { "type": "review", "name","blurb", "items": [ { "label","url","platform" } ] }   // outbound CTAs; no backend
     { "type": "video", "name","blurb", "url"|"playlist", "title" }   // YouTube embed; url = pinned video, playlist = auto-newest (UULF… uploads playlist)

   Most builders are pure (read only their `block` arg). The exceptions read
   single-source-of-truth data from SITE.business via getBusiness(): `map`
   (address/embed fallback) and `hours` (the week of opening times). New blocks
   should stay pure unless they're rendering SSOT business data.

   IMPORTANT: block text supports small inline HTML (<em>, <a>, <strong>…).
   EVERY spec-authored rich-text field is passed through sanitizeInline()
   before reaching innerHTML - disallowed tags/attributes and js/data: hrefs
   are stripped, so a compromised or LLM-generated spec can't inject scripts.
   Still author these values yourself; the sanitizer is defense in depth,
   not permission to feed it untrusted input.
---------------------------------------------------------------------- */

/* ----------------------------------------------------------------------
   2. I18N - runtime language switch (localStorage, no URL/build)

   Two layers are internationalized:
     1. CONTENT - one full spec file per locale (LOCALE_SPECS). The default
        locale's file is the canonical `site-spec.json` that the dev tools
        (dev/generate-static.mjs, dev/launch-check.js) and the static crawler mirror
        target; alternate locales are runtime-only.
     2. CHROME - the engine's own strings (aria-labels, error screen, weekday
        names, the language switcher) live in the UI table below, keyed by
        locale with an English fallback. Reach them with t("key").

   The active locale is read from localStorage at boot (LANG_KEY); switching
   saves the choice and re-renders the site in place (switchLocale → renderSite),
   instantly and with no fade - no page reload, no separate URLs. The background,
   theme, current tab and scroll position survive the switch; see the teardown
   registry (section 3) for the contract that makes a second render safe.
   Because the switch is runtime-only, the static SEO mirror reflects the
   DEFAULT locale; that's the accepted trade-off of a switcher over per-locale
   URLs.
---------------------------------------------------------------------- */

const LANG_KEY = "lang-preference";
const DEFAULT_LOCALE = "en";
// locale → its full spec file. Must be served over http (not file://) or the
// fetch is blocked by CORS. To add a language: add its spec file here, a
// LOCALE_NAMES endonym below, and a UI block below. The switcher (initLang) is
// a dropdown that lists every locale, so no per-language switcher code to touch.
const LOCALE_SPECS = {
    en: "site-spec.json",
    sk: "site-spec.sk.json",
};

// Human-readable names (endonyms) for the language dropdown; any locale not
// listed falls back to its uppercased code.
const LOCALE_NAMES = {
    en: "English",
    sk: "Slovenčina",
};

// Engine chrome strings, per locale. Author content in the spec; these are the
// strings the spec never carries. Missing keys fall back to English.
const UI = {
    en: {
        home: "Home",
        mainSections: "Main sections",
        skip: "Skip to content",
        themeToggle: "Toggle color theme",
        openMenu: "Open menu",
        closeMenu: "Close menu",
        primaryNav: "Primary",
        mobileNav: "Mobile",
        langToggle: "Change language",
        visitorStats: "Visitor statistics",
        prevSlide: "Previous slide",
        nextSlide: "Next slide",
        chooseSlide: "Choose slide",
        image: "Image",
        imageCarousel: (n) => `Image carousel, ${n} slides`,
        slideOf: (i, n) => `${i} of ${n}`,
        goToSlide: (n) => `Go to slide ${n}`,
        video: "YouTube video",
        lightboxLabel: "Enlarged image",
        lightboxClose: "Close",
        lightboxPrev: "Previous image",
        lightboxNext: "Next image",
        openMaps: "Open in Maps",
        locationMap: "Location map",
        slide: "Slide",
        enlargeImage: "Enlarge image",
        imageGallery: (n) => `Image gallery, ${n} images`,
        galleryPagination: "Gallery pagination",
        prevPage: "Previous page",
        nextPage: "Next page",
        kinds: {phone: "Phone", email: "Email", instagram: "Instagram", youtube: "YouTube", spotify: "Spotify", github: "GitHub", linkedin: "LinkedIn"},
        errorTitle: "This page is temporarily unavailable",
        errorLead: "The content couldn't be loaded right now. Please try again in a moment. ",
        errorDetails: "Technical details",
        days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    },
    sk: {
        home: "Domov",
        mainSections: "Hlavné sekcie",
        skip: "Preskočiť na obsah",
        themeToggle: "Prepnúť farebný motív",
        openMenu: "Otvoriť menu",
        closeMenu: "Zavrieť menu",
        primaryNav: "Hlavná navigácia",
        mobileNav: "Mobilná navigácia",
        langToggle: "Zmeniť jazyk",
        visitorStats: "Štatistiky návštevnosti",
        prevSlide: "Predchádzajúca snímka",
        nextSlide: "Ďalšia snímka",
        chooseSlide: "Vybrať snímku",
        image: "Obrázok",
        imageCarousel: (n) => `Fotogaléria, ${n} snímok`,
        slideOf: (i, n) => `${i} z ${n}`,
        goToSlide: (n) => `Prejsť na snímku ${n}`,
        video: "YouTube video",
        lightboxLabel: "Zväčšený obrázok",
        lightboxClose: "Zavrieť",
        lightboxPrev: "Predchádzajúci obrázok",
        lightboxNext: "Ďalší obrázok",
        openMaps: "Otvoriť mapy",
        locationMap: "Mapa lokality",
        slide: "Snímka",
        enlargeImage: "Zväčšiť obrázok",
        imageGallery: (n) => `Galéria, ${n} obrázkov`,
        galleryPagination: "Stránkovanie galérie",
        prevPage: "Predchádzajúca strana",
        nextPage: "Ďalšia strana",
        kinds: {phone: "Telefón", email: "E-mail", instagram: "Instagram", youtube: "YouTube", spotify: "Spotify", github: "GitHub", linkedin: "LinkedIn"},
        errorTitle: "Stránka je dočasne nedostupná",
        errorLead: "Obsah sa práve nepodarilo načítať. Skús to prosím o chvíľu znova. ",
        errorDetails: "Technické detaily",
        days: ["Pondelok", "Utorok", "Streda", "Štvrtok", "Piatok", "Sobota", "Nedeľa"],
    },
};

// Active locale, resolved from localStorage at the top of init(). Everything
// under here reads it via t(); the fetched spec file is LOCALE_SPECS[LOCALE].
let LOCALE = DEFAULT_LOCALE;

// Look up a chrome string for the active locale, falling back to English, then
// to the key itself. Function values (e.g. imageCarousel) are returned as-is
// for the caller to invoke.
function t(key) {
    const table = UI[LOCALE] || UI[DEFAULT_LOCALE];
    const val = table[key];
    return val !== undefined ? val : (UI[DEFAULT_LOCALE][key] !== undefined ? UI[DEFAULT_LOCALE][key] : key);
}

// The spec file for the active locale.
const currentSpecUrl = () => LOCALE_SPECS[LOCALE] || LOCALE_SPECS[DEFAULT_LOCALE];

// Pick the active locale from localStorage; unknown/missing → default.
function resolveLocale() {
    let stored = null;
    try {
        stored = localStorage.getItem(LANG_KEY);
    } catch {
        // storage unavailable - fall back to default
    }
    return stored && LOCALE_SPECS[stored] ? stored : DEFAULT_LOCALE;
}

// Populated from the fetched JSON on boot. Empty until then; if the load fails
// it stays empty and the error screen is shown.
let SITE = {};

/* ----------------------------------------------------------------------
   3. RENDER LIFECYCLE (teardown registry)

   The site is rendered more than once per page load: the language switch
   re-renders in place (switchLocale) instead of reloading, because a reload
   blinks the whole page - the shell repaints empty behind html.site-booting,
   the background layers restart from nothing, and the boot fade-in replays,
   all for what is really just a text swap.

   In-place means anything an init* function installs on a target that OUTLIVES
   a render - window, document, a media query, or one of the static shell
   elements index.html ships (#brand, #themeToggle, #menuToggle, #navDesktop,
   #navScrim, the bg layers) - would stack up a second copy on the next render.
   Install those with on() / onTeardown(), never a bare addEventListener:
   teardownSite() undoes them all before the next render.

   Listeners on nodes the render itself replaces (everything the build*
   functions wire: carousels, galleries, faq toggles, nav links) need no
   registration - they are collected along with their DOM.
---------------------------------------------------------------------- */

const TEARDOWN = [];

// addEventListener that remembers how to undo itself.
function on(target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    TEARDOWN.push(() => target.removeEventListener(type, handler, opts));
}

// Register any other undo: clearInterval, removing a node, tripping a
// "stopped" flag an in-flight callback checks.
function onTeardown(fn) {
    TEARDOWN.push(fn);
}

// Undo everything the current render installed, most recent first. A failing
// undo must not strand the rest of the teardown, hence the per-entry catch.
function teardownSite() {
    while (TEARDOWN.length) {
        try {
            TEARDOWN.pop()();
        } catch (err) {
            console.warn("Teardown step failed:", err);
        }
    }
}

/* ----------------------------------------------------------------------
   4. SMALL HELPERS
---------------------------------------------------------------------- */

const TAB_HASH_PREFIX = "#/";

function panelId(id) {
    return `panel-${id}`;
}

function tabHash(id) {
    return `${TAB_HASH_PREFIX}${encodeURIComponent(id)}`;
}

function readTabHash() {
    const hash = location.hash || "";

    // decodeURIComponent throws URIError on a malformed escape (e.g. "#/%").
    // A garbage hash must fall back to the default tab, not break init().
    const decode = (s) => {
        try {
            return decodeURIComponent(s);
        } catch {
            return "";
        }
    };

    if (hash.startsWith(TAB_HASH_PREFIX)) {
        return decode(hash.slice(TAB_HASH_PREFIX.length));
    }

    // Legacy "#id" form, kept so older links still land on their tab. Panels
    // are id'd "panel-<id>", so the browser finds no anchor to scroll to.
    if (hash.startsWith("#")) {
        return decode(hash.slice(1));
    }

    return "";
}

/* Jump the page to an exact offset with no smooth animation, temporarily
   overriding the `scroll-behavior: smooth` on <html>. */
function scrollInstantTo(top) {
    const html = document.documentElement;
    const previous = html.style.scrollBehavior;

    html.style.scrollBehavior = "auto";
    window.scrollTo({top, left: 0, behavior: "auto"});
    html.style.scrollBehavior = previous;
}

function scrollToTopInstant() {
    scrollInstantTo(0);
}

const $ = (sel, root = document) => root.querySelector(sel);

/* The JS side of the `prefers-reduced-motion` guards the CSS already honors -
   for the motion CSS can't switch off, like a timed fade the code waits on.
   Read live rather than cached at boot, so flipping the OS setting takes effect
   without a reload. */
const reducedMotion = () =>
    !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

/* Round ❮ / ❯ arrow button shared by the lightbox, the carousel, and the
   gallery pager - same glyphs and type/aria wiring everywhere, only the
   class differs. */
const navButton = (className, label, dir) =>
    el("button", {type: "button", class: className, "aria-label": label},
        dir === "prev" ? "&#10094;" : "&#10095;");

/* Shared roving-tabindex arrow-key handler (desktop tablist + carousel dots).
   Reads the moving-from index via getIndex (-1 = focus elsewhere, ignore),
   maps Arrow/Home/End to a wrapped target index, and hands it to onMove,
   which activates + focuses. Unrelated keys pass through untouched. */
function rovingKeydown(e, count, getIndex, onMove) {
    const current = getIndex();
    if (current === -1) return;

    let next = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = current + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = current - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = count - 1;

    if (next === null) return;

    e.preventDefault();
    onMove((next + count) % count);
}

/* Shared horizontal-swipe gesture (carousel + lightbox). Pointer Events give
   one code path for touch and pen; mouse is skipped on purpose - those users
   have the arrow buttons, and hijacking a mouse drag breaks text/image select.

   The CSS `touch-action` on `target` decides which axis the browser keeps and
   which one reaches us - see the swipe gotcha in docs/gotchas.md. Get it wrong and
   the browser claims the gesture for scrolling, ending the pointer stream in a
   pointercancel before any swipe can complete.

   onSwipe(-1 | +1) fires for a right / left flick; the optional onDismiss
   fires on a downward one (the usual "flick the photo away" close). */
const SWIPE_MIN = 45;      // px of travel before a drag counts as a swipe
const SWIPE_SLOP = 10;     // px before the gesture stops being a tap
const SWIPE_RATIO = 1.3;   // the winning axis must beat the other by this much

function initSwipe(target, {onSwipe, onDismiss} = {}) {
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let dragging = false;      // travelled past SWIPE_SLOP - no longer a tap
    let swallowClick = false;

    const reset = () => {
        pointerId = null;
        dragging = false;
    };

    target.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" || pointerId !== null) return;
        pointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        dragging = false;
        // A fresh press means the previous gesture's click either arrived or
        // never will; either way it must not eat this one.
        swallowClick = false;
    });

    target.addEventListener("pointermove", (e) => {
        if (e.pointerId !== pointerId || dragging) return;
        if (Math.abs(e.clientX - startX) < SWIPE_SLOP
            && Math.abs(e.clientY - startY) < SWIPE_SLOP) return;

        dragging = true;
        // Capture only once the gesture is clearly a drag, so a plain tap still
        // lands on the button underneath, while a drag that wanders off the
        // element still delivers its pointerup here.
        try {
            target.setPointerCapture(pointerId);
        } catch {
            /* pointer already gone - the up/cancel handlers still run */
        }
    });

    target.addEventListener("pointerup", (e) => {
        if (e.pointerId !== pointerId) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const wasDrag = dragging;
        reset();
        if (!wasDrag) return;

        // This release ends a drag, not a tap: the click the browser
        // synthesises next would activate whatever sits under the finger
        // (the expand button, or the lightbox's close-on-backdrop).
        swallowClick = true;

        if (onSwipe && Math.abs(dx) >= SWIPE_MIN
            && Math.abs(dx) > Math.abs(dy) * SWIPE_RATIO) {
            onSwipe(dx < 0 ? 1 : -1);
        } else if (onDismiss && dy >= SWIPE_MIN
            && dy > Math.abs(dx) * SWIPE_RATIO) {
            onDismiss();
        }
    });

    // Scroll took over, or the browser dropped the gesture: no swipe, and the
    // tap that never completed must not be swallowed either.
    target.addEventListener("pointercancel", (e) => {
        if (e.pointerId === pointerId) reset();
    });

    target.addEventListener("click", (e) => {
        if (!swallowClick) return;
        swallowClick = false;
        e.preventDefault();
        e.stopPropagation();
    }, true);
}

// Build an anchor's attrs with the standard external-link decoration applied:
// external (http/https) targets open in a new tab with rel="noopener
// noreferrer"; internal/relative ones are left untouched. `base` carries any
// other attrs (class, aria-label, …). One place owns this so every outbound
// link is decorated identically - see also the sanitizer, which applies the
// same rel to authored <a> tags in rich text.
const linkAttrs = (url, base = {}) => {
    const attrs = {...base, href: url};
    if (isExternalUrl(url)) {
        attrs.target = "_blank";
        attrs.rel = "noopener noreferrer";
    }
    return attrs;
};

/* ----------------------------------------------------------------------
   5. SINGLE SOURCE OF TRUTH - business resolution

   Contact + legal data lives in exactly one place: SITE.business. Blocks that
   need a phone/email/social reference it by KEY instead of restating the
   value, so a number is typed once in the whole spec. resolveRef() turns a
   key ("phone", "email", or a social icon key) into a {label, handle, url,
   icon} link descriptor, or null if the spec doesn't define it.
---------------------------------------------------------------------- */

function getBusiness() {
    return SITE.business && typeof SITE.business === "object" ? SITE.business : {};
}

/* Strip spaces/formatting from a phone number to build a tel: href. */
const telHref = (phone = "") => "tel:" + String(phone).replace(/[^\d+]/g, "");

/* Localized display names for what KIND of contact a row is ("Phone" over the
   number) - the active locale's `kinds` map from the UI table. Used by
   resolveRef() for SSOT rows and as the icon-key fallback for inline links
   items (an explicit item `kind` always wins). */
const kindLabels = () => t("kinds");

function resolveRef(key) {
    const b = getBusiness();

    if (key === "phone" && b.phone) {
        return {label: b.phone, handle: "", url: telHref(b.phone), icon: "phone", kind: kindLabels().phone};
    }
    if (key === "email" && b.email) {
        return {label: b.email, handle: "", url: "mailto:" + b.email, icon: "email", kind: kindLabels().email};
    }

    // Otherwise treat the key as a social icon key and pull from socials[].
    const social = (SITE.socials || []).find((s) => s && s.icon === key);
    if (social) {
        return {label: social.label, handle: "", url: social.url, icon: social.icon, kind: kindLabels()[social.icon] || ""};
    }

    return null;
}

/* ----------------------------------------------------------------------
   6. SAFE INLINE HTML

   Several blocks accept small inline HTML authored in the spec. As soon as
   that text can come from an LLM or a client intake form, raw innerHTML is a
   hole. sanitizeInline() keeps an allowlist of harmless inline tags and drops
   everything else (scripts, event handlers, javascript: URLs). Use it on any
   spec-authored rich text before it reaches innerHTML.
---------------------------------------------------------------------- */

const INLINE_ALLOWED = {
    em: [], strong: [], b: [], i: [], br: [], span: [],
    a: ["href", "title"],
};

function sanitizeInline(html = "") {
    const tpl = document.createElement("template");
    tpl.innerHTML = String(html);

    const walk = (node) => {
        // Iterate over a static copy: we mutate the tree as we go.
        Array.from(node.childNodes).forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE) return;
            if (child.nodeType !== Node.ELEMENT_NODE) {
                child.remove();
                return;
            }
            const tag = child.tagName.toLowerCase();
            const allowed = INLINE_ALLOWED[tag];
            if (!allowed) {
                // Disallowed element: keep its text, drop the wrapper.
                child.replaceWith(...Array.from(child.childNodes));
                return;
            }
            // Strip every attribute except the allowlisted ones.
            Array.from(child.attributes).forEach((attr) => {
                if (!allowed.includes(attr.name.toLowerCase())) child.removeAttribute(attr.name);
            });
            // Block javascript:/data: hrefs; force safe rel/target on links.
            if (tag === "a") {
                const href = child.getAttribute("href") || "";
                if (/^\s*(javascript|data):/i.test(href)) child.removeAttribute("href");
                if (isExternalUrl(href)) {
                    child.setAttribute("target", "_blank");
                    child.setAttribute("rel", "noopener noreferrer");
                }
            }
            walk(child);
        });
    };

    walk(tpl.content);
    return tpl.innerHTML;
}

/* The standard wrap for a spec-authored field on its way into innerHTML:
   coerce to string (nullish → "") and sanitize. Every builder uses this;
   a bare sanitizeInline() call means the value is already a string (built
   HTML, template literals). NOT for values set via el()/setAttribute
   (alt, aria-label, …) - those never parse HTML and must stay raw. */
const safeText = (v) => sanitizeInline(String(v ?? ""));

/* Render spec text honoring its declared `format`. Defaults to the sanitized
   inline-HTML path (back-compatible with existing specs); "plain" escapes
   everything; "markdown" handles a tiny inline subset then sanitizes. */
function renderRichText(text = "", format = "html") {
    if (format === "plain") return escapeHtml(text);
    if (format === "markdown") {
        const md = escapeHtml(text)
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
            .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
            .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
        return sanitizeInline(md);
    }
    return sanitizeInline(text);
}

/* ----------------------------------------------------------------------
   7. SPEC ACCESSORS, ESCAPING, SOCIAL ICONS

   getSections / navItems (the section list every render path reads),
   escapeHtml, the SOCIAL_ICONS map and buildSocials.
---------------------------------------------------------------------- */

/* The ordered list of sections, normalized + guarded. Every render path and
   the tab logic go through this, so a missing/empty `sections` array degrades
   to an empty site instead of throwing. Entries without an `id` are dropped
   (an id is required to anchor the tab + URL hash). */
function getSections() {
    const list = Array.isArray(SITE.sections) ? SITE.sections : [];
    return list.filter((s) => s && s.id);
}

/* Derive the nav (tabs) from the sections array - the array IS the nav.
   Falls back to the id when a section has no explicit label. */
function navItems() {
    return getSections().map((s) => ({id: s.id, label: s.label || s.id}));
}

/* HTML-escape a string before interpolating it into an innerHTML template -
   as plain-text content (hours values, the error screen's technical detail)
   or inside a quoted attribute (the map block's href). NOT needed for values
   set via el()/setAttribute, which never parse HTML. */
const escapeHtml = (str = "") =>
    String(str)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

/* Inline SVG icons - no icon library (keeps the no-deps rule). Each uses
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
    spotify:
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">' +
        '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.59 14.43a.62.62 0 0 1-.86.21c-2.35-1.44-5.3-1.76-8.79-.96a.62.62 0 1 1-.28-1.21c3.81-.87 7.08-.5 9.72 1.11.29.18.38.57.21.85zm1.22-2.72a.78.78 0 0 1-1.07.26c-2.69-1.65-6.79-2.13-9.97-1.17a.78.78 0 0 1-.45-1.49c3.63-1.1 8.15-.56 11.24 1.33.37.22.49.71.25 1.07zm.1-2.84C14.8 8.99 9.3 8.8 6.22 9.74a.94.94 0 1 1-.54-1.8c3.53-1.07 9.6-.86 13.39 1.39a.94.94 0 0 1-.96 1.61z"/>' +
        "</svg>",
    email:
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="3" y="5" width="18" height="14" rx="2"/>' +
        '<path d="m3 7 9 6 9-6"/>' +
        "</svg>",
    phone:
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>' +
        "</svg>",
    github:
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">' +
        '<path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.575.106.785-.25.785-.554 0-.273-.01-.998-.015-1.96-3.196.695-3.87-1.54-3.87-1.54-.523-1.33-1.278-1.683-1.278-1.683-1.044-.714.08-.7.08-.7 1.155.082 1.763 1.187 1.763 1.187 1.026 1.758 2.693 1.25 3.35.955.104-.744.401-1.25.73-1.538-2.552-.29-5.236-1.276-5.236-5.68 0-1.255.448-2.28 1.183-3.084-.119-.29-.513-1.46.112-3.044 0 0 .966-.31 3.165 1.178a10.98 10.98 0 0 1 2.88-.388c.977.005 1.962.132 2.882.388 2.197-1.488 3.162-1.178 3.162-1.178.627 1.584.233 2.754.114 3.044.737.804 1.182 1.829 1.182 3.084 0 4.415-2.688 5.386-5.248 5.671.413.356.78 1.057.78 2.131 0 1.539-.014 2.78-.014 3.158 0 .307.207.666.79.553A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z"/>' +
        "</svg>",
    linkedin:
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">' +
        '<path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/>' +
        "</svg>",
};

/* Build the row of social links shown next to the brand: a colored icon plus
   its visible label. Routes through el() and linkAttrs() so external links
   get target=_blank + rel=noopener for free, same as every other link.

   A social item may carry an optional `headerLabel`. When `useHeaderLabel` is
   true (the header brand cluster and the mobile drawer), that label wins over
   the default `label`; everywhere else (the contact box, the error-state escape
   hatch) keeps `label`. This lets the header Instagram button read differently
   from the same link shown in contacts, while the URL/icon stay single-source.
   `headerLabel` is optional, so existing specs are unaffected. */
function buildSocials(items, {useHeaderLabel = false} = {}) {
    const wrap = el("div", {class: "socials"});

    items.forEach((it) => {
        const icon = SOCIAL_ICONS[it.icon] || "";
        const label =
            useHeaderLabel && typeof it.headerLabel === "string" && it.headerLabel.trim()
                ? it.headerLabel.trim()
                : it.label;

        const attrs = linkAttrs(it.url, {
            class: `socials__link socials__link--${it.icon}`,
            "aria-label": label,
        });

        wrap.appendChild(
            el("a", attrs, `${icon}<span class="socials__label">${safeText(label)}</span>`)
        );
    });

    return wrap;
}

/* ----------------------------------------------------------------------
   8. BLOCK BUILDERS (hero, text, cards, links, map, table)

   Small functions that each turn one block's data into a DOM node. Most are
   pure builders (no SITE access), so they can be reused and tested; the two
   sanctioned exceptions are `map` and `hours`, which read single-source-of-
   truth business data via getBusiness(). The BLOCK_RENDERERS map at the end
   wires a `type` string to one of these.
---------------------------------------------------------------------- */

/* Optional name (serif heading) + blurb (prose intro) pair that opens seven
   block types (table, faq, slideshow, gallery, hours, review, text). styles.css
   already unified the look under .block__name/.block__blurb; this helper is
   the JS side of the same deduplication. `type` feeds the type-specific class
   ("table__name"), `nameAttrs` any extra heading attrs (the carousel passes
   an id so the slider can aria-labelledby it). */
function appendBlockHeader(wrapper, block, type, nameAttrs = {}) {
    if (block.name) {
        wrapper.appendChild(
            el("h3", {class: `block__name ${type}__name`, ...nameAttrs}, safeText(block.name))
        );
    }
    if (block.blurb) {
        wrapper.appendChild(
            el("div", {class: `prose block__blurb ${type}__blurb`}, `<p>${safeText(block.blurb)}</p>`)
        );
    }
}

/* Native-button disclosure pair shared by the FAQ rows and collapsible
   tables: a toggle <button> (label + plus/minus icon spans) wired to a
   hidden panel via aria-expanded/aria-controls; click flips both. The
   type-specific classes come from the caller - the ARIA contract and the
   flip handler live here once (same deduplication as appendBlockHeader).
   The label is plain text, set via textContent. */
function makeToggle(label, id, cls) {
    const btn = el("button", {
        type: "button",
        class: cls.button,
        id: `${id}-btn`,
        "aria-expanded": "false",
        "aria-controls": id,
    });
    btn.appendChild(el("span", {class: cls.text})).textContent = String(label);
    btn.appendChild(el("span", {class: cls.icon, "aria-hidden": "true"}));

    const panel = el("div", {
        class: cls.panel,
        id,
        role: "region",
        "aria-labelledby": `${id}-btn`,
        hidden: true,
    });

    btn.addEventListener("click", () => {
        const open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", open ? "false" : "true");
        panel.hidden = open;
    });

    return {btn, panel};
}

/* hero - the big intro/landing block: eyebrow + headline + lead paragraph.
   Only the FIRST hero on the page gets an <h1>; later heroes render an <h2>
   (same .intro__title styling - CSS targets the class, not the element), so
   a document with several hero sections keeps a single H1 for SEO. The
   counter is reset by renderContent() before each full render. */
let heroCount = 0;

function buildHero(block) {
    const wrap = el("div", {class: "intro"});
    if (block.eyebrow) wrap.appendChild(el("p", {class: "intro__eyebrow"}, safeText(block.eyebrow)));
    if (block.title) {
        const tag = ++heroCount === 1 ? "h1" : "h2";
        wrap.appendChild(el(tag, {class: "intro__title"}, safeText(block.title)));
    }
    if (block.lead) wrap.appendChild(el("p", {class: "intro__lead"}, safeText(block.lead)));
    return wrap;
}

/* text - a prose paragraph, optionally opened by the shared serif block
   heading (`name`, same look as table/faq names). Inline HTML is sanitized to
   an allowlist; set `format: "markdown"` for a small markdown subset or
   "plain" to escape all. */
function buildText(block) {
    if (!block.text) return null;
    const html = renderRichText(block.text, block.format);
    const prose = el("div", {class: "prose section__text"}, `<p>${html}</p>`);
    if (!block.name) return prose;
    const wrap = el("div", {class: "text-block"});
    appendBlockHeader(wrap, block, "text");
    wrap.appendChild(prose);
    return wrap;
}

/* cards - a responsive card grid. `linked: true` + an item `url` makes the
   whole card a link. An item `icon` adds a monochrome icon (a black PNG on a
   transparent background) to the left of the text,
   vertically centered; styles.css owns
   the sizing and the dark-theme inversion (--mono-icon-filter), so one asset
   re-themes in light/dark for free. Cards have no background photos. */
function buildCards(block) {
    const items = block.items || [];
    if (!items.length) return null;

    const linked = !!block.linked;
    const grid = el("div", {class: "card-grid"});

    items.forEach((it) => {
        // Optional monochrome icon (black PNG on transparent), shown to the
        // LEFT of the text, vertically centered. The
        // text (title/body/meta) is wrapped in .card__body so the card can
        // switch to a row layout (.card--icon) without breaking the meta's
        // stick-to-bottom behavior on plain cards. CSS inverts the icon in
        // dark theme via --mono-icon-filter so black art stays visible on
        // both themes. Decorative: alt is empty, the title carries meaning.
        const icon = typeof it.icon === "string" ? it.icon.trim() : "";

        const text = `
            <h3>${safeText(it.title)}</h3>
            ${it.body ? `<p>${safeText(it.body)}</p>` : ""}
            ${it.meta ? `<span class="card__meta">${safeText(it.meta)}</span>` : ""}
        `;

        const inner = icon
            ? `<span class="card__icon" aria-hidden="true"><img src="${escapeHtml(icon)}" alt="" loading="lazy"/></span><div class="card__body">${text}</div>`
            : text;

        const cardClass = icon ? "card card--icon" : "card";

        if (linked && it.url) {
            const attrs = linkAttrs(it.url, {class: `${cardClass} card__link`});
            grid.appendChild(el("a", attrs, inner));
        } else {
            grid.appendChild(el("article", {class: cardClass}, inner));
        }
    });

    return grid;
}

/* links - the contact/social link rows.
   Row anatomy: icon | (kind label over value) | optional handle | arrow cue.
   The kind ("Phone", "Instagram", …) comes from kindLabels() via the icon
   key, or an explicit item `kind`; the persistent arrow is the same
   clickability cue redirect cards use, so rows never need explaining.
   `layout: "grid"` renders the rows as side-by-side tiles instead. */
function buildLinks(block) {
    // Resolve `use: ["phone","email","instagram"]` against business/socials -
    // the SSOT path - then append any explicit inline items after them.
    const fromRefs = (block.use || [])
        .map(resolveRef)
        .filter(Boolean);
    const items = fromRefs.concat(block.items || []);
    if (!items.length) return null;

    const ul = el("ul", {class: `link-list${block.layout === "grid" ? " link-list--grid" : ""}`});

    items.forEach((it) => {
        if (!it || !it.url) return;

        const attrs = linkAttrs(it.url, {
            class: it.icon ? `link-list--${it.icon}` : null,
        });

        // Optional leading icon - `icon` must match a key in SOCIAL_ICONS.
        const icon = it.icon && SOCIAL_ICONS[it.icon]
            ? `<span class="link-list__icon" aria-hidden="true">${SOCIAL_ICONS[it.icon]}</span>`
            : "";

        // Small muted "what is this" line above the value. Explicit item
        // `kind` wins; otherwise derived from the icon key. Optional.
        const kind = it.kind || kindLabels()[it.icon] || "";
        const kindHtml = kind ? `<span class="link-list__kind">${safeText(kind)}</span>` : "";
        const labelHtml = it.label ? `<span class="label">${safeText(it.label)}</span>` : "";
        // Only render the handle span when there is one - an empty span here
        // breaks the :has() spacing in CSS.
        const handleHtml = it.handle ? `<span class="handle">${safeText(it.handle)}</span>` : "";

        const a = el(
            "a",
            attrs,
            `${icon}<span class="link-list__text">${kindHtml}${labelHtml}</span>${handleHtml}<span class="link-list__arrow" aria-hidden="true"></span>`
        );

        const li = el("li");
        li.appendChild(a);
        ul.appendChild(li);
    });

    return ul.children.length ? ul : null;
}

/* map - location block with two modes:
   - "embed" (default): the live Google Maps iframe + an "Open in Maps" button.
   - "static": a clean themed card with no iframe - the location name, an
     optional address line (only if `address` is set), and the button. */
/* The "open in Maps" button row shared by both map modes - one place owns
   the label and the link decoration. */
const mapOpenRow = (href) =>
    el(
        "p",
        {class: "map-open-row"},
        `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("openMaps"))}</a>`
    );

function buildMap(block) {
    const b = getBusiness();
    const mode = block.mode === "static" ? "static" : "embed";
    // Fall back to the business-level map fields so the URL is typed once.
    const embed = block.embed || b.mapEmbed;
    const href = block.url || b.mapUrl || embed;

    // ---- Static card mode (no iframe) ----
    if (mode === "static") {
        if (!href) return null; // nothing to point at - skip silently.

        const card = el("div", {class: "map-card"});
        if (block.label) card.appendChild(el("p", {class: "map-card__name"}, safeText(block.label)));
        if (block.address) card.appendChild(el("p", {class: "map-card__address"}, safeText(block.address)));

        card.appendChild(mapOpenRow(href));
        return card;
    }

    // ---- Embed mode (live iframe), the default ----
    if (!embed) return null;

    const frag = document.createDocumentFragment();

    const wrap = el("div", {class: "map-embed"});
    wrap.appendChild(
        el("iframe", {
            src: embed,
            title: block.label || t("locationMap"),
            loading: "lazy",
            referrerpolicy: "no-referrer-when-downgrade",
            allowfullscreen: true,
        })
    );
    frag.appendChild(wrap);
    frag.appendChild(mapOpenRow(href));

    return frag;
}

/* table - a structured table (e.g. a price list).
   Block shape: { name?, blurb?, headings: [...], rows: [[...], ...], accentValue?, offerCatalog? }
   offerCatalog is NOT read here - business-jsonld.mjs exports flagged tables
   into the schema.org OfferCatalog; this builder renders them like any other.
   Short rows are padded with empty cells and extra cells are ignored, so a
   ragged row never breaks the grid. By default the LAST column gets the
   accent price/value treatment (accent color, semibold) - right for short
   numeric values like prices. Set accentValue: false on prose tables
   (conditions, company data), where a whole column of bold accent sentences
   drowns the page and reads as links. */
let tableSeq = 0;

function buildTable(block) {
    const headings = block.headings || [];
    const rows = block.rows || [];
    if (!headings.length || !rows.length) return null;

    // Index of the accent-styled value column; -1 = no accent treatment.
    const valueCol = block.accentValue === false ? -1 : headings.length - 1;

    // Collapsible (opt-in via `collapsible: true`): the name becomes an
    // accordion toggle and the blurb + table collapse behind it - the shared
    // makeToggle pair, same as the FAQ. The name is the thing you click,
    // so without one the flag is ignored and the table renders expanded.
    const collapsible = block.collapsible === true && !!block.name;

    const wrapper = el("div", {
        class: collapsible ? "table-block table-block--collapsible" : "table-block",
    });

    // Where the blurb + table land: the wrapper itself, or the hidden panel.
    let panel = wrapper;
    if (collapsible) {
        const toggle = makeToggle(block.name, `table-${++tableSeq}`, {
            button: "table__toggle",
            text: "table__toggle-text",
            icon: "table__toggle-icon",
            panel: "table__panel",
        });

        wrapper
            .appendChild(el("h3", {class: "block__name table__name table__name--toggle"}))
            .appendChild(toggle.btn);

        panel = toggle.panel;
        if (block.blurb) {
            panel.appendChild(
                el("div", {class: "prose block__blurb table__blurb"}, `<p>${safeText(block.blurb)}</p>`)
            );
        }
        wrapper.appendChild(panel);
    } else {
        appendBlockHeader(wrapper, block, "table");
    }

    // Scroll wrapper: on a narrow screen the table scrolls sideways instead of
    // squashing its columns or forcing the page wider.
    const scroll = el("div", {class: "table-scroll"});
    const labelFor = (h) => String(h ?? "").replace(/<[^>]+>/g, "").trim();

    // A 2-column table stacks readably on mobile in source order (label →
    // value). With 3+ columns the stacked cells lose their meaning, so a wide
    // table also gets a mobile accordion mirror (built below) and is marked so
    // the CSS can swap the <table> for it on a narrow screen.
    const multicol = headings.length > 2;
    const table = el("table", {
        class: multicol ? "data-table data-table--multicol" : "data-table",
    });

    // Head.
    const thead = el("thead");
    const headRow = el("tr");
    headings.forEach((h, i) => {
        headRow.appendChild(
            el("th", {scope: "col", class: i === valueCol ? "data-table__value" : null}, safeText(h))
        );
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    // Body. One <tr> per row; cells are read positionally against headings.
    const tbody = el("tbody");
    rows.forEach((row) => {
        const cells = Array.isArray(row) ? row : [row];
        const tr = el("tr");
        for (let i = 0; i < headings.length; i++) {
            const value = safeText(cells[i]);
            tr.appendChild(
                el("td", {class: i === valueCol ? "data-table__value" : null}, value)
            );
        }
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    scroll.appendChild(table);
    panel.appendChild(scroll);

    // Mobile mirror for wide tables: a per-row accordion. Each row collapses to
    // its first cell (the name) + a +/- toggle and expands to the remaining
    // columns as labelled rows. CSS shows the <table> on desktop and this on
    // mobile (each is display:none on the other), so exactly one is ever in the
    // a11y tree - no duplicated content for screen readers. Reuses makeToggle,
    // the same disclosure pair as the FAQ and the collapsible-table header.
    if (multicol) {
        const gid = ++tableSeq;
        const cards = el("div", {class: "table-cards"});
        rows.forEach((row, r) => {
            const cells = Array.isArray(row) ? row : [row];
            const {btn, panel: rowPanel} = makeToggle(
                labelFor(cells[0]),
                `tcard-${gid}-${r}`,
                {
                    button: "table-cards__toggle",
                    text: "table-cards__name",
                    icon: "table-cards__icon",
                    panel: "table-cards__panel",
                }
            );
            for (let i = 1; i < headings.length; i++) {
                const line = el("div", {
                    class: i === valueCol ? "table-cards__row table-cards__row--value" : "table-cards__row",
                });
                line.appendChild(el("span", {class: "table-cards__label"}, safeText(headings[i])));
                line.appendChild(el("span", {class: "table-cards__value"}, safeText(cells[i])));
                rowPanel.appendChild(line);
            }
            const item = el("div", {class: "table-cards__item"});
            item.appendChild(btn);
            item.appendChild(rowPanel);
            cards.appendChild(item);
        });
        panel.appendChild(cards);
    }

    return wrapper;
}

/* ----------------------------------------------------------------------
   9. FAQ / ACCORDION

   buildFaq(block) returns a list of expand/collapse question rows.
   Shape: { name?, blurb?, items: [ { q, a }, ... ] }  (q + a required per item)
   Each row is a native <button> toggling an answer panel - keyboard-operable
   and screen-reader-labelled via aria-expanded + aria-controls, no JS state
   machine needed (the click handler just flips the attribute + hidden). `q`
   is plain text; `a` allows the same trusted inline HTML as text/table blurbs
   (authored content only - never raw user/LLM input). Returns null if empty so
   a misfilled block disappears instead of rendering broken; the validator
   flags the emptiness separately.
---------------------------------------------------------------------- */

let faqSeq = 0;

function buildFaq(block) {
    const items = (block.items || []).filter(
        (it) => it && (it.q != null) && (it.a != null)
    );
    if (!items.length) return null;

    const wrapper = el("div", {class: "faq-block"});
    appendBlockHeader(wrapper, block, "faq");

    const list = el("div", {class: "faq__list"});
    const seq = ++faqSeq;

    items.forEach((it, i) => {
        const item = el("div", {class: "faq__item"});

        // Question via the shared toggle pair (plain text, keyboard-native);
        // answer: trusted inline HTML (matches text/table), hidden until opened.
        const toggle = makeToggle(it.q, `faq-${seq}-${i}`, {
            button: "faq__q",
            text: "faq__q-text",
            icon: "faq__icon",
            panel: "faq__a",
        });
        toggle.panel.innerHTML = `<div class="prose">${safeText(it.a)}</div>`;

        item.appendChild(toggle.btn);
        item.appendChild(toggle.panel);
        list.appendChild(item);
    });

    wrapper.appendChild(list);
    return wrapper;
}

/* ----------------------------------------------------------------------
   10. LIGHTBOX + SLIDESHOW / CAROUSEL

   buildCarousel(block) returns a self-contained carousel node for a slideshow
   block: { name?, blurb?, slides: [ {src, title, caption, text}, ... ] }
   (only `src` is required per slide).

   Navigation is arrows + dots + keyboard, plus touch swipe via the shared
   initSwipe (which the lightbox below uses too). Swipe is additive - every
   control stays, so nothing regresses for keyboard or mouse.
---------------------------------------------------------------------- */

let carouselSeq = 0;

/* Shared lightbox: one overlay reused by every carousel, created lazily on
   first open. Shows the full image letterboxed (object-fit: contain in CSS). */
let lightboxApi = null;

function getLightbox() {
    if (lightboxApi) return lightboxApi;

    // A native modal <dialog>. showModal() puts it in the top layer, makes the
    // rest of the page inert (Tab cannot wander into the page behind), closes
    // on Escape / the back gesture, and returns focus to the opener on close.
    // So there is deliberately NO role/aria-modal, no focus trap, no Escape
    // key handler and no focus-restore code here - adding them back would
    // fight the browser.
    const overlay = el("dialog", {class: "lightbox", "aria-label": t("lightboxLabel")});

    const closeBtn = el("button", {
        type: "button",
        class: "lightbox__close",
        "aria-label": t("lightboxClose"),
        autofocus: true,
    }, "&times;");

    const prevBtn = navButton("lightbox__nav lightbox__nav--prev", t("lightboxPrev"), "prev");
    const nextBtn = navButton("lightbox__nav lightbox__nav--next", t("lightboxNext"), "next");

    const img = el("img", {class: "lightbox__img", alt: ""});
    const cap = el("p", {class: "lightbox__caption"});

    overlay.appendChild(closeBtn);
    overlay.appendChild(prevBtn);
    overlay.appendChild(nextBtn);
    overlay.appendChild(img);
    overlay.appendChild(cap);
    document.body.appendChild(overlay);

    const FADE_MS = 200;       // matches the .lightbox opacity transition
    let closeTimer = null;     // pending fade-out → dialog.close()
    let slides = [];           // current carousel's slides
    let index = 0;

    const render = () => {
        const s = slides[index] || {};
        img.src = s.src || "";
        img.alt = s.caption || "";
        cap.textContent = s.caption || "";
        cap.style.display = s.caption ? "" : "none";

        // Hide prev/next when there's only one image.
        const multi = slides.length > 1;
        prevBtn.style.display = multi ? "" : "none";
        nextBtn.style.display = multi ? "" : "none";
    };

    const go = (delta) => {
        if (slides.length < 2) return;
        index = (index + delta + slides.length) % slides.length;
        render();
    };

    // The ONE place a close is completed, whichever way it started: our
    // fade-out timer, an instant close, or the browser closing the dialog
    // itself (the `close` event below). Safe to run twice.
    const finish = () => {
        if (closeTimer) {
            clearTimeout(closeTimer);
            closeTimer = null;
        }
        overlay.classList.remove("is-open");
        document.body.classList.remove("lightbox-open");
        if (overlay.open) overlay.close();
        img.removeAttribute("src");
    };

    // Fade out, then close. `instant` skips the fade: used when the page under
    // the overlay is about to change (tab switch, language switch), where the
    // dialog must hand focus back to its opener NOW, while that opener is
    // still visible.
    const close = ({instant = false} = {}) => {
        if (!overlay.open) return;
        if (instant || reducedMotion()) {
            finish();
            return;
        }
        if (closeTimer) return; // already fading out
        overlay.classList.remove("is-open");
        closeTimer = setTimeout(finish, FADE_MS);
    };

    const open = (slideList, startIndex) => {
        // Re-opened during a fade-out: cancel the pending close and carry on.
        if (closeTimer) {
            clearTimeout(closeTimer);
            closeTimer = null;
        }

        slides = Array.isArray(slideList) ? slideList : [];
        index = Math.max(0, Math.min(startIndex || 0, slides.length - 1));

        render();
        if (!overlay.open) overlay.showModal();
        document.body.classList.add("lightbox-open");
        requestAnimationFrame(() => overlay.classList.add("is-open"));
    };

    closeBtn.addEventListener("click", () => close());
    prevBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        go(-1);
    });
    nextBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        go(1);
    });

    // Click on the backdrop (but not the image or any control) closes. The
    // dialog fills the viewport, so "the backdrop" is the dialog element itself.
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
    });

    // Escape / back gesture arrive as `cancel`. Take them through our own
    // close() so they fade like every other close; if the browser closes the
    // dialog regardless, the `close` event still tidies up.
    overlay.addEventListener("cancel", (e) => {
        e.preventDefault();
        close();
    });
    overlay.addEventListener("close", finish);

    // Arrow keys step through the set. Focus is always inside the modal, so
    // the listener lives on the dialog - no document-level handler to tear down.
    overlay.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") go(1);
        else if (e.key === "ArrowLeft") go(-1);
    });

    // The overlay is page-level, so it survives a re-render unless we say
    // otherwise - but its labels are localized at build time, so a locale swap
    // has to discard it and let the next open build a localized one.
    onTeardown(() => {
        finish();
        overlay.remove();
        lightboxApi = null;
    });

    // Touch: flick sideways to step through the set, down to dismiss - the
    // same two moves the arrows and Escape provide. This is the gallery's
    // only navigation on a phone: its tiles open straight into here.
    initSwipe(overlay, {onSwipe: go, onDismiss: () => close()});

    lightboxApi = {open, close, isOpen: () => overlay.open};
    return lightboxApi;
}

/* Close the shared lightbox if one is open - and never create it just to ask.
   The overlay is page-level, not owned by any panel, so a tab change beneath
   it (browser back/forward while an image is expanded) would otherwise leave
   it floating over the newly shown panel with page scroll still locked by
   .lightbox-open. Called by show() in initTabs and by switchLocale; the null
   check is what keeps the lightbox lazy for visitors who never open one.
   Instant (no fade), so focus returns to the opener before its panel hides. */
function closeLightbox() {
    if (lightboxApi && lightboxApi.isOpen()) lightboxApi.close({instant: true});
}

/* Normalize image entries ({src,title,caption,text}) into the {src,caption}
   shape the shared lightbox renders. Shared by the carousel and the gallery so
   both feed the lightbox identically. */
function toLightboxSlides(list) {
    return (list || []).map((s, i) => ({
        src: s.src,
        caption: [s.title, s.caption, s.text].filter(Boolean).join(" - ") || `${t("image")} ${i + 1}`,
    }));
}

function buildCarousel(block) {
    block = block || {};
    const list = (block.slides || []).filter((s) => s && s.src);
    if (!list.length) return null;

    const name = block.name;
    const multi = list.length > 1;
    const uid = `carousel-${++carouselSeq}`;

    const baseLabel = multi ? t("imageCarousel")(list.length) : t("image");

    const wrapper = el("div", {class: "carousel-block"});
    appendBlockHeader(wrapper, block, "carousel", {id: `${uid}-name`});

    const root = el("div", {
        class: "carousel" + (multi ? "" : " carousel--single"),
        role: "group",
        "aria-roledescription": "carousel",
        "aria-label": name ? `${name}: ${baseLabel}` : baseLabel,
        "aria-labelledby": name ? `${uid}-name` : null,
    });

    const viewport = el("div", {class: "carousel__viewport"});

    const lightboxSlides = toLightboxSlides(list);

    const slideNodes = list.map((s, i) => {
        const slide = el("figure", {
            class: "carousel__slide",
            role: "group",
            "aria-roledescription": multi ? "slide" : null,
            "aria-label": multi ? t("slideOf")(i + 1, list.length) : null,
            "aria-hidden": multi && i !== 0 ? "true" : null,
            id: `${uid}-slide-${i}`,
        });

        const altText = s.title || s.caption || `${t("slide")} ${i + 1}`;

        const trigger = el("button", {
            type: "button",
            class: "carousel__expand",
            "aria-label": `${t("enlargeImage")}: ${altText}`,
        });

        const img = el("img", {
            class: "carousel__img",
            src: s.src,
            alt: altText, // set via setAttribute - no escaping needed (or wanted)
            loading: i === 0 ? "eager" : "lazy",
            decoding: "async",
        });

        img.addEventListener("error", () => {
            img.classList.add("is-broken");
        });

        trigger.appendChild(img);
        trigger.addEventListener("click", () => getLightbox().open(lightboxSlides, i));
        slide.appendChild(trigger);

        if (s.title || s.caption || s.text) {
            const cap = el("figcaption", {class: "carousel__caption"});
            if (s.title) cap.appendChild(el("span", {class: "carousel__title"}, safeText(s.title)));
            if (s.caption) cap.appendChild(el("span", {class: "carousel__text"}, safeText(s.caption)));
            if (s.text) cap.appendChild(el("span", {class: "carousel__subtext"}, safeText(s.text)));
            slide.appendChild(cap);
        }

        viewport.appendChild(slide);
        return slide;
    });

    root.appendChild(viewport);

    if (!multi) {
        wrapper.appendChild(root);
        return wrapper;
    }

    // ---- Multi-slide controls ----
    let index = 0;
    let dots = [];

    const setActive = (next) => {
        index = (next + list.length) % list.length;

        slideNodes.forEach((node, i) => {
            const active = i === index;
            node.classList.toggle("is-active", active);
            node.setAttribute("aria-hidden", active ? "false" : "true");
        });

        dots.forEach((dot, i) => {
            const active = i === index;
            dot.classList.toggle("is-active", active);
            dot.setAttribute("aria-selected", String(active));
            dot.tabIndex = active ? 0 : -1;
        });
    };

    const AUTOPLAY_MS = 5000;

    let timer = null;

    const stop = () => {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    };

    const start = () => {
        if (reducedMotion() || timer) return;
        timer = setInterval(() => setActive(index + 1), AUTOPLAY_MS);
    };

    // The carousel's own listeners ride along when the render replaces its DOM,
    // but a timer doesn't - an autoplay left running would keep ticking against
    // a detached carousel, one extra interval per language switch.
    onTeardown(stop);

    root.addEventListener("mouseenter", stop);
    root.addEventListener("mouseleave", start);
    root.addEventListener("focusin", stop);
    root.addEventListener("focusout", start);

    const prevBtn = navButton("carousel__nav carousel__nav--prev", t("prevSlide"), "prev");
    const nextBtn = navButton("carousel__nav carousel__nav--next", t("nextSlide"), "next");

    const manual = (fn) => () => {
        fn();
        stop();
        start();
    };

    prevBtn.addEventListener("click", manual(() => setActive(index - 1)));
    nextBtn.addEventListener("click", manual(() => setActive(index + 1)));

    // Touch swipe on the slide area (not the whole root - the arrows and dots
    // keep their own taps). Routed through manual() so a swipe resets the
    // autoplay timer exactly like pressing an arrow does.
    initSwipe(viewport, {onSwipe: (dir) => manual(() => setActive(index + dir))()});

    root.appendChild(prevBtn);
    root.appendChild(nextBtn);

    const dotWrap = el("div", {
        class: "carousel__dots",
        role: "tablist",
        "aria-label": t("chooseSlide"),
    });

    dots = list.map((s, i) => {
        const dot = el("button", {
            type: "button",
            class: "carousel__dot",
            role: "tab",
            "aria-label": t("goToSlide")(i + 1),
            "aria-selected": i === 0 ? "true" : "false",
            "aria-controls": `${uid}-slide-${i}`,
            tabindex: i === 0 ? "0" : "-1",
        });
        dot.addEventListener("click", manual(() => setActive(i)));
        dotWrap.appendChild(dot);
        return dot;
    });

    dotWrap.addEventListener("keydown", (e) => {
        rovingKeydown(e, list.length, () => index, (next) => {
            setActive(next);
            dots[index].focus();
            stop();
            start();
        });
    });

    root.appendChild(dotWrap);

    setActive(0);
    start(); // begin autoplay
    wrapper.appendChild(root);
    return wrapper;
}

/* ----------------------------------------------------------------------
   11. GALLERY / PHOTO (image grid, shares the carousel's lightbox)

   buildGallery(block) renders a responsive grid of image tiles. Same theme
   tokens and the SAME shared lightbox as the carousel (getLightbox), but every
   tiles are shown one page at a time (see perPage); a pager steps between pages.
   Tiles are image-only - no caption strip under them. Click any tile → the
   lightbox opens at that image's absolute index, then arrow through the WHOLE
   set (across pages). Broken images fail silently (panel background shows
   through), matching the carousel.

   Block shape:
   { "type": "gallery", "name"?, "blurb"?, "columns"?: 2|3|4, "perPage"?: int,
     "images": [ { "src", "thumb"?, "title"?, "caption"? } ] }  // src required;
   optional `thumb` is a smaller rendition used for the grid tile only - the
   lightbox always opens the full `src`.

   title/caption are NOT rendered as visible tile captions - they feed the
   image alt text and the lightbox caption only. perPage defaults to 12.

   buildPhoto(block) is single-image sugar: normalizes to a one-image gallery so
   it shares the styling + lightbox. Shape: { "type": "photo", "src", ... }.
---------------------------------------------------------------------- */

const GALLERY_PER_PAGE_DEFAULT = 12;

function buildGallery(block) {
    block = block || {};
    const list = (block.images || []).filter((s) => s && s.src);
    if (!list.length) return null;

    const name = block.name;
    const uid = `gallery-${++carouselSeq}`; // reuse the carousel sequence counter

    // Same data the carousel feeds the lightbox - identical preview experience.
    // Built once over the FULL list so lightbox indices are absolute: arrowing
    // in the lightbox traverses every image regardless of the visible page.
    const lightboxSlides = toLightboxSlides(list);

    // How many tiles per page. Clamp to a sane minimum; default keeps a few
    // rows visible without dumping a whole archive at once.
    let perPage = Number(block.perPage);
    if (!Number.isInteger(perPage) || perPage < 1) perPage = GALLERY_PER_PAGE_DEFAULT;

    const pageCount = Math.ceil(list.length / perPage);
    const paged = pageCount > 1;
    let page = 0; // current page index (0-based)

    const wrapper = el("div", {class: "gallery-block"});
    appendBlockHeader(wrapper, block, "gallery", {id: `${uid}-name`});

    const gridAttrs = {
        class: "gallery__grid",
        role: "list",
        "aria-label": name || t("imageGallery")(list.length),
    };
    const cols = Number(block.columns);
    if (cols === 2 || cols === 3 || cols === 4) {
        gridAttrs["data-columns"] = String(cols);
    }
    const grid = el("div", gridAttrs);

    // Build one tile for absolute index `absI` in the full list.
    const buildTile = (s, absI) => {
        const altText = s.title || s.caption || `${t("image")} ${absI + 1}`;

        // Each tile is a real button → focusable + keyboard-openable, exactly
        // like the carousel's .carousel__expand trigger.
        const trigger = el("button", {
            type: "button",
            class: "gallery__item",
            role: "listitem",
            "aria-label": `${t("enlargeImage")}: ${altText}`,
        });

        const img = el("img", {
            class: "gallery__img",
            // Tiles are small - serve the optional `thumb` rendition when the
            // spec provides one; the lightbox always opens the full `src`.
            src: s.thumb || s.src,
            alt: altText, // set via setAttribute - no escaping needed (or wanted)
            // First row of the FIRST page eager; everything else lazy.
            loading: absI < 4 ? "eager" : "lazy",
            decoding: "async",
        });

        img.addEventListener("error", () => {
            img.classList.add("is-broken"); // silent fail, like .carousel__img
        });

        trigger.appendChild(img);

        // Tap a tile → open the shared lightbox at its ABSOLUTE index, so the
        // lightbox can arrow across the whole set, not just the visible page.
        trigger.addEventListener("click", () => getLightbox().open(lightboxSlides, absI));

        return trigger;
    };

    // Render the tiles for the current page (replaces grid contents).
    const renderPage = () => {
        grid.replaceChildren();
        const start = page * perPage;
        const end = Math.min(start + perPage, list.length);
        for (let i = start; i < end; i++) {
            grid.appendChild(buildTile(list[i], i));
        }
    };

    renderPage();
    wrapper.appendChild(grid);

    // Pager: only when the set spans more than one page.
    if (paged) {
        const pager = el("nav", {
            class: "gallery__pager",
            "aria-label": name ? `${t("galleryPagination")}: ${name}` : t("galleryPagination"),
        });

        const status = el("span", {
            class: "gallery__pager-status",
            "aria-live": "polite",
        });

        const prev = navButton("gallery__pager-btn gallery__pager-btn--prev", t("prevPage"), "prev");
        const next = navButton("gallery__pager-btn gallery__pager-btn--next", t("nextPage"), "next");

        const syncControls = () => {
            status.textContent = `${page + 1} / ${pageCount}`;
            prev.disabled = page === 0;
            next.disabled = page === pageCount - 1;
        };

        const goToPage = (next0) => {
            const clamped = Math.max(0, Math.min(next0, pageCount - 1));
            if (clamped === page) return;
            page = clamped;
            renderPage();
            syncControls();
            // Keep the gallery heading/top in view after a page change.
            wrapper.scrollIntoView({block: "nearest", behavior: "smooth"});
        };

        prev.addEventListener("click", () => goToPage(page - 1));
        next.addEventListener("click", () => goToPage(page + 1));

        pager.appendChild(prev);
        pager.appendChild(status);
        pager.appendChild(next);
        syncControls();

        wrapper.appendChild(pager);
    }

    return wrapper;
}

function buildPhoto(block) {
    if (!block || !block.src) return null;
    return buildGallery({
        name: block.name,
        blurb: block.blurb,
        images: [{src: block.src, thumb: block.thumb, title: block.title, caption: block.caption, text: block.text}],
    });
}

/* ----------------------------------------------------------------------
   12. OPENING HOURS

   Renders SITE.business.hours as a seven-row week (Monday…Sunday). Hours
   are single-source-of-truth: the block carries no hours data, only an
   optional name/blurb, and reads business.hours by key - same philosophy as
   the links block referencing phone/email. Today's row is highlighted
   (is-today + aria-current); no open/closed-now logic.

   business.hours shape (all keys optional; a missing day shows a dash):
     { "mon": "9:00–17:00", ..., "sat": "Closed", "sun": "Closed" }

   Block shape: { "type": "hours", "name"?, "blurb"? }
---------------------------------------------------------------------- */

// Fixed Mon-first week; the visible weekday labels are localized via the UI
// `days` array (same Mon→Sun order). HOURS_DAY_BY_GETDAY maps JS getDay()
// (Sun=0..Sat=6) into this key order so "today" lands on the right row.
const HOURS_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const HOURS_DAY_BY_GETDAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function buildHours(block) {
    block = block || {};
    const hours = getBusiness().hours;
    if (!hours || typeof hours !== "object") return null;

    // Need at least one real day value, else there's nothing to show.
    const hasAny = HOURS_DAY_KEYS.some((k) => typeof hours[k] === "string" && hours[k].trim());
    if (!hasAny) return null;

    const todayKey = HOURS_DAY_BY_GETDAY[new Date().getDay()];
    const dayLabels = t("days");

    const wrapper = el("div", {class: "hours-block"});
    appendBlockHeader(wrapper, block, "hours");

    const dl = el("dl", {class: "hours__list"});

    HOURS_DAY_KEYS.forEach((key, i) => {
        const raw = hours[key];
        const value = (typeof raw === "string" && raw.trim()) ? raw.trim() : "-";
        const isToday = key === todayKey;

        const row = el("div", {
            class: isToday ? "hours__row is-today" : "hours__row",
            "aria-current": isToday ? "date" : false,
        });

        row.appendChild(el("dt", {class: "hours__day"}, dayLabels[i]));
        row.appendChild(el("dd", {class: "hours__value"}, escapeHtml(value)));
        dl.appendChild(row);
    });

    wrapper.appendChild(dl);
    return wrapper;
}

/* ----------------------------------------------------------------------
   13. REVIEW + VIDEO
---------------------------------------------------------------------- */

/* review - a "leave a review" call-to-action. Pure builder.

   This block does NOT collect or store reviews (the engine is no-build and
   has no backend). It renders one or more outbound buttons that send the
   visitor to where reviews actually live and are moderated - Google Business,
   Facebook, etc. The "submission" happens on the platform's own page.

   Shape: { name?, blurb?, items: [ { label, url, platform? } ] }
     - label    (required) visible button text, plain.
     - url      (required) the external review page. Skipped if missing.
     - platform (optional) one of REVIEW_ICONS keys (google, facebook) for a
                leading brand icon + tint class; unknown/absent = generic icon. */

/* Self-contained brand glyphs for review CTAs. Kept here (not in SOCIAL_ICONS)
   because these are link buttons, not the brand-row social icons. */
const REVIEW_ICONS = {
    google:
        '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
        '<path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"/>' +
        '<path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>' +
        '<path fill="#fbbc05" d="M5.85 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.67-2.84z"/>' +
        '<path fill="#ea4335" d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.16-3.16C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.67 2.84C6.71 7.3 9.14 5.38 12 5.38z"/>' +
        "</svg>",
    facebook:
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="#1877f2" aria-hidden="true">' +
        '<path d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.95.92-1.95 1.87V12h3.32l-.53 3.47h-2.79v8.38A12 12 0 0 0 24 12z"/>' +
        "</svg>",
    generic:
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="m12 3 2.6 5.27 5.82.85-4.21 4.1.99 5.78L12 16.27 6.8 19l.99-5.78-4.21-4.1 5.82-.85L12 3z"/>' +
        "</svg>",
};

function buildReview(block) {
    const items = (block.items || []).filter((it) => it && it.url && it.label);
    if (!items.length) return null;

    const wrapper = el("div", {class: "review-block"});
    appendBlockHeader(wrapper, block, "review");

    const list = el("div", {class: "review__list"});

    items.forEach((it) => {
        const platform = typeof it.platform === "string" ? it.platform : "";
        const icon = REVIEW_ICONS[platform] || REVIEW_ICONS.generic;

        const attrs = linkAttrs(it.url, {
            class: platform ? `review__cta review__cta--${platform}` : "review__cta",
        });

        // label is plain text → sanitizeInline escapes it. icon is authored SVG.
        const a = el(
            "a",
            attrs,
            `<span class="review__cta-icon" aria-hidden="true">${icon}</span>` +
            `<span class="review__cta-label">${safeText(it.label)}</span>` +
            `<span class="review__cta-arrow" aria-hidden="true"></span>`
        );

        list.appendChild(a);
    });

    wrapper.appendChild(list);
    return wrapper;
}

/* video - an embedded YouTube player. Pure builder.
   Shape: { name?, blurb?, url? | playlist?, title? }   (one source required)

   Two source modes:
   - `url` - a PINNED video: a normal YouTube link in any of the shapes people
     actually copy (watch?v=, youtu.be/, shorts/, live/, embed/); the 11-char
     video id is extracted from it.
   - `playlist` - an AUTO-UPDATING player: a playlist id or any URL with
     ?list=. The player opens on the playlist's FIRST entry, and YouTube's
     synthetic channel playlists are ordered newest-first - so pointing this
     at a channel's uploads playlist always shows the latest video with no
     spec edit per upload. Playlist ids: take the channel id (UC…) and swap
     the prefix - UU… = all uploads (includes Shorts), UULF… = long-form
     videos only (the right one for "latest episode").
   When both are set, `url` wins - an explicit pin beats auto-latest.

   Served from the privacy-enhanced youtube-nocookie.com host, which sets no
   cookies until the visitor presses play (same privacy posture as picking
   GoatCounter over GA). The iframe is lazy-loaded like the map embed -
   and, like it, warmed up in the background after page load when it sits in
   a hidden tab (see warmUpIframes) - but stays interactive (no
   pointer-events trick - you have to be able to click play). `title` is the
   iframe's accessible name; falls back to the block `name`.

   Returns null when no id can be extracted from either source, so a
   misfilled block disappears instead of rendering a broken frame;
   launch-check flags it separately (VIDEO_URL_NOT_YOUTUBE /
   VIDEO_PLAYLIST_INVALID). The id parsing (youtubeVideoId /
   youtubePlaylistId) lives in business-jsonld.mjs, shared with the validator
   and the llms.txt generator. */
function buildVideo(block) {
    const videoId = youtubeVideoId(block.url);
    const playlistId = videoId ? null : youtubePlaylistId(block.playlist);

    const src = videoId
        ? `https://www.youtube-nocookie.com/embed/${videoId}`
        : playlistId
            ? `https://www.youtube-nocookie.com/embed/videoseries?list=${playlistId}`
            : null;
    if (!src) return null;

    const wrapper = el("div", {class: "video-block"});
    appendBlockHeader(wrapper, block, "video");

    const frame = el("div", {class: "video-embed"});
    frame.appendChild(
        el("iframe", {
            src,
            title: block.title || block.name || t("video"),
            loading: "lazy",
            allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
            referrerpolicy: "strict-origin-when-cross-origin",
            allowfullscreen: true,
        })
    );
    wrapper.appendChild(frame);
    return wrapper;
}

/* ----------------------------------------------------------------------
   14. BLOCK DISPATCH
---------------------------------------------------------------------- */

const BLOCK_RENDERERS = {
    hero: buildHero,
    text: buildText,
    cards: buildCards,
    links: buildLinks,
    map: buildMap,
    slideshow: buildCarousel,
    table: buildTable,
    faq: buildFaq,
    gallery: buildGallery,
    photo: buildPhoto,
    hours: buildHours,
    review: buildReview,
    video: buildVideo,
};

function renderBlock(block) {
    if (!block || !block.type) return null;

    const builder = BLOCK_RENDERERS[block.type];
    if (!builder) {
        console.warn(`Unknown block type: "${block.type}" - skipped.`);
        return null;
    }

    return builder(block);
}

/* ----------------------------------------------------------------------
   15. RENDER NAVIGATION

   Tabs are derived from the sections array (navItems()), so there is no
   separate nav list to keep in sync.
---------------------------------------------------------------------- */

function renderNav() {
    const desktop = $("#navDesktop");
    const mobile = $("#navMobile");
    const brand = $("#brand");

    if (!desktop || !mobile || !brand) return;

    // Start from empty: this runs again on a locale swap, and appending to the
    // previous render's nav would stack two sets of tabs. Clearing the drawer
    // also drops its injected close button - initMobileMenu(), which runs after
    // this, puts a freshly localized one back.
    desktop.innerHTML = "";
    mobile.innerHTML = "";
    brand.classList.remove("brand--image");

    // Header brand: text by default; an optional spec-level `brandImage`
    // (e.g. a PNG logo) replaces the text visually. The brand string still
    // matters - it becomes the image's alt, and keeps feeding the footer
    // copyright and metadata, so it stays the single source of truth for the
    // name. Monochrome black-on-transparent logos are auto-inverted in dark
    // theme by CSS (--mono-icon-filter on .brand__img).
    const brandImage = typeof SITE.brandImage === "string" ? SITE.brandImage.trim() : "";
    if (brandImage) {
        brand.textContent = "";
        brand.classList.add("brand--image");
        brand.appendChild(el("img", {
            class: "brand__img",
            src: brandImage,
            alt: SITE.brand || t("home"),
        }));
    } else {
        brand.textContent = SITE.brand;
    }

    const firstItem = navItems()[0];
    if (firstItem) {
        brand.href = tabHash(firstItem.id);
    }

    // Wrap the brand and optional socials into one left-side header cluster
    // so header-fit measures brand + socials as a single unit. On a re-render
    // the cluster already exists - reuse it (a second replaceWith() would nest
    // a wrap inside the old one) and rebuild its contents from scratch.
    let brandWrap = brand.parentElement && brand.parentElement.classList.contains("brand-wrap")
        ? brand.parentElement
        : null;

    if (!brandWrap) {
        brandWrap = el("div", {class: "brand-wrap"});
        brand.replaceWith(brandWrap);
    }

    brandWrap.replaceChildren(brand);

    if (SITE.socials && SITE.socials.length) {
        brandWrap.appendChild(buildSocials(SITE.socials, {useHeaderLabel: true}));
    }

    desktop.setAttribute("role", "tablist");
    desktop.setAttribute("aria-label", t("mainSections"));

    navItems().forEach((item) => {
        // Desktop nav is the real ARIA tablist. These IDs are unique.
        desktop.appendChild(
            el(
                "a",
                {
                    href: tabHash(item.id),
                    "data-nav": item.id,
                    role: "tab",
                    id: `tab-${item.id}`,
                    "aria-controls": panelId(item.id),
                    "aria-selected": "false",
                    tabindex: "-1",
                },
                safeText(item.label)
            )
        );

        // Mobile nav is plain navigation. Do not duplicate desktop tab IDs.
        mobile.appendChild(
            el(
                "a",
                {
                    href: tabHash(item.id),
                    "data-nav": item.id,
                },
                safeText(item.label)
            )
        );
    });

    // A copy of the social links at the bottom of the mobile drawer.
    if (SITE.socials && SITE.socials.length) {
        mobile.appendChild(buildSocials(SITE.socials, {useHeaderLabel: true}));
    }
}

/* ----------------------------------------------------------------------
   16. RENDER CONTENT SECTIONS (+ image / embed warm-up)

   Each section in the array is rendered as its optional title followed by its
   blocks, in order. Reorder a section by reordering its `blocks`; reorder the
   site by reordering the `sections` array.
---------------------------------------------------------------------- */

function buildSection(section) {
    const node = el("section", {
        id: panelId(section.id),
        class: "section",
        role: "tabpanel",
        "aria-labelledby": `tab-${section.id}`,
        tabindex: "-1",
    });

    // Optional section heading. The hero block carries its own headline, so a
    // section that leads with hero usually omits `title`.
    if (section.title) {
        node.appendChild(el("h2", {class: "section__title"}, safeText(section.title)));
    }

    const blocks = section.blocks || [];
    blocks.forEach((block) => {
        const rendered = renderBlock(block);
        if (!rendered) return;

        const wrap = el("div", {class: "block"});
        wrap.appendChild(rendered);
        node.appendChild(wrap);
    });

    return node;
}

function renderContent() {
    const main = $("#main");
    if (!main) return;

    main.innerHTML = "";
    heroCount = 0; // first hero of this render gets the page's single <h1>

    const sections = getSections();

    // One panel per section, in array order.
    const panels = sections.map((section) => buildSection(section));

    // Image priority pass - must run BEFORE the nodes hit the DOM (the
    // browser reads `loading` at insertion). Builders mark the first image
    // of every carousel/gallery "eager" so an opened tab feels instant, but
    // at boot only ONE panel is visible: the hidden panels' eager images
    // (~0.5 MB each) would compete with the visible one for bandwidth. So
    // the panel shown first keeps its eager images - its first one is the
    // likely LCP element and gets fetchpriority=high - and every other
    // panel is demoted to lazy, then warmed back up after `load` (below)
    // so tab switches still hit the HTTP cache. Hidden panels' lazy iframes
    // (map/video embeds) are collected for the same warm-up: lazy iframes in
    // a display:none panel never intersect, so they'd only start loading on
    // tab switch - the delay warmUpIframes() exists to remove.
    const hash = readTabHash();
    const initialId = sections.some((s) => s.id === hash) ? hash : sections[0].id;
    const warmupSrcs = [];
    const warmupFrames = [];
    panels.forEach((panel, i) => {
        const eager = panel.querySelectorAll('img[loading="eager"]');
        if (sections[i].id === initialId) {
            if (eager[0]) eager[0].setAttribute("fetchpriority", "high");
            return;
        }
        eager.forEach((img) => {
            img.setAttribute("loading", "lazy");
            warmupSrcs.push(img.getAttribute("src"));
        });
        panel.querySelectorAll('iframe[loading="lazy"]').forEach((f) => warmupFrames.push(f));
    });

    panels.forEach((panel) => main.appendChild(panel));

    warmUpImages(warmupSrcs);
    warmUpIframes(warmupFrames);
}

/* Prefetch the images the priority pass demoted, once the page has fully
   loaded and the browser is idle - the first open of another tab then reads
   them from the HTTP cache instead of a cold fetch. Best-effort by design:
   skipped when the user asked for reduced data (Save-Data), and a miss just
   means that tab loads its image on open, like any lazy image. */
function warmUpImages(srcs) {
    if (!srcs.length) return;
    if (navigator.connection && navigator.connection.saveData) return;
    whenLoadedAndIdle(() => srcs.forEach((src) => {
        new Image().src = src;
    }));
}

/* Same idea for hidden tabs' embeds (the Maps iframe, the YouTube player).
   A lazy iframe inside a display:none panel never intersects, so the browser
   doesn't even open a connection until the tab is switched to - the visitor
   then sits through the whole player load. Flipping `loading` to "eager"
   after load+idle starts that load in the background instead.

   The catch, and why this is more than a one-line attribute flip: a
   display:none panel gives its iframes NO BOX, so the embed initializes at
   zero size. YouTube then picks its smallest poster rendition (a 4:3 crop)
   and never upgrades it when the tab is finally shown - the thumbnail
   renders visibly cropped and pixelated. So the panel is laid out at its
   real content width for the duration of the warm-up, parked off-screen via
   the `.is-warming` class, and put back to display:none once the embeds have
   loaded. Same Save-Data respect and best-effort posture as above. */
function warmUpIframes(frames) {
    if (!frames.length) return;
    if (navigator.connection && navigator.connection.saveData) return;

    // The off-screen layout applies to the panel, not the iframe, so warm a
    // panel once no matter how many embeds it holds.
    const byPanel = new Map();
    frames.forEach((f) => {
        const panel = f.closest(".section");
        if (!panel) return;
        if (!byPanel.has(panel)) byPanel.set(panel, []);
        byPanel.get(panel).push(f);
    });
    if (!byPanel.size) return;

    whenLoadedAndIdle(() => {
        const width = contentColumnWidth();
        byPanel.forEach((list, panel) => {
            if (width > 0) panel.style.setProperty("--warm-width", `${width}px`);
            // A laid-out panel is back in the tab order and the a11y tree
            // even though it's invisible ([hidden] only removes it via
            // display:none, which .is-warming overrides) - inert keeps
            // keyboard focus and screen readers out of it, same as the
            // closed mobile drawer. show() lifts it if the tab is opened
            // mid-warm, so a revealed panel is never left dead.
            panel.inert = true;
            panel.classList.add("is-warming");

            const stop = () => {
                panel.inert = false;
                panel.classList.remove("is-warming");
                panel.style.removeProperty("--warm-width");
            };
            let pending = list.length;
            const done = () => {
                if (--pending > 0) return;
                // The frame is loaded, but the player fetches its poster
                // after that - hold the box a moment longer so it lands at
                // full size rather than at the zero-size fallback.
                setTimeout(stop, 1500);
            };

            list.forEach((f) => {
                // `error` counts as settled too (offline / blocked host) -
                // the guard keeps a frame from decrementing twice if both
                // events manage to fire.
                let settled = false;
                const settle = () => {
                    if (settled) return;
                    settled = true;
                    done();
                };
                f.addEventListener("load", settle, {once: true});
                f.addEventListener("error", settle, {once: true});
                f.setAttribute("loading", "eager");
            });
            // Safety net: never leave a panel parked off-screen (and inert)
            // because an embed never settled - including browsers without
            // lazy-iframe support, where `load` fired at boot, before these
            // listeners existed.
            setTimeout(stop, 20000);
        });
    });
}

/* The pixel width a section gets inside the content column - the warm-up has
   to state it explicitly because a position:fixed panel no longer inherits it
   from `.content`. Read from the live element rather than restating the
   `max-width`/`--gutter` math, so it can't drift from the CSS. */
function contentColumnWidth() {
    const content = $("#main");
    if (!content) return 0;
    const cs = getComputedStyle(content);
    return content.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
}

/* Shared scheduler for the two warm-up passes: run `fn` once the page has
   fully loaded AND the browser is idle, so warm-ups never compete with the
   visible tab's own resources. */
function whenLoadedAndIdle(fn) {
    const run = () => {
        const idle = window.requestIdleCallback || ((f) => setTimeout(f, 2000));
        idle(fn);
    };
    if (document.readyState === "complete") {
        run();
    } else {
        window.addEventListener("load", run, {once: true});
    }
}

/* ----------------------------------------------------------------------
   17. RENDER FOOTER (+ optional visitor count)
---------------------------------------------------------------------- */

function renderFooter() {
    const f = $("#siteFooter");
    if (!f) return;

    // JSON can't compute a value, so the year is filled in here at render time.
    const year = (SITE.footer && SITE.footer.year) || new Date().getFullYear();
    const note = (SITE.footer && SITE.footer.note) || "";

    f.innerHTML = "";

    const copyright = el("span", {}, sanitizeInline(`© ${year} ${SITE.brand || ""}`.trim()));
    f.append(copyright);

    // Optional visitor count, attached right after the © line. Driven by
    // meta.analytics.countUrl (e.g. a GoatCounter /counter/TOTAL.json
    // endpoint); absent config = no count, no request. The fetch is
    // best-effort: any failure leaves the footer untouched, never throws.
    const analytics = SITE.meta && SITE.meta.analytics;
    if (analytics && analytics.countUrl) {
        // Link to the public dashboard if one is configured, else a plain span.
        const countEl = analytics.dashboardUrl
            ? el("a", linkAttrs(analytics.dashboardUrl, {
                class: "footer__count",
                "aria-label": t("visitorStats"),
            }))
            : el("span", {class: "footer__count"});
        f.append(countEl);
        renderVisitorCount(countEl, analytics.countUrl, analytics.countLabel);
    }

    f.append(el("span", {}, safeText(note)));
}

/* Fetch the visitor count from a GoatCounter-style JSON endpoint and write it
   into `target`. Best-effort: the count.js script (loaded in index.html) does
   the actual tracking; this only displays the number. Requires "Allow adding
   visitor counts on your website" to be enabled in the GoatCounter site
   settings, otherwise the endpoint won't return a usable count. */
async function renderVisitorCount(target, url, label) {
    try {
        const res = await fetch(url, {headers: {Accept: "application/json"}});
        if (!res.ok) return;
        const data = await res.json();
        // GoatCounter returns { count: "1,234", count_unique: "..." }; count is
        // already a localized string. Fall back across field names defensively.
        const count = data.count_unique || data.count;
        if (count == null || count === "") return;
        target.textContent = label ? `${count} ${label}` : String(count);
    } catch (err) {
        // Network/parse failure - leave the footer count empty, never break.
        console.warn("Visitor count unavailable:", err);
    }
}

/* ----------------------------------------------------------------------
   18. RENDER THEME

   Brand-defining design tokens live in SITE.theme so one engine can produce
   differently-branded sites from config alone. This writes them as :root
   custom properties at boot (accent on <body> - see below); styles.css holds
   the defaults, so any token the
   spec omits simply keeps its CSS value. Structural CSS is NOT touched here -
   only the brand knobs (accent, fonts, sizing, social tints).
---------------------------------------------------------------------- */

function renderTheme() {
    const theme = SITE.theme;
    if (!theme || typeof theme !== "object") return;

    const setVar = (name, value, el = document.documentElement) => {
        if (value === undefined || value === null || value === "") return;
        el.style.setProperty(name, String(value));
    };

    // --accent is a per-theme token: both [data-theme] blocks on <body>
    // declare it, so a value on :root would be shadowed and do nothing. Set
    // on <body> it wins over both themes (same accent in dark and light).
    setVar("--accent", theme.accent, document.body);
    setVar("--root-scale", theme.rootScale);
    setVar("--content-width", theme.contentWidth);
    setVar("--radius", theme.radius);
    setVar("--font-sans", theme.fontSans);
    setVar("--font-serif", theme.fontHeading);
    setVar("--font-brand", theme.fontBrand);

    // Per-platform social brand tints, e.g. { instagram: "#e1306c" }.
    if (theme.socialColors && typeof theme.socialColors === "object") {
        Object.entries(theme.socialColors).forEach(([key, color]) => {
            setVar(`--brand-${key}`, color);
        });
    }
}

/* ----------------------------------------------------------------------
   19. RENDER DOCUMENT HEAD

   Single source of truth for the page's metadata: everything here is driven
   by SITE.meta. The tags also exist statically in index.html so crawlers and
   social scrapers (which don't run JS) still see them - this function keeps
   them in sync with the config and is the canonical place to change them.

   Idempotent: each tag is found-or-created by a stable selector and only its
   value is updated, so running this never duplicates tags. To change the
   title/description/OG/etc., edit SITE.meta in site-spec.json - not the HTML.
---------------------------------------------------------------------- */

/* Find-or-create a <head> tag: query by a stable selector; when absent, build
   it via `create` and append. The caller sets only the value, so this is the
   one place that owns the head renderers' idempotency contract - one tag per
   key, no duplicates on re-run (setMeta/setLink here, renderJsonLd below). */
function upsertHead(selector, create) {
    let node = document.head.querySelector(selector);
    if (!node) {
        node = create();
        document.head.appendChild(node);
    }
    return node;
}

function renderHead() {
    const meta = SITE.meta;
    if (!meta) return;

    // <html lang>
    if (meta.lang) document.documentElement.setAttribute("lang", meta.lang);

    // <title>
    if (meta.title) document.title = meta.title;

    // Set a <meta> found by attribute (e.g. name="description" or
    // property="og:title"), creating it if absent.
    const setMeta = (attr, key, valueAttr, value) => {
        if (value === undefined || value === null) return;
        upsertHead(`meta[${attr}="${key}"]`, () => el("meta", {[attr]: key}))
            .setAttribute(valueAttr, String(value));
    };

    const setLink = (rel, href) => {
        if (!href) return;
        upsertHead(`link[rel="${rel}"]`, () => el("link", {rel}))
            .setAttribute("href", href);
    };

    // Standard meta (name="...")
    setMeta("name", "description", "content", meta.description);
    setMeta("name", "author", "content", meta.author);
    setMeta("name", "theme-color", "content", meta.themeColor);
    setMeta("name", "twitter:card", "content", meta.twitterCard);

    // Open Graph (property="..."). og:description can differ from the plain
    // meta description; fall back to it when not separately specified.
    // og:site_name comes from the brand (single source of truth) - shown by
    // Discord & co. above the card title. twitter:image mirrors og:image for
    // scrapers that don't fall back between the two tag families.
    setMeta("property", "og:type", "content", meta.ogType);
    setMeta("property", "og:site_name", "content", SITE.brand);
    setMeta("property", "og:title", "content", meta.title);
    setMeta("property", "og:description", "content", meta.ogDescription || meta.description);
    setMeta("property", "og:url", "content", meta.domain);
    if (meta.ogImage) {
        // Scrapers need an absolute image URL - resolve a relative spec path
        // against the canonical domain (same rule as JSON-LD's `image`), so
        // this never downgrades the absolute URL in the static HTML fallback.
        const ogImage = absoluteUrl(meta.ogImage, meta.domain);
        setMeta("property", "og:image", "content", ogImage);
        // Width/height let scrapers render the card on first share without
        // fetching the image; only emitted when both are set in meta.
        if (meta.ogImageWidth && meta.ogImageHeight) {
            setMeta("property", "og:image:width", "content", String(meta.ogImageWidth));
            setMeta("property", "og:image:height", "content", String(meta.ogImageHeight));
        }
        setMeta("name", "twitter:image", "content", ogImage);
    }

    // Canonical
    setLink("canonical", meta.domain);
}

/* ----------------------------------------------------------------------
   20. STRUCTURED DATA (JSON-LD)

   Emits a schema.org Store description of the business as a
   <script type="application/ld+json"> tag, built entirely from data that
   already lives in the spec (SITE.business + SITE.meta + brand). The
   builder lives in business-jsonld.mjs, SHARED with the dev-only
   dev/generate-static.mjs, which stamps the same object statically into
   index.html for crawlers that don't run JS. The static copy can't drift:
   it's generated from the same code, and launch-check fails when it's
   stale. At runtime this upserts the very tag the generator wrote (same
   data-jsonld marker), so browsers always end with the fresh value.
---------------------------------------------------------------------- */

/* The JSON-LD script tag, found by its data-jsonld marker - idempotent via
   upsertHead like every other head renderer. */
function renderJsonLd() {
    const data = buildBusinessJsonLd(SITE);
    if (!data) return;

    const node = upsertHead(
        'script[type="application/ld+json"][data-jsonld="business"]',
        () => el("script", {type: "application/ld+json", "data-jsonld": "business"})
    );
    node.textContent = JSON.stringify(data);
}

/* ----------------------------------------------------------------------
   21. INPUT MODE
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

    on(window, "keydown", enableKeyboardMode, true);
    on(window, "pointerdown", disableKeyboardMode, true);
    on(window, "mousedown", disableKeyboardMode, true);
    on(window, "touchstart", disableKeyboardMode, true);
}

/* ----------------------------------------------------------------------
   22. THEME (light / dark + localStorage)
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
        const bg = getComputedStyle(document.body).getPropertyValue("--bg-base").trim();
        if (bg) meta.setAttribute("content", bg);
    }
}

function initTheme() {
    const toggle = $("#themeToggle");
    if (!toggle) return;

    const stored = getStoredTheme();
    const theme = stored || "dark";

    applyTheme(theme);

    on(toggle, "click", () => {
        const next = document.body.getAttribute("data-theme") === "light" ? "dark" : "light";

        // Flip the whole page in ONE frame. Components have their own
        // color/border transitions (for hover feedback); left running, a theme
        // change would ripple through them at different speeds. So transitions
        // are switched off (html.theme-switching in styles.css) while the
        // theme changes, the new styles are flushed with them still off, and
        // only then are transitions allowed again.
        const html = document.documentElement;
        html.classList.add("theme-switching");
        applyTheme(next);
        // Reading a layout property flushes the new styles NOW, with
        // transitions still off - so every value is already at its end state
        // and removing the class afterwards has nothing left to animate.
        void html.offsetWidth;
        html.classList.remove("theme-switching");

        try {
            localStorage.setItem(THEME_KEY, next);
        } catch {
            // storage unavailable - fail silently
        }
    });
}

/* ----------------------------------------------------------------------
   23. LANGUAGE (runtime switch + localStorage)
---------------------------------------------------------------------- */

// Push the active locale's chrome strings onto the static shell elements that
// index.html ships in English (they render before the engine runs). Called on
// boot; aria-labels/text are swapped in place. Safe to call on the error path.
function applyChromeStrings() {
    document.documentElement.lang = (SITE.meta && SITE.meta.lang) || LOCALE;

    const set = (sel, attr, val) => {
        const node = $(sel);
        if (node) attr === "text" ? (node.textContent = val) : node.setAttribute(attr, val);
    };

    set(".skip-link", "text", t("skip"));
    set("#themeToggle", "aria-label", t("themeToggle"));
    set("#navDesktop", "aria-label", t("primaryNav"));
    set("#navMobile", "aria-label", t("mobileNav"));
    set("#brand", "aria-label", t("home"));

    // Only relabel the menu toggle if the drawer is closed - initMobileMenu()
    // owns the open/closed aria-label swap while it's active.
    const menu = $("#menuToggle");
    if (menu && menu.getAttribute("aria-expanded") !== "true") {
        menu.setAttribute("aria-label", t("openMenu"));
    }
}

/* Swap the active language without reloading the page: undo the previous
   render (teardownSite) and re-render from the new locale's spec in place. The
   background, the header chrome, the theme, the current tab and the scroll
   position all stay put.

   Instant - there is no fade. The other locales' specs are prefetched at idle
   (initLang), so the swap normally never touches the network, and with the
   spec in hand the only awaits between teardownSite() and the end of
   renderSite() are on settled promises (microtasks), so the browser never
   paints the torn-down state. DO NOT add a setTimeout / requestAnimationFrame
   wait inside that path: an empty #main would become visible. On a cold cache
   the old copy simply stays up until the spec lands. Background: docs/i18n.md.

   Sequential by design: a second pick mid-swap is ignored. */
let localeSwapping = false;

async function switchLocale(target) {
    if (localeSwapping || !target || target === LOCALE || !LOCALE_SPECS[target]) return;
    localeSwapping = true;

    // Persist first, so a later reload agrees with what the page is about to
    // show. A storage failure only means the choice won't outlive the tab.
    try {
        localStorage.setItem(LANG_KEY, target);
    } catch {
        // storage unavailable - session-only switch
    }

    // Transient UI that must not outlive the swap: an expanded image, and the
    // mobile drawer, whose contents renderNav is about to replace. Clicking the
    // toggle runs the drawer's real close(), so focus and the scrim stay in step.
    closeLightbox();
    const drawer = $("#navMobile");
    const menuToggle = $("#menuToggle");
    if (drawer && menuToggle && drawer.classList.contains("is-open")) menuToggle.click();

    // The dropdown the pick came from is about to be replaced; note whether it
    // held focus so we can hand focus to its replacement instead of dropping it
    // on <body>.
    const langHadFocus = !!(document.activeElement
        && document.activeElement.closest
        && document.activeElement.closest("#langSwitcher"));

    const scrollY = window.scrollY;

    try {
        // Point the engine at the new locale and get its spec - normally a
        // cache hit. The old render stays live while a cold one loads; the
        // only side effect is a chrome string resolving in the incoming
        // language a moment early.
        LOCALE = target;
        const loaded = await loadContent();

        teardownSite();
        await renderSite(loaded);

        // initTabs' first show() lands the new render at the top; put the
        // reader back where they were - this is a text swap, not navigation.
        // Same frame as the render, so the jump is never painted.
        scrollInstantTo(scrollY);

        if (langHadFocus) {
            const summary = $("#langSwitcher summary");
            if (summary) summary.focus({preventScroll: true});
        }
    } catch (err) {
        // A render that throws half-way would otherwise leave a torn-down,
        // half-built page with dead controls. Fall back to the same calm error
        // screen a broken spec gets - the page must never blank or stay stuck.
        console.error("Language switch failed:", err);
        try {
            teardownSite();
            renderErrorState({kind: "render", detail: `Language switch failed: ${err && err.message}`});
            initInputMode();
            initTheme();
            initLang();
        } catch (fallbackErr) {
            console.error("Error screen failed too:", fallbackErr);
        }
    } finally {
        // Always release the lock, or one failed swap would disable the
        // switcher for the rest of the session.
        localeSwapping = false;
    }
}

// Wire the header language switcher: a dropdown listing every locale, revealed
// only when there's more than one. Picking one hands off to switchLocale().
// Idempotent-safe: no-op if the container or a second locale is absent.
function initLang() {
    applyChromeStrings();

    const container = $("#langSwitcher");
    if (!container) return;

    // A re-render (locale swap) must not leave the previous dropdown behind.
    container.innerHTML = "";

    // The switcher ships hidden. A single-locale site has nothing to switch
    // to, so leave it hidden and bail - no switcher at all.
    const locales = Object.keys(LOCALE_SPECS);
    if (locales.length < 2) return;

    // A custom <details> disclosure (not a native <select>): the summary keeps
    // the frosted-button look, and the option list is a fully site-styled
    // panel. Each option shows the ISO 639-1 code (EN, SK); the full language
    // name (endonym) rides along as the accessible label + tooltip.
    const labelText = t("langToggle");
    const caret =
        '<svg class="lang-dd__caret" viewBox="0 0 12 8" fill="none" stroke="currentColor" ' +
        'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M1 1.5 6 6.5l5-5"/></svg>';

    const optionsHtml = locales.map((loc) => {
        const name = LOCALE_NAMES[loc] || loc.toUpperCase();
        const active = loc === LOCALE;
        return (
            `<li><button type="button" class="lang-dd__option${active ? " is-active" : ""}" ` +
            `data-locale="${escapeHtml(loc)}" aria-label="${escapeHtml(name)}" ` +
            `title="${escapeHtml(name)}"${active ? ' aria-current="true"' : ""}>` +
            `${escapeHtml(loc.toUpperCase())}</button></li>`
        );
    }).join("");

    const details = el("details", {class: "lang-dd"});
    details.innerHTML =
        `<summary class="lang-dd__current" aria-label="${escapeHtml(labelText)}" title="${escapeHtml(labelText)}">` +
        `<span class="lang-dd__code">${escapeHtml(LOCALE.toUpperCase())}</span>${caret}</summary>` +
        `<ul class="lang-dd__list">${optionsHtml}</ul>`;

    // Prefetch the other locales' specs so the swap never waits on the
    // network - this is what makes it instant. Primarily at load + idle: the
    // specs are a few KB, and a touch user can open the dropdown and tap an
    // option faster than a round-trip, so waiting for intent alone would leave
    // the first swap cold. Hover / `toggle` stay as a backstop for a click that
    // beats the idle callback. Cheap and idempotent - SPEC_CACHE collapses
    // repeats (including a re-render's call) into one request.
    const warmOthers = () => {
        Object.keys(LOCALE_SPECS).forEach((loc) => {
            if (loc !== LOCALE) warmLocale(loc);
        });
    };

    whenLoadedAndIdle(warmOthers);

    const summary = details.querySelector("summary");
    if (summary) summary.addEventListener("pointerenter", warmOthers);
    details.addEventListener("toggle", () => {
        if (details.open) warmOthers();
    });

    // Choosing a locale re-renders the site in place; choosing the current one
    // just closes the menu. Close first either way, so the dropdown isn't left
    // hanging open over the swap.
    details.querySelectorAll(".lang-dd__option").forEach((btn) => {
        btn.addEventListener("click", () => {
            details.open = false;
            switchLocale(btn.dataset.locale);
        });
    });

    // Close on Escape (return focus to the summary) and on any outside click.
    details.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && details.open) {
            details.open = false;
            const s = details.querySelector("summary");
            if (s) s.focus();
        }
    });
    // Document-level, so it outlives the dropdown it belongs to - must be
    // registered for teardown or every swap would add another copy.
    on(document, "click", (e) => {
        if (details.open && !details.contains(e.target)) details.open = false;
    });

    container.appendChild(details);
    container.hidden = false; // reveal now that we know there's a second locale
}

/* ----------------------------------------------------------------------
   24. MOBILE MENU
---------------------------------------------------------------------- */

function initMobileMenu() {
    const toggle = $("#menuToggle");
    const nav = $("#navMobile");
    const scrim = $("#navScrim");

    if (!toggle || !nav || !scrim) return;

    // Close button inside the drawer (frosted drawer needs an explicit X).
    let closeBtn = nav.querySelector(".nav-mobile__close");
    if (!closeBtn) {
        closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "nav-mobile__close";
        closeBtn.setAttribute("aria-label", t("closeMenu"));
        closeBtn.innerHTML = "&times;";
        nav.prepend(closeBtn);
    }

    let closeTimer = null;

    const open = () => {
        if (closeTimer) clearTimeout(closeTimer);

        nav.classList.add("is-open");
        nav.setAttribute("aria-hidden", "false");
        nav.inert = false;
        toggle.setAttribute("aria-expanded", "true");
        toggle.setAttribute("aria-label", t("closeMenu"));
        document.body.classList.add("menu-open");

        scrim.hidden = false;
        requestAnimationFrame(() => scrim.classList.add("is-visible"));
    };

    const close = () => {
        // Focus must leave the drawer before it goes inert, or it falls to <body>.
        if (nav.contains(document.activeElement)) toggle.focus();
        nav.classList.remove("is-open");
        nav.setAttribute("aria-hidden", "true");
        nav.inert = true;
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", t("openMenu"));
        document.body.classList.remove("menu-open");

        scrim.classList.remove("is-visible");
        closeTimer = setTimeout(() => {
            scrim.hidden = true;
        }, 220);
    };

    // All of these hang off shell elements that outlive a render (the drawer and
    // scrim are in index.html; the close button is re-injected above), so they
    // go through on() - see the teardown registry.
    on(toggle, "click", () => (nav.classList.contains("is-open") ? close() : open()));
    on(scrim, "click", close);
    on(closeBtn, "click", close);
    // Close on link tap.
    on(nav, "click", (e) => {
        if (e.target.closest("a")) close();
    });

    // Close on Escape.
    on(document, "keydown", (e) => {
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

    on(mq, "change", onDesktop);

    // close() hides the scrim on a 220ms delay (it fades first). If a render
    // lands inside that window - closing the drawer is the first thing a locale
    // swap does - the timer must not simply be dropped: the scrim is
    // position:fixed inset:0 and only stops covering the page once `hidden` is
    // set, so cancelling without finishing the job leaves an invisible sheet
    // swallowing every click on the new render.
    onTeardown(() => {
        if (!closeTimer) return;
        clearTimeout(closeTimer);
        scrim.hidden = true;
    });
}

/* ----------------------------------------------------------------------
   25. TABS

   Each section is a tab panel; only one is shown at a time. The URL hash
   drives the active tab, so direct links and browser navigation work. The
   tab/panel id list comes from the sections array.
---------------------------------------------------------------------- */

function initTabs() {
    if ("scrollRestoration" in history) {
        history.scrollRestoration = "manual";
    }

    const nav = navItems();
    const links = Array.from(document.querySelectorAll("[data-nav]"));
    const desktopTabs = Array.from(document.querySelectorAll("#navDesktop [role='tab']"));
    const panels = nav.map((n) => document.getElementById(panelId(n.id))).filter(Boolean);
    const ids = nav.map((n) => n.id);
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

    const show = (rawId, {focusPanel = false, push = true, scrollTop = true} = {}) => {
        const id = normalize(rawId);

        // The panel under the lightbox is about to change; the overlay must not
        // outlive it. Done before the swap so its focus restore still lands on
        // a visible element.
        closeLightbox();

        panels.forEach((p) => {
            const active = p.id === panelId(id);
            p.hidden = !active;
            // A panel may still be inert from the embed warm-up
            // (warmUpIframes) - the shown panel must never stay that way.
            if (active) p.inert = false;
        });

        links.forEach((link) => setActiveLink(link, id));

        if (push && readTabHash() !== id) {
            history.pushState(null, "", tabHash(id));
        }

        if (scrollTop) {
            scrollToTopInstant();
        }

        if (focusPanel) {
            const panel = document.getElementById(panelId(id));
            if (panel) panel.focus({preventScroll: true});
        }
    };

    // Click / tap. The links themselves are rebuilt by every renderNav(), so
    // their listeners are collected with them - no teardown needed here.
    links.forEach((link) => {
        // Mouse: switch on press, not release - saves the ~100ms a click spends
        // held down, which is most of what makes a tab switch feel slow. Mouse
        // only: on touch, pointerdown also starts every scroll of the drawer.
        // Modifier clicks are left alone. The click that follows calls show()
        // again for the same id, which is a no-op swap (no history push, the
        // page is already at the top).
        link.addEventListener("pointerdown", (e) => {
            if (e.pointerType !== "mouse" || e.button !== 0) return;
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            show(link.getAttribute("data-nav"));
        });

        link.addEventListener("click", (e) => {
            e.preventDefault();
            show(link.getAttribute("data-nav"));

            if (e.detail !== 0) link.blur();
        });
    });

    // Keyboard arrows on the desktop tablist only.
    const desktop = $("#navDesktop");
    if (desktop) {
        on(desktop, "keydown", (e) => {
            rovingKeydown(
                e,
                desktopTabs.length,
                () => desktopTabs.findIndex((tab) => tab === document.activeElement),
                (next) => {
                    const tab = desktopTabs[next];
                    tab.focus();
                    show(tab.getAttribute("data-nav"));
                }
            );
        });
    }

    // Brand click → home tab.
    const brand = $("#brand");
    if (brand) {
        on(brand, "click", (e) => {
            e.preventDefault();
            show(defaultId);
        });
    }

    // Routing is hash-only, so hashchange alone covers typed URLs AND the
    // back/forward buttons (a popstate listener here would just double-fire
    // the same show() on every history step).
    on(window, "hashchange", () => {
        show(readTabHash() || defaultId, {push: false});
    });

    // Initial render: read #/kontakt or legacy #kontakt, but do not let browser anchor-scroll.
    show(readTabHash() || defaultId, {push: false, scrollTop: true});
}

/* ----------------------------------------------------------------------
   26. HEADER FIT
---------------------------------------------------------------------- */

function initHeaderFit() {
    const header = $(".site-header");
    const brandWrap = $(".brand-wrap");
    const nav = $("#navDesktop");

    if (!header || !brandWrap || !nav) return;

    const BUFFER = 24;

    const apply = () => {
        header.classList.remove("force-mobile-nav");

        if (window.innerWidth <= 640) return;

        const socials = brandWrap.querySelectorAll(".socials__link");
        const leftEdgeEl = socials.length
            ? socials[socials.length - 1]
            : brandWrap.lastElementChild;
        const firstTab = nav.querySelector("a");

        if (!leftEdgeEl || !firstTab) return;

        const leftRight = leftEdgeEl.getBoundingClientRect().right;
        const tabLeft = firstTab.getBoundingClientRect().left;

        const gap = tabLeft - leftRight;

        if (gap < BUFFER) {
            header.classList.add("force-mobile-nav");
        } else {
            // Back in desktop mode with the drawer still open: close it through
            // the toggle, which runs initMobileMenu's real close() - the only
            // path that also makes the drawer inert and hands focus back. Same
            // move switchLocale makes.
            const mobileNav = $("#navMobile");
            const menuToggle = $("#menuToggle");
            if (mobileNav && menuToggle && mobileNav.classList.contains("is-open")) menuToggle.click();
        }
    };

    apply();
    on(window, "resize", apply);

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(apply).catch(() => {
        });
    }
}

/* ----------------------------------------------------------------------
   27. BACKGROUND
---------------------------------------------------------------------- */

function initBackground() {
    const layers = [$("#bg"), $("#bg2")].filter(Boolean);
    const list = SITE.backgrounds;

    // The layers are page-level: a locale swap re-runs this while they are still
    // painted and mid-cycle. `stopped` lets the previous render's in-flight
    // image loads and its interval expire without touching them.
    let stopped = false;
    onTeardown(() => {
        stopped = true;
    });

    if (layers.length < 2 || !list || !list.length) {
        const bg = layers[0];
        if (bg && list && list.length) {
            const img = new Image();
            img.onload = () => {
                if (stopped) return;
                bg.style.backgroundImage = `url("${list[0]}")`;
                bg.classList.add("is-active");
            };
            img.src = list[0];
        }
        return;
    }

    const HOLD = 8000;

    let index = 0;       // which image in the list is showing
    let front = 0;       // which layer is currently on top (0 or 1)

    const show = (i, layerIndex) => {
        const layer = layers[layerIndex];
        const src = list[i];
        const img = new Image();

        img.onload = () => {
            if (stopped) return;

            layer.style.backgroundImage = `url("${src}")`;

            layer.classList.remove("is-active");
            void layer.offsetWidth;
            layer.classList.add("is-active");

            layers[1 - layerIndex].classList.remove("is-active");
        };

        img.onerror = () => {
            // Image missing - skip to the next one on the next tick.
        };

        img.src = src;
    };

    // On a re-render the background is already on screen. Adopt what it shows -
    // which layer is active, and where in the list it is - instead of starting
    // over: re-showing list[0] would either crossfade the background for no
    // reason or dip it to black re-fading the image that's already up.
    const activeLayer = layers.findIndex((l) => l.classList.contains("is-active"));

    if (activeLayer >= 0) {
        front = activeLayer;
        const shown = list.findIndex((src) => layers[front].style.backgroundImage.includes(src));
        if (shown >= 0) index = shown;
    } else {
        show(index, front);
    }

    if (list.length < 2) return;

    const timer = setInterval(() => {
        index = (index + 1) % list.length;   // next image, in order
        front = 1 - front;                    // swap to the other layer
        show(index, front);
    }, HOLD);

    onTeardown(() => clearInterval(timer));
}

/* ----------------------------------------------------------------------
   28. CONTENT LOADING (spec fetch + session cache)
---------------------------------------------------------------------- */

/* Parsed specs, keyed by URL, for the life of the page.

   Worth it because the swap's one unavoidable cost is the network: the specs
   are a few KB, so fetching one is all latency and no transfer - and `_headers`
   serves them `max-age=0, must-revalidate`, so even a warm HTTP cache still
   pays a round-trip to be told "not modified". Cached here, switching back to a
   locale you've already seen costs nothing, and `warmLocale()` can move the
   first switch's round-trip off the critical path too.

   Two rules: only SUCCESSFUL loads stay cached (a transient failure must not
   stick for the whole session), and the in-flight promise is cached as well, so
   a prefetch and the swap that follows it share one request instead of racing.

   Session-scoped on purpose - a reload still revalidates, so a content push
   shows up as fast as the headers promise. */
const SPEC_CACHE = new Map();

function loadContent(url = currentSpecUrl()) {
    const cached = SPEC_CACHE.get(url);
    if (cached) return cached;

    const pending = fetchSpec(url).then((result) => {
        if (result.error) SPEC_CACHE.delete(url);
        return result;
    });

    SPEC_CACHE.set(url, pending);
    return pending;
}

// Kick off (and cache) a locale's spec before it's needed. Fire-and-forget: a
// failure just leaves the cache empty and the real swap retries it.
function warmLocale(locale) {
    const url = LOCALE_SPECS[locale];
    if (url) loadContent(url);
}

/* Fetch + parse one spec file (the raw request behind loadContent). JSON is the single source of truth - there is no
   inline fallback to merge onto, so this just loads + parses + returns it.

   Returns { data, error }:
     - data:  the parsed JSON on success, otherwise null.
     - error: null on success, otherwise { kind, detail } describing why the
              load failed. init() turns a null/empty result into the error
              screen.

   Failure shapes:
     - "fetch" - couldn't load it at all (404 / network / file:// CORS).
     - "parse" - loaded, but the body wasn't valid JSON. */
async function fetchSpec(url) {
    let res;
    try {
        res = await fetch(url, {headers: {Accept: "application/json"}});
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());
    } catch (err) {
        console.error("Content fetch failed:", err);
        return {data: null, error: {kind: "fetch", detail: `Could not load ${url}: ${err.message}`}};
    }

    try {
        const data = await res.json();
        return {data, error: null};
    } catch (err) {
        console.error("Content parse failed:", err);
        return {data: null, error: {kind: "parse", detail: `${url} is not valid JSON: ${err.message}`}};
    }
}

/* ----------------------------------------------------------------------
   29. ERROR SCREEN
---------------------------------------------------------------------- */

/* The visible screen shown when there is nothing to render: the JSON failed
   to load/parse, or loaded but had no usable sections. Plain DOM, themed via
   the same CSS vars, no deps. Gives the visitor a calm "temporarily
   unavailable" message + a contact escape hatch, and tucks the technical
   reason into a <details> for whoever maintains the site.

   It lays down a minimal brand + footer so the chrome isn't half-built, and
   skips the nav/tabs/background wiring that assume real sections exist.

   Note: when the JSON failed to load, SITE is empty, so the brand and the
   contact escape hatch below simply render nothing - that's fine. If the JSON
   loaded but was merely missing sections, brand/socials may still show. */
function renderErrorState(reason) {
    const main = $("#main");

    // Minimal header brand (empty if the JSON never loaded).
    const brand = $("#brand");
    if (brand) brand.textContent = SITE.brand || "";

    // Empty at boot, but a locale swap onto a broken spec lands here with the
    // previous render's tabs still in the header - and their handlers already
    // torn down. Clear them so nothing dead is left clickable.
    [$("#navDesktop"), $("#navMobile")].forEach((nav) => {
        if (nav) nav.innerHTML = "";
    });

    if (main) {
        main.innerHTML = "";

        const wrap = el("div", {class: "block"});
        const box = el("div", {class: "error-state", role: "alert"});

        box.appendChild(el("h1", {class: "error-state__title"}, t("errorTitle")));
        box.appendChild(el(
            "p",
            {class: "error-state__lead"},
            t("errorLead")
        ));

        // Contact escape hatch from socials, if any survived (none if the JSON
        // failed to load) - so the visitor isn't fully stuck.
        const socials = (SITE.socials || []).filter((s) => s && s.url);
        if (socials.length) {
            box.appendChild(buildSocials(socials));
        }

        // Technical detail for the maintainer, collapsed by default.
        if (reason && reason.detail) {
            const details = el("details", {class: "error-state__details"});
            details.appendChild(el("summary", {}, t("errorDetails")));
            details.appendChild(el("p", {}, escapeHtml(reason.detail)));
            box.appendChild(details);
        }

        wrap.appendChild(box);
        main.appendChild(wrap);
    }

    // A footer is harmless and keeps the page feeling whole.
    renderFooter();
}

/*
 * Built from m-remis/static-web-template
 * https://github.com/m-remis/static-web-template
 */

/* ----------------------------------------------------------------------
   30. BOOT (renderSite, init)
---------------------------------------------------------------------- */

/* Render the whole site from the active locale's spec, and wire the UI to it.
   Called on boot by init() and again by switchLocale() for a language change,
   so it must be safe to run more than once: the render* functions each clear
   what they own, and everything wired here onto a long-lived target goes
   through on() / onTeardown() (see the teardown registry).

   `loaded` is an already-resolved loadContent() result; switchLocale passes one
   so teardown and render run back to back, with no fetch (and so no painted
   empty frame) between them. */
async function renderSite(loaded) {
    const {data, error} = loaded || await loadContent();
    SITE = data || {};

    // Drive the document head (title, meta, OG, canonical) from SITE.meta.
    // Done first so the metadata is correct even if we fall through to the
    // error screen below.
    renderHead();
    renderJsonLd();

    // Apply brand design tokens from SITE.theme (before content paints, and
    // before the error screen, so both are correctly branded).
    renderTheme();

    // JSON is the single source of truth: render it, or show the error
    // screen. Three ways we end up with nothing to render:
    //   - "fetch": couldn't load the file (404 / network / file:// CORS),
    //   - "parse": loaded but wasn't valid JSON,
    //   - "empty": loaded + parsed fine, but had no usable `sections`.
    const hasContent = getSections().length > 0;

    if (!hasContent) {
        const reason = error || {
            kind: "empty",
            detail: `${currentSpecUrl()} loaded but contained no usable "sections".`,
        };
        console.error("No renderable content - showing error screen:", reason.detail);

        renderErrorState(reason);
        initInputMode();
        initTheme();
        initLang();
        return;
    }

    renderNav();
    renderContent();
    renderFooter();
    initInputMode();
    initTheme();
    initLang();
    initMobileMenu();
    initHeaderFit();
    initTabs();
    initBackground();
}

async function init() {
    // Reveal the page exactly once, no matter which path the render takes
    // (normal render OR the error screen). The shell starts hidden via
    // html.site-booting (set inline in index.html before first paint) to avoid a
    // flash of the empty layout; we swap to site-ready here so the finished page
    // fades in. Must run on every exit, or the page would stay invisible -
    // hence finally.
    const reveal = () => {
        const html = document.documentElement;
        html.classList.remove("site-booting");
        html.classList.add("site-ready");
    };

    // Resolve the active language before anything fetches or renders, so the
    // right spec is loaded and every t() call reads the correct locale.
    LOCALE = resolveLocale();

    try {
        await renderSite();
    } finally {
        reveal();
    }

    // Dev-only: `?tweak` in the URL loads the live design-token panel
    // (dev/tweaker.js, see docs/theming.md). Never fetched without the flag.
    if (new URLSearchParams(location.search).has("tweak")) {
        import("./dev/tweaker.js").catch((err) => console.warn("dev/tweaker.js failed to load:", err));
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}