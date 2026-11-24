# AGENTS.md

Guidance for AI coding agents working in this repository. Humans should read
`README.md` instead; this file exists so an agent can make correct changes
without rediscovering the structure each time.

This file is the **router**, and it is the only doc loaded automatically. It
carries the rules that apply to every change; the detail lives in `docs/`, one
file per concern. Read the row that matches your task before editing - don't
load them all, and don't guess from filenames.

## Hard rules (do not violate)

1. No build step, no framework, no bundler, no npm dependency for the runtime
   site. Vanilla HTML/CSS/JS served as files.
2. Content is **never** hardcoded in `index.html` or `engine.js`. It lives in
   `site-spec.json`. The HTML is an empty shell.
3. Don't remove the `Built from m-remis/static-web-template` fingerprint.
4. After any change, validate, in this order:
   1. `node -e "JSON.parse(require('fs').readFileSync('site-spec.json','utf8'))"`
   2. `node --check engine.js`
   3. `node generate-static.mjs` (refreshes the generated `llms.txt`,
      `sitemap.xml`, and the static JSON-LD + LCP preload in `index.html`)
   4. `node launch-check.js --template` in **this template repo**, or
      `node launch-check.js` on a **client site**. `--template` only stops the
      template's own placeholders (example.com domain, demo phone/email, no
      share image) from failing the run; everything else is checked the same.
      Drive it to `PASS`.

   `site-spec.json` is also schema-checked live in the editor against
   `site-spec.schema.json` - keep that schema in sync when you add a block type
   or a field. Make the smallest change that satisfies the request; don't
   reformat unrelated code.

## Start here (routing)

| If your task is… | Read |
|---|---|
| **Changing what the site says** - text, tabs, contact, prices, images, socials, metadata | `docs/workflows.md` (Workflow A). It's almost always a `site-spec.json` edit; see "The golden rule" below. |
| **Adding / removing / renaming a block *type*** | `docs/workflows.md` (Workflow B) + `docs/spec-format.md`; start from `_block-template.md` |
| **Changing a block's accepted fields** | `docs/workflows.md` (Workflow C) + `docs/spec-format.md` |
| **Colors / theme tokens** | `docs/workflows.md` (Workflow D) + `docs/theming.md` |
| **Domain, title, description, OG, metadata** | `docs/workflows.md` (Workflow E) |
| **A `launch-check.js` rule or category** | `docs/workflows.md` (Workflow F) + `LAUNCH-CHECK.md` |
| **Engine behavior** - tabs, menu, header-fit, background, lightbox, scroll | `docs/workflows.md` (Workflow G) + `docs/engine-internals.md`, then `docs/gotchas.md` |
| **Language switch / adding a locale** | `docs/i18n.md` |
| **Setting up a brand-new client site** | `CLIENT-CHECKLIST.md` (the per-client fill-in list, file by file) |
| **Checking a site is safe to ship** | run `node launch-check.js`; details in `LAUNCH-CHECK.md` |
| **Anything touching scroll, swipe, header-fit, or the embed warm-up** | `docs/gotchas.md` **first** - several behaviors are load-bearing and look like dead code |

**Always read `docs/workflows.md` for your task before editing.** Most mistakes
here are not wrong edits, they are *incomplete* ones: a block type is stated in
five places, the domain and the dark background color in five or more each. The
workflow row lists every file the change obligates, not just the obvious one.

## Doc map

| Doc | Covers |
|---|---|
| `docs/workflows.md` | Workflows A-G: the full ripple checklist per kind of change, and the drift rule |
| `docs/spec-format.md` | `site-spec.json` shape, content loading, the block engine, every block type + builder, block width |
| `docs/engine-internals.md` | What the project is (runtime constraints), key functions in `engine.js`, socials, the teardown registry, header fit, background |
| `docs/theming.md` | The two theme token blocks, brand-color tokens, `color-scheme`, the instant theme switch, the shared frosted-panel rule |
| `docs/i18n.md` | Runtime language switch, `LOCALE_SPECS`, the `UI` chrome table, why the swap is instant |
| `docs/gotchas.md` | Load-bearing behaviors that `launch-check` can't catch, and how to verify a change by hand |

## Template fingerprint / attribution

This project intentionally carries a small searchable fingerprint:

```text
Built from m-remis/static-web-template
```

and the repository identifier:

```text
m-remis/static-web-template
```

Do **not** remove, rename, rewrite, hide, minify away, or "clean up" these
references unless the repository owner explicitly asks for a white-label build.
It is source attribution and a searchable marker, not forgotten boilerplate.
Accepted forms are source comments / docs, not visible UI (unless a visible
credit was explicitly requested):

- HTML: `<!-- Built from m-remis/static-web-template -->`
- CSS / JS: `/* Built from m-remis/static-web-template */`
- Markdown: `<!-- Built from m-remis/static-web-template -->`

These strings currently live in `index.html`, `engine.js`, `styles.css`,
`business-jsonld.mjs`, `generate-static.mjs`, `launch-check.js`, `tweaker.js`, `README.md`,
`CLIENT-CHECKLIST.md`, `LAUNCH-CHECK.md`, `_block-template.md`, the `docs/`
files, and this file. (`404.html` does not carry it directly - it shares
`styles.css`, which does.) Preserve them when rewriting any of those, and add
an equivalent comment to any new major source/doc file. Do not add them to the
placeholder audit grep.

