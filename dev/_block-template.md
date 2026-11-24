# Block template - copy this to add a new block type

This is the **canonical starting point** for adding a content block. A block
type lives in **five places that must agree**:

| # | Place | File |
|---|---|---|
| 1 | the renderer map `BLOCK_RENDERERS` | `engine.js` |
| 2 | the `BLOCK TYPES` comment at the top | `engine.js` |
| 3 | the validator map `BLOCK_RULES` | `dev/launch-check.js` |
| 4 | the `block` type enum + a `blockX` subschema | `site-spec.schema.json` |
| 5 | the block-types table | `docs/spec-format.md` |

`launch-check` cross-checks 1, 3, 4 and 5 and fails with `BLOCK_TYPE_DRIFT` when
they disagree. Number 2 is prose, so it is on you.

Copy the pieces below, rename `example` to your type, fill them in, and you've
satisfied Workflow B without reverse-engineering an existing builder.

> Full procedure: **Workflow B** in `docs/workflows.md`. This file is the
> fill-in-the-blanks companion. The `_` prefix and `.md` extension keep it out
> of the runtime - the engine never loads it.

Replace the name **`example`** everywhere (builder `buildExample`, map key
`example`, CSS `.example-block`, validator `checkExampleBlock` / `EXAMPLE_*`
codes, schema `blockExample`, and `"type": "example"`). Pick a short lowercase
noun: `hours`, `faq`, `cta`, `steps`.

---

## The checklist (from Workflow B)

- [ ] **1. Engine renderer** - add `buildExample()` + register it in
  `BLOCK_RENDERERS` (Piece 1).
- [ ] **2. Styles** - add the CSS, themed via existing tokens (Piece 2).
- [ ] **3. Engine comment** - add the shape to the `BLOCK TYPES` comment at the
  top of `engine.js` (Piece 3).
- [ ] **4. Validator** - add `checkExampleBlock()` and one entry in the
  `BLOCK_RULES` map in `dev/launch-check.js` (Piece 4). *Skipping this makes
  `launch-check` flag every use of the new type as unknown.*
- [ ] **5. Schema** - add a `blockExample` subschema to `site-spec.schema.json`,
  register it in `block.oneOf` and the `type` enum (Piece 5). *Skipping this
  makes the IDE flag every use of the new type as invalid.*
- [ ] **6. Docs + use it** - add a row to the block table in
  `docs/spec-format.md`, add to `dev/CLIENT-CHECKLIST.md` §1c if clients fill it
  in, then use `{ "type": "example", ... }` in `site-spec.json` (Piece 6).

**Done when** all five places list the type; `node --check engine.js` passes; a
test block renders; and `node dev/launch-check.js --template` reports no
`UNKNOWN_BLOCK_TYPE` and no `BLOCK_TYPE_DRIFT`.

---

## Piece 1 - Engine renderer (`engine.js`)

Add this with the other `buildX` builders (after `buildReview`, say). Keep it a
**pure builder**: read only the `block` argument, never `SITE`. Return a DOM
node, a fragment, or `null` (returning `null` on empty input means a misfilled
block silently disappears instead of rendering broken - the validator catches
the emptiness separately).

Three rules the skeleton below already follows. Keep them when you fill it in:

- **Spec text that reaches `innerHTML` goes through `safeText()`.** `el()`'s
  third argument is assigned to `innerHTML`, so `el("p", {}, it.label)` with a
  raw spec value is an injection hole. `safeText(value)` coerces to a string
  and strips everything except the small inline allowlist (`<em>`, `<strong>`,
  `<a href>`, ...). For text that should allow no HTML at all, set
  `.textContent` instead.
- **Attributes take the raw value.** Anything passed in `el()`'s attrs object
  (`alt`, `aria-label`, `title`, `href`) is set with `setAttribute`, which
  never parses HTML - do not `safeText()` or escape those.
- **User-facing strings the spec doesn't carry come from `t()`.** An
  `aria-label`, a fallback caption, a button title: add a key to **both**
  locales in the `UI` table at the top of `engine.js` and read it with
  `t("key")`. Never hardcode an English string in a builder. For the same
  reason, never name a local variable `t`.

