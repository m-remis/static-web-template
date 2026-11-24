/* Built from m-remis/static-web-template */
/*
  tweaker.js - DEV-ONLY live design-token tweaker.

  Loaded only when the page URL carries `?tweak` (see init() in engine.js), so
  normal visitors never fetch it. It reads the design tokens straight out of
  styles.css (the `:root`, shared `[data-theme]`, `[data-theme="dark"]` and
  `[data-theme="light"]` blocks), builds a floating panel of controls for
  them, and applies edits live through one injected
  <style id="tweaker-overrides"> sheet.

  - Sections are tabs (Colors, Layout, Type, Tabs, Motion, All, Changed).
    Colors are one line each: a ☾ and a ☀ swatch, click one for a popover
    (picker, hex, opacity, "same as" another token, reset).
  - Tweaks persist in localStorage but only show in `?tweak` mode. Nothing
    reaches the real site until you either "Save to styles.css" (writes the
    file through the File System Access API - Chrome / Edge - then reloads)
    or "Copy CSS" and paste. Workflow D in docs/workflows.md still applies.
  - Undo / redo (Ctrl+Z / Ctrl+Shift+Z), hold ⇆ to see the original, ` (back
    tick) hides the panel. Presets save / load / import / export.
  - Hover a row to outline where its token is used; hold Alt and hover the
    page to highlight the rows for an element; Alt+click pins them.

  No dependencies, no build step. The panel lives in a Shadow DOM so the
  site's CSS and the panel's CSS can't affect each other.
*/

const STATE_KEY = "tweaker:state";
const PRESETS_KEY = "tweaker:presets";
const UI_KEY = "tweaker:ui";

const SCOPES = ["root", "dark", "light"];
const THEMES = ["dark", "light"];
const SCOPE_SELECTOR = {
    root: ":root",
    dark: '[data-theme="dark"]',
    light: '[data-theme="light"]',
};

// Shared tokens that read a per-theme token are declared on `[data-theme]`
// (body) instead of :root - see the shared block in styles.css. Both count as
// the "root" (shared) scope here.
const SHARED_SELECTORS = [":root", "[data-theme]"];

// Overrides for shared tokens are written on BOTH, so a value like
// `var(--accent)` resolves on body, where the per-theme tokens exist.
const OVERRIDE_SELECTOR = {
    root: ":root, [data-theme]",
    dark: SCOPE_SELECTOR.dark,
    light: SCOPE_SELECTOR.light,
};

// Panel tabs, in order. "All" shows every section; a "Changed" tab is added
// while anything is changed.
const TABS = ["Colors", "Layout", "Type", "Tabs", "Motion", "All"];

// Sections: [name, tab, test]. A token goes to the FIRST section whose test
// matches; sections show in TABS order, then in this order.
const GROUPS = [
    ["Tab indicator", "Tabs", (t) => /^--tab-(indicator|active)/.test(t.name)],
    ["Header tabs", "Tabs", (t) => /^--tab-/.test(t.name)],
    ["Background motion", "Motion", (t) => /^--bg-(motion|fade)/.test(t.name)],
    ["Hover & transitions", "Motion", (t) => /^--(transition|duration|ease)/.test(t.name)],
    ["Surfaces", "Colors", (t) => t.themed && /^--(bg|overlay|header)/.test(t.name)],
    ["Text & menu", "Colors", (t) => t.themed && /^--(text|menu)/.test(t.name)],
    ["Accent & lines", "Colors", (t) => t.themed],
    ["Brand icons", "Colors", (t) => /^--brand-/.test(t.name)],
    ["Over photos", "Colors", (t) => /^--(on-image|dot|carousel)/.test(t.name)],
    ["Size & spacing", "Layout", (t) => /^--(root-scale|content-|block-gap|gutter)/.test(t.name)],
    ["Shape", "Layout", (t) => /^--(radius|panel-blur|focus)/.test(t.name)],
    ["Fonts", "Type", (t) => /^--font-/.test(t.name)],
    ["Other", "Type", () => true],
];

// Slider ranges [min, max, step] for tokens where the automatic range is poor.
const RANGES = {
    "--root-scale": [75, 150, 0.25],
    "--content-width": [30, 90, 0.5],
    "--block-gap": [0, 5, 0.05],
    "--radius": [0, 32, 1],
    "--radius-sm": [0, 24, 1],
    "--panel-blur": [0, 32, 1],
    "--focus-offset": [0, 10, 1],
    "--bg-motion-duration": [2, 60, 0.5],
    "--bg-fade": [0, 4000, 50],
    "--tab-radius": [0, 32, 1],
    "--tab-border-width": [0, 4, 0.5],
    "--tab-indicator-height": [0, 8, 0.5],
    "--tab-indicator-radius": [0, 8, 0.5],
};

// Every tab-indicator preset sets all of these, so switching presets never
// leaves a value behind from the previous one. The indicator color is left
// out on purpose: a color you picked survives a shape change.
const INDICATOR_BASE = {
    "--tab-indicator-width": "calc(100% - 1.7rem)",
    "--tab-indicator-height": "2px",
    "--tab-indicator-radius": "2px",
    "--tab-indicator-top": "auto",
    "--tab-indicator-bottom": "0.15rem",
    "--tab-active-bg": "transparent",
};
const indicator = (values) => ({...INDICATOR_BASE, ...values});

// One-click presets shown at the top of a group. Values equal to styles.css
// simply clear the override, so the first entry doubles as "back to default".
// Only shared (:root) tokens belong here.
const GROUP_PRESETS = {
    "Background motion": [
        ["Ken Burns drift", {"--bg-motion": "bg-drift", "--bg-motion-duration": "15s", "--bg-motion-easing": "ease-in-out", "--bg-motion-direction": "alternate"}],
        ["Slow zoom", {"--bg-motion": "bg-zoom", "--bg-motion-duration": "24s", "--bg-motion-easing": "ease-in-out", "--bg-motion-direction": "alternate"}],
        ["Pan", {"--bg-motion": "bg-pan", "--bg-motion-duration": "30s", "--bg-motion-easing": "ease-in-out", "--bg-motion-direction": "alternate"}],
        ["Breathe", {"--bg-motion": "bg-breathe", "--bg-motion-duration": "8s", "--bg-motion-easing": "ease-in-out", "--bg-motion-direction": "alternate"}],
        ["Float", {"--bg-motion": "bg-float", "--bg-motion-duration": "18s", "--bg-motion-easing": "ease-in-out", "--bg-motion-direction": "alternate"}],
        ["Still", {"--bg-motion": "none"}],
    ],
    "Tab indicator": [
        ["Underline", indicator({})],
        ["Full-width underline", indicator({"--tab-indicator-width": "100%", "--tab-indicator-bottom": "0px"})],
        ["Short bar", indicator({"--tab-indicator-width": "1.25rem", "--tab-indicator-height": "3px"})],
        ["Overline", indicator({"--tab-indicator-top": "0.15rem", "--tab-indicator-bottom": "auto"})],
        ["Dot", indicator({"--tab-indicator-width": "5px", "--tab-indicator-height": "5px", "--tab-indicator-radius": "50%", "--tab-indicator-bottom": "0.1rem"})],
        ["Filled pill", indicator({"--tab-indicator-height": "0px", "--tab-active-bg": "var(--accent-soft)"})],
        ["Pill + underline", indicator({"--tab-active-bg": "var(--accent-soft)"})],
        ["None", indicator({"--tab-indicator-height": "0px"})],
    ],
    "Header tabs": [
        ["As is (no border)", {"--tab-border-width": "0px", "--tab-radius": "var(--radius-sm)"}],
        ["Outlined", {"--tab-border-width": "1px", "--tab-radius": "var(--radius-sm)"}],
        ["Outlined pill", {"--tab-border-width": "1px", "--tab-radius": "999px"}],
        ["Outlined square", {"--tab-border-width": "1px", "--tab-radius": "0px"}],
    ],
};

// Plain-language row labels. A token missing here gets a label made from its
// name (see labelFor), so new tokens still read fine without an entry.
const LABELS = {
    "--bg-base": "Page background",
    "--bg-panel": "Card background",
    "--bg-panel-solid": "Drawer & button background",
    "--text": "Main text",
    "--text-soft": "Secondary text",
    "--text-faint": "Footer & caption text",
    "--menu-text": "Menu link",
    "--menu-text-active": "Menu link, active / hover",
    "--menu-hover-bg": "Menu hover highlight",
    "--accent": "Accent color",
    "--accent-soft": "Soft accent (tints)",
    "--border": "Lines & borders",
    "--overlay-top": "Photo overlay, top",
    "--overlay-bottom": "Photo overlay, bottom",
    "--header-bg": "Header background",
    "--mono-icon-filter": "Black icon recolor",
    "--root-scale": "Overall size",
    "--content-width": "Content column width",
    "--block-gap": "Space between blocks",
    "--gutter": "Page side margin",
    "--radius": "Corner roundness",
    "--radius-sm": "Small corner roundness",
    "--panel-blur": "Glass blur",
    "--focus-ring": "Keyboard focus ring",
    "--focus-offset": "Focus ring gap",
    "--transition": "Hover animation",
    "--font-sans": "Body font",
    "--font-serif": "Heading font",
    "--font-brand": "Brand fallback font",
    "--bg-motion": "Animation style",
    "--bg-motion-duration": "Animation length",
    "--bg-motion-easing": "Animation easing",
    "--bg-motion-direction": "Animation direction",
    "--bg-fade": "Photo crossfade",
    "--tab-radius": "Tab corner roundness",
    "--tab-border-width": "Tab border width",
    "--tab-border-color": "Tab border color",
    "--tab-indicator-width": "Indicator width",
    "--tab-indicator-height": "Indicator thickness",
    "--tab-indicator-radius": "Indicator roundness",
    "--tab-indicator-top": "Indicator distance from top",
    "--tab-indicator-bottom": "Indicator distance from bottom",
    "--tab-indicator-color": "Indicator color",
    "--tab-active-bg": "Active tab fill",
    "--tab-hover-bg": "Tab hover background",
    "--tab-hover-text": "Tab hover text",
    "--on-image-text": "Text over photos",
    "--on-image-btn-bg": "Photo button",
    "--on-image-btn-bg-hover": "Photo button, hover",
    "--on-image-hairline": "Lines over photos",
    "--on-image-veil": "Lightbox backdrop",
    "--dot-veil-bg": "Slideshow dots backing",
    "--dot-ring": "Slideshow dot ring",
    "--dot-fill-hover": "Slideshow dot, hover",
    "--carousel-chip-text": "Slideshow counter text",
    "--unicode-arrow": "Arrow character",
};

const humanize = (name) => {
    const s = name.replace(/^--/, "").replace(/-/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
};

function labelFor(name) {
    if (LABELS[name]) return LABELS[name];
    const brand = name.match(/^--brand-(.+)$/);
    if (brand) return `${humanize(`--${brand[1]}`)} icon`;
    return humanize(name);
}

// Max outlines drawn when hovering a panel row.
const MAX_OUTLINES = 80;

// Tokens edited with a dropdown. "--bg-motion" is filled in at boot from the
// bg-* @keyframes found in the stylesheets.
const ENUMS = {
    "--bg-motion-direction": ["normal", "reverse", "alternate", "alternate-reverse"],
};

const EASINGS = [
    "ease",
    "ease-in",
    "ease-out",
    "ease-in-out",
    "linear",
    "cubic-bezier(0.4, 0, 0.2, 1)",
    "cubic-bezier(0.2, 0, 0, 1)",
    "cubic-bezier(0.34, 1.56, 0.64, 1)",
];

const FONT_STACKS = [
    '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    '"Oswald", "Arial Narrow", system-ui, sans-serif',
    'Georgia, "Times New Roman", serif',
    'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    '"Helvetica Neue", Arial, sans-serif',
    "ui-serif, Georgia, serif",
    "ui-monospace, SFMono-Regular, Menlo, monospace",
];

const VAR_RE = /var\(\s*(--[\w-]+)/g;
const NUM_RE = /^(-?\d*\.?\d+)(px|rem|em|%|vw|vh|ms|s)?$/;
const MOTION_RE = /^(\d*\.?\d+)(ms|s)\s+(.+)$/;
const LINK_RE = /^var\(\s*(--[\w-]+)\s*\)$/;
const UNSAFE_RE = /[;{}<]/;

/* ---- small helpers ---------------------------------------------------- */

const store = {
    get(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // storage unavailable - tweaks just won't survive a reload
        }
    },
};

function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids.flat()) {
        if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
    }
    return el;
}

