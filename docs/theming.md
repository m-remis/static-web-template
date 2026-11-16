<!-- Built from m-remis/static-web-template -->

# Theming

> Part of the agent docs. Router: `AGENTS.md`.

## Theming (single source of truth)

Colors live only in `styles.css` under `[data-theme="dark"]` and
`[data-theme="light"]`, grouped by comment: Backgrounds, Text, Menu / nav,
Accents & lines, Background-image overlay & header, and Monochrome icon/logo
inversion. Tokens that are identical in both themes (brand tints, the
on-image/lightbox controls, `--panel-blur`) are defined once in `:root`.
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

**Frosted panels.** The blur behind every translucent surface is declared once,
in the grouped "Frosted panels" rule near the top of `styles.css` (with the
`-webkit-` prefix older Safari needs). A new frosted surface is added to that
selector list, not given its own `backdrop-filter` pair.
