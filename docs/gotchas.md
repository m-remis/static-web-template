<!-- Built from m-remis/static-web-template -->

# Gotchas and verification

> Part of the agent docs. Router: `AGENTS.md`.

## Constraints / gotchas

- Keep it accessible: real `<button>`s, ARIA tab roles (desktop nav is a real
  tablist; the carousel dots are a tablist), keyboard arrow nav, skip link,
  focus styles gated behind `body.keyboard-nav` (toggled by `initInputMode()`),
  `prefers-reduced-motion` guards. Don't regress these.
- No external runtime deps beyond the optional GoatCounter analytics script —
  fonts are self-hosted in `assets/fonts/`. Don't add CDNs.
- `engine.js` is an ES module (it imports `business-jsonld.mjs`). Keep `index.html`'s
  `<script type="module">`. Opening `index.html` over `file://` hits both module
  CORS *and* the `site-spec.json` fetch CORS in most browsers; serve over
  `http://` (`python3 -m http.server 8000`) when testing locally.
- The site must otherwise work on any static host with no server-side
  assumptions.
- Block text (hero `title`/`lead`, `text`, cards, table cells, captions,
  blurbs, section titles, footer note) allows small inline HTML (`<em>`,
  `<a>`, `<strong>`…) and **every such field is passed through
  `sanitizeInline()`** before reaching `innerHTML` — use the `safeText()`
  wrapper (string-coerce + sanitize) for spec values — disallowed tags,
  attributes, and `javascript:`/`data:` hrefs are stripped. Keep the values
  authored anyway; the sanitizer is defense in depth. Image `alt` is built
  through `escapeHtml()` defensively.