const fmtNum = (n) => String(Math.round(n * 10000) / 10000);
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), Math.max(lo, hi));
const squash = (v) => String(v).replace(/\s+/g, " ").trim().toLowerCase();

function describe(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = [...el.classList].slice(0, 2);
    if (cls.length) s += `.${cls.join(".")}`;
    return s;
}

/* ---- colors ----------------------------------------------------------- */

function parseColor(value) {
    const v = String(value).trim().toLowerCase();
    let m = v.match(/^#([0-9a-f]{3,8})$/);
    if (m) {
        let hex = m[1];
        if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
        if (hex.length !== 6 && hex.length !== 8) return null;
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
            a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
        };
    }
    m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
    if (m) {
        let a = 1;
        if (m[4] !== undefined) a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        return {r: +m[1], g: +m[2], b: +m[3], a: clamp(a, 0, 1)};
    }
    // How browsers report a computed color-mix(in srgb, ...): channels 0-1.
    m = v.match(/^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+%?))?\s*\)$/);
    if (m) {
        let a = 1;
        if (m[4] !== undefined) a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        const ch = (x) => clamp(parseFloat(x), 0, 1) * 255;
        return {r: ch(m[1]), g: ch(m[2]), b: ch(m[3]), a: clamp(a, 0, 1)};
    }
    return null;
}

let probe = null;

// Any CSS color (named, hsl, var(...)) → {r,g,b,a}, via the browser's own
// parser. `theme` ("dark" / "light") resolves var()s against that theme's
// tokens - the probe carries the data-theme attribute the token blocks match -
// instead of whichever theme the page is showing.
function resolveColor(value, theme) {
    const direct = parseColor(value);
    if (direct) return direct;
    if (!value || !CSS.supports("color", value)) return null;
    if (!probe) {
        probe = document.createElement("span");
        probe.style.display = "none";
        document.body.append(probe);
    }
    if (theme) probe.setAttribute("data-theme", theme);
    else probe.removeAttribute("data-theme");
    probe.style.color = "";
    probe.style.color = value;
    return parseColor(getComputedStyle(probe).color);
}

const toHex = ({r, g, b}) =>
    "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");

const fmtColor = (c) =>
    c.a >= 0.995
        ? toHex(c)
        : `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${+c.a.toFixed(2)})`;

const isColorValue = (v) =>
    !!v && !/var\(|color-mix|gradient/.test(v) && CSS.supports("color", v);

function sameValue(a, b) {
    if (squash(a) === squash(b)) return true;
    const ca = parseColor(a);
    const cb = parseColor(b);
    return !!(ca && cb) &&
        Math.abs(ca.r - cb.r) < 0.5 && Math.abs(ca.g - cb.g) < 0.5 &&
        Math.abs(ca.b - cb.b) < 0.5 && Math.abs(ca.a - cb.a) < 0.005;
}

const enumFor = (name) => ENUMS[name] || (/-easing$/.test(name) ? EASINGS : null);

function classify(name, value) {
    if (enumFor(name)) return "enum";
    if (/^--font-/.test(name)) return "font";
    if (isColorValue(value)) return "color";
    if (NUM_RE.test(value)) return "number";
    if (MOTION_RE.test(value)) return "motion";
    return "text";
}

/* ---- token discovery -------------------------------------------------- */

function* walkRules(list, media = []) {
    for (const rule of list) {
        if (rule instanceof CSSStyleRule) {
            yield {rule, media};
        } else if (rule instanceof CSSMediaRule) {
            yield* walkRules(rule.cssRules, [...media, matchMedia(rule.media.mediaText)]);
        } else if (rule.cssRules) {
            yield* walkRules(rule.cssRules, media); // @supports, @layer
        }
    }
}

// Selector parts with state pseudo-classes / pseudo-elements stripped, so a
// `.btn:hover` or `.card::before` rule still counts for the element itself.
function simplifySelectors(selectorText) {
    return selectorText
        .split(",")
        .map((s) => s
            .replace(/::?(before|after|placeholder|marker|selection|backdrop|first-line|first-letter|-webkit-[\w-]+|-moz-[\w-]+)\b/g, "")
            .replace(/:(hover|focus-visible|focus-within|focus|active|visited|target)\b/g, "")
            .trim())
        .filter(Boolean);
}

function discover() {
    const tokens = new Map(); // name → {name, base:{root?,dark?,light?}, themed, spec, order}
    const usage = []; // {selectors, media, refs}

    const sheets = [...document.styleSheets].filter((sheet) => {
        if (sheet.ownerNode && sheet.ownerNode.id === "tweaker-overrides") return false;
        try {
            return !!sheet.cssRules;
        } catch {
            return false; // cross-origin sheet
        }
    });

    for (const sheet of sheets) {
        for (const {rule, media} of walkRules(sheet.cssRules)) {
            const sel = rule.selectorText.trim();
            const scope = SHARED_SELECTORS.includes(sel)
                ? "root"
                : Object.keys(SCOPE_SELECTOR).find((s) => SCOPE_SELECTOR[s] === sel);

            if (scope && media.length === 0) {
                for (const prop of rule.style) {
                    if (!prop.startsWith("--")) continue;
                    const t = tokens.get(prop) || {name: prop, base: {}, order: tokens.size};
                    t.base[scope] = rule.style.getPropertyValue(prop).trim();
                    if (scope === "root") t.decl = sel; // where Copy CSS should put it
                    tokens.set(prop, t);
                }
                continue;
            }

            const refs = new Set([...rule.style.cssText.matchAll(VAR_RE)].map((m) => m[1]));
            if (refs.size) usage.push({selectors: simplifySelectors(sel), media, refs});
        }
    }

    for (const t of tokens.values()) {
        t.themed = "dark" in t.base || "light" in t.base;
        // renderTheme() writes the spec's `theme` knobs as inline vars on
        // <html> (accent on <body>). Shared tokens show that value as their base.
        const fromHtml = document.documentElement.style.getPropertyValue(t.name).trim();
        const fromBody = document.body.style.getPropertyValue(t.name).trim();
        if (fromHtml || fromBody) t.spec = true;
        if (!t.themed && fromHtml) t.base.root = fromHtml;
    }

    // Drop usage refs that aren't tweakable tokens.
    for (const u of usage) {
        for (const r of u.refs) if (!tokens.has(r)) u.refs.delete(r);
    }

    const keyframes = new Set();
    const walkKeyframes = (list) => {
        for (const rule of list) {
            if (rule instanceof CSSKeyframesRule) keyframes.add(rule.name);
            else if (rule.cssRules && !(rule instanceof CSSStyleRule)) walkKeyframes(rule.cssRules);
        }
    };
    sheets.forEach((sheet) => walkKeyframes(sheet.cssRules));

    return {
        tokens,
        usage: usage.filter((u) => u.refs.size && u.selectors.length),
        keyframes: [...keyframes],
    };
}

/* ---- panel styles ----------------------------------------------------- */

const PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }

.panel {
    position: fixed; top: 16px; left: 16px;
    width: 400px; min-width: 330px; max-width: min(720px, calc(100vw - 16px));
    max-height: calc(100vh - 32px);
    display: flex; flex-direction: column;
    background: #16171b; color: #e4e6eb;
    border: 1px solid #2c2f37; border-radius: 12px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0, 0, 0, 0.3);
    font: 12.5px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color-scheme: dark; overflow: hidden; resize: horizontal;
}
.panel.is-collapsed .body { display: none; }
.panel.is-collapsed { resize: none; }