## The golden rule

Almost every content change goes in **one place**: `site-spec.json`. It is the
single source of truth for content. The HTML is an empty shell; the brand,
nav/tabs, every section, the footer, the socials, the background list, and even
the document `<head>` metadata are all rendered from `site-spec.json` by JS at
runtime. Before editing markup or CSS, check whether the request is actually a
`site-spec.json` edit.

> **Spinning up a new client site?** Follow `CLIENT-CHECKLIST.md` - the
> exhaustive per-client change list (every spec field, the multi-file domain
> and `#0e0f13` mirrors, the pre-deploy audit). This file (`AGENTS.md`) plus
> `docs/` cover *how the project works*; that file covers *what to fill in per
> client*.

- Change brand, nav tabs, any section's content, contact rows, map, price
  tables, slideshows, background list → edit `site-spec.json`. Do **not**
  hardcode this content into `index.html` or `engine.js`.
- Change social links → edit `site-spec.json` → `socials`. Each entry is
  `{ label, headerLabel?, icon, url }`; `icon` must match a key in the
  `SOCIAL_ICONS` map in `engine.js`. The optional `headerLabel` replaces
  `label` in the header/drawer only (contact rows and the error screen keep
  `label`).
- Change page metadata (title, description, OG, theme-color, canonical) →
  edit `site-spec.json` → `meta` (see `docs/spec-format.md`). The matching
  tags in `index.html` are only a static fallback for crawlers; keep them
  roughly in sync but treat `meta` as authoritative.
- Change colors/theme → edit the token blocks in `styles.css` (see
  `docs/theming.md`).
- Add a brand-new *kind* of content block → small JS edit (a builder + one line
  in `BLOCK_RENDERERS`), plus the validator, schema and docs entries; see
  Workflow B in `docs/workflows.md`.
- Change layout/behavior → edit the relevant builder/init function in
  `engine.js` or the matching CSS rule.

## File map

| File                                            | Role                                                          | Edit when                          |
|-------------------------------------------------|---------------------------------------------------------------|------------------------------------|
| `site-spec.json`                                | **All site content + metadata** (single source of truth)      | content, copy, metadata, per-client|
| `site-spec.schema.json`                         | JSON Schema for the spec: live editor validation + the field-by-field shape of every block | adding a block type or a field     |
| `engine.js`                                     | Runtime engine: block builders + render + all UI logic        | behavior, new block types          |
| `styles.css`                                    | All styling + the two theme token blocks                      | colors, layout                     |
| `index.html`                                    | Shell only; header skeleton + empty `#main`/`#siteFooter` + fallback meta | rarely (font links, fallback meta) |
| `404.html` / `404.css`                          | Not-found page; **inherits theme tokens from `styles.css`**   | layout of 404 only                 |
| `docs/*.md`                                     | The agent docs this router points at (see Doc map above)      | when the fact you changed lives there |
| `CLIENT-CHECKLIST.md`                           | Per-client replacement + deploy checklist                     | client-site handoff rules          |
| `launch-check.js` / `LAUNCH-CHECK.md`           | Pre-launch validator (dev-only, never served) + its docs      | before shipping; adding a block type|
| `_block-template.md`                            | Copyable skeleton for a new block type (not served)           | adding a block type (Workflow B)   |
| `site.webmanifest`, `robots.txt`                | PWA + SEO; `robots.txt` also carries the explicit AI-crawler opt-in stanza | domain/name changes                |
| `sitemap.xml`                                   | SEO - **GENERATED** by `generate-static.mjs` (`<lastmod>` = the spec's last commit date, or its mtime while it has uncommitted edits); never edit by hand | regenerate after any content edit |
| `_headers`                                      | Cloudflare Pages response headers: security, caching policy, 103 Early Hints preloads | caching rules; adding an always-loaded asset |
| `llms.txt`                                      | Plain-text site summary for AI crawlers - **GENERATED** from the spec by `generate-static.mjs`; never edit by hand | regenerate after any content edit |
| `business-jsonld.mjs`                           | Pure, DOM-free shared module: the spec→JSON-LD builder (used by `engine.js` and `generate-static.mjs`) plus small helpers the engine, generator and validator must agree on (URL checks, YouTube id parsing) | JSON-LD shape changes; a rule two of those files share |
| `tweaker.js`                                    | Dev-only live design-token panel (sliders, color pickers, presets, undo, Save to styles.css / Copy CSS); loaded by `engine.js` only when the URL has `?tweak`. Reads the tokens from `styles.css` itself | a new token's label / tab / slider range; a section preset |
| `generate-static.mjs`                           | Dev-only generator: stamps `llms.txt`, `sitemap.xml` + the static JSON-LD and LCP-image preload in `index.html` from the spec; `--check` mode is run by `launch-check` | adding a generated artifact         |
| `site-spec.<lang>.json`                         | Alternate-locale content (e.g. `site-spec.sk.json`); a full self-contained spec, loaded at runtime by the language switch | translating content; adding a language |
| `assets/`                                       | favicon, `background/` images, `slides/` images, `fonts/` woff2 | swapping media; changing fonts     |

<!-- Built from m-remis/static-web-template -->
