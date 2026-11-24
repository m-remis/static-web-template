<!-- Built from m-remis/static-web-template -->

# Spec format - site-spec.json and the block engine

> Part of the agent docs. Router: `AGENTS.md`.

## Content loading & metadata - JSON is the single source of truth

There is **no inline content** in `engine.js`. On boot, `init()` resolves the
active locale (see `docs/i18n.md`) and calls `loadContent()`,
which `fetch`es that locale's spec file (`currentSpecUrl()` → `LOCALE_SPECS`;
the default locale's file is `site-spec.json`) and parses it into the
module-level `SITE` object. `SITE` starts as `{}` and is assigned the parsed
JSON - there is no inline fallback content and no `deepMerge`. (The old
`dataUrl`/`deepMerge` "inline + optional override" model is gone; do not
reintroduce it. Each locale spec is **self-contained** - that's deliberate, not
an oversight.)

Three failure modes all end at the same calm error screen
(`renderErrorState()`), and the page must never blank or throw:

- **`fetch`** - the file couldn't be loaded (404 / network / `file://` CORS).
- **`parse`** - it loaded but wasn't valid JSON.
- **`empty`** - it parsed fine but had no usable `sections` (see `getSections()`,
  which drops entries without an `id`).

Because the page is served as static files, `site-spec.json` must be reachable
over `http://`. Opening `index.html` over `file://` will fail the fetch (CORS)
and show the error screen - serve locally with `python3 -m http.server 8000`.

### `site-spec.json` shape

```jsonc
{
  "brand": "Your Business",
  "brandImage": "assets/logo.png", // optional: PNG logo replaces the header text; "brand" still feeds alt text + footer
  "meta": {
    "lang": "sk",
    "domain": "https://example.com/",
    "title": "…",
    "description": "…",
    "ogDescription": "…",   // optional; falls back to description
    "author": "…",
    "themeColor": "#0e0f13",
    "ogType": "website",
    "ogImage": "assets/og_image.jpg", // optional; og:image + twitter:image only emitted if present
    "ogImageWidth": 1731, "ogImageHeight": 909, // optional; emitted as og:image:width/height when both set
    "twitterCard": "summary",
    "analytics": {           // optional; drives the footer visitor count only
      "countUrl": "https://<site>.goatcounter.com/counter/TOTAL.json",
      "countLabel": "visits",          // optional suffix after the number
      "dashboardUrl": "https://<site>.goatcounter.com"  // optional; makes the count a link
    }
  },
  "theme": {                 // optional per-client brand tokens; renderTheme() writes them as :root
                             // CSS vars at boot, overriding the styles.css defaults (omitted = CSS value)
    "accent": "#8ab4ff",     // set on <body>, so it wins over BOTH themes - check contrast in light mode
    "rootScale": "100%", "contentWidth": "56rem", "radius": "…",
    "fontSans": "…", "fontHeading": "…", "fontBrand": "…",  // font stacks
    "socialColors": { "instagram": "#e1306c", "youtube": "#ff0000" }  // → --brand-<key>
  },
  "business": {              // single source of truth for contact/legal data; blocks reference it by key
    "legalName": "…",
    "ico": "…", "dic": "…",  // company / tax IDs
    "phone": "…", "email": "…",
    "address": { "street": "…", "city": "…", "postalCode": "…", "country": "…", "label": "…" },
    "mapUrl": "…", "mapEmbed": "…",   // used by the map block's fallback
    "geo": { "lat": 49.0899325, "lng": 18.6338737 },  // optional; exact pin → JSON-LD GeoCoordinates (local search)
    "priceRange": "€€",               // optional; JSON-LD priceRange
    "areaServed": "Greater Anytown",  // optional; JSON-LD areaServed
    "hours": {               // optional; rendered by the "hours" block, which highlights today
      "mon": "9:00–17:00", "tue": "9:00–17:00", "wed": "9:00–17:00",
      "thu": "9:00–17:00", "fri": "9:00–17:00",
      "sat": "By appointment", "sun": "Closed"   // free-form value strings; missing day → dash row
    }
  },
  "sections": [               // ORDERED - order IS the nav order AND the page order
    {
      "id": "home",           // unique; required; used in the URL hash + tab id
      "label": "Domov",       // text shown in the nav tab
      "title": "Optional",    // optional <h2> heading at the top of the section
      "blocks": [ /* ordered content blocks, each { "type": … } */ ]
    }
  ],
  "footer":  { "note": "…", "year": 2026 },  // year optional; JS fills the current year
  "socials": [ { "label": "…", "headerLabel": "…", "icon": "instagram", "url": "…" } ],  // headerLabel optional; wins in the header/drawer only
  "backgrounds": [ "assets/background/bg.jpg", "…" ]
}
```

`renderHead()` drives the document `<head>` from `meta`: `<html lang>`,
`<title>`, `description`, `author`, `theme-color`, `twitter:card`, the Open
Graph tags (`og:type`, `og:site_name` - sourced from `brand`, not `meta` -
`og:title`, `og:description`, `og:url`, and `og:image` + `twitter:image` -
plus `og:image:width`/`og:image:height` when both dimensions are in `meta` -
**only if `meta.ogImage` is set**), and the canonical link. A relative
`meta.ogImage` is resolved to an absolute URL against `meta.domain` (via
`absoluteUrl()`, shared with the JSON-LD `image`) - scrapers ignore relative
image URLs. It upserts one tag
per key, so it's safe to re-run and won't duplicate tags. The corresponding
tags hardcoded in `index.html` are an SSR-style fallback for crawlers that don't
run JS - edit `meta` as the real source and keep the HTML fallback approximately
matching.

