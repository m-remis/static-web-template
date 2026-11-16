<!-- Built from m-remis/static-web-template -->

# Engine internals

> Part of the agent docs. Router: `AGENTS.md`.

## What this project is

A static personal/business site, built from a no-build template. **No build
step, no framework, no bundler, no package manager.** It is plain HTML + CSS +
vanilla JS (ES modules) served as files. Do not introduce npm, bundlers,
transpilers, TypeScript, frameworks, or a `package.json` for the *runtime site*.
If a change seems to "need" tooling, it is the wrong change — find the no-build
way to do it. (The `launch-check.js` preflight script is a dev-only tool run by
hand, never loaded by the page, and uses only Node built-ins — see
`LAUNCH-CHECK.md`.)

Fonts (Inter, Oswald) are self-hosted variable woff2 files in `assets/fonts/`,
declared via `@font-face` in `styles.css` and preloaded from `index.html` — no
Google Fonts request (the 404 page gets them from `styles.css` too). The
template ships with **no** external runtime requests beyond the site's own ES
modules; the possible ones a spec/client can introduce are the optional
analytics (a GoatCounter-style `<script>` you add to `index.html`, plus the
footer count fetch when `meta.analytics.countUrl` is set), the Maps embed
iframe, and the YouTube embed iframe (`video` block — served from the
privacy-enhanced `youtube-nocookie.com` host, which sets no cookies until play). `engine.js` is loaded as
`<script type="module">` and imports the shared JSON-LD builder module
(`business-jsonld.mjs`); keep it a module.

## Key functions in `engine.js`

`engine.js` opens with a numbered **section index** (1-30); every section
starts with an `N. TITLE` comment line you can search for. Keep the numbers in
one sequence when adding a section, and add it to the index.

- `init()` (async) — boot: `resolveLocale()` (before anything fetches, so the
  right spec loads) then `await renderSite()`, which does `loadContent()` →
  assign `SITE` → `renderHead()` + `renderJsonLd()` + `renderTheme()` (always,
  so metadata and brand tokens are right even on the error screen) → if no
  usable sections, `renderErrorState()` + minimal init and return; otherwise
  `renderNav()`, `renderContent()`, `renderFooter()`, `initInputMode()`,
  `initTheme()`, `initLang()`, `initMobileMenu()`, `initHeaderFit()`,
  `initTabs()`, and `initBackground()`. The boot body runs inside a
  `try { … } finally { reveal() }`: the shell starts hidden via
  `html.site-booting` (set inline in `index.html` to avoid a flash of the empty
  layout), and `reveal()` swaps it to `site-ready` on **every** exit path
  (normal render and the error-screen return). A `<noscript>` block in
  `index.html` force-shows the page if JS never runs, so the booting class can
  never permanently hide it.
- `loadContent(url?)` / `fetchSpec()` / `warmLocale()` — fetch + parse a spec;
  returns `{data, error}` with `error.kind` of `fetch` / `parse`; never throws.
  `loadContent()` is the cached front door (`SPEC_CACHE`, keyed by URL, session-
  scoped, successes only, in-flight promises shared); `fetchSpec()` is the raw
  request behind it. `warmLocale()` primes a locale's spec ahead of need —
  `initLang()` calls it for every other locale at load + idle (and on dropdown
  hover/open as a backstop) so the swap itself never waits on the network. Defaults to the active locale's URL, so boot is unchanged.
- `getSections()` — the normalized, guarded ordered section list. Drops entries
  without an `id`. Every render path and the tab logic go through it, so a
  missing/empty `sections` degrades to the empty/error state instead of throwing.
- `navItems()` — derives the tab list from `getSections()` (id + label).
- Builders: `buildHero`, `buildText`, `buildCards`, `buildLinks`, `buildMap`,
  `buildTable`, `buildCarousel` (slideshow), `buildGallery`, `buildPhoto`,
  `buildHours`, `buildFaq`, `buildReview`, `buildVideo`, plus `buildSocials`
  (header/drawer socials).
