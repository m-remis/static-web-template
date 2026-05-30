# AGENTS.md

Guidance for AI coding agents working in this repository. Humans should read
`README.md` instead; this file exists so an agent can make correct changes
without rediscovering the structure each time.

## What this project is

A static personal/company site template. **No build step, no framework, no
dependencies, no package manager.** It is plain HTML + CSS + vanilla JS served
as files. Do not introduce npm, bundlers, transpilers, TypeScript, frameworks,
or a `package.json`. If a change seems to "need" tooling, it is the wrong
change — find the no-build way to do it.

## The golden rule

Almost every content change goes in **one place**: the `SITE` object at the top
of `script.js` (marked `◀━━ EDIT THIS BLOCK`). The HTML is an empty shell;
sections are rendered from `SITE` by JS. Before editing markup or CSS, check
whether the request is actually a `SITE` edit.

- Change brand, headings, body text, projects, contact, map, background list
  → edit `SITE`. Do **not** hardcode this content into `index.html`.
- Change colors/theme → edit the token blocks in `styles.css` (see below).
- Change layout/behavior → edit the relevant render/init function in
  `script.js` or the matching CSS rule.

## File map

| File                                            | Role                                                  | Edit when                      |
|-------------------------------------------------|-------------------------------------------------------|--------------------------------|
| `script.js`                                     | `SITE` content object (top) + all UI logic            | content, behavior              |
| `styles.css`                                    | All styling + the theme token blocks                  | colors, layout                 |
| `index.html`                                    | Shell only; almost no content                         | rarely (meta tags, font links) |
| `404.html` / `404.css`                          | Not-found page; **inherits tokens from `styles.css`** | layout of 404 only             |
| `site.webmanifest`, `sitemap.xml`, `robots.txt` | PWA + SEO                                             | domain/name changes            |
| `assets/`                                       | favicon + `background/` images                        | swapping media                 |

## Theming (single source of truth)

Colors live only in `styles.css` under `[data-theme="dark"]` and
`[data-theme="light"]`, grouped by comment: Backgrounds, Text, Menu / nav,
Accents & lines, and an "advanced" overlay/header group. There is intentionally
**no duplication**:

- `404.html` loads `styles.css`, so the 404 page re-themes automatically. Do
  not re-add color variables to `404.css` — keep it layout-only.
- The browser `theme-color` meta is read from the `--bg-base` token at runtime
  (in `applyTheme` in `script.js`, and inline in `404.html`). Do not hardcode
  hex values for it.

When adding a color, add a named CSS variable to **both** theme blocks rather
than inlining a hex value in a rule. If a thing can't be restyled without
touching multiple selectors, that's a signal to introduce a new variable.

## Content loading

`SITE.dataUrl` (top of `script.js`) is `null` by default → inline content is
used. If set to a URL, `loadContent()` fetches JSON and `deepMerge()`s it over
the inline `SITE` (fetched keys win; omitted keys fall back; arrays replace
wholesale). On fetch failure it falls back to inline content and warns — never
let it throw or blank the page. Preserve this fallback behavior.

## Key functions in `script.js`

- `init()` (async) — boot: merges content, then renders + wires everything.
- `renderNav()`, `renderContent()`, `cardSection()`, `buildLinkList()`,
  `renderFooter()` — build DOM from `SITE`.
- `initTheme()` / `applyTheme()` — theme toggle + `localStorage` persistence.
- `initTabs()` — section-as-tab switching, hash routing, keyboard arrows, and
  scroll-position control (see the scroll gotcha below).
- `initMobileMenu()` — mobile drawer (separate from desktop nav).
- `initBackground()` — picks one random background, fades in, fails silently.

## Sections are semi-generic

Nav items map to section `id`s. Rendering is type-specific: `services` and
`projects` render as card grids, `find-me` renders the map, `contact` renders a
link list. Adding a brand-new *kind* of section means a small JS edit in
`renderContent()`, not just a `SITE` edit. Renaming/reordering existing
sections is just a `SITE.nav` edit (keep the `id`s consistent with the render
logic and the `aria-labelledby`/panel ids).

## Constraints / gotchas

- Keep it accessible: real `<button>`s, ARIA tab roles, keyboard nav, skip
  link, focus styles, `prefers-reduced-motion` guards. Don't regress these.
- No external runtime deps beyond the Google Fonts `<link>`. Don't add CDNs.
- The site must work opened directly as a file and on any static host. No
  server-side assumptions.
- `SITE` is declared with `let` (not `const`) because `init()` reassigns it
  after merging fetched content. Keep it that way.
- Content with intentional inline markup (e.g. `intro.title` uses `<em>`) is
  injected as HTML. Keep `SITE` values trusted/authored, not user input.
- **Scroll position on load is handled deliberately — don't "simplify" it.**
  Because the page is rendered by JS after load, the browser's automatic scroll
  restoration anchors to a nearby element before the content exists, which on
  mobile (especially iOS Safari) shows up as a "pre-scroll" to a random card on
  refresh. Three things work together to prevent this and must be kept:
  (1) `history.scrollRestoration = "manual"` at the top of `initTabs()`;
  (2) the `forceTop` branch in `show()`, which re-asserts `scrollTo(0, 0)` across
  several frames, a `setTimeout`, and the `window` `load` event — iOS Safari
  restores scroll on a later tick and only partially honors `manual`, so a single
  top-scroll is not enough; and (3) `overflow-anchor: none` on `body` in
  `styles.css`, so late-loading content (background image, map iframe) can't pin
  the viewport and drag it. The initial `show()` call passes `forceTop: true`;
  normal tab clicks use the plain single top-scroll and should stay that way.

## How to verify a change

There are no tests and no build. After editing:

1. `node --check script.js` to catch JS syntax errors.
2. Open `index.html` in a browser (or `python3 -m http.server 8000`) and check:
   light/dark toggle, each nav tab, mobile menu (narrow viewport), the 404 page
   (`/404.html`), and that no errors appear in the console.
3. On mobile (or a touch-emulated narrow viewport, ideally iOS Safari): open a
   tab other than the first, scroll down, then refresh. The page must land at the
   top of that tab, not pre-scrolled to a nearby card. This regresses easily —
   see the scroll gotcha above.

Make the smallest change that satisfies the request, match the existing style,
and don't reformat unrelated code.