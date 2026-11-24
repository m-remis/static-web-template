<!-- Built from m-remis/static-web-template -->

# Theming

> Part of the agent docs. Router: `AGENTS.md`.

## Theming (single source of truth)

Colors live only in `styles.css` under `[data-theme="dark"]` and
`[data-theme="light"]`, grouped by comment: Backgrounds, Text, Menu / nav,
Accents & lines, Background-image overlay & header, and Monochrome icon/logo
inversion. Tokens that are identical in both themes (brand tints, the
on-image/lightbox controls, `--panel-blur`) are defined once in `:root` -
unless their value reads a per-theme token (`--focus-ring`, the tab border /
indicator color, `--tab-active-bg` all read `--accent` or `--border`): those
are defined once in the shared `[data-theme]` block right after the two theme
blocks, because a `var()` inside a custom property resolves where it is
declared and the per-theme tokens only exist on `<body>`.
(One override layer sits on top: the optional spec-level `theme` object, whose
brand tokens `renderTheme()` writes as `:root` vars at boot - see the spec
shape in `docs/spec-format.md`. Structural colors still live only in `styles.css`.)
There is intentionally **no duplication**:

- `404.html` loads `styles.css`, so the 404 page re-themes automatically. Do
  not re-add color variables to `404.css` - keep it layout-only.
- The browser `theme-color` meta is read from the `--bg-base` token at runtime
  (in `applyTheme()` in `engine.js`, and inline in `404.html`). Do not hardcode
  hex for it. Note `meta.themeColor` in `site-spec.json` is the *initial/static*
  value `renderHead()` writes; `applyTheme()` then keeps it in sync with the
  active theme's `--bg-base`.