- Dispatch: `BLOCK_RENDERERS`, `renderBlock()`,
  `buildSection()`, `renderContent()`. `renderContent()` also runs the image
  priority pass: builders mark each carousel/gallery's first image `eager`,
  but only the initially-shown panel keeps that (its first image gets
  `fetchpriority="high"` — the likely LCP element); hidden panels are demoted
  to `lazy` before insertion and re-fetched into the HTTP cache after `load`
  by `warmUpImages()` (skipped under Save-Data), so tab switches stay instant
  without the hidden tabs' images competing with the visible one at boot.
  `warmUpIframes()` does the same for hidden tabs' lazy embeds (map, video):
  after load+idle it flips their `loading` to `eager`, so the Maps/YouTube
  player loads in the background instead of on first tab open. It also parks
  the panel off-screen (`.is-warming`) for the duration — see the embed
  warm-up gotcha in `docs/gotchas.md`, that part is load-bearing.
  The same image is preloaded from `index.html` via a GENERATED
  `<link rel="preload" data-preload="lcp">` stamped by `generate-static.mjs`,
  so its download starts at HTML-parse time, before the engine runs.
- `renderHead()` — writes `<head>` metadata from `SITE.meta` (see
  `docs/spec-format.md`).
- `renderTheme()` — writes `SITE.theme` brand tokens (`accent`, `rootScale`,
  `contentWidth`, `radius`, `fontSans`, `fontHeading`, `fontBrand`,
  `socialColors`) as `:root` CSS custom properties; omitted tokens keep their
  `styles.css` defaults.
- `renderJsonLd()` — upserts a schema.org `Store` JSON-LD script into
  `<head>` from `SITE.business` + `SITE.meta` + `brand` + `socials` +
  flagged tables. Hours in `H:MM–H:MM`
  form become `openingHoursSpecification` entries; free-form values
  ("Closed") are skipped. Also emitted when the spec provides them:
  `geo` (from `business.geo`), `sameAs` (external `socials` URLs),
  `priceRange`, `areaServed`, `taxID` (DIČ) + an IČO `identifier`, and
  `hasOfferCatalog` — every table block flagged `offerCatalog: true`
  becomes an `OfferCatalog` of `Offer`s (first cell = service name, last
  cell = price: `"12 €"` → price+EUR, `"35 €/hod"` → a
  `UnitPriceSpecification`, `"dohodou"` → offer without price);
  `currenciesAccepted: "EUR"` rides along when any offer states a price.
  Built by the pure `buildBusinessJsonLd(site)`,
  which lives in `business-jsonld.mjs` — SHARED with `generate-static.mjs`,
  which stamps the same object statically into `index.html` for crawlers
  that don't run JS. The runtime upserts that same tag (matched by its
  `data-jsonld` marker), so browsers always end with the fresh value and
  the two copies can't drift (launch-check fails when the static one is
  stale).
- `renderNav()` — builds `.brand-wrap` (brand + optional socials),
  the desktop ARIA tablist, the mobile nav, and a second socials copy in the
  drawer.
- `renderErrorState(reason)` — the calm "temporarily unavailable" screen with a
  contact escape hatch (from `socials`, if any survived) and a collapsed
  `<details>` with the technical reason for the maintainer.
- `initTheme()` / `applyTheme()` — dark-default theme toggle + `localStorage`.
  The toggle flips the whole page in one frame: it sets `html.theme-switching`
  (which turns every transition off), applies the theme, flushes styles, then
  removes the class - see `docs/theming.md`.
- `resolveLocale()` / `t()` / `currentSpecUrl()` / `initLang()` /
  `switchLocale()` / `applyChromeStrings()` — the i18n layer: pick the locale
  from `localStorage`, resolve chrome strings, pick the locale's spec file, wire
  the header language switch, and swap language by re-rendering in place rather
  than reloading (see `docs/i18n.md`).
- `renderSite(loaded?)` — one full render from the active locale's spec:
  fetch → head/JSON-LD/theme → nav/content/footer → all the `init*` wiring (or
  the error screen). Called by `init()` on boot and by `switchLocale()` for a
  language change, so it must stay safe to run twice; the optional `loaded`
  argument is a pre-resolved `loadContent()` result, which is how the swap
  runs teardown and render back to back in one frame, with no fetch between.
- `on()` / `onTeardown()` / `teardownSite()` — the render lifecycle registry
  (section 3). Every listener and timer that would outlive a render is
  installed through these so the next render starts clean; see "Re-rendering in
  place" in this file — this is a rule, not a convenience.
- `initTabs()` — section-as-tab switching, hash routing, keyboard arrows on the
  desktop tablist, and scroll-position control (see the scroll gotcha in
  `docs/gotchas.md`).
