# LAUNCH-CHECK.md

Documentation for `launch-check.js` - the pre-launch validator for sites built
on this engine.

> Companion to `AGENTS.md` + `docs/` (how the engine works) and `CLIENT-CHECKLIST.md`
> (what to fill in per client). This file documents one thing: the preflight
> script that tells you whether a site is safe to ship.

## What it is

`launch-check.js` is a **dev-only preflight inspector**. It reads the project
files, runs a series of sanity checks, prints a grouped report, and exits with
a status code you can act on. It catches the boring, expensive, embarrassing
mistakes that ship silently because the page still *renders* fine - fake
contact data, leftover placeholder text, broken asset paths, a domain that
doesn't match across files, a missing social-share image.

It is **not** loaded by the website. It never runs in the browser. It is a tool
you run by hand (or in CI) before delivering a site.

Design constraints, all intentional:

- **Zero dependencies.** Node built-ins only (`fs`, `path`, `url`,
  `child_process`). No npm install, no `package.json` needed.
- **CommonJS**, not ES modules - runs with plain `node`, no `"type": "module"`.
  The one thing it loads besides built-ins is the project's own
  `business-jsonld.mjs`, via a dynamic `import()`, for pure helpers the engine
  uses too (e.g. the YouTube link parser) - so the validator and the page can't
  disagree about what is valid.
- **Offline and deterministic.** No network calls, no live-URL crawling. It
  inspects local files only, so it's fast (~tens of ms) and never flaky.
- **Heuristic, not exhaustive.** It pattern-matches "does this look fake / left
  over / inconsistent." It will occasionally false-positive, and it can miss a
  novel placeholder phrase. That's an accepted tradeoff for a fast preflight -
  it's a nudge, not a proof.

## How to run it

From the project root:

```bash
node launch-check.js                 # human-readable report
node launch-check.js --json          # machine-readable JSON (for CI/tooling)
node launch-check.js --strict        # treat warnings as blocking failures too
node launch-check.js --template      # checking the unfilled template itself (see below)
node launch-check.js --help          # usage
```

Other flags (all optional):

```text
--root <dir>            Check another folder instead of the cwd.
--site-spec <file>      Use a different spec file. Default: site-spec.json
--no-unused-assets      Don't warn about unreferenced files under assets/.
--max-image-kb <n>      Warn when an image asset exceeds n KB. Default: 900
--max-css-kb <n>        Warn when a CSS file exceeds n KB. Default: 250
--max-js-kb <n>         Warn when a JS file exceeds n KB. Default: 250
```

**`--template`** is for working on the template/engine repo itself, where the
spec is deliberately unfilled. It keeps six expected findings from failing the
run: `EMAIL_FAKE`, `PHONE_FAKE`, `OG_IMAGE_MISSING`, `DOMAIN_PLACEHOLDER`,
`SITEMAP_PLACEHOLDER`, `ROBOTS_PLACEHOLDER`. They are still counted and listed
in a note under the report (and as `templateSuppressed` in `--json`), and every
other check runs unchanged, so `PASS` there means "nothing is broken beyond
the placeholders a client will replace". **Never use it on a client site** -
there each of those six is a real launch blocker.

It must be run **from the repo root** (or pointed at a folder with `--root`) -
it inspects files on disk relative to that root.

### Exit codes

```text
0  pass - no blocking errors (warnings may still be present)
1  fail - blocking errors found
```

Warnings never affect the exit code by default. Only errors block - **unless**
you pass `--strict`, which promotes warnings to blocking failures (a useful
hard gate in CI).

### Output modes

**Text (default).** `PASS` or `FAIL`, followed by errors and warnings grouped
by category:

```text
FAIL

Errors:

[content]
- Placeholder text found at $.sections[0].blocks[0].lead: "Bla bla bla …"
- Email looks fake or invalid: r@r.sk

[manifest]
- Manifest icon path does not exist as written: /web-app-manifest-192x192.png …

Warnings:

[assets]
- Unused asset: assets/slides/custom_5.jpg
```

**JSON (`--json`).** A stable shape for CI or other tooling:

```json
{
  "status": "fail",
  "ok": false,
  "counts": { "errors": 8, "warnings": 4 },
  "errors":   [ { "category": "content", "code": "EMAIL_FAKE", "message": "…" }, … ],
  "warnings": [ { "category": "assets",  "code": "UNUSED_ASSET", "message": "…" }, … ]
}
```