/* -- header bar -- */
.bar {
    display: flex; align-items: center; gap: 4px;
    padding: 6px 6px 6px 12px; background: #1c1e23; border-bottom: 1px solid #2c2f37;
    cursor: grab; user-select: none; touch-action: none;
}
.bar:active { cursor: grabbing; }
.bar__title { font-weight: 650; letter-spacing: 0.01em; margin-right: 4px; }
.bar__spacer { flex: 1; }
.badge {
    height: 18px; min-width: 18px; padding: 0 6px; border-radius: 9px; border: 0;
    background: #f5a524; color: #1a1300; font: 700 11px/18px system-ui, sans-serif; cursor: pointer;
}
.bar button.reset-all { color: #f5a524; width: 22px; height: 22px; }

/* -- generic controls -- */
button, select, input { font: inherit; color: inherit; }
button {
    background: #262930; border: 1px solid #353943; border-radius: 6px;
    padding: 3px 10px; cursor: pointer; white-space: nowrap; height: 26px;
}
button:hover:not(:disabled) { background: #30343d; }
button:disabled { opacity: 0.35; cursor: default; }
button.primary { background: #2f62c0; border-color: #3f74d4; color: #fff; }
button.primary:hover:not(:disabled) { background: #3a6fcf; }
button.ghost { background: transparent; border-color: transparent; }
button.ghost:hover:not(:disabled) { background: #2a2d35; }
button.icon { width: 26px; padding: 0; display: inline-grid; place-items: center; flex: none; font-size: 14px; }
input[type="text"], input[type="search"], input[type="number"], select {
    background: #0f1013; border: 1px solid #353943; border-radius: 6px;
    padding: 3px 7px; min-width: 0; height: 26px;
}
input[type="number"] { width: 62px; flex: none; text-align: right; padding-right: 4px; }
input:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid #5b9dff; outline-offset: 1px; }
input[type="range"] { flex: 1; min-width: 40px; margin: 0; height: 18px; accent-color: #5b9dff; }

.body { display: flex; flex-direction: column; min-height: 0; flex: 1; position: relative; }
/* Only the list may shrink (and scroll). Everything else keeps its height -
   the tab strip especially: it scrolls sideways, which drops its minimum
   height to 0, so with a long list it used to get squashed flat. */
.bar, .tabs, .toolbar, .foot { flex: none; }

/* -- tabs + toolbar -- */
.tabs { display: flex; gap: 2px; padding: 6px 8px 0; border-bottom: 1px solid #2c2f37; overflow-x: auto; scrollbar-width: none; }
.tab {
    background: transparent; border: 0; border-radius: 6px 6px 0 0; height: 28px; padding: 0 9px;
    color: #9ba1ad; border-bottom: 2px solid transparent;
}
.tab:hover:not(:disabled) { background: transparent; color: #e4e6eb; }
.tab.is-active { color: #fff; border-bottom-color: #5b9dff; }
.tab--changed { color: #f5a524; }
.toolbar { display: flex; gap: 6px; padding: 8px; align-items: center; }
.toolbar input[type="search"] { flex: 1; }
.pin {
    max-width: 45%; overflow: hidden; text-overflow: ellipsis;
    background: rgba(91, 157, 255, 0.16); border-color: rgba(91, 157, 255, 0.4);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px;
}

/* -- list + sections -- */
.list { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding-bottom: 8px; }
.empty { padding: 18px 14px; color: #7f8592; }
.sec__head {
    position: sticky; top: 0; z-index: 2;
    display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 4px 10px 4px 14px;
    background: #16171b; border-bottom: 1px solid #23262d;
}
.sec__title { flex: 1; color: #9ba1ad; font-size: 11px; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; }
.sec__head select { height: 24px; max-width: 160px; }
.sec__cols { display: flex; gap: 6px; margin-right: 26px; color: #6f7581; font-size: 13px; }
.sec__cols span { width: 30px; text-align: center; }
.sec__cols .is-active { color: #e4e6eb; }

/* -- rows -- */
.row {
    position: relative; display: grid; align-items: center; gap: 8px;
    grid-template-columns: minmax(0, 1fr) auto 18px;
    min-height: 34px; padding: 4px 10px 4px 14px;
}
.row--wide { grid-template-columns: minmax(96px, 38%) minmax(0, 1fr) 18px; }
.row:hover { background: #1c1e23; }
.row.is-changed::before {
    content: ""; position: absolute; left: 5px; top: 50%; width: 5px; height: 5px; margin-top: -2.5px;
    border-radius: 50%; background: #f5a524;
}
.row.hl { background: rgba(91, 157, 255, 0.18); box-shadow: inset 2px 0 0 #5b9dff; }
.row.hl-soft { background: rgba(91, 157, 255, 0.07); }
.row__text { min-width: 0; display: flex; align-items: baseline; gap: 6px; }
.row__label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #e4e6eb; }
.row__note { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #737987; font-size: 11px; }
.row.is-linked .ctl { opacity: 0.55; }
.row.is-linked .ctl:hover, .row.is-linked .ctl:focus-within { opacity: 1; }
.tag { flex: none; font-size: 10px; padding: 0 5px; border-radius: 4px; background: #3a2f12; color: #f5c46a; }
.reset {
    width: 18px; height: 18px; padding: 0; border: 0; background: transparent; color: #f5a524;
    visibility: hidden; font-size: 13px; line-height: 1;
}
.reset:hover:not(:disabled) { background: transparent; color: #ffc15e; }
.row.is-changed .reset { visibility: visible; }

.ctl { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.line { display: flex; gap: 6px; align-items: center; min-width: 0; }
.line > input[type="text"], .line > select { flex: 1; width: 0; }
.unit { color: #737987; min-width: 18px; flex: none; font-size: 11px; }
.duo { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }

/* -- color chips -- */
.chips { display: flex; gap: 6px; justify-content: flex-end; }
.chip {
    position: relative; width: 30px; height: 22px; padding: 0; border-radius: 6px; overflow: hidden;
    border: 1px solid #454955;
    background: conic-gradient(#8a8a8a 25%, #cfcfcf 0 50%, #8a8a8a 0 75%, #cfcfcf 0) 0 0 / 8px 8px;
}
.chip:hover:not(:disabled) { border-color: #8b92a1; background: conic-gradient(#8a8a8a 25%, #cfcfcf 0 50%, #8a8a8a 0 75%, #cfcfcf 0) 0 0 / 8px 8px; }
.chip.is-open { outline: 2px solid #5b9dff; outline-offset: 1px; }
.chip__fill { position: absolute; inset: 0; }
.chip.is-changed::after {
    content: ""; position: absolute; right: 2px; top: 2px; width: 6px; height: 6px;
    border-radius: 50%; background: #f5a524; box-shadow: 0 0 0 1px #16171b;
}
.chip.is-linked::before {
    content: "="; position: absolute; left: 3px; bottom: -1px; z-index: 1;
    font: 700 10px/1 system-ui, sans-serif; color: #fff; text-shadow: 0 0 2px #000, 0 0 2px #000;
}

/* -- color popover -- */
.pop {
    position: fixed; z-index: 3; width: 250px; padding: 10px;
    display: grid; gap: 8px;
    background: #1d1f25; border: 1px solid #3a3e48; border-radius: 10px;
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.6);
    font: 12.5px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #e4e6eb; color-scheme: dark;
}
.pop__head { display: flex; align-items: baseline; gap: 6px; }
.pop__title { font-weight: 650; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pop__scope { color: #9ba1ad; font-size: 11px; }
.pop__name { color: #737987; font: 10.5px ui-monospace, SFMono-Regular, Menlo, monospace; margin-top: -6px; }
.pop__swatch {
    position: relative; width: 44px; height: 44px; flex: none; border-radius: 8px; overflow: hidden;
    border: 1px solid #454955; cursor: pointer;
    background: conic-gradient(#8a8a8a 25%, #cfcfcf 0 50%, #8a8a8a 0 75%, #cfcfcf 0) 0 0 / 10px 10px;
}
.pop__swatch span { position: absolute; inset: 0; }
.pop__swatch input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; border: 0; padding: 0; cursor: pointer; }
.pop__val { display: grid; gap: 6px; flex: 1; min-width: 0; }
.pop label { display: flex; gap: 8px; align-items: center; color: #9ba1ad; font-size: 11px; }
.pop label select { flex: 1; }
.pop__alpha { width: 34px; text-align: right; color: #c9cdd6; }

/* -- footer -- */
.foot { display: flex; align-items: center; gap: 6px; padding: 8px; border-top: 1px solid #2c2f37; background: #1a1c21; }
.status { flex: 1; min-width: 0; color: #b9bec9; font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* -- menus (presets, help) -- */
.menu {
    position: absolute; z-index: 4; right: 8px; width: 290px; max-height: 70%; overflow: auto;
    display: grid; gap: 8px; padding: 10px;
    background: #1d1f25; border: 1px solid #3a3e48; border-radius: 10px; box-shadow: 0 14px 40px rgba(0, 0, 0, 0.6);
}
.menu h4 { margin: 0; color: #9ba1ad; font-size: 11px; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; }
.menu p { margin: 0; color: #c9cdd6; }
.menu kbd {
    font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; padding: 0 4px; border-radius: 4px;
    background: #2a2d35; border: 1px solid #3a3e48;
}
.menu hr { width: 100%; border: 0; border-top: 1px solid #2c2f37; margin: 2px 0; }
.menu__row { display: flex; gap: 6px; align-items: center; }
.menu__row > input[type="text"] { flex: 1; }
.menu__preset { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; }
.menu__empty { color: #7f8592; }
.menu label { display: flex; gap: 8px; align-items: center; cursor: pointer; }
.danger { color: #ff8b7b; }

.modal { position: absolute; inset: 0; z-index: 5; background: rgba(10, 11, 14, 0.94); display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.modal textarea {
    flex: 1; resize: none; background: #0f1013; color: #e4e6eb; border: 1px solid #353943; border-radius: 6px;
    padding: 8px; font: 11.5px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* -- phone / tablet preview -- */
.preview { position: fixed; inset: 0; background: rgba(12, 13, 16, 0.95); }
.preview__bar {
    position: absolute; top: 12px; display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;
    font: 12.5px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #e4e6eb; color-scheme: dark;
}
.preview__sep { width: 12px; }
.preview__stage { position: absolute; display: flex; align-items: flex-start; justify-content: center; }
.device { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.device__screen {
    position: relative; overflow: hidden; border-radius: 14px; background: #000;
    border: 1px solid #3a3e48; box-shadow: 0 12px 44px rgba(0, 0, 0, 0.55);
}
.device iframe { position: absolute; top: 0; left: 0; border: 0; transform-origin: 0 0; background: #fff; }
.device__cap { color: #9ba1ad; font: 11px system-ui, sans-serif; white-space: nowrap; }

/* -- page overlays -- */
.outline {
    position: fixed; display: none; pointer-events: none;
    border: 2px solid #5b9dff; border-radius: 3px; background: rgba(91, 157, 255, 0.1);
}
.outline__label, .uses__tag {
    position: absolute; left: -2px; bottom: 100%; margin-bottom: 3px;
    padding: 1px 6px; border-radius: 3px; white-space: nowrap;
    background: #5b9dff; color: #08101f; font: 600 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.outline.label-inside .outline__label { bottom: auto; top: 0; margin: 0; }
.uses { position: fixed; pointer-events: none; border: 2px dashed #f5a524; border-radius: 3px; }
.uses__tag { position: fixed; bottom: auto; margin: 0; background: #f5a524; color: #1a1300; pointer-events: none; }
`;

/* ---- boot ------------------------------------------------------------- */

function boot() {
    const {tokens, usage, keyframes} = discover();
    if (!tokens.size) {
        console.warn("[tweaker] no design tokens found in the page's stylesheets");
        return;
    }
    ENUMS["--bg-motion"] = ["none", ...keyframes.filter((k) => k.startsWith("bg-"))];

    /* -- state -- */

    const scopesOf = (t) => (t.themed ? THEMES : ["root"]);
    const isScopeOk = (t, scope) => (scope === "root" ? !t.themed : t.themed);

    function sanitize(data) {
        const clean = {root: {}, dark: {}, light: {}};
        let skipped = 0;
        if (!data || typeof data !== "object") return {clean, skipped};
        for (const scope of SCOPES) {
            const src = data[scope];
            if (!src || typeof src !== "object") continue;
            for (const [name, value] of Object.entries(src)) {
                const t = tokens.get(name);
                const v = typeof value === "string" ? value.trim() : "";
                if (!t || !v || UNSAFE_RE.test(v) || !isScopeOk(t, scope)) {
                    skipped++;
                    continue;
                }
                // Already the styles.css value (e.g. it was saved / pasted
                // in and the page reloaded) - not a change any more.
                if (sameValue(v, t.base[scope] ?? "")) continue;
                clean[scope][name] = v;
            }
        }
        return {clean, skipped};
    }

    const overrides = sanitize(store.get(STATE_KEY, null)).clean;
    const ui = Object.assign(
        {x: null, y: null, w: 400, collapsed: false, tab: "Colors", followTheme: true, previewOn: false, previewMode: "both"},
        store.get(UI_KEY, {}));
    if (!TABS.includes(ui.tab) && ui.tab !== "Changed") ui.tab = "Colors";
    const saveUi = () => store.set(UI_KEY, ui);

    // Counted per token, not per theme: a color changed in both themes is one
    // changed row, and the badge / Changed tab must agree with the rows shown.
    const changedCount = () => new Set(SCOPES.flatMap((s) => Object.keys(overrides[s]))).size;
    const isChanged = (name) => SCOPES.some((s) => Object.hasOwn(overrides[s], name));
    const activeTheme = () => (document.body.getAttribute("data-theme") === "light" ? "light" : "dark");
    const currentValue = (scope, name) => overrides[scope][name] ?? tokens.get(name).base[scope] ?? "";
    const linkOf = (value) => {
        const m = String(value).match(LINK_RE);
        return m && tokens.has(m[1]) ? m[1] : null;
    };
    const themeFor = (scope) => (scope === "root" ? undefined : scope);

    // The value actually in effect for `name` in `scope`, following var()
    // links (--tab-hover-bg → --menu-hover-bg → --accent-soft).
    function rawValue(scope, name) {
        const theme = scope === "root" ? activeTheme() : scope;
        let v = currentValue(scope, name);
        for (let i = 0; i < 8; i++) {
            const target = linkOf(v);
            if (!target) break;
            v = currentValue(tokens.get(target).themed ? theme : "root", target);
        }
        return v;
    }

    const isColorish = (v) => isColorValue(v) || (/^color-mix\(/.test(v) && CSS.supports("color", v));
    const colorOf = (scope, name) => resolveColor(rawValue(scope, name), themeFor(scope));

    // Does following `from`'s links ever reach `to`? (Prevents link cycles.)
    function reaches(from, to, scope) {
        let v = currentValue(tokens.get(from).themed ? (scope === "root" ? activeTheme() : scope) : "root", from);
        for (let i = 0; i < 8; i++) {
            const target = linkOf(v);
            if (!target) return false;
            if (target === to) return true;
            v = currentValue(tokens.get(target).themed ? (scope === "root" ? activeTheme() : scope) : "root", target);
        }
        return false;
    }

    /* -- undo / redo -- */

    // Edits close together (a slider drag) become one undo step; a step ends
    // after a short pause. Bulk changes (presets, resets) are their own step.
    const undoStack = [];
    const redoStack = [];
    let burst = false;
    let burstTimer = 0;

    function recordEdit() {
        if (!burst) {
            undoStack.push(structuredClone(overrides));
            if (undoStack.length > 200) undoStack.shift();
            redoStack.length = 0;
            burst = true;
        }
        clearTimeout(burstTimer);
        burstTimer = setTimeout(() => (burst = false), 700);
        syncUndo();
    }

    function checkpoint() {
        burst = false;
        recordEdit();
        clearTimeout(burstTimer);
        burst = false;
    }

    function restore(snap) {
        for (const s of SCOPES) overrides[s] = {...snap[s]};
        burst = false;
        renderList();
        scheduleApply();
    }

    function undo() {
        if (!undoStack.length) return;
        redoStack.push(structuredClone(overrides));
        restore(undoStack.pop());
        status("Undone");
    }

    function redo() {
        if (!redoStack.length) return;
        undoStack.push(structuredClone(overrides));
        restore(redoStack.pop());
        status("Redone");
    }

    /* -- applying overrides -- */

    const styleEl = h("style", {id: "tweaker-overrides"});
    document.head.append(styleEl);

    let frame = 0;
    let fitTimer = 0;

    function writeOverrides() {
        styleEl.textContent = SCOPES.map((scope) => {
            const entries = Object.entries(overrides[scope]);
            if (!entries.length) return "";
            // !important: beats the base blocks and renderTheme()'s inline vars.
            const body = entries.map(([k, v]) => `  ${k}: ${v} !important;`).join("\n");
            return `${OVERRIDE_SELECTOR[scope]} {\n${body}\n}`;
        }).join("\n");

        store.set(STATE_KEY, overrides);

        const meta = document.querySelector('meta[name="theme-color"]');
        const bg = getComputedStyle(document.body).getPropertyValue("--bg-base").trim();
        if (meta && bg) meta.setAttribute("content", bg);

        syncFrames(); // phone / tablet previews get the same overrides

        // Sizes and fonts change the header's layout; let initHeaderFit() re-measure
        // (in the page and in each preview frame).
        clearTimeout(fitTimer);
        fitTimer = setTimeout(() => {
            window.dispatchEvent(new Event("resize"));
            resizeFrames();
        }, 120);
    }

    function scheduleApply() {
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            writeOverrides();
            repaintChips(); // linked / derived colors follow their source
            refreshLinkedRows(); // ...and so do linked sliders
            placeUsage(); // a size / border change moves the outlined elements
        });
    }

    function setOverride(scope, name, value) {
        const v = String(value).trim();
        if (UNSAFE_RE.test(v)) {
            status("Values can't contain ; { } or <");
            return;
        }
        recordEdit();
        const base = tokens.get(name).base[scope] ?? "";
        if (!v || sameValue(v, base)) delete overrides[scope][name];
        else overrides[scope][name] = v;
        refreshState();
        scheduleApply();
    }

    /* -- shadow host + panel skeleton -- */

    const host = h("div", {id: "tweaker-host"});
    host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000;";
    document.body.append(host);
    const root = host.attachShadow({mode: "open"});
    root.append(h("style", {text: PANEL_CSS}));

    const iconBtn = (text, title, onclick) =>
        h("button", {class: "icon ghost", type: "button", text, title, "aria-label": title, onclick});

    const badge = h("button", {class: "badge", type: "button", title: "Show only what you changed", hidden: true, onclick: () => setTab("Changed")});
    const resetAllBtn = h("button", {
        class: "icon ghost reset-all", type: "button", text: "↺", hidden: true,
        title: "Reset all changes (Ctrl+Z brings them back)", "aria-label": "Reset all changes",
        onclick: resetAll,
    });
    const undoBtn = iconBtn("↶", "Undo (Ctrl+Z)", undo);
    const redoBtn = iconBtn("↷", "Redo (Ctrl+Shift+Z)", redo);
    const compareBtn = iconBtn("⇆", "Hold to see the original styles.css", null);
    const previewBtn = iconBtn("📱", "Phone & tablet preview", togglePreview);
    const themeBtn = h("button", {class: "ghost", type: "button", title: "Switch the page's theme (uses the site's own toggle)", onclick: toggleTheme});
    const collapseBtn = iconBtn("–", "Collapse", toggleCollapsed);
    const bar = h("div", {class: "bar", title: "Drag to move · double-click to collapse · ` hides the panel"},
        h("span", {class: "bar__title", text: "Tokens"}), badge, resetAllBtn, h("span", {class: "bar__spacer"}),
        undoBtn, redoBtn, compareBtn, previewBtn, themeBtn, collapseBtn);

    const tabsEl = h("div", {class: "tabs", role: "tablist"});
    const search = h("input", {type: "search", placeholder: "Search all tokens…", spellcheck: "false", "aria-label": "Search tokens", oninput: applyView});
    const pinChip = h("button", {class: "pin", type: "button", hidden: true, title: "Alt+click result - click to clear", onclick: clearPin});
    const presetsBtn = h("button", {type: "button", text: "Presets ▾", "aria-haspopup": "true", onclick: () => toggleMenu("presets")});
    const toolbar = h("div", {class: "toolbar"}, search, pinChip, presetsBtn);

    const list = h("div", {class: "list"});
    const emptyMsg = h("div", {class: "empty", hidden: true});

    const statusEl = h("div", {class: "status", "aria-live": "polite"});
    const canWrite = typeof window.showOpenFilePicker === "function";
    const helpBtn = iconBtn("?", "Help & settings", () => toggleMenu("help"));
    const copyBtn = h("button", {type: "button", class: canWrite ? "" : "primary", text: "Copy CSS", title: "Copy the changed lines for styles.css to the clipboard", onclick: copyCss});
    const saveBtn = h("button", {
        type: "button", class: "primary", text: "Save to styles.css", hidden: !canWrite,
        title: "Write the changes into styles.css (asks for the file once), then reload",
        onclick: saveToFile,
    });
    const foot = h("div", {class: "foot"}, statusEl, helpBtn, copyBtn, saveBtn);

    const menu = h("div", {class: "menu", hidden: true, role: "dialog"});
    const body = h("div", {class: "body"}, tabsEl, toolbar, list, emptyMsg, foot, menu);
    const panel = h("div", {class: "panel"}, bar, body);

    const pop = h("div", {class: "pop", hidden: true, role: "dialog"});
    const outlineLabel = h("span", {class: "outline__label"});
    const outline = h("div", {class: "outline"}, outlineLabel);
    const usesLayer = h("div");
    const usesTag = h("div", {class: "uses__tag", hidden: true});
    const previewBar = h("div", {class: "preview__bar"});
    const previewStage = h("div", {class: "preview__stage"});
    const previewEl = h("div", {class: "preview", hidden: true}, previewBar, previewStage);
    // The preview is first, so the panel and its popover paint above it.
    root.append(previewEl, panel, pop, usesLayer, usesTag, outline);

    let statusTimer = 0;

    function status(msg, sticky = false) {
        statusEl.textContent = msg;
        clearTimeout(statusTimer);
        if (msg && !sticky) statusTimer = setTimeout(() => (statusEl.textContent = ""), 5000);
    }

    // Trailing `/* ... */` comments from styles.css, shown in row tooltips.
    // CSSOM drops comments, so the stylesheet text is fetched once.
    const hints = new Map();
    const stylesHref = [...document.styleSheets].map((s) => s.href).find((href) => href && /styles\.css(\?|$)/.test(href));
    if (stylesHref) {
        fetch(stylesHref)
            .then((r) => (r.ok ? r.text() : ""))
            .then((css) => {
                for (const m of css.matchAll(/^\s*(--[\w-]+)\s*:[^;\n]*;\s*\/\*\s*(.+?)\s*\*\/\s*$/gm)) {
                    if (!hints.has(m[1])) hints.set(m[1], m[2]);
                }
                for (const entry of rowEls.values()) entry.text.title = tipFor(entry.t);
            })
            .catch(() => {
                // no tooltips - labels still work
            });
    }

    const tipFor = (t) => [t.name, hints.get(t.name)].filter(Boolean).join(" - ");

    /* -- inline controls (non-color rows) -- */

    function autoRange(num, unit) {
        const floor = {px: 48, rem: 4, em: 4, "%": 200, vw: 100, vh: 100, ms: 1000, s: 2, "": 4}[unit] ?? 10;
        const max = Math.max(floor, Math.ceil(Math.abs(num) * 2.5));
        const step = unit === "px" || unit === "ms" ? 1 : max > 50 ? 0.5 : max > 10 ? 0.1 : 0.01;
        return [Math.min(0, num), max, step];
    }

    // Slider + number box, kept in step. `emit(n)` gets the number.
    function sliderBox(num, [min, max, step], unit, emit) {
        const range = h("input", {type: "range", min, max, step, value: num, "aria-label": "Value"});
        const box = h("input", {type: "number", step, value: fmtNum(num), "aria-label": "Value"});
        range.addEventListener("input", () => {
            box.value = fmtNum(+range.value);
            emit(+range.value);
        });
        box.addEventListener("input", () => {
            const n = parseFloat(box.value);
            if (!Number.isFinite(n)) return;
            range.value = String(n);
            emit(n);
        });
        return h("div", {class: "line"}, range, box, h("span", {class: "unit", text: unit}));
    }

    function numberControl(value, onChange, name) {
        const m = value.match(NUM_RE);
        const unit = m[2] || "";
        const num = parseFloat(m[1]);
        const range = RANGES[name] || autoRange(num, unit);
        return h("div", {class: "ctl"}, sliderBox(num, range, unit, (n) => onChange(fmtNum(n) + unit)));
    }

    function motionControl(value, onChange) {
        const m = value.match(MOTION_RE);
        let ms = m[2] === "s" ? +m[1] * 1000 : +m[1];
        let ease = m[3].trim();
        const emit = () => onChange(`${fmtNum(ms)}ms ${ease}`);
        const options = EASINGS.some((e) => squash(e) === squash(ease)) ? EASINGS : [ease, ...EASINGS];
        const select = h("select", {"aria-label": "Easing"}, options.map((e) => h("option", {value: e, text: e})));
        select.value = options.find((e) => squash(e) === squash(ease));
        select.addEventListener("change", () => {
            ease = select.value;
            emit();
        });
        return h("div", {class: "ctl"},
            sliderBox(ms, [0, Math.max(1000, ms * 2), 10], "ms", (n) => {
                ms = n;
                emit();
            }),
            h("div", {class: "line"}, select));
    }

    function fontControl(value, onChange) {
        const fontBases = [...tokens.values()]
            .filter((t) => t.name.startsWith("--font-"))
            .flatMap((t) => Object.values(t.base));
        const options = [];
        for (const o of [value, ...fontBases, ...FONT_STACKS]) {
            if (o && !options.some((x) => squash(x) === squash(o))) options.push(o);
        }
        const select = h("select", {"aria-label": "Font"}, options.map((o) => {
            const opt = h("option", {value: o, text: o.split(",")[0].replace(/["']/g, "").trim()});
            opt.style.fontFamily = o;
            return opt;
        }), h("option", {value: "__custom", text: "Custom stack…"}));
        select.value = options[0];
        const text = h("input", {type: "text", value, spellcheck: "false", hidden: true, "aria-label": "Font stack"});
        select.addEventListener("change", () => {
            const custom = select.value === "__custom";
            text.hidden = !custom;
            if (custom) {
                text.focus();
                return;
            }
            text.value = select.value;
            onChange(select.value);
        });
        text.addEventListener("input", () => onChange(text.value));
        return h("div", {class: "ctl"}, h("div", {class: "line"}, select), h("div", {class: "line"}, text));
    }

    function enumControl(value, onChange, name) {
        const base = enumFor(name);
        const options = base.some((o) => squash(o) === squash(value)) ? base : [value, ...base];
        const select = h("select", {"aria-label": "Value"}, options.map((o) => h("option", {value: o, text: o})));
        select.value = options.find((o) => squash(o) === squash(value));
        select.addEventListener("change", () => onChange(select.value));
        return h("div", {class: "ctl"}, h("div", {class: "line"}, select));
    }

    function textControl(value, onChange) {
        const text = h("input", {type: "text", value, spellcheck: "false", "aria-label": "Value"});
        text.addEventListener("input", () => onChange(text.value));
        return h("div", {class: "ctl"}, h("div", {class: "line"}, text));
    }

    const CONTROLS = {
        number: numberControl,
        motion: motionControl,
        font: fontControl,
        enum: enumControl,
        text: textControl,
    };

    /* -- color chips + popover -- */

    const chipEls = new Map(); // "scope|name" → {chip, fill, t, scope}

    function paintChip(c) {
        const col = colorOf(c.scope, c.t.name);
        c.fill.style.background = col ? fmtColor(col) : "transparent";
        c.chip.classList.toggle("is-changed", Object.hasOwn(overrides[c.scope], c.t.name));
        c.chip.classList.toggle("is-linked", !!linkOf(currentValue(c.scope, c.t.name)));
    }

    function repaintChips() {
        for (const c of chipEls.values()) paintChip(c);
    }

    function buildChip(t, scope) {
        const fill = h("span", {class: "chip__fill"});
        const where = scope === "root" ? "both themes" : scope === "dark" ? "dark theme" : "light theme";
        const chip = h("button", {class: "chip", type: "button", title: `${labelFor(t.name)} - ${where}`, "aria-label": `${labelFor(t.name)}, ${where}`}, fill);
        const entry = {chip, fill, t, scope};
        chip.addEventListener("click", (e) => {
            e.stopPropagation();
            if (popState && popState.chip === chip) {
                closePopover();
                return;
            }
            // Editing a theme's color shows that theme, so you see what you change.
            if (ui.followTheme && scope !== "root" && activeTheme() !== scope) toggleTheme();
            // e.detail is 0 for a keyboard "click" (Enter / Space).
            openPopover(t, scope, chip, e.detail === 0);
        });
        chipEls.set(`${scope}|${t.name}`, entry);
        paintChip(entry);
        return chip;
    }

    let popState = null;

    function closePopover() {
        if (!popState) return;
        popState.chip.classList.remove("is-open");
        popState = null;
        pop.hidden = true;
        pop.replaceChildren();
    }

    function openPopover(t, scope, chip, fromKeyboard = false) {
        closePopover();
        const theme = themeFor(scope);
        let c = colorOf(scope, t.name) || {r: 0, g: 0, b: 0, a: 1};

        const fill = h("span");
        const picker = h("input", {type: "color", "aria-label": "Pick a color"});
        const hex = h("input", {type: "text", spellcheck: "false", "aria-label": "Color value"});
        const alpha = h("input", {type: "range", min: 0, max: 1, step: 0.01, "aria-label": "Opacity"});
        const alphaVal = h("span", {class: "pop__alpha"});

        const candidates = [...tokens.values()]
            .filter((x) => x.name !== t.name && kinds.get(x.name) === "color" && !reaches(x.name, t.name, scope))
            .sort((a, b) => labelFor(a.name).localeCompare(labelFor(b.name)));
        const same = h("select", {"aria-label": "Same as"},
            h("option", {value: "", text: "- its own color -"}),
            candidates.map((x) => h("option", {value: x.name, text: labelFor(x.name)})));

        const sync = (fromHex = false) => {
            fill.style.background = fmtColor(c);
            picker.value = toHex(c);
            alpha.value = String(c.a);
            alphaVal.textContent = `${Math.round(c.a * 100)}%`;
            if (!fromHex) hex.value = fmtColor(c);
            same.value = linkOf(currentValue(scope, t.name)) || "";
        };
        const own = () => setOverride(scope, t.name, fmtColor(c));

        picker.addEventListener("input", () => {
            c = {...parseColor(picker.value), a: c.a};
            own();
            sync();
        });
        alpha.addEventListener("input", () => {
            c = {...c, a: +alpha.value};
            own();
            sync();
        });
        hex.addEventListener("input", () => {
            const next = resolveColor(hex.value.trim(), theme);
            if (!next) return;
            c = next;
            setOverride(scope, t.name, hex.value.trim());
            sync(true);
        });
        same.addEventListener("change", () => {
            if (same.value) setOverride(scope, t.name, `var(${same.value})`);
            else own();
            c = colorOf(scope, t.name) || c;
            sync();
        });
        const resetBtn = h("button", {
            type: "button", text: "↺ Reset", title: `Back to styles.css: ${t.base[scope] || "unset"}`,
            onclick: () => {
                checkpoint();
                delete overrides[scope][t.name];
                refreshState();
                scheduleApply();
                c = colorOf(scope, t.name) || c;
                sync();
            },
        });
        const where = scope === "root" ? "both themes" : scope === "dark" ? "☾ Dark" : "☀ Light";

        pop.replaceChildren(
            h("div", {class: "pop__head"},
                h("span", {class: "pop__title", text: labelFor(t.name)}),
                h("span", {class: "pop__scope", text: where})),
            h("div", {class: "pop__name", text: t.name}),
            h("div", {class: "line"},
                h("label", {class: "pop__swatch", title: "Pick a color"}, fill, picker),
                h("div", {class: "pop__val"}, hex, h("div", {class: "line"}, alpha, alphaVal))),
            h("label", {}, h("span", {text: "Same as"}), same),
            h("div", {class: "line"}, resetBtn, h("span", {class: "bar__spacer"}),
                h("button", {type: "button", class: "primary", text: "Done", onclick: closePopover})));
        sync();

        popState = {chip, t, scope};
        chip.classList.add("is-open");
        pop.hidden = false;
        const r = chip.getBoundingClientRect();
        const pw = pop.offsetWidth;
        const ph = pop.offsetHeight;
        let top = r.bottom + 6;
        if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
        Object.assign(pop.style, {
            left: `${clamp(r.right - pw, 8, window.innerWidth - pw - 8)}px`,
            top: `${top}px`,
        });
        // Only move focus into the popover for keyboard users. With the mouse,
        // focus stays on the swatch, so Ctrl+Z still undoes the color change
        // (inside the hex field it would be the browser's own text undo).
        if (fromKeyboard) {
            hex.focus();
            hex.select();
        }
    }

    /* -- rows + sections -- */

    const rowEls = new Map(); // token name → {row, text, note, t, kind}
    const kinds = new Map(); // token name → row kind
    const sectionEls = []; // {name, tab, sec, rows, cols}
    const groupPresetSelects = []; // {select, presets}

    function rowKind(t) {
        if (scopesOf(t).some((s) => isColorish(rawValue(s, t.name)))) return "color";
        if (t.themed) return "themed-text";
        return classify(t.name, rawValue("root", t.name));
    }

    function buildRow(t) {
        const kind = kinds.get(t.name);
        const note = h("span", {class: "row__note"});
        const text = h("div", {class: "row__text", title: tipFor(t)},
            h("span", {class: "row__label", text: labelFor(t.name)}), note,
            t.spec && h("span", {class: "tag", text: "spec", title: "site-spec.json → theme also sets this, and that value wins on the live site"}));
        const reset = h("button", {
            class: "reset", type: "button", text: "↺", title: "Reset to styles.css", "aria-label": `Reset ${labelFor(t.name)}`,
            onclick: () => {
                checkpoint();
                for (const s of SCOPES) delete overrides[s][t.name];
                renderList();
                scheduleApply();
            },
        });
        const row = h("div", {class: `row ${kind === "color" ? "" : "row--wide"}`, "data-token": t.name});

        let control;
        if (kind === "color") {
            control = h("div", {class: "chips"}, scopesOf(t).map((s) => buildChip(t, s)));
        } else if (kind === "themed-text") {
            control = h("div", {class: "duo"}, THEMES.map((s) => {
                const input = h("input", {type: "text", value: currentValue(s, t.name), spellcheck: "false", title: s === "dark" ? "☾ Dark" : "☀ Light", "aria-label": `${labelFor(t.name)}, ${s}`});
                input.addEventListener("input", () => setOverride(s, t.name, input.value));
                return input;
            }));
        } else {
            control = inlineControl(t, kind);
        }

        row.append(text, control, reset);
        row.dataset.search = `${t.name} ${labelFor(t.name)}`.toLowerCase();
        row.addEventListener("pointerenter", () => {
            clearTimeout(usageTimer);
            usageTimer = setTimeout(() => showUsage(t.name), 150);
        });
        row.addEventListener("pointerleave", () => {
            clearTimeout(usageTimer);
            clearUsage();
        });
        rowEls.set(t.name, {row, text, note, t, kind, control, raw: rawValue("root", t.name)});
        return row;
    }

    // A linked value (e.g. tab roundness = var(--radius-sm)) shows the value
    // it follows, dimmed; editing it gives the token its own value.
    const inlineControl = (t, kind) =>
        CONTROLS[kind](rawValue("root", t.name), (v) => setOverride("root", t.name, v), t.name);

    // A linked slider / dropdown shows the value of the token it follows, so
    // when that token changes, rebuild it to show the new value.
    function refreshLinkedRows() {
        for (const entry of rowEls.values()) {
            if (entry.kind === "color" || entry.kind === "themed-text") continue;
            if (!linkOf(currentValue("root", entry.t.name))) continue;
            const raw = rawValue("root", entry.t.name);
            if (raw === entry.raw || classify(entry.t.name, raw) !== entry.kind) continue;
            const next = inlineControl(entry.t, entry.kind);
            entry.control.replaceWith(next);
            entry.control = next;
            entry.raw = raw;
        }
    }

    const matchingPreset = (presets) =>
        presets.find(([, values]) => Object.entries(values).every(([k, v]) =>
            tokens.has(k) && sameValue(currentValue("root", k), v)));

    function buildGroupPresets(groupName) {
        const presets = GROUP_PRESETS[groupName].filter(([, values]) =>
            Object.keys(values).some((k) => tokens.has(k)));
        const select = h("select", {title: "Apply a ready-made look to this section", "aria-label": `${groupName} preset`},
            h("option", {value: "", text: "Custom"}),
            presets.map(([label]) => h("option", {value: label, text: label})));
        select.addEventListener("change", () => {
            const preset = presets.find(([label]) => label === select.value);
            if (!preset) return;
            checkpoint();
            for (const [k, v] of Object.entries(preset[1])) {
                const t = tokens.get(k);
                if (!t || t.themed) continue;
                if (sameValue(v, t.base.root ?? "")) delete overrides.root[k];
                else overrides.root[k] = v;
            }
            renderList();
            scheduleApply();
            status(`Applied "${preset[0]}"`);
        });
        groupPresetSelects.push({select, presets});
        return select;
    }

    function renderList() {
        closePopover();
        clearUsage();
        const scrollTop = list.scrollTop;
        list.replaceChildren();
        rowEls.clear();
        chipEls.clear();
        kinds.clear();
        sectionEls.length = 0;
        groupPresetSelects.length = 0;

        for (const t of tokens.values()) kinds.set(t.name, rowKind(t));

        const buckets = new Map(GROUPS.map(([name, tab]) => [name, {tab, members: []}]));
        const sorted = [...tokens.values()].sort((a, b) => a.order - b.order);
        for (const t of sorted) buckets.get(GROUPS.find(([, , test]) => test(t))[0]).members.push(t);
        const ordered = [...buckets].sort(([, a], [, b]) => TABS.indexOf(a.tab) - TABS.indexOf(b.tab));

        for (const [name, {tab, members}] of ordered) {
            if (!members.length) continue;
            const themedColors = members.some((t) => t.themed && kinds.get(t.name) === "color");
            const cols = themedColors && h("span", {class: "sec__cols", "aria-hidden": "true"},
                h("span", {"data-col": "dark", text: "☾", title: "Dark theme"}),
                h("span", {"data-col": "light", text: "☀", title: "Light theme"}));
            const head = h("div", {class: "sec__head"},
                h("span", {class: "sec__title", text: name}),
                GROUP_PRESETS[name] && buildGroupPresets(name),
                cols);
            const rows = members.map(buildRow);
            const sec = h("section", {class: "sec", "aria-label": name}, head, ...rows);
            list.append(sec);
            sectionEls.push({name, tab, sec, rows});
        }

        list.scrollTop = scrollTop;
        refreshState();
        applyView();
        syncTheme();
    }

    // Cheap, per-edit refresh of everything that shows "changed" state.
    function refreshState() {
        for (const {row, note, kind, t} of rowEls.values()) {
            row.classList.toggle("is-changed", isChanged(t.name));
            const links = scopesOf(t).map((s) => linkOf(currentValue(s, t.name)));
            const sameLink = links[0] && links.every((l) => l === links[0]) ? links[0] : null;
            note.textContent = sameLink ? `= ${labelFor(sameLink)}` : "";
            row.classList.toggle("is-linked", kind !== "color" && !!sameLink);
        }
        for (const c of chipEls.values()) {
            c.chip.classList.toggle("is-changed", Object.hasOwn(overrides[c.scope], c.t.name));
            c.chip.classList.toggle("is-linked", !!linkOf(currentValue(c.scope, c.t.name)));
        }
        for (const {select, presets} of groupPresetSelects) {
            const match = matchingPreset(presets);
            select.value = match ? match[0] : "";
        }
        const n = changedCount();
        badge.textContent = String(n);
        badge.hidden = !n;
        resetAllBtn.hidden = !n;
        renderTabs();
        syncUndo();
    }

    function syncUndo() {
        undoBtn.disabled = !undoStack.length;
        redoBtn.disabled = !redoStack.length;
    }

    /* -- tabs, search, pin -- */

    let pin = null; // {label, all:Set}

    function currentMode() {
        if (search.value.trim()) return "search";
        if (pin) return "pin";
        return ui.tab;
    }

    function renderTabs() {
        const n = changedCount();
        const mode = currentMode();
        const names = n || ui.tab === "Changed" ? [...TABS, "Changed"] : TABS;
        tabsEl.replaceChildren(...names.map((name) => h("button", {
            type: "button",
            role: "tab",
            class: `tab${name === mode ? " is-active" : ""}${name === "Changed" ? " tab--changed" : ""}`,
            "aria-selected": String(name === mode),
            text: name === "Changed" ? `Changed ${n}` : name,
            onclick: () => setTab(name),
        })));
    }

    function setTab(name) {
        ui.tab = name;
        saveUi();
        search.value = "";
        pin = null;
        list.scrollTop = 0;
        applyView();
    }

    function applyView() {
        const mode = currentMode();
        const q = search.value.trim().toLowerCase();
        let any = false;
        for (const s of sectionEls) {
            let secAny = false;
            for (const row of s.rows) {
                const name = row.dataset.token;
                let show;
                if (mode === "search") show = row.dataset.search.includes(q);
                else if (mode === "pin") show = pin.all.has(name);
                else if (mode === "Changed") show = isChanged(name);
                else show = mode === "All" || s.tab === mode;
                row.hidden = !show;
                secAny ||= show;
            }
            s.sec.hidden = !secAny;
            any ||= secAny;
        }
        emptyMsg.textContent = mode === "Changed" ? "Nothing changed yet." : "No tokens match.";
        emptyMsg.hidden = any;
        pinChip.hidden = !pin;
        if (pin) pinChip.textContent = `📌 ${pin.label} ✕`;
        renderTabs();
    }

    function clearPin() {
        pin = null;
        applyView();
    }

    /* -- menus: presets + help -- */

    let menuOpen = null;

    function closeMenu() {
        menuOpen = null;
        menu.hidden = true;
        menu.replaceChildren();
    }

    function toggleMenu(which) {
        if (menuOpen === which) {
            closeMenu();
            return;
        }
        closePopover();
        menuOpen = which;
        menu.replaceChildren(...(which === "presets" ? presetsMenu() : helpMenu()));
        menu.hidden = false;
        // Presets drop down from the toolbar, help pops up from the footer.
        const bodyRect = body.getBoundingClientRect();
        if (which === "presets") {
            menu.style.top = `${toolbar.getBoundingClientRect().bottom - bodyRect.top}px`;
            menu.style.bottom = "auto";
        } else {
            menu.style.top = "auto";
            menu.style.bottom = `${bodyRect.bottom - foot.getBoundingClientRect().top + 4}px`;
        }
    }

    const readPresets = () => {
        const p = store.get(PRESETS_KEY, {});
        return p && typeof p === "object" && !Array.isArray(p) ? p : {};
    };

    function presetsMenu() {
        const names = Object.keys(readPresets()).sort((a, b) => a.localeCompare(b));
        const nameInput = h("input", {type: "text", placeholder: "Name for the current look", spellcheck: "false", "aria-label": "Preset name"});
        const fileInput = h("input", {type: "file", accept: ".json,application/json", hidden: true, onchange: () => importPreset(fileInput)});
        const save = () => {
            if (savePreset(nameInput.value.trim())) menu.replaceChildren(...presetsMenu());
        };
        nameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") save();
        });
        return [
            h("h4", {text: "Saved looks"}),
            // Spread: the caller passes this array to replaceChildren(), which
            // (unlike h()) doesn't flatten - a nested array became "[object …]".
            ...(names.length
                ? names.map((n) => h("div", {class: "menu__row"},
                    h("button", {type: "button", class: "menu__preset", text: n, title: `Load "${n}" (replaces the current changes; undo brings them back)`, onclick: () => {
                        loadPreset(n);
                        closeMenu();
                    }}),
                    iconBtn("✕", `Delete "${n}"`, () => {
                        if (deletePreset(n)) menu.replaceChildren(...presetsMenu());
                    })))
                : [h("p", {class: "menu__empty", text: "None yet - save the current look below."})]),
            h("div", {class: "menu__row"}, nameInput, h("button", {type: "button", text: "Save", onclick: save})),
            h("hr"),
            h("div", {class: "menu__row"},
                h("button", {type: "button", text: "Import file…", onclick: () => fileInput.click()}),
                h("button", {type: "button", text: "Export file", onclick: () => exportPreset(nameInput.value.trim())}),
                fileInput),
            h("hr"),
            h("button", {type: "button", class: "danger", text: "Reset all changes", onclick: () => {
                resetAll();
                closeMenu();
            }}),
        ];
    }

    function helpMenu() {
        const follow = h("input", {type: "checkbox"});
        follow.checked = ui.followTheme;
        follow.addEventListener("change", () => {
            ui.followTheme = follow.checked;
            saveUi();
        });
        const k = (key) => h("kbd", {text: key});
        return [
            h("h4", {text: "How it works"}),
            h("p", {text: "Changes show live but only here (?tweak). Save to styles.css or Copy CSS makes them real."}),
            h("p", {}, "Click a ☾ / ☀ swatch to edit that theme's color. Hover a row to outline where it's used."),
            h("p", {}, k("Alt"), " + hover the page: find an element's tokens. ", k("Alt"), " + click: pin them."),
            h("p", {}, k("Ctrl Z"), " undo · ", k("Ctrl Shift Z"), " redo · hold ⇆ to compare · ", k("`"), " hide panel"),
            h("p", {}, "📱 shows the site in a phone and a tablet frame, live. Hover outlines and ", k("Alt"), " tools pause while it's open."),
            h("hr"),
            h("label", {}, follow, h("span", {text: "Switch the page to a theme when editing its colors"})),
        ];
    }

    /* -- presets: save / load / import / export / reset -- */

    function replaceOverrides(clean) {
        checkpoint();
        for (const s of SCOPES) overrides[s] = {...clean[s]};
        renderList();
        scheduleApply();
    }

    function savePreset(name) {
        if (!name) {
            status("Type a name first");
            return false;
        }
        const all = readPresets();
        if (Object.hasOwn(all, name) && !confirm(`Overwrite the saved look "${name}"?`)) return false;
        all[name] = structuredClone(overrides);
        store.set(PRESETS_KEY, all);
        status(`Saved "${name}" (${changedCount()} changes)`);
        return true;
    }

    function loadPreset(name) {
        const data = readPresets()[name];
        if (!data) return;
        const {clean, skipped} = sanitize(data);
        replaceOverrides(clean);
        status(`Loaded "${name}"` + (skipped ? ` - skipped ${skipped} unknown token(s)` : ""));
    }

    function deletePreset(name) {
        if (!confirm(`Delete the saved look "${name}"?`)) return false;
        const all = readPresets();
        delete all[name];
        store.set(PRESETS_KEY, all);
        status(`Deleted "${name}"`);
        return true;
    }

    function exportPreset(rawName) {
        const name = rawName || "tweaks";
        const payload = {format: "tweaker-preset", version: 1, name, tokens: overrides};
        const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], {type: "application/json"});
        const a = h("a", {href: URL.createObjectURL(blob), download: `${name.replace(/[^\w.-]+/g, "-")}.tokens.json`});
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        status(`Exported "${name}"`);
    }

    async function importPreset(fileInput) {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (!file) return;
        let data;
        try {
            data = JSON.parse(await file.text());
        } catch {
            status(`${file.name} isn't valid JSON`);
            return;
        }
        const {clean, skipped} = sanitize(data && data.tokens ? data.tokens : data);
        const baseName = (data && typeof data.name === "string" && data.name.trim()) ||
            file.name.replace(/\.json$/i, "").replace(/\.tokens$/i, "");
        replaceOverrides(clean);
        const all = readPresets();
        // Never silently overwrite a different saved look of the same name.
        let name = baseName;
        for (let i = 2; Object.hasOwn(all, name) && JSON.stringify(all[name]) !== JSON.stringify(clean); i++) {
            name = `${baseName} (${i})`;
        }
        all[name] = structuredClone(clean);
        store.set(PRESETS_KEY, all);
        closeMenu();
        status(`Imported "${name}"` + (skipped ? ` - skipped ${skipped} unknown token(s)` : ""));
    }

    function resetAll() {
        const n = changedCount();
        if (!n) {
            status("Nothing to reset");
            return;
        }
        replaceOverrides({root: {}, dark: {}, light: {}});
        status(`Reset ${n} change(s) - Ctrl+Z brings them back`);
    }

    /* -- turning changes into styles.css edits -- */

    // Tokens that only exist on <body>: per-theme ones, and the shared ones
    // declared in the [data-theme] block.
    const bodyOnly = new Set([...tokens.values()]
        .filter((t) => t.themed || t.decl === "[data-theme]").map((t) => t.name));
    const readsBodyOnly = (value) => [...value.matchAll(VAR_RE)].some((m) => bodyOnly.has(m[1]));

    // Where each change goes in styles.css. A :root token whose new value
    // reads a <body>-only token must move to the shared [data-theme] block,
    // or it would resolve to nothing (see docs/theming.md).
    function plan() {
        const out = [];
        for (const scope of SCOPES) {
            for (const [name, value] of Object.entries(overrides[scope])) {
                const t = tokens.get(name);
                let selector = SCOPE_SELECTOR[scope];
                let from = null;
                if (scope === "root") {
                    if (t.decl === "[data-theme]") selector = "[data-theme]";
                    else if (readsBodyOnly(value)) {
                        selector = "[data-theme]";
                        from = ":root";
                    }
                }
                out.push({name, value, selector, from, spec: t.spec, order: t.order});
            }
        }
        return out.sort((a, b) => a.order - b.order);
    }

    const BG_MIRRORS = "index.html + 404.html theme-color, site.webmanifest theme_color + background_color, " +
        "and meta.themeColor in every site-spec*.json (docs/workflows.md, Workflow D)";

    function buildCss() {
        const lines = ["/* Changed design tokens - paste over the matching lines in styles.css. */"];
        const entries = plan();
        for (const selector of [":root", "[data-theme]", SCOPE_SELECTOR.dark, SCOPE_SELECTOR.light]) {
            const here = entries.filter((e) => e.selector === selector);
            if (!here.length) continue;
            lines.push("", `${selector} {`);
            for (const e of here) {
                const notes = [];
                if (e.from) notes.push(`moved here from :root - delete it there; it reads a per-theme token`);
                if (e.spec) notes.push("also set by site-spec.json theme - change it there too");
                lines.push(`    ${e.name}: ${e.value};${notes.map((n) => ` /* ${n} */`).join("")}`);
            }
            lines.push("}");
        }
        const bg = overrides.dark["--bg-base"];
        if (bg) lines.push("", `/* Dark --bg-base is now ${bg}. Also update: ${BG_MIRRORS}. */`);
        return lines.join("\n") + "\n";
    }

    const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Apply plan() to the text of styles.css: each token line is rewritten in
    // place (indentation and trailing comment kept); moved lines are removed
    // from :root and added to the end of the [data-theme] block.
    function patchCss(input) {
        let css = input;
        const applied = [];
        const missing = [];
        const moved = [];
        const block = (selector) => {
            const m = new RegExp(`^${escRe(selector)}\\s*\\{`, "m").exec(css);
            if (!m) return null;
            const start = m.index + m[0].length;
            const end = css.indexOf("\n}", start);
            return end < 0 ? null : {start, end};
        };
        const lineRe = (name) => new RegExp(`^([ \\t]*${escRe(name)}[ \\t]*:[ \\t]*)([^;]*)(;)`, "m");
        const replaceIn = (b, name, value) => {
            const inner = css.slice(b.start, b.end);
            const m = lineRe(name).exec(inner);
            if (!m) return false;
            css = css.slice(0, b.start) + inner.slice(0, m.index) + m[1] + value + m[3] +
                inner.slice(m.index + m[0].length) + css.slice(b.end);
            return true;
        };

        for (const e of plan()) {
            if (e.from) {
                const src = block(e.from);
                if (src) {
                    const inner = css.slice(src.start, src.end);
                    const m = new RegExp(`^[ \\t]*${escRe(e.name)}[ \\t]*:[^;]*;[^\\n]*\\n?`, "m").exec(inner);
                    if (m) css = css.slice(0, src.start) + inner.slice(0, m.index) + inner.slice(m.index + m[0].length) + css.slice(src.end);
                }
            }
            const b = block(e.selector);
            if (!b) {
                missing.push(e.name);
                continue;
            }
            if (replaceIn(b, e.name, e.value)) {
                applied.push(e.name);
            } else if (e.from) {
                css = css.slice(0, b.end) + `\n    ${e.name}: ${e.value};` + css.slice(b.end);
                applied.push(e.name);
                moved.push(e.name);
            } else {
                missing.push(e.name);
            }
        }
        return {css, applied, missing, moved};
    }

    function showModal(text) {
        const area = h("textarea", {readonly: true, spellcheck: "false"});
        area.value = text;
        const modal = h("div", {class: "modal"},
            h("div", {text: "Clipboard unavailable here - select and copy:"}),
            area,
            h("div", {class: "line"}, h("span", {class: "bar__spacer"}),
                h("button", {type: "button", text: "Close", onclick: () => modal.remove()})));
        body.append(modal);
        area.focus();
        area.select();
    }

    async function copyCss() {
        const n = changedCount();
        if (!n) {
            status("Nothing changed yet");
            return;
        }
        const css = buildCss();
        try {
            await navigator.clipboard.writeText(css);
            status(`Copied ${n} change(s) - paste them into styles.css`);
        } catch {
            showModal(css);
        }
    }

    // The picked styles.css is remembered in IndexedDB (a file handle can be
    // stored there, not in localStorage), so it survives the reload every
    // save does - otherwise "asks for the file once" would be every time.
    const idb = (mode, fn) => new Promise((resolve, reject) => {
        const req = indexedDB.open("tweaker", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("kv");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("kv", mode);
            const op = fn(tx.objectStore("kv"));
            tx.oncomplete = () => {
                db.close();
                resolve(op.result);
            };
            tx.onerror = () => reject(tx.error);
        };
    });
    const loadHandle = () => idb("readonly", (s) => s.get("styles-css")).catch(() => null);
    const storeHandle = (handle) => idb("readwrite", (s) => s.put(handle, "styles-css")).catch(() => {});
    const forgetHandle = () => idb("readwrite", (s) => s.delete("styles-css")).catch(() => {});

    let fileHandle = null;

    async function saveToFile() {
        const n = changedCount();
        if (!n) {
            status("Nothing changed yet");
            return;
        }
        try {
            if (!fileHandle) fileHandle = (await loadHandle()) || null;
            if (fileHandle) {
                // A remembered handle needs its write permission confirmed
                // again after a reload (one click in the browser's prompt).
                let perm = await fileHandle.queryPermission({mode: "readwrite"});
                if (perm !== "granted") perm = await fileHandle.requestPermission({mode: "readwrite"});
                if (perm !== "granted") {
                    status("No permission to write the file - nothing written");
                    return;
                }
            } else {
                [fileHandle] = await window.showOpenFilePicker({
                    id: "tweaker-styles",
                    types: [{description: "Stylesheet", accept: {"text/css": [".css"]}}],
                });
                storeHandle(fileHandle);
            }
            if (fileHandle.name !== "styles.css" &&
                !confirm(`You picked ${fileHandle.name}, not styles.css. Write into it anyway?`)) {
                fileHandle = null;
                forgetHandle();
                return;
            }
            const text = await (await fileHandle.getFile()).text();
            if (!/^:root\s*\{/m.test(text) || !/^\[data-theme="dark"\]\s*\{/m.test(text)) {
                status(`${fileHandle.name} doesn't look like this site's styles.css - nothing written`);
                fileHandle = null;
                forgetHandle();
                return;
            }
            const result = patchCss(text);
            if (!result.applied.length) {
                status("None of the changed tokens were found in that file - nothing written");
                return;
            }
            const msg = [`Write ${result.applied.length} change(s) into ${fileHandle.name}? The page reloads afterwards.`];
            if (result.moved.length) msg.push(`Moved to the shared [data-theme] block (they read a per-theme color): ${result.moved.join(", ")}`);
            if (result.missing.length) msg.push(`Not found in the file, left as tweaks: ${result.missing.join(", ")}`);
            if (overrides.dark["--bg-base"]) msg.push(`Dark page background changed - also update by hand: ${BG_MIRRORS}.`);
            if (plan().some((e) => e.spec)) msg.push("Some of these are also set in site-spec.json → theme, which wins on the live site.");
            if (!confirm(msg.join("\n\n"))) return;

            const writable = await fileHandle.createWritable();
            await writable.write(result.css);
            await writable.close();

            // Refresh the HTTP cache so the reload really gets the new file;
            // on reload the saved tweaks match styles.css and drop away.
            if (stylesHref) await fetch(stylesHref, {cache: "reload"}).catch(() => {});
            status("Saved to styles.css - reloading…", true);
            setTimeout(() => location.reload(), 400);
        } catch (err) {
            if (err && err.name === "AbortError") return; // picker cancelled
            console.warn("[tweaker] save failed:", err);
            status(`Couldn't save: ${err && err.message ? err.message : err}`);
            // The file may have been moved or deleted - pick it again next time.
            fileHandle = null;
            forgetHandle();
        }
    }

    /* -- theme, compare, collapse, hide, drag, resize -- */

    function toggleTheme() {
        const toggle = document.getElementById("themeToggle");
        if (toggle) toggle.click();
        else document.body.setAttribute("data-theme", activeTheme() === "dark" ? "light" : "dark");
    }

    function syncTheme() {
        const theme = activeTheme();
        themeBtn.textContent = theme === "dark" ? "☾ Dark" : "☀ Light";
        root.querySelectorAll(".sec__cols [data-col]").forEach((s) => {
            s.classList.toggle("is-active", s.dataset.col === theme);
        });
        repaintChips(); // shared colors that follow a theme color change with it
        syncFrames(); // previews switch theme with the page
    }

    new MutationObserver(syncTheme).observe(document.body, {attributes: true, attributeFilter: ["data-theme"]});

    // Hold ⇆ to switch the overrides off and see styles.css as it is.
    const compare = (on) => {
        comparing = on;
        if (styleEl.sheet) styleEl.sheet.disabled = on;
        compareBtn.classList.toggle("primary", on);
        syncFrames();
        window.dispatchEvent(new Event("resize"));
        resizeFrames();
    };
    compareBtn.addEventListener("pointerdown", (e) => {
        compareBtn.setPointerCapture(e.pointerId);
        compare(true);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) =>
        compareBtn.addEventListener(type, () => compare(false)));

    function toggleCollapsed() {
        ui.collapsed = !ui.collapsed;
        syncCollapsed();
        saveUi();
    }

    function syncCollapsed() {
        panel.classList.toggle("is-collapsed", ui.collapsed);
        collapseBtn.textContent = ui.collapsed ? "▢" : "–";
        collapseBtn.title = ui.collapsed ? "Expand" : "Collapse";
        if (ui.collapsed) {
            closePopover();
            closeMenu();
        }
        layoutPreview();
    }

    function toggleHidden() {
        const hide = host.style.display !== "none";
        host.style.display = hide ? "none" : "";
        if (hide) {
            closePopover();
            closeMenu();
            clearHighlight();
        }
    }

    function placePanel(x, y) {
        const r = panel.getBoundingClientRect();
        ui.x = clamp(x, 0, window.innerWidth - r.width);
        ui.y = clamp(y, 0, window.innerHeight - 40);
        Object.assign(panel.style, {
            left: `${ui.x}px`,
            top: `${ui.y}px`,
            // Room left below the panel's top edge - a long list scrolls
            // inside it instead of pushing the footer off the screen.
            maxHeight: `${Math.max(160, window.innerHeight - ui.y - 16)}px`,
        });
        layoutPreview(); // previews use the space beside the panel
    }

    bar.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest("button")) return;
        const r = panel.getBoundingClientRect();
        const dx = e.clientX - r.left;
        const dy = e.clientY - r.top;
        bar.setPointerCapture(e.pointerId);
        closePopover();
        const move = (ev) => placePanel(ev.clientX - dx, ev.clientY - dy);
        const up = () => {
            bar.removeEventListener("pointermove", move);
            bar.removeEventListener("pointerup", up);
            bar.removeEventListener("pointercancel", up);
            // Snap to a screen edge when dropped near it.
            const pr = panel.getBoundingClientRect();
            if (pr.left < 40) placePanel(16, ui.y);
            else if (window.innerWidth - pr.right < 40) placePanel(window.innerWidth - pr.width - 16, ui.y);
            saveUi();
        };
        bar.addEventListener("pointermove", move);
        bar.addEventListener("pointerup", up);
        bar.addEventListener("pointercancel", up);
    });
    bar.addEventListener("dblclick", (e) => {
        if (!e.target.closest("button")) toggleCollapsed();
    });
    window.addEventListener("resize", () => {
        if (ui.x !== null) placePanel(ui.x, ui.y);
    });

    // The panel's width is user-resizable (bottom-right corner); remember it.
    let widthTimer = 0;
    new ResizeObserver(() => {
        if (ui.collapsed) return;
        const w = Math.round(panel.getBoundingClientRect().width);
        if (w === ui.w) return;
        ui.w = w;
        // Widening a panel that sits at the right edge must not push it off screen.
        if (ui.x !== null) placePanel(ui.x, ui.y);
        clearTimeout(widthTimer);
        widthTimer = setTimeout(saveUi, 300);
    }).observe(panel);

    /* -- phone / tablet preview -- */

    // Each device is a real <iframe> of this page at the device's CSS size
    // (so media queries, the mobile menu and header-fit all behave as on the
    // device), scaled down to fit next to the panel. Loaded without ?tweak,
    // so no panel inside; the overrides sheet is copied in from here.
    const DEVICES = {
        phone: {label: "Phone", w: 390, h: 844},
        tablet: {label: "Tablet", w: 820, h: 1180},
    };
    const PREVIEW_MODES = {phone: ["phone"], tablet: ["tablet"], both: ["phone", "tablet"]};
    let frames = []; // {iframe, screen, cap, d}
    let comparing = false;

    function previewUrl() {
        const url = new URL(location.href);
        url.searchParams.delete("tweak");
        return url.href;
    }

    const frameDoc = (f) => {
        try {
            return f.iframe.contentDocument;
        } catch {
            return null; // not same-origin (shouldn't happen) - leave it alone
        }
    };

    // Copy the overrides and the current theme into every frame.
    function syncFrames() {
        for (const f of frames) {
            const doc = frameDoc(f);
            if (!doc || !doc.head) continue;
            let el = doc.getElementById("tweaker-overrides");
            if (!el) {
                el = doc.createElement("style");
                el.id = "tweaker-overrides";
                doc.head.append(el);
            }
            if (el.textContent !== styleEl.textContent) el.textContent = styleEl.textContent;
            if (el.sheet) el.sheet.disabled = comparing;
            if (doc.body && doc.body.getAttribute("data-theme") !== activeTheme()) {
                doc.body.setAttribute("data-theme", activeTheme());
            }
        }
    }

    function resizeFrames() {
        for (const f of frames) {
            try {
                f.iframe.contentWindow.dispatchEvent(new Event("resize"));
            } catch {
                // frame not ready
            }
        }
    }

    function layoutPreview() {
        if (!frames.length) return;
        const W = window.innerWidth;
        const H = window.innerHeight;
        const pr = panel.getBoundingClientRect();
        // Use the side of the screen the panel isn't on.
        const panelOnRight = pr.left + pr.width / 2 > W / 2;
        const left = panelOnRight ? 16 : Math.min(W - 216, pr.right + 16);
        const right = panelOnRight ? Math.max(216, pr.left - 16) : W - 16;
        const top = 52;
        const capH = 24;
        const gap = 24;
        const areaW = Math.max(200, right - left);
        const areaH = Math.max(200, H - 16 - top - capH);
        const sumW = frames.reduce((s, f) => s + f.d.w, 0) + gap * (frames.length - 1);
        const maxH = Math.max(...frames.map((f) => f.d.h));
        const scale = Math.min(1, areaW / sumW, areaH / maxH);

        Object.assign(previewBar.style, {left: `${left}px`, width: `${areaW}px`});
        Object.assign(previewStage.style, {left: `${left}px`, width: `${areaW}px`, top: `${top}px`, gap: `${gap}px`});
        for (const f of frames) {
            f.screen.style.width = `${Math.round(f.d.w * scale)}px`;
            f.screen.style.height = `${Math.round(f.d.h * scale)}px`;
            f.iframe.style.transform = `scale(${scale})`;
            f.cap.textContent = `${f.d.label} · ${f.d.w} × ${f.d.h} · ${Math.round(scale * 100)}%`;
        }
    }

    function renderPreviewBar() {
        const mode = ui.previewMode;
        const seg = (key, text) => h("button", {
            type: "button", class: key === mode ? "primary" : "", text,
            "aria-pressed": String(key === mode),
            onclick: () => setPreview(key),
        });
        previewBar.replaceChildren(
            seg("phone", "Phone"), seg("tablet", "Tablet"), seg("both", "Both"),
            h("span", {class: "preview__sep"}),
            h("button", {type: "button", text: "↻ Reload", title: "Reload the previews (e.g. after a content change)", onclick: () => setPreview(mode)}),
            h("button", {type: "button", text: "✕ Close", title: "Close the preview (Esc)", onclick: () => setPreview(null)}));
    }

    // setPreview("phone" | "tablet" | "both") opens / switches; null closes.
    function setPreview(mode) {
        previewStage.replaceChildren();
        frames = [];
        ui.previewOn = !!mode;
        if (mode) ui.previewMode = mode;
        saveUi();
        previewEl.hidden = !mode;
        previewBtn.classList.toggle("primary", !!mode);
        if (!mode) return;

        closePopover();
        clearUsage();
        clearHighlight();
        renderPreviewBar();
        const url = previewUrl();
        for (const key of PREVIEW_MODES[mode]) {
            const d = DEVICES[key];
            const iframe = h("iframe", {src: url, title: `${d.label} preview`, width: d.w, height: d.h});
            iframe.style.width = `${d.w}px`;
            iframe.style.height = `${d.h}px`;
            // Re-sync once the page is in (its engine sets the theme on boot).
            iframe.addEventListener("load", () => {
                syncFrames();
                setTimeout(syncFrames, 300);
            });
            const screen = h("div", {class: "device__screen"}, iframe);
            const cap = h("div", {class: "device__cap"});
            previewStage.append(h("div", {class: "device"}, screen, cap));
            frames.push({iframe, screen, cap, d});
        }
        layoutPreview();
    }

    function togglePreview() {
        setPreview(ui.previewOn ? null : ui.previewMode || "both");
    }

    /* -- closing popovers / menus -- */

    root.addEventListener("pointerdown", (e) => {
        const path = e.composedPath();
        if (popState && !path.includes(pop) && !path.some((el) => el.classList && el.classList.contains("chip"))) closePopover();
        if (menuOpen && !path.includes(menu) && !path.includes(presetsBtn) && !path.includes(helpBtn)) closeMenu();
    });
    document.addEventListener("pointerdown", (e) => {
        if (e.composedPath().includes(host)) return;
        closePopover();
        closeMenu();
    }, true);
    list.addEventListener("scroll", closePopover, {passive: true});

    /* -- keyboard -- */

    const isTyping = (e) => {
        const el = e.composedPath()[0];
        if (!(el instanceof HTMLElement)) return false;
        if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
        if (el.tagName === "INPUT") return !/^(range|checkbox|color|button|radio)$/.test(el.type);
        return false;
    };

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && (popState || menuOpen)) {
            closePopover();
            closeMenu();
            return;
        }
        if (e.key === "Escape" && ui.previewOn && host.style.display !== "none") {
            setPreview(null);
            return;
        }
        if (isTyping(e)) return;
        const mod = e.ctrlKey || e.metaKey;
        if (mod && !e.altKey && e.key.toLowerCase() === "z") {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
        } else if (mod && !e.altKey && e.key.toLowerCase() === "y") {
            e.preventDefault();
            redo();
        } else if (e.key === "`" && !mod && !e.altKey) {
            e.preventDefault();
            toggleHidden();
        }
    }, true);

    /* -- hover a row → outline where that token is used -- */

    let usageTimer = 0;
    let usesTargets = [];
    let usesLabel = "";

    // The token plus every token that reads it, directly or through others
    // (--accent → --accent-soft → --menu-hover-bg).
    function dependentsOf(name) {
        const all = new Set([name]);
        let grew = true;
        while (grew) {
            grew = false;
            for (const t of tokens.values()) {
                if (all.has(t.name)) continue;
                const reads = SCOPES.some((s) => {
                    const v = overrides[s][t.name] ?? t.base[s];
                    return !!v && [...v.matchAll(VAR_RE)].some((m) => all.has(m[1]));
                });
                if (reads) {
                    all.add(t.name);
                    grew = true;
                }
            }
        }
        return all;
    }

    const inView = (r) => r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;

    function placeUsage() {
        const boxes = usesLayer.children;
        while (boxes.length < usesTargets.length) usesLayer.append(h("div", {class: "uses"}));
        while (boxes.length > usesTargets.length) usesLayer.lastChild.remove();
        let tagAt = null;
        usesTargets.forEach((el, i) => {
            const r = el.getBoundingClientRect();
            Object.assign(boxes[i].style, {left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`});
            if (!tagAt && inView(r)) tagAt = r;
        });
        usesTag.hidden = !tagAt;
        if (tagAt) {
            usesTag.textContent = usesLabel;
            Object.assign(usesTag.style, {
                left: `${clamp(tagAt.left, 4, window.innerWidth - 200)}px`,
                top: `${tagAt.top > 24 ? tagAt.top - 21 : tagAt.top + 2}px`,
            });
        }
    }

    function showUsage(name) {
        if (hoverEl) return; // an Alt-hover on the page owns the outlines right now
        if (ui.previewOn) return; // the page is behind the preview - nothing to outline
        const names = dependentsOf(name);
        const found = new Set();
        for (const u of usage) {
            if (u.media.length && !u.media.every((mq) => mq.matches)) continue;
            if (![...u.refs].some((r) => names.has(r))) continue;
            for (const sel of u.selectors) {
                try {
                    document.querySelectorAll(sel).forEach((el) => found.add(el));
                } catch {
                    // selector the stripping made invalid - ignore
                }
            }
        }

        let visible = [...found].filter((el) => {
            if (el === host || host.contains(el)) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0; // hidden tabs, closed drawer
        });
        // html/body outline the whole page - only show them when nothing else uses it.
        const specific = visible.filter((el) => el !== document.body && el !== document.documentElement);
        if (specific.length) visible = specific;

        usesTargets = visible.slice(0, MAX_OUTLINES);
        const shown = visible.filter((el) => inView(el.getBoundingClientRect())).length;
        usesLabel = `${labelFor(name)} · ${visible.length}` + (shown < visible.length ? ` (${visible.length - shown} below)` : "");
        placeUsage();
        if (!visible.length) status(`${labelFor(name)}: not used by anything visible on this tab`);
        else if (!shown) status(`${labelFor(name)}: used by ${visible.length} element(s), all scrolled out of view`);
    }

    function clearUsage() {
        usesTargets = [];
        usesLayer.replaceChildren();
        usesTag.hidden = true;
    }

    /* -- Alt + hover / Alt + click on the page -- */

    function expandRefs(names) {
        const all = new Set(names);
        const queue = [...names];
        while (queue.length) {
            const t = tokens.get(queue.pop());
            if (!t) continue;
            for (const scope of SCOPES) {
                const v = overrides[scope][t.name] ?? t.base[scope];
                if (!v) continue;
                for (const m of v.matchAll(VAR_RE)) {
                    if (tokens.has(m[1]) && !all.has(m[1])) {
                        all.add(m[1]);
                        queue.push(m[1]);
                    }
                }
            }
        }
        return all;
    }

    // Tokens the element's own rules use; if none, the nearest ancestor's.
    function tokensFor(el) {
        for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
            const direct = new Set();
            for (const u of usage) {
                if (u.media.length && !u.media.every((mq) => mq.matches)) continue;
                for (const sel of u.selectors) {
                    let hit = false;
                    try {
                        hit = node.matches(sel);
                    } catch {
                        // selector the stripping made invalid - ignore
                    }
                    if (hit) {
                        u.refs.forEach((r) => direct.add(r));
                        break;
                    }
                }
            }
            if (direct.size) return {node, direct, all: expandRefs(direct)};
        }
        return null;
    }

    const inPanel = (e) => e.composedPath().includes(host);
    let hoverEl = null;
    let outlineTarget = null;
    let lastPoint = null;
    let altUsed = false;

    function placeOutline() {
        if (!outlineTarget) return;
        const r = outlineTarget.getBoundingClientRect();
        Object.assign(outline.style, {
            display: "block",
            left: `${r.left}px`,
            top: `${r.top}px`,
            width: `${r.width}px`,
            height: `${r.height}px`,
        });
        outline.classList.toggle("label-inside", r.top < 22);
    }

    function showHighlight(el) {
        clearUsage();
        const found = tokensFor(el);
        outlineTarget = found ? found.node : el;
        outlineLabel.textContent = found
            ? `${describe(found.node)} · ${found.direct.size} token${found.direct.size === 1 ? "" : "s"} · Alt+click to pin`
            : `${describe(el)} · no tokens`;
        placeOutline();

        let first = null;
        for (const {row, t} of rowEls.values()) {
            const strong = !!found && found.direct.has(t.name);
            row.classList.toggle("hl", strong);
            row.classList.toggle("hl-soft", !!found && !strong && found.all.has(t.name));
            if (strong && !first && !row.hidden) first = row;
        }
        if (first && !ui.collapsed) first.scrollIntoView({block: "nearest"});
    }

    function clearHighlight() {
        hoverEl = null;
        outlineTarget = null;
        outline.style.display = "none";
        for (const {row} of rowEls.values()) row.classList.remove("hl", "hl-soft");
    }

    function hoverAt(el) {
        if (!el || el === host || el === hoverEl || ui.previewOn) return;
        hoverEl = el;
        altUsed = true;
        showHighlight(el);
    }

    document.addEventListener("mousemove", (e) => {
        lastPoint = {x: e.clientX, y: e.clientY};
        if (!e.altKey) {
            if (hoverEl) clearHighlight();
            return;
        }
        if (!inPanel(e)) hoverAt(e.target);
    }, true);

    document.addEventListener("keydown", (e) => {
        if (e.key !== "Alt" || !lastPoint || host.style.display === "none") return;
        hoverAt(document.elementFromPoint(lastPoint.x, lastPoint.y));
    }, true);

    document.addEventListener("keyup", (e) => {
        if (e.key !== "Alt") return;
        // Stop Firefox from opening its menu bar after an Alt-hover.
        if (altUsed) e.preventDefault();
        altUsed = false;
        clearHighlight();
    }, true);

    window.addEventListener("blur", clearHighlight);
    const reposition = () => {
        placeOutline();
        placeUsage();
    };
    window.addEventListener("scroll", reposition, {capture: true, passive: true});
    window.addEventListener("resize", reposition);

    document.addEventListener("click", (e) => {
        if (!e.altKey || inPanel(e) || host.style.display === "none") return;
        // Alt+click would otherwise follow links / switch tabs (or download, in Chrome).
        e.preventDefault();
        e.stopPropagation();
        const found = tokensFor(e.target);
        if (!found) {
            status("No tokens on that element");
            return;
        }
        pin = {label: describe(found.node), all: found.all};
        search.value = "";
        if (ui.collapsed) toggleCollapsed();
        list.scrollTop = 0;
        applyView();
    }, true);

    /* -- start -- */

    // Restored tweaks go live first, so swatches of derived colors
    // (color-mix of an overridden accent) paint their current value.
    if (changedCount()) writeOverrides();
    // Left on "Changed" last time, but nothing is changed now (e.g. it was
    // all saved to styles.css): don't open on an empty list.
    else if (ui.tab === "Changed") ui.tab = "Colors";
    panel.style.width = `${clamp(ui.w || 400, 330, Math.min(720, window.innerWidth - 16))}px`;
    renderList();
    syncCollapsed();
    syncUndo();
    if (ui.x !== null && ui.y !== null) placePanel(ui.x, ui.y);
    else placePanel(window.innerWidth - panel.getBoundingClientRect().width - 16, 16);
    if (!PREVIEW_MODES[ui.previewMode]) ui.previewMode = "both";
    if (ui.previewOn) setPreview(ui.previewMode);
    if (changedCount()) status(`Restored ${changedCount()} change(s) from last time`);
}

// Inside one of the tweaker's own phone / tablet preview frames (e.g. the
// demo's "Open" link clicked in there), stay out: the parent panel owns the
// overrides, and a second panel would fight it over the same localStorage.
const inTweakerPreview = () => {
    try {
        return window.parent !== window && !!window.parent.__tweakerLoaded;
    } catch {
        return false; // cross-origin parent - not our preview
    }
};

if (!window.__tweakerLoaded && !inTweakerPreview()) {
    window.__tweakerLoaded = true;
    boot();
}