- `initMobileMenu()` — frosted drawer; injects its own close (`×`) button,
  scrim, Escape-to-close, close-on-link-tap, and auto-close when resized up to
  desktop.
- `initHeaderFit()` — measures the header row and switches to mobile mode when
  the left cluster and the nav would touch (see "Header fit" in this file).
  When the header grows back to desktop mode with the drawer still open, it
  closes the drawer by clicking `#menuToggle`, so `initMobileMenu()`'s real
  `close()` runs (inert + focus hand-off) - don't re-implement the close here.
- `initBackground()` — dual-layer crossfading background with Ken Burns drift
  (see "Background" in this file).
- `getLightbox()` — shared image-preview overlay reused by the slideshow, the
  `gallery`, and `photo` (all feed it via `toLightboxSlides()`). It is a native
  modal `<dialog>` opened with `showModal()`: the browser puts it in the top
  layer, makes the page behind inert (focus cannot tab out of it), closes it on
  Escape / back gesture and returns focus to the opener. So it has **no**
  `role`/`aria-modal`, focus trap, Escape handler or focus-restore code - don't
  add them back. `close()` fades out and then calls `dialog.close()`;
  `close({instant: true})` skips the fade.
  `closeLightbox()` is its no-create, instant closer: `show()` in `initTabs()`
  calls it on every tab change (and `switchLocale()` before a swap), because the overlay is page-level and would otherwise
  survive a browser back/forward taken while an image is expanded — floating
  over the newly shown panel with page scroll still locked by `.lightbox-open`.
  The `lightboxApi &&` guard is what keeps the overlay lazy for visitors who
  never open one; don't "simplify" it into `getLightbox().close()`. The overlay
  is also page-level in the other sense — it would outlive a re-render — so it
  registers a teardown that removes the node and nulls `lightboxApi`, letting the
  next open rebuild it with the new locale's labels.
- `renderFooter()` — `© year brand` + footer note, plus an optional visitor
  count when `meta.analytics.countUrl` is set. `renderVisitorCount()` fetches
  the GoatCounter-style JSON count best-effort (any failure leaves the footer
  untouched, never throws). This only *displays* a number; the actual
  *tracking* is a separate analytics `<script>` that the template does not ship
  by default — add one to `index.html` if you want it (see `CLIENT-CHECKLIST.md`).