## The block engine (how sections work) - the core mental model

This is the biggest thing to understand and the part most likely to be edited.
Sections are **not** hardcoded per-tab layouts, and there is no per-section
special-casing anywhere (no `renderContent()` branch per section id). A section
is an ordered list of typed content blocks rendered by a generic dispatch.

- `sections` is an **ordered array**. Each entry is
  `{ id, label, title?, blocks: [ … ] }`. Order in the array is both the nav
  order and the on-page order. There is no separate `nav` list to keep in sync -
  the tabs are derived from `sections` by `navItems()`.
- A section renders as its optional `title` heading followed by its `blocks`, in
  order. To rearrange a section, reorder its `blocks`.

`renderContent()` iterates the sections (via `getSections()`) and calls
`buildSection(section)` for each. `buildSection()` renders the optional
`<h2 class="section__title">`, then for each block calls `renderBlock(block)`
and wraps the result in a `<div class="block">`.

### Block types and their builders

`renderBlock()` looks up `block.type` in the `BLOCK_RENDERERS` map and calls the
matching `buildX(block)` function. Most builders are **pure DOM builders** (read
only their `block` argument, never `SITE`) and return a node, a fragment, or
`null`. The exceptions read single-source-of-truth data from `SITE.business` via
`getBusiness()`: `map` (address/embed fallback) and `hours` (the week of opening
times). A new block should stay pure unless it renders SSOT business data.
Current types:

| `type`       | Builder          | Produces                                                                 |
|--------------|------------------|--------------------------------------------------------------------------|
| `hero`       | `buildHero`      | eyebrow + big headline + lead paragraph (first hero on the page = `<h1>`, later heroes = `<h2>`, same styling - keeps a single H1 for SEO) |
| `text`       | `buildText`      | a `.prose` paragraph; optional `name` = serif block heading above it (same look as table/faq names); optional `format`: `"html"` (sanitized inline HTML, default), `"markdown"` (tiny inline subset), `"plain"` (all escaped) |
| `cards`      | `buildCards`     | responsive card grid; `linked: true` + item `url` makes each a link; item `icon` adds a monochrome icon (black-on-transparent PNG, dark-theme auto-invert) |
| `links`      | `buildLinks`     | contact link rows: icon, kind label over value, arrow cue; `layout: "grid"` = tiles |
| `map`        | `buildMap`       | `mode: "embed"` live iframe, or `mode: "static"` themed address card     |
| `slideshow`  | `buildCarousel`  | 1 slide = framed image; 2+ = carousel w/ prev/next, dots, ARIA, lightbox |
| `table`      | `buildTable`     | structured table (price list etc.); last column accent-styled as a price - set `accentValue: false` for prose tables; `offerCatalog: true` exports the table into the JSON-LD as a schema.org OfferCatalog (consumed by `business-jsonld.mjs`, ignored by the builder); `collapsible: true` renders it collapsed behind its `name` as an FAQ-style accordion toggle (needs `name`; presentation only - exports unaffected) |
| `faq`        | `buildFaq`       | accordion of `items` of `{ q, a }`; native button toggles, ARIA-wired    |
| `gallery`    | `buildGallery`   | paged responsive image grid (opt. `columns` 2–4, `perPage` default 12); image-only tiles; optional per-image `thumb` (smaller rendition for the tile - the lightbox opens the full `src`); shares the slideshow lightbox across pages|
| `photo`      | `buildPhoto`     | single-image sugar (`src` + optional `thumb`, `title`, `caption`, `text`, `name`, `blurb`); normalizes to a one-image `gallery` |
| `hours`      | `buildHours`     | opening hours; reads `business.hours` (SSOT), highlights the current day |
| `review`     | `buildReview`    | leave-a-review CTAs to external platforms (`items` of `{ label, url, platform? }`); outbound links only, no backend |
| `video`      | `buildVideo`     | YouTube embed: `url` pins one video, or `playlist` auto-plays the newest entry (use the channel's `UULF…` long-form uploads playlist for "latest episode"); privacy-enhanced `youtube-nocookie.com` player, lazy-loaded |

The exact field-by-field shapes live in two places: the `BLOCK TYPES` comment
at the top of `engine.js` (one line per type) and `site-spec.schema.json` (the
machine-checked version, with a description per field). Keep both in sync if
you change a builder's accepted fields. Note `block.type` lives on each **block**, not on
the section - a section never has a `type`.

### Adding a NEW block type

Adding a new *kind* of content (e.g. `hours`, `faq`, `cta`) is the only content
task that is real code, and it touches five places that must stay in agreement
(engine renderer, validator rules, the `BLOCK TYPES` comment,
`site-spec.schema.json`, and the table above). The full step-by-step -
including the ripple checklist that keeps those five in sync - is **Workflow B**
in `docs/workflows.md`, and `_block-template.md` is the copyable skeleton to
start from. Follow them rather than ad-hoc editing.

Engine behavior worth knowing while you do: unknown block types are skipped with
a `console.warn`, not thrown - a typo never blanks the page. Once built, a block
is reusable across all future clients; growing a tested block library is the real
product value.

### Block width

Every block is wrapped in a single `.block` element and fills the one content
column (CSS variable `--content-width`, ≈56rem), centered with the page gutter
holding it off the screen edges on small viewports. There are no width tiers and
no per-block `width` field - all blocks share one consistent left edge across
the site. Vertical rhythm between blocks is one rule:
`.block + .block { margin-top: var(--block-gap); }`. Adding a block type needs no
new spacing CSS. If a specific block ever needs to be narrower (e.g. a centered
prose column), constrain it inside that block's own builder/CSS, not via a spec
field.