Three fonts are tokenized: `--font-sans` (Inter, body), `--font-serif` (Oswald,
headings - bold/condensed/uppercase), and `--font-brand` (system serif; the
brand renders as an image via `brandImage`, so no webfont is loaded for it and
it only shows on the error screen's text fallback). When adding a color, add a
named variable to
**both** theme blocks rather than inlining a hex in a rule.

**Theme default:** dark. `initTheme()` uses the stored `localStorage` choice if
present, else falls back to dark. (It does **not** follow the OS
`prefers-color-scheme` - that's intentional in this build.) `404.html` mirrors
the same dark-default + stored-pref logic inline.

**Exceptions - brand colors (NOT theme tokens).** Per-platform brand colors
are identical in light and dark mode, so they live once in `:root` as
`--brand-<key>` tokens (`--brand-instagram`, `--brand-youtube`,
`--brand-spotify`, `--brand-phone`, `--brand-email`, `--brand-linkedin`), and a
spec can override them through `theme.socialColors`. Two sets of rules consume
them:

- Header/drawer socials: `.socials__link--<icon> svg { color: var(--brand-<icon>) }`.
- Contact-row icons (the `links` block): `.link-list--<icon> .link-list__icon
  { color: var(--brand-<icon>) }`, applied via the `link-list--<icon>` class
  that `buildLinks()` puts on each `<a>` from the item's `icon` field.

GitHub is the one exception to the exception: its mark is monochrome, so both
rules use `var(--text)` and it follows the theme. Contact-row tints are
deliberately **kept on hover** - there is no hover->accent rule on contact
icons. Don't reintroduce one.

**Browser-drawn UI follows `color-scheme`.** The root scrollbar (always visible,
because `html` reserves its gutter), form controls and the canvas painted
before the stylesheet arrives are drawn by the browser, not by our tokens. So
`html` declares `color-scheme: dark`, `html:has(body[data-theme="light"])`
switches it to `light`, and `index.html` / `404.html` carry
`<meta name="color-scheme" content="dark light">` for the first paint. Keep the
three in step if the default theme ever changes.

**The theme switch is instant.** Components have their own color / border /
background transitions for hover feedback; if those ran during a theme change
the page would ripple at different speeds. The toggle therefore sets
`html.theme-switching` (one rule: `transition: none !important` on everything)
for the single moment `data-theme` changes. Don't add a "smooth" theme
transition to an individual component - it would be the one element lagging
behind the rest.

**Background motion and header tabs are tokens too.** The `.bg` layers'
animation is `var(--bg-motion) var(--bg-motion-duration)
var(--bg-motion-easing) infinite var(--bg-motion-direction)`, with the
crossfade in `--bg-fade`; `--bg-motion` names one of the `bg-*` `@keyframes`
(`bg-drift` default, `bg-zoom`, `bg-pan`, `bg-breathe`, `bg-float`) or `none`.
A new motion style is a new `bg-*` keyframes block - start it scaled above 1
so a translate never shows the layer edge. Desktop header tabs take
`--tab-border-width` (0 = no border, the default), `--tab-border-color`
(shared `[data-theme]` block, defaults to `var(--border)`, so it still
follows the theme) and `--tab-radius` (defaults to
`var(--radius-sm)`). The active-tab marker is built from
`--tab-indicator-width` / `-height` / `-radius` / `-top` / `-bottom` (shape and
position, in `:root`) plus `--tab-indicator-color` and the active fill
`--tab-active-bg` (shared `[data-theme]` block). Underline, full-width
underline, short bar, overline, dot, filled pill and none are all just value
combinations - the tweaker has them as presets. Tab hover uses
`--tab-hover-bg` / `--tab-hover-text` (shared `[data-theme]` block), which
default to `var(--menu-hover-bg)` / `var(--menu-text-active)` - change them to
restyle the desktop tabs without touching the mobile drawer, or change the
`--menu-*` tokens to restyle both.

**Live tweaker (`dev/tweaker.js`, dev-only).** Open the site with `?tweak` in the
URL and `init()` imports `dev/tweaker.js`; without the flag it is never fetched.
The panel's own styles are `dev/tweaker.css`, loaded into its Shadow DOM (so
they can't affect the site, and the site's CSS can't affect the panel).
It discovers tokens by reading the `:root`, shared `[data-theme]`,
`[data-theme="dark"]` and `[data-theme="light"]` blocks in `styles.css`, so a
new token shows up in the panel automatically. The tables at the top of the
file decide the rest: `GROUPS` (which tab and section a token lands in),
`LABELS` (plain-language names - a token without one gets a name made from
its token name, so add an entry when you add a token), `RANGES` (slider
limits), `ENUMS` (dropdowns) and `GROUP_PRESETS` (one-click looks per section).

Edits go into one injected `<style id="tweaker-overrides">` with
`!important`, persist in `localStorage`, and only show in `?tweak` mode. They
reach the real site in one of two ways:

- **Save to styles.css** (Chrome / Edge - File System Access API): asks for
  the file once per session, shows what it will write, rewrites each changed
  token line in place (indentation and comments kept), then refreshes the
  cache and reloads; saved tweaks match `styles.css` after the reload and drop
  out of the changed list. A `:root` token whose new value reads a per-theme
  token is moved to the shared `[data-theme]` block automatically. Firefox has
  no file-writing API, so the button is hidden there.
- **Copy CSS**: the same changes as CSS blocks for pasting by hand.

Either way, Workflow D still applies (the dark `--bg-base` mirrors are not
written for you - the tool reminds you), and a token also set by
`site-spec.json → theme` is flagged because the spec value wins.

The UI: tabs (Colors, Layout, Type, Tabs, Motion, All, and Changed while
anything is changed); colors are one line each with a ☾ and a ☀ swatch -
clicking one switches the page to that theme (optional, in ?) and opens a
popover with picker, hex, opacity, "Same as" another color (a `var()` link)
and reset. Linked non-color values (e.g. tab roundness = small roundness) show
dimmed with "= <label>" and become their own value when edited; ↺ relinks.
Section presets sit in the section header. Presets menu: save / load / delete
named looks, import / export `.json`, reset all (also the ↺ next to the
orange change count in the header). 📱 opens a phone (390 × 844) and / or
tablet (820 × 1180) preview: real same-origin iframes of the page without
`?tweak`, scaled to fit beside the panel, with the overrides sheet and the
theme copied in live (hover outlines and the Alt tools pause while it is
open, since they work on the main page). Undo / redo (Ctrl+Z /
Ctrl+Shift+Z; a slider drag is one step), hold ⇆ to see the original, `
hides the panel; drag the header to move (snaps to the screen edges), drag
the bottom-right corner to resize. Hovering a row outlines every visible
element using the token (directly or through a token built from it) with a
count; Alt + hover the page highlights the rows for that element's tokens;
Alt + click pins the list to them.

**Frosted panels.** The blur behind every translucent surface is declared once,
in the grouped "Frosted panels" rule near the top of `styles.css` (with the
`-webkit-` prefix older Safari needs). A new frosted surface is added to that
selector list, not given its own `backdrop-filter` pair.