- Helpers: `$` (querySelector), `el()` (attribute-aware element builder; skips
  `null`/`false`/`undefined` attrs), `isExternalUrl()`, `escapeHtml()`,
  `youtubeVideoId()` / `youtubePlaylistId()` (imported, like `isExternalUrl()`,
  from `business-jsonld.mjs`, where the validator and generator get them too),
  `appendBlockHeader()` (the shared optional name+blurb opener used by the
  table/faq/slideshow/gallery/hours/review builders), `navButton()` (the
  shared ❮/❯ arrow button), `rovingKeydown()` (the shared arrow-key
  tablist handler used by the desktop nav and the carousel dots),
  `initSwipe()` (the shared touch-swipe gesture behind the carousel and the
  lightbox — see the swipe gotcha in `docs/gotchas.md`),
  `whenLoadedAndIdle()` (the shared load+idle scheduler behind both warm-up
  passes), and `contentColumnWidth()` (live content-column pixel width, read
  from `#main` so it can't drift from the CSS).

## Socials

Social links render in two places from the single `SITE.socials` array, both via
`buildSocials()`:

- **Header** (desktop): colored icon + visible label next to the brand, inside
  `.brand-wrap`.
- **Mobile drawer**: a second `buildSocials()` call appends the same links to the
  bottom of `#navMobile`, stacked one per row.

Icons are inline SVGs in the `SOCIAL_ICONS` map in `engine.js` (no icon library
— that would break the no-deps rule). The same map is reused by the `links`
block for the optional leading contact icon. Each SVG uses `currentColor`; the
per-platform `.socials__link--<icon> svg` rule sets the brand tint. `label`
doubles as the `aria-label`, so give each entry a distinct label. To add a
platform: add an SVG to `SOCIAL_ICONS`, add a `.socials__link--<icon> svg
{ color: … }` rule (and, if it'll be used in a contact row, a
`.link-list--<icon> .link-list__icon` rule), then reference the key.

## Re-rendering in place (the teardown registry) — read before adding a listener

The site is rendered **more than once per page load**: `renderSite()` runs on
boot from `init()`, and again on every language switch (`switchLocale()`). That
makes idempotency a hard requirement, in two directions:

1. **Every `render*` function clears what it owns first.** `renderContent()`,
   `renderFooter()` and `initLang()` empty their container; `renderNav()` clears
   both navs, drops the `brand--image` class, and *reuses* an existing
   `.brand-wrap` (a second `brand.replaceWith()` would nest one wrap inside the
   old one). `renderHead()`/`renderJsonLd()` upsert. If you add a render step,
   it must be safe to run twice.
2. **Every listener or timer on a target that outlives a render goes through
   `on()` / `onTeardown()`** — the registry in section 3 of `engine.js`. That
   means `window`, `document`, a `matchMedia` list, and the static shell
   elements `index.html` ships (`#brand`, `#themeToggle`, `#menuToggle`,
   `#navDesktop`, `#navScrim`, `#navMobile`, the `#bg`/`#bg2` layers), plus
   anything page-level the engine creates once (the lightbox overlay, the
   background interval). `teardownSite()` pops them all before the next render.
   A bare `addEventListener` on one of those is the bug this registry exists to
   prevent: it survives the render and you get **two** handlers, so one theme
   click toggles twice, one tab click pushes two history entries, and so on.

Listeners inside `build*` functions need no registration — their nodes are
replaced by the render, so the listeners go with them. Don't add bookkeeping
there.

Two teardown details that are load-bearing, both found by breaking them:

- **A teardown must *finish* a pending transition, not just cancel it.** The
  drawer's `close()` hides the scrim on a 220ms delay, and closing the drawer is
  the first thing a swap does — so the teardown lands inside that window. The
  scrim is `position: fixed; inset: 0` with **no** `pointer-events: none`; it
  only stops covering the page once `hidden` is set. Cancelling that timer
  without also setting `hidden` leaves an invisible sheet over the new render
  swallowing every click.
- **`initBackground()` adopts the running background instead of restarting it.**
  It reads which layer carries `.is-active` and which list entry it shows, and
  only calls `show()` when nothing is painted yet. Restarting would crossfade
  the background on a language switch for no reason — or dip it to black while
  re-fading the image that was already up. Its in-flight `Image.onload`
  callbacks check a `stopped` flag the teardown trips, so the previous render's
  loads can't paint over the new one.

## Header fit (left cluster ↔ nav collision) — don't "simplify" this

The header packs the left cluster (brand + socials), the desktop nav,
and the toggles onto one row. CSS can't detect when two flex items are about to
touch, so `initHeaderFit()` measures it: it reads the gap between the rightmost
item in the left cluster and the first nav tab (`getBoundingClientRect()`), and
when that gap drops below `BUFFER` px it adds `.force-mobile-nav` to the header.
That class hides the desktop nav AND the header socials and shows the hamburger;
the socials remain reachable in the drawer. Growing the window back removes it.

Things that must stay consistent or this breaks:

- The left cluster keeps its natural width — `.brand-wrap` is `flex: none` and
  `.socials` has **no** `overflow: hidden` / shrink. Clipping or shrinking the
  socials would hide the collision from the measurement so the switch never
  fires. Don't add it.
- The rightmost-edge element is the last social link when socials exist, else
  `brandWrap.lastElementChild` (so header-fit still works with zero socials).
  Keep that fallback.
- `.force-mobile-nav` and the `@media (max-width: 640px)` block are parallel
  triggers for the same mobile mode (CSS can't `@media` on a class). Both hide
  `.nav-desktop` and `.brand-wrap .socials` and show `.menu-toggle` — keep them
  in sync.
- `BUFFER` is the one dial for how early/late it flips. Don't replace the
  geometry measurement with a guessed pixel breakpoint; the point is that it
  reacts to real layout (font loading, label lengths, nav contents). The measure
  re-runs on resize and once `document.fonts.ready` resolves.

## Background (dual-layer crossfade)

`index.html` has two layers, `#bg` and `#bg2`. `initBackground()` preloads each
image, sets it on the back layer, then crossfades by toggling `.is-active`
(opacity), cycling through `SITE.backgrounds` in order on a timer (`HOLD`). Each
active layer runs the `bg-drift` Ken Burns zoom. With only one layer present it
degrades to a single static image; missing image files fail silently to the
plain background. `prefers-reduced-motion` disables the drift.
