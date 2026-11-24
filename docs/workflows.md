<!-- Built from m-remis/static-web-template -->

# Workflows - what a change obligates

> Part of the agent docs. Router: `AGENTS.md`.

## Workflows (what a change obligates)

Most mistakes here are not wrong edits - they are *incomplete* ones: the code
changes but a doc, a mirror file, or the validator is left describing the old
world. This section maps each kind of task to the **full** set of edits it
requires, so a change lands consistent instead of drifting.

The rule of thumb: **if you change a fact, change every place that states it.**
A block type is stated in five places; the domain and the dark background
color in five or more each. Pick
your task below and do the whole row, not just the first cell.

| If you're changing… | Go to workflow |
|---|---|
| site text, tabs, contact, prices, images, socials | **A - Content edit** |
| adding/removing/renaming a block *type* | **B - New block type** |
| a builder's accepted fields (no new type) | **C - Block fields change** |
| colors / theme tokens | **D - Theme/color edit** |
| domain, title, description, OG, metadata | **E - Metadata/domain edit** |
| a `dev/launch-check.js` rule or category | **F - Validator change** |
| any engine behavior (tabs, menu, header-fit, …) | **G - Behavior change** |

Every workflow ends with the same gate: run the validation commands from Hard
Rule 4 in `AGENTS.md` and reach `launch-check` `PASS` (or only-expected
warnings). In this template repo that is `node dev/launch-check.js --template`,
which does not count the placeholder domain and demo contact data the template
ships with; on a client site run it without the flag.

### Workflow A - Content edit (the 90% case)

**Trigger:** change what the site *says* - copy, a tab, a price row, a contact
handle, a slideshow image, a social link.

1. Edit `site-spec.json` only. Nothing in `engine.js`/`styles.css`/`index.html`
   should need to move for a pure content change.
2. Run `node dev/generate-static.mjs` - it refreshes the derived artifacts
   (`llms.txt`, `sitemap.xml`, plus the static JSON-LD and the LCP-image
   preload in `index.html`) from the spec.
   Skipping this makes `launch-check` fail with `GENERATED_STALE`.
3. If you added a social platform that isn't in `SOCIAL_ICONS` yet, that's not
   content - switch to **Workflow B**'s icon note.

**Ripple - also update:** nothing by hand; the generator owns the mirrors.
**Done when:** JSON parses, `launch-check` passes, the affected tab renders.

### Workflow B - Adding (or removing/renaming) a block *type*

**Trigger:** a genuinely new *kind* of content (e.g. `hours`, `faq`, `cta`), or
removing/renaming an existing type. This is the one content task that is real
code, and it touches **five places that must agree**.

> **Start from the skeleton:** `dev/_block-template.md` has every piece (builder,
> CSS, comment line, validator check, schema, docs row) pre-written to the
> house style -
> copy it and rename `example` → your type rather than hand-writing from
> scratch. The steps below are what that template fills in.

1. **Engine:** write `buildX(block)` in `engine.js` (pure DOM builder - reads
   only its `block` arg, never `SITE`), and add `yourtype: buildX` to the
   `BLOCK_RENDERERS` map.
2. **Styles:** add the block's CSS in `styles.css`, themed via existing tokens.
3. **Engine docs (in-file):** add the block's shape to the `BLOCK TYPES` comment
   at the top of `engine.js`.
4. **Validator:** write a `checkXBlock()` for its required fields in
   `dev/launch-check.js` and add `yourtype: (block, where) => checkXBlock(block,
   where)` to the `BLOCK_RULES` map (the one list of known types - there is no
   separate `switch` to extend). **Skipping this makes
   `launch-check` falsely flag every use of the new type as unknown.**
5. **Schema:** add the block's shape to `site-spec.schema.json` (a `blockX`
   subschema in `$defs`, add it to the `block.oneOf` list and the `type` enum)
   so the editor validates and autocompletes it. **Skipping this makes the IDE
   flag every use of the new type as an invalid block.**
6. **Docs:** add a row to the block-types table in `docs/spec-format.md` and,
   if it's a notable function, the "Key functions" list in
   `docs/engine-internals.md`.
7. **dev/CLIENT-CHECKLIST.md:** if the type is something clients will commonly fill
   in, add it to the §1c per-block list.

**Ripple checklist - a new block type is not done until:** `BLOCK_RENDERERS`,
`BLOCK_RULES`, the `engine.js` `BLOCK TYPES` comment, `site-spec.schema.json`,
and the `docs/spec-format.md` table **all** list it. `launch-check`
cross-checks four of the five (`BLOCK_TYPE_DRIFT`); the `BLOCK TYPES` comment
is prose and is on you. (Removing a type: delete from the same five places,
and grep
`site-spec.json` so no section still uses it.)
**Done when:** the five places agree, `node --check engine.js` passes, a test
block of the new type renders, and `launch-check` doesn't warn "unknown type".

### Workflow C - Changing a block's accepted fields (no new type)

**Trigger:** a builder starts accepting a new field, or stops accepting one
(e.g. `gallery` gains a `columns` option).

1. **Engine:** change `buildX()` to read the field.
2. **Engine docs:** update that block's line in the `BLOCK TYPES` comment.
3. **Validator:** if the field is required, or has a constraint (range, enum),
   reflect it in the block's `checkXBlock()` in `dev/launch-check.js`.
4. **Schema:** add or remove the field in the block's subschema in
   `site-spec.schema.json`. Every block subschema is
   `additionalProperties: false`, so **a field the schema doesn't list shows
   up as an error in the editor** even though the engine renders it.
5. **`docs/spec-format.md` / `dev/CLIENT-CHECKLIST.md`:** update the block's
   documented shape if the field is author-facing.