Each finding carries a stable `category`, a stable machine `code` (e.g.
`EMAIL_FAKE`, `MANIFEST_ICON_WRONG_PATH`, `UNUSED_ASSET`), and a human
`message`. The `code` is the thing to match on in tooling - the message wording
may change, the code won't.

`status`/`ok` give a quick branch, `counts` supports thresholds, and the arrays
carry the detail. The exit code matches the status in both modes, so CI can
rely on either.

## Errors vs warnings

- **Errors block the launch** (exit 1). These are things that are broken or
  obviously wrong: missing required files, invalid JSON, fake/placeholder
  content, broken asset/icon paths, a domain mismatch between files.
- **Warnings don't block** (exit stays 0). These are things worth a look but
  not necessarily wrong: unused image files, a stale metadata fallback (the
  engine overwrites it at runtime), missing image descriptions, very short hero
  copy. Some warnings are judgment calls - e.g. a `CNAME` host differing from
  `meta.domain` is flagged because it's *usually* a mistake, but is legitimate
  for www↔apex redirect setups.

## What it checks, by file

`meta` in `site-spec.json` is treated as the **single source of truth**; the
other files are checked for agreement with it. The spec is walked
**recursively**, so contact data and asset references are found wherever they
live in the structure (a phone in a `links` block, an IČO in a `table` row).

### Required files (presence)

Fails if any are missing: `index.html`, `styles.css`, `site-spec.json`,
`site.webmanifest`, `robots.txt`, `sitemap.xml`, and the runtime script
`engine.js`.

### `styles.css` theme tokens

- **Token scope** (`THEME_TOKEN_SCOPE`, error) - a token in `:root` whose value
  reads a per-theme token (one declared in `[data-theme="dark"]` /
  `[data-theme="light"]`). A `var()` inside a custom property resolves where
  it is declared, and the per-theme tokens only exist on `<body>`, so it
  silently resolves to nothing. Move it to the shared `[data-theme]` block
  (see `docs/theming.md`).
- **Unpaired token** (`THEME_TOKEN_UNPAIRED`, warning) - a token declared in
  one theme block but not the other, so it is unset in that theme.

### `site-spec.json`

- **Valid JSON** - a parse error is a hard fail and stops the run.
- **Shape** - `sections` is a non-empty array; every section has a unique `id`;
  no duplicate ids; `label` present (warning if not). Note `type` lives on
  **blocks**, not sections.
- **Block types** - each block's `type` must be one the engine knows
  (`hero, text, cards, links, map, slideshow, table, faq, gallery, photo, hours,
  review, video`). An unknown type is flagged because the engine silently skips
  it. The known list is the `BLOCK_RULES` map near the top of `launch-check.js`,
  which maps each type to its check function (it is the dispatch too - there is
  no separate `switch`); keep it in sync with `BLOCK_RENDERERS` in `engine.js`
  when you add a block type.
- **Block-type registry drift** (`BLOCK_TYPE_DRIFT`) - cross-checks the four
  places the type list is stated: `BLOCK_RENDERERS` in `engine.js`,
  `BLOCK_RULES` here, the `type` enum in `site-spec.schema.json`, and the
  block-types table in `docs/spec-format.md`. Any mismatch is a hard failure, so adding
  or removing a type without updating all four is caught before it ships.
- **Generated artifacts freshness** (`GENERATED_STALE`) - runs
  `generate-static.mjs --check`, which byte-compares `llms.txt`, `sitemap.xml`
  and the stamped tags in `index.html` (the static JSON-LD and the LCP-image
  preload) against what the current spec would generate. The one thing it
  does not compare is the sitemap's `<lastmod>` date, so the result does not
  depend on when or where the repo was checked out. A spec edit without a
  re-run (or a hand edit of an artifact) is a hard failure - run
  `node generate-static.mjs` to refresh them.
- **Geo coordinates** (`GEO_INVALID`) - if `business.geo` is set, `lat`/`lng`
  must be numbers in valid ranges (±90 / ±180); anything else would pin the
  business at a wrong location in the JSON-LD.
- **Table flags** (warnings) - `accentValue` and `offerCatalog` must be real
  booleans when present (`TABLE_ACCENT_VALUE_NOT_BOOL`,
  `TABLE_OFFER_CATALOG_NOT_BOOL`).