```js
/* example - ONE-LINE DESCRIPTION OF WHAT THIS BLOCK SHOWS.
   Shape: { name?, blurb?, items: [ { label, url? } ] }   // describe required fields
   `name`/`blurb` are the house-standard optional heading + intro, matching
   table/slideshow/gallery. Drop the appendBlockHeader() call if this block
   doesn't need them. */
function buildExample(block) {
    // 1. Guard: bail to null if there's nothing to render. Mirror the field
    //    your block actually requires (table checks headings+rows; cards
    //    checks items; gallery checks images).
    const items = (block.items || []).filter((it) => it && it.label);
    if (!items.length) return null;

    // 2. Outer wrapper. Class name = `<type>-block`, matching .table-block /
    //    .carousel-block / .gallery-block.
    const wrapper = el("div", {class: "example-block"});

    // 3. Optional name + blurb - ONE call. appendBlockHeader() emits the
    //    shared `block__name` / `block__blurb` classes (styled once in
    //    styles.css) plus `example__name` / `example__blurb` for overrides,
    //    and sanitizes both values. Don't hand-roll the <h3>.
    appendBlockHeader(wrapper, block, "example");

    // 4. The actual content. Build it with el(); append to wrapper.
    //    el(tag, attrs, html): attrs with null/false/undefined values are
    //    skipped, `true` becomes a bare attribute, and `html` is innerHTML -
    //    hence safeText() on every spec value passed there.
    const list = el("ul", {class: "example__list"});
    items.forEach((it) => {
        const li = el("li", {class: "example__item"});
        if (it.url) {
            // linkAttrs() adds target=_blank + rel=noopener to external URLs.
            li.appendChild(el("a", linkAttrs(it.url), safeText(it.label)));
        } else {
            li.innerHTML = safeText(it.label);
        }
        list.appendChild(li);
    });
    wrapper.appendChild(list);

    return wrapper;
}
```

Then register it - one line at the end of the `BLOCK_RENDERERS` map (don't
retype the map; just add the entry):

```js
const BLOCK_RENDERERS = {
    // ...existing entries...
    example: buildExample,   // <-- add
};
```

There is **no width step** - every block fills the single content column. Don't
add a width field.

Adding a listener? Listeners on nodes the builder creates need nothing extra.
A timer, or a listener on `window` / `document` / a static shell element, must
be registered with `onTeardown()` / `on()` so a language switch can undo it -
see "Re-rendering in place" in `docs/engine-internals.md`.

---

## Piece 2 - Styles (`styles.css`)

Add near the other block styles. **Only use existing theme tokens** (listed in
the two `[data-theme]` blocks) so the block re-themes in light/dark for free and
the 404 page inherits it. Never inline a hex; if you need a new color, add a
named variable to **both** theme blocks (see Workflow D). You do **not** need
spacing-between-blocks CSS - `.block + .block` handles vertical rhythm globally.

```css
/* ---- Example block ---------------------------------------------------- */
/* Rendered by buildExample() in engine.js from an `example` block. Uses the
   same tokens as cards/table so it matches and re-themes automatically. */

/* Heading + blurb need NO CSS here - the shared `.block__name` /
   `.block__blurb` rules style them. Only add a `.example__name { ... }` rule
   if THIS block needs to differ from the default. */

.example__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
}

/* A panel row, matching the .link-list a / .card surface treatment. */
.example__item {
    padding: 0.85rem 1.1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-panel);
    color: var(--text);
}
```

Two house patterns:

- **Frosted blur:** do not write `backdrop-filter` in the block's own rule. Add
  the selector (here `.example__item`) to the grouped "Frosted panels" rule
  near the top of `styles.css`, which carries the prefixed + unprefixed pair
  once for every translucent surface.
- **Hover:** put hover styling inside `@media (hover: hover) { ... }` right
  next to the component, so touch devices never get a sticky hover state.
  There is nothing to undo elsewhere. Press feedback (`:active`) stays outside
  the media query.

```css
@media (hover: hover) {
    .example__item:hover {
        border-color: var(--accent);
    }
}
```

---

## Piece 3 - Engine comment (`engine.js` `BLOCK TYPES`)

In the big comment block at the top of `engine.js`, add a line matching the
others so the shape is documented where builders live:

```text
     { "type": "example", "name","blurb", "items": [ { "label","url" } ] }
```

---

## Piece 4 - Validator (`dev/launch-check.js`)

Two edits, both mirroring the existing block checks.

**4a.** Add a `checkExampleBlock()` next to the others. Use `fail()` for "this
won't render / is broken" and `warn()` for "looks off but renders". Reuse a
category (`spec, content, links, seo, manifest, assets, accessibility,
performance`) and give each finding a stable uppercase `CODE`:

```js
function checkExampleBlock(block, where, sectionIds) {
    // Required field -> fail (the builder returns null without it).
    if (!Array.isArray(block.items) || block.items.length === 0) {
        fail("spec", "EXAMPLE_EMPTY", `${where} (example) has no "items"`);
        return;
    }

    // Per-item checks. Mirror checkFaqBlock / checkReviewBlock.
    block.items.forEach((it, i) => {
        const iw = `${where}.items[${i}]`;
        if (!hasNonEmptyString(it && it.label)) {
            fail("spec", "EXAMPLE_ITEM_NO_LABEL", `${iw} (example) has no "label"`);
        }
        // Any URL field: checkUrlValue validates the form and, given the
        // section ids, that a "#/id" link points at a real section.
        if (it && it.url) checkUrlValue(it.url, `${iw}.url`, { sectionIds });
    });

    // If a field has a numeric range/enum, validate it like gallery's columns:
    //   if (block.someNum != null) { const n = Number(block.someNum);
    //     if (!Number.isInteger(n) || n < 1 || n > 6) warn(...); }
}
```

Available helpers: `hasNonEmptyString(v)`, `plainTextLength(v)`,
`checkUrlValue(value, where, opts)`,
`checkImageLike(node, where, opts)` (for image-bearing blocks),
`checkDuplicateValue(seenSet, value, category, code, prefix)`.

**4b.** Add ONE entry to the `BLOCK_RULES` map near the top of the file. That
map is both the list of known types and the dispatch - there is no separate
`switch` to extend. Without the entry every use is flagged
`UNKNOWN_BLOCK_TYPE`. Each entry receives `(block, where, ctx)`, where `ctx` is
`{ section, sectionIds }`; pass on only what your check needs:

```js
const BLOCK_RULES = Object.freeze({
    // ...existing entries...
    example: (block, where, ctx) => checkExampleBlock(block, where, ctx.sectionIds),
});
```

If you changed what the validator checks in a way a user should know about,
add a line to `dev/LAUNCH-CHECK.md` too (Workflow F).

---

## Piece 5 - Schema (`site-spec.schema.json`)

Three edits, mirroring an existing block subschema (copy `blockFaq` or
`blockReview`).

**5a.** Add a `blockExample` subschema in `$defs`. `additionalProperties: false`
plus `required` mirror the validator's required fields, so the IDE flags typos
and missing fields. List **every** field the builder reads - a field missing
here is an editor error even though the engine renders it:

```json
"blockExample": {
  "type": "object",
  "additionalProperties": false,
  "description": "One-line description of what it renders.",
  "required": ["type", "items"],
  "properties": {
    "type": { "const": "example" },
    "name": { "type": "string" },
    "blurb": { "type": "string" },
    "items": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["label"],
        "properties": {
          "label": { "type": "string", "minLength": 1 },
          "url": { "type": "string" }
        }
      }
    }
  }
}
```

**5b.** Register it in the `block.oneOf` list: `{ "$ref": "#/$defs/blockExample" }`.

**5c.** Add the type to the `block.properties.type.enum` array so the bare
`"type"` field autocompletes it.

> Verify: your `site-spec.json` still validates, and a deliberately-broken
> example block (wrong field name, missing `items`) lights up red in the editor.

---

## Piece 6 - Docs + use it

**6a.** Add a row to the block-types table in `docs/spec-format.md` ("Block
types and their builders"). `launch-check` parses this table, so keep the first
two cells in the same backticked form as the other rows:

```text
| `example`    | `buildExample`   | one-line description of what it renders     |
```

**6b.** If clients commonly fill this in, add it to `dev/CLIENT-CHECKLIST.md` §1c
(the per-block placeholder list).

**6c.** Use it in `site-spec.json` (and in every `site-spec.<lang>.json`, which
are full copies of the spec):

```json
{
  "type": "example",
  "name": "Example",
  "blurb": "Short intro line.",
  "items": [
    { "label": "First" },
    { "label": "Second", "url": "https://example.com/" }
  ]
}
```

**6d.** Validate, in this order:

```bash
node -e "JSON.parse(require('fs').readFileSync('site-spec.json','utf8'))"
node --check engine.js
node dev/generate-static.mjs
node dev/launch-check.js --template   # drop --template on a client site
```

Then serve the site (`python3 -m http.server 8000`) and confirm the block
renders in light + dark and on a narrow viewport.

<!-- Built from m-remis/static-web-template -->