**Done when:** the `BLOCK TYPES` comment, the schema and any validator rule
match the builder's real behavior.

### Workflow D - Theme / color edit

**Trigger:** changing a color, especially `--bg-base`, or adding a token.

1. **Add to both theme blocks.** A new color is a named variable added under
   **both** `[data-theme="dark"]` and `[data-theme="light"]` in `styles.css` -
   never an inline hex in a rule. (Exception: per-platform social brand colors,
   which are intentionally identical across themes and live as `--brand-*`
   tokens in `:root` - see `docs/theming.md`.)
   **A shared token whose value reads a per-theme token** (e.g.
   `var(--accent)`) goes in the shared `[data-theme]` block, **not** `:root`:
   a `var()` inside a custom property resolves where it is declared, and the
   per-theme tokens only exist on `<body>`. In `:root` it silently resolves
   to nothing (this is what once hid the keyboard focus ring).
2. **If you changed dark `--bg-base`,** update its mirrors: `index.html`
   `theme-color`, `404.html` `theme-color`, `site.webmanifest` `theme_color`
   **and** `background_color`, and `meta.themeColor` in **every** spec file -
   `site-spec.json` *and* each `site-spec.<lang>.json`.

**Ripple - dark `--bg-base` is stated in 5 places, plus one per extra locale
spec.** Change them together; `launch-check` warns when a locale spec's
`meta.themeColor` differs from the default's (`LOCALE_DATA_DRIFT`).
**Done when:** light + dark both read correctly, the 404 page re-themes, and the
browser chrome color matches in both themes.

### Workflow E - Metadata / domain edit

**Trigger:** changing the domain, title, description, OG fields, or canonical.

1. **`site-spec.json` → `meta` is the source of truth.** Edit it there first;
   `renderHead()` drives the live `<head>` from it. Each
   `site-spec.<lang>.json` carries its **own** `meta` block with the same
   `domain`/`themeColor`, so mirror the change into every locale spec -
   `checkLocales()` warns (`LOCALE_DATA_DRIFT`) when a locale's `domain` /
   `themeColor` / `ogImage` differ from the default spec's.
4. **If the business name (`brand`) changed,** it is also typed as plain text
   in `site.webmanifest` (`name`, `short_name`), in `index.html` (`og:site_name`
   and the `<noscript>` heading) and in `404.html` (`<title>` and the
   per-language `docTitle` strings). `launch-check` warns on a leftover
   (`BRAND_MIRROR_STALE`).
2. **Mirror the static fallback in `index.html`** (title, description, author,
   og:*, canonical) - crawlers that don't run JS read these.
3. **If the domain changed,** also update `robots.txt`
   `Sitemap:`, the `index.html` canonical + `og:url` + `og:image` +
   `twitter:image` (the share-image fallbacks are absolute URLs - scrapers
   don't reliably resolve relative ones - so they carry the full host,
   currently `example.com`), and `CNAME` if present.
   `sitemap.xml` `<loc>` is GENERATED - `node dev/generate-static.mjs` refreshes
   it from `meta.domain`.

**Ripple - the domain is stated in ~5 places plus each locale spec, and
`launch-check` cross-checks all of them.** A mismatch in the default spec's
mirrors is a hard failure; a locale spec that disagrees with the default is a
warning.
**Done when:** `launch-check` reports no domain/metadata mismatch.

### Workflow F - Validator change (`dev/launch-check.js`)

**Trigger:** adding/changing a check, a category, a flag, or an error code.

1. **Code:** add the `checkX()` and call it from `main()`; reuse an existing
   category (`missing, spec, content, links, seo, manifest, assets,
   accessibility, performance`) and give the finding a stable uppercase `code`.
2. **Docs:** update `dev/LAUNCH-CHECK.md` - the "What it checks" list, and the
   category/flag/code references if you touched those.
3. **Keep it dependency-free, offline, CommonJS.** If a check needs a parser,
   network, or npm package, it doesn't belong here.

**Ripple:** a new category or flag must appear in `dev/LAUNCH-CHECK.md`, not just
the code. **Done when:** the script runs, and its docs describe what it now does.

### Workflow G - Behavior change (engine internals)

**Trigger:** changing tabs, theme, mobile menu, header-fit, background,
lightbox, scroll handling, etc.

1. **Edit the relevant `init*`/`build*` function in `engine.js`.**
2. **Adding a listener or a timer?** Read "Re-rendering in place (the teardown
   registry)" in `docs/engine-internals.md` first - anything attached to `window`, `document`, or a static
   shell element must go through `on()`/`onTeardown()`, or it doubles up on the
   next language switch.
3. **Check "Constraints / gotchas" in `docs/gotchas.md`** before touching scroll
   handling, header-fit, or the mobile drawer - several behaviors are load-
   bearing and look like dead code (e.g. the instant top-scroll on tab
   switches). If you change one, update its gotcha note so the next agent
   knows why.
4. **Update "Key functions in `engine.js`"** (`docs/engine-internals.md`) if you add/rename/remove a function
   or change what it does.
5. **Run the manual checks in "How to verify a change"** (`docs/gotchas.md`) - behavior changes are
   exactly what `launch-check` *can't* catch (it validates the spec, not the
   rendered result).

**Done when:** the relevant manual checks pass and any gotcha/function doc you
invalidated is updated.

### The drift rule (why this section exists)

This engine has already drifted once: the code grew `gallery`, `photo`, and
`meta.analytics` while the docs and validator still described the older,
smaller world. The block-type list living in five places is the canonical
example - treat "I changed a fact in one place" as a prompt to grep for the
others. When in doubt, `grep -rn "<the thing>" --exclude-dir=.git .` and fix
every hit that states the old value.