- **Block required fields** - `table` needs `headings` + `rows`; `cards` needs
  `items`; `links` needs `use` refs or `items` (a row with no `label` is only
  warned about when it also lacks a kind line, i.e. has neither `kind` nor
  `icon`, or has no `handle`); `slideshow` needs `slides`; `gallery` needs `images`
  (and `columns`, if set, must be 2–4 - the only values the engine and CSS
  honor); `photo` needs `src`; `map` needs `url`
  or `embed`; `faq` needs `items` (each with `q` + `a`); `review` needs `items`
  (each with `label` + `url`); `hours` reads `business.hours` rather than its own
  fields; `video` needs a recognizable YouTube `url` or `playlist`; etc. (a
  builder returns nothing on bad input, so these would vanish).
- **Placeholder text** - scans every string for filler markers (`lorem`,
  `bla bla`, `nejaky`, `tbd`, `placeholder`, …) and reports the JSON path.
- **Contact data** - emails (fake/invalid patterns like `r@r.sk`), phones (too
  short, all-zeros, sequential dummy), Slovak IČO (8 digits) and DIČ (10 digits)
  when present.
- **Content quality** (warnings) - very short hero lead; a pricing-looking
  section with no price-like content.
- **Image alt / accessibility** (`IMAGE_MISSING_TEXT`, `accessibility`
  category) - an image with no `title`/`caption`/`text` to derive alt text
  from. An error for a `photo` and for `gallery` images (nothing else carries
  their meaning), a warning for `slideshow` slides. There is no `alt` field:
  the engine never reads one.

### `index.html`

- **SEO basics** (errors) - non-empty `<title>`, a description meta, a favicon
  link, and an `og:image` (either here or via `meta.ogImage`).
- **Optional SEO** (warnings) - `og:title`, `og:description`, `<html lang>`,
  canonical link.
- **Domain match** (errors) - canonical and `og:url` must equal `meta.domain`.
  An absolute `og:image`/`twitter:image` on a different host is a **warning**:
  intended while only a dev/preview host serves the image, but it must move to
  `meta.domain` at launch (relative paths are always fine).
- **Metadata consistency** (warnings) - the static fallback tags (title,
  description, author, og:*, twitter:card, theme-color, lang) should match
  `meta`. They're a crawler fallback the engine overwrites at runtime, so drift
  isn't fatal - but crawlers that don't run JS see the stale value.
- **Asset references** - any `assets/` image referenced here must exist.

### `site.webmanifest`

- **Valid JSON**; has `name`; has icons.
- **Icon paths resolve** (error) - every icon `src` must point at a file that
  exists *as written*. Catches the common root-absolute mistake
  (`/web-app-manifest-192x192.png` when the file is at `assets/…`).
- **Soft fields** (warnings) - `short_name`, `theme_color`, `background_color`;
  `theme_color` drifting from `meta.themeColor`.

### Brand name mirrors (`BRAND_MIRROR_STALE`, warning)

The business name lives in `brand`, but is also typed as plain text where the
engine never rewrites it: `site.webmanifest` `name` / `short_name`, the
`og:site_name` fallback and the `<noscript>` heading in `index.html`, and the
`<title>` plus per-language `docTitle` strings in `404.html`. Each is flagged
when it neither contains the brand nor is contained in it (so a shortened
`short_name` passes) - the usual cause is a value left over from the template
or a previous client.

### `sitemap.xml`

- Has `<loc>` entries; the `<loc>` matches `meta.domain` (error on mismatch);
  no placeholder domains (`example.com`, `github.io/…`).
- Note: parsed by regex, not validated as well-formed XML. The file itself is
  GENERATED by `generate-static.mjs` (`<lastmod>` = the date of the last commit
  that touched the spec, or the spec's mtime while it has uncommitted edits), so
  don't hand-edit it - the freshness check above would flag it.

### `robots.txt`

- Has a `Sitemap:` line (warning if not); its host matches `meta.domain`'s host
  (error on mismatch); no placeholder domain.

### `CNAME` (only if present)

- Host matches `meta.domain`'s host (warning - www↔apex setups legitimately
  differ).

### `assets/` (walked on disk)

- **Referenced-but-missing** (error) - a block points at a file that isn't
  there. Besides the spec and `index.html`, root-level stylesheets
  (`styles.css`, `404.css`) are scanned for `url(...)` references (fonts,
  backgrounds) - a missing one is a `CSS_ASSET_MISSING` error.
- **Present-but-unused** (warning) - a file on disk nothing references
  (spec, `index.html`, or a root-level stylesheet). The favicon family is
  exempt (referenced by convention).