- **Scroll position on load is handled deliberately — don't "simplify" it.**
  Because content is rendered by JS after load, the browser's automatic scroll
  restoration anchors to a nearby element before content exists, which on mobile
  (especially iOS Safari) can show up as a "pre-scroll" to a random card on
  refresh. Three things work together and must be kept: (1)
  `history.scrollRestoration = "manual"` at the top of `initTabs()`; (2) the
  `scrollTop` option in `show()` — `scrollToTopInstant()` forces an instant
  (non-smooth) `scrollTo(0,0)` on the initial render and on every tab switch;
  (3) `overflow-anchor: none` on `body`, and `scrollbar-gutter: stable` on
  `html` (with an `overflow-y: scroll` fallback), so switching between short
  and tall tabs doesn't add/remove the scrollbar and shift the centered layout.
  (An earlier build re-asserted the top-scroll across several frames for iOS —
  that `forceTop` machinery is gone; if the iOS refresh pre-scroll ever
  reappears, that's the shape of the fix.)
- **Swipe needs its `touch-action` — the CSS is half the feature.** `initSwipe()`
  only ever *observes* pointers; which gestures reach it at all is decided by
  CSS. `.carousel__viewport` is `touch-action: pan-y` (horizontal is ours,
  vertical stays page scroll) and `.lightbox` is `touch-action: none` (it owns
  everything; page scroll behind is already locked by `.lightbox-open`). Delete
  or widen either and the browser claims the gesture for scrolling, cancels the
  pointer stream, and the swipe silently stops working while the JS still looks
  correct. Narrowing them has the opposite failure: a finger that lands on a
  slide can no longer scroll the page past it. Two more load-bearing details in
  the handler: it captures the pointer only *after* ~10px of travel, so a plain
  tap still reaches the expand button underneath; and it swallows the click the
  browser synthesises after a drag, without which every carousel swipe would
  also pop the lightbox open and every lightbox swipe would close it on the
  backdrop. Mouse pointers are ignored by design. `launch-check` sees none of
  this — verify by hand on a touch device (or emulation): swipe both, tap both,
  and scroll the page vertically with the finger starting on a slide.
- Mobile drawer open state sets `body.menu-open`, which only touches
  `overflow-x` — do **not** lock vertical `overflow` there; on some mobile
  browsers that changes the viewport calc and visually shifts the centered
  content.
- **The embed warm-up lays the panel out on purpose — don't "simplify" it to
  an attribute flip.** `warmUpIframes()` pre-loads a hidden tab's map/video
  iframes so opening that tab is instant, but a `display:none` panel gives
  its iframes no box, and a zero-size YouTube player locks onto its smallest
  poster rendition and never upgrades it — the thumbnail then renders cropped
  and pixelated once the tab is opened. So for the seconds the embeds load,
  the panel gets `.is-warming`: laid out at the real content-column width
  (`--warm-width`, measured from `#main` by `contentColumnWidth()`), but
  `position: fixed` (out of flow — can't add a scrollbar or shift the
  centered layout) at `left: -200vw` with `opacity: 0`. **Do not "tidy" that
  into `visibility: hidden`** — visibility is inherited but a descendant can
  turn it back on, and the carousel does (`.carousel--single
  .carousel__slide`), which made a warming panel's slideshow flash over the
  live page. Off-screen and group opacity can't be overridden from inside.
  A warming panel is also made `inert`: overriding `[hidden]`'s display puts
  its links/buttons back in the tab order and the a11y tree even though
  they're invisible, and inert is what keeps keyboard focus and screen
  readers out (same tool as the closed mobile drawer). That's why `show()`
  in `initTabs()` clears `inert` on the panel it reveals — without it,
  opening the tab mid-warm would show a dead panel until the warm-up's
  cleanup fired. The `[hidden]` in the CSS selector is what makes opening
  the tab mid-warm cancel the off-screen parking for free. Three things to
  re-check by eye if you touch this, since `launch-check` sees none of them:
  the thumbnail is sharp after warming from another tab, nothing from the
  warming panel paints **during** the warm-up (screenshot the live tab
  mid-warm, not just after), and Tab-cycling during the warm-up never lands
  focus in invisible content.

## How to verify a change

There are no tests and no build. After editing:

1. Validate the spec and engine before anything else:
    - `node -e "JSON.parse(require('fs').readFileSync('site-spec.json','utf8'))"`
      — a stray comma or missing quote in `site-spec.json` makes the fetch parse
      fail and shows the **error screen** (not a blank page); this catches it
      fast with a line/column.
    - `node --check engine.js` to catch JS syntax errors.
    - `node generate-static.mjs` to refresh the generated mirrors.
    - Run `node launch-check.js` for a fuller preflight (placeholders, fake
      contact data, broken/missing/unused assets, SEO, domain/metadata
      consistency); drive it to `PASS`. In this template repo add
      `--template`, which does not count the placeholder domain and demo
      contact data the template ships with. See `LAUNCH-CHECK.md` for flags
      and the full check list.
2. Serve and open the site — prefer `python3 -m http.server 8000` over
   `file://` (the page fetches `site-spec.json`; `file://` fails CORS and shows
   the error screen). Check: light/dark toggle, every nav tab, each block type
   renders (hero, text, cards, links/contact icons, map, slideshow, table, faq,
   gallery, photo, hours, review, video), the
   mobile menu at a narrow viewport, the 404 page (`/404.html`), and a clean
   console.
3. On mobile (or a touch-emulated narrow viewport, ideally iOS Safari): open a
   tab other than the first, scroll down, refresh. It must land at the top of
   that tab, not pre-scrolled to a card. This regresses easily — see the scroll
   gotcha.
4. Drag the window slowly across the mid-widths (~640px up to wide desktop): the
   header must flip to the hamburger the instant the left cluster and the nav
   approach each other, no overlap frame, and flip back when widened. Confirm
   the socials appear (stacked, with labels) in the drawer in that mode.
5. Touch (emulated or real): swipe the slideshow left/right — it should step
   like the arrows and reset autoplay; open a gallery tile and swipe sideways
   (next/prev) and downward (close). Then confirm a *tap* on a slide still
   opens the lightbox, and that a vertical drag starting on a slide scrolls the
   page. See the swipe gotcha. Then expand an image and press browser Back: the
   overlay must close with the tab change, not float over the new panel.
6. Tables: confirm the desktop table scrolls sideways if very wide, and that on
   ≤640px each row collapses into a stacked card (a long row must not force
   horizontal page scroll).
7. Language switch (multi-locale sites): from a *non-first* tab, scrolled down,
   pick the other language. The copy should change instantly (no fade, no
   empty frame; give the page a couple of seconds after load first, so the
   idle prefetch has run) — no page blink, no
   background restart, same tab, same scroll position — and afterwards **one**
   theme-toggle click must still flip the theme once, one tab click must add one
   history entry, and the drawer/lightbox must still open. Duplicated handlers
   from a missed teardown show up exactly there. Switching *while* the drawer is
   open must leave the page clickable (the scrim gotcha in
   `docs/engine-internals.md`).
8. Theme toggle: click it on a tab with cards, a table and the map. Everything
   - page background, panels, borders, text, the toggle icon, the scrollbar -
   must change in the same frame, with nothing fading in late.
9. Lightbox: open an image, press Tab repeatedly - focus must cycle inside the
   overlay and never reach the page behind. Escape closes it and focus returns
   to the image you opened.

Make the smallest change that satisfies the request, match the existing style,
and don't reformat unrelated code.

<!-- Built from m-remis/static-web-template -->