- **Oversized images** (warning, `performance` category) - images larger than
  `--max-image-kb` (default 900 KB), and CSS/JS over `--max-css-kb` /
  `--max-js-kb` (default 250 KB), so heavy media gets compressed before ship.

### Locale specs (`site-spec.<lang>.json`)

The runtime language switch loads one spec per locale (see `docs/i18n.md`).
Each is a full copy of the spec, so everything untranslated is duplicated. The
default run compares that duplicated data against the default `site-spec.json`
and checks each locale's asset paths (the content/contact/SEO checks still run
on the default spec only - that's the single-language SEO mirror by design):

- **Invalid locale spec** (`LOCALE_SPEC_INVALID`, `spec`) - a
  `site-spec.<lang>.json` is not valid JSON.
- **Missing `meta.lang`** (`LOCALE_LANG_MISSING`, `spec`) - needed for
  `<html lang>` and the switcher.
- **Section drift** (`LOCALE_SECTION_DRIFT`, `content`) - a locale's section
  `id`s differ from the default's, so a translation is missing or renaming a
  section (the current tab is preserved across a switch by id).
- **Data drift** (`LOCALE_DATA_DRIFT`, `content`, warning) - something that must
  be identical in every locale differs from the default spec: `meta.domain`,
  `meta.themeColor`, `meta.ogImage`, `brandImage`, `business.phone` / `email` /
  `ico` / `dic` / `mapUrl` / `mapEmbed` / `geo`, the `socials` list (icon + url,
  in order), `backgrounds`, or the block types inside a section (a block added
  to one language only).
- **Missing asset** (`LOCALE_ASSET_MISSING`, `assets`, error) - a locale spec
  points at a file that isn't there. Files only a locale spec uses also count
  as referenced for the unused-asset warning.

To run the **full** content/contact/SEO pass on a specific locale, point the
validator at it: `node launch-check.js --site-spec site-spec.sk.json`. (Expect
`HTML_*_STALE` there - the static `index.html` mirror is the default locale on
purpose.)

## How to use it in the workflow

The intended place is the gate **between authoring the spec and shipping**:

```text
author / generate site-spec.json
  → node launch-check.js
  → fix every error (and review warnings)
  → re-run until PASS
  → deploy
```

This matters most when the spec is generated from a client intake form by an
LLM: the engine renders whatever the JSON says without complaint, so the
validator is the thing that distrusts the generated spec before it reaches a
real customer. (See `CLIENT-CHECKLIST.md` for the per-client fill-in steps the
validator backs up.)

A clean run on a fresh client typically still surfaces the obvious first-pass
items - placeholder hero copy, template contact values, a not-yet-made
`og:image`, manifest icon paths. That's expected; work them down to `PASS`.

## Limitations (read these)

- **It validates inputs, not the rendered result.** It can't tell you the site
  *looks* right - only that the spec and metadata aren't obviously broken. The
  manual checks in `docs/gotchas.md` (open it, click every tab, test on a real phone)
  still matter.
- **Heuristics false-positive and false-negative.** A real phone number that
  looks odd may be flagged; a placeholder phrase nobody anticipated may pass.
  Treat errors as "look at this," not "this is definitely wrong."
- **JSON validity is checked for `site-spec.json` and `site.webmanifest` only.**
  `sitemap.xml` is regex-scraped, not validated as well-formed XML.
- **No network checks.** It does not fetch the live site, verify URLs resolve,
  or inspect deployed headers. By design - that keeps it fast and offline.

## Extending it

The structure is one pass: read files → run `checkX()` functions that push into
the `errors`/`warnings` arrays (tagged with a category) → print → exit on
`errors.length`. To add a check:

1. Write a `checkSomething(...)` function that calls `fail(category, code, msg)`
   or `warn(category, code, msg)`.
2. Call it from `main()`.
3. Reuse the existing category names where they fit (`missing`, `spec`,
   `content`, `links`, `seo`, `manifest`, `assets`, `accessibility`,
   `performance`) rather than inventing new ones, and give the finding a stable
   uppercase `code`.

Keep it dependency-free, offline, and CommonJS. If a check would need a parser,
a network call, or an npm package, it probably doesn't belong here - that's the
line that keeps this a fast preflight rather than a slow test suite.

Possible future additions (not yet built): well-formed-XML validation for
`sitemap.xml` (currently regex-scraped), and live-URL / deployed-header checks
(deliberately out of scope today to keep the run offline and fast).

<!-- Built from m-remis/static-web-template -->