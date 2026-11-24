A small, fast, static site. No frameworks, no build step, no dependencies -
just HTML, CSS, and vanilla JS.

## How it works

All content lives in **`site-spec.json`** - the brand, the nav tabs, every
section and its content blocks, the footer, the socials, the background images,
and the page metadata. The engine (`engine.js`) fetches that file on load and
renders the whole page from it; `index.html` is just an empty shell. To change
what the site says, edit `site-spec.json` - not the HTML or the JS.

## Project structure

```text
.
├── index.html              # mostly empty shell - content is injected by the engine
├── engine.js               # the runtime: fetches the spec, renders every block, all UI logic
├── styles.css              # all styling + the light/dark theme tokens (incl. --accent)
├── business-jsonld.mjs     # spec → schema.org JSON-LD (shared by the runtime + the generator)
├── 404.html                # custom not-found page (inherits its theme from styles.css)
├── 404.css
│
├── site-spec.json          # ◀━━ ALL content + metadata - the single source of truth (default: English)
├── site-spec.sk.json       # Slovak copy - loaded at runtime by the language switch (localStorage)
├── site-spec.schema.json   # JSON Schema for the spec → live validation + autocomplete in the editor
│
├── llms.txt                # GENERATED - plain-text mirror of the site for AI crawlers
├── sitemap.xml             # GENERATED - SEO sitemap
│
├── site.webmanifest        # PWA manifest
├── robots.txt              # crawler rules + explicit AI-crawler opt-in
├── _headers                # Cloudflare Pages caching + security headers
├── .nojekyll               # tell GitHub Pages to skip Jekyll processing
├── .gitignore
├── LICENSE
│
├── README.md               # this file
├── AGENTS.md               # agent router: hard rules + which doc to read for which task
├── docs/                   # the agent docs AGENTS.md routes to
│   ├── workflows.md        # what each kind of change obligates (A-G)
│   ├── spec-format.md      # site-spec.json shape + every block type
│   ├── engine-internals.md # key functions, teardown registry, header fit, background
│   ├── theming.md          # theme tokens
│   ├── i18n.md             # the runtime language switch
│   └── gotchas.md          # load-bearing behaviors + how to verify by hand
├── CLAUDE.md               # points coding agents at AGENTS.md
│
├── dev/                    # development tools + their docs - not part of the running site
│   ├── CLIENT-CHECKLIST.md # per-client setup checklist (incl. §1d: adding a language)
│   ├── generate-static.mjs # regenerates llms.txt, sitemap.xml + index.html's static tags from the spec
│   ├── launch-check.js     # pre-deploy validator (placeholders, fake data, broken assets…)
│   ├── LAUNCH-CHECK.md     # what launch-check.js checks, and how to run it
│   ├── tweaker.js          # live design-token panel, loaded only with ?tweak in the URL
│   ├── tweaker.css         # the panel's styles (loaded into its Shadow DOM)
│   └── _block-template.md  # copyable skeleton for adding a new block type
│
└── assets/
    ├── favicon.ico
    ├── background/          # crossfaded in list order on a timer - list the paths in site-spec.json → "backgrounds"
    │   ├── background.jpg
    │   ├── background_2.jpg
    │   └── background_3.jpg
    ├── slides/              # demo images for the slideshow / gallery / photo blocks
    │   ├── mountains.jpg
    │   └── …
    └── fonts/               # self-hosted Inter + Oswald (woff2) - no Google Fonts request
        ├── inter-latin.woff2
        └── …
```

> **Content vs. generated:** you edit `site-spec.json` (and any
> `site-spec.<lang>.json`); `llms.txt`, `sitemap.xml`, and the JSON-LD + LCP
> preload inside `index.html` are **generated** from it by `dev/generate-static.mjs`
> - never by hand. Backgrounds are **listed explicitly** in the spec's
> `backgrounds` array, not auto-discovered.
>
> No `CNAME` ships by default - add one (a single line with your domain) only if
> you deploy to a custom domain; see **Deploy**.

## Run it locally

The page fetches `site-spec.json`, so it must be served over HTTP (opening the
file directly with `file://` fails the fetch). From the repo root:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

After editing the spec, sanity-check the JSON:

```bash
node -e "JSON.parse(require('fs').readFileSync('site-spec.json','utf8'))"
```

`site-spec.json` is also covered by a JSON Schema (**`site-spec.schema.json`**),
referenced from the spec's `$schema` field. An editor like VS Code or IntelliJ
reads it to validate block types and fields live - wrong block type or a typo'd
field lights up red as you type, before you ever run the validator.

After a content edit, regenerate the derived artifacts (`llms.txt` plus the
static JSON-LD and the LCP-image preload in `index.html` - all built from the
spec, never edited by hand):

```bash
node dev/generate-static.mjs
```

And before deploying, run the preflight validator - it catches placeholders,
fake contact data, broken assets, domain mismatches, and stale generated
artifacts:

```bash
node dev/launch-check.js
```

To restyle visually, open the local site with `?tweak` in the URL (e.g.
`http://localhost:8000/?tweak`): a floating panel lets you change colors (both
themes), sizes, radius, fonts, header tabs and the background animation live,
with undo and saved presets. "Save to styles.css" writes the result into the
file (Chrome / Edge); "Copy CSS" gives it to you to paste. Details in
`docs/theming.md`.

## Docs

- **`dev/CLIENT-CHECKLIST.md`** - what to fill in for a new client site, file by
  file (content, metadata, assets, deploy).
- **`AGENTS.md`** - the agent router: hard rules, the file map, and which
  `docs/` file to read for which task. Start here before changing behavior or
  adding a block type; the detail (block system, theming, the tricky bits)
  lives in `docs/`.
- **`dev/LAUNCH-CHECK.md`** - the `dev/launch-check.js` preflight validator: what it
  checks and how to run it.
- **`site-spec.schema.json`** - JSON Schema for `site-spec.json`; gives live
  validation + autocomplete in the editor. Not a doc to read, but keep it in
  sync when you add a block type or field.

## Deploy

Any static host works (GitHub Pages, Netlify, Vercel, Cloudflare Pages) - point
it at the folder. `.nojekyll` is included for GitHub Pages. For a custom domain,
add a `CNAME` file; see `dev/CLIENT-CHECKLIST.md`.

<!-- Built from m-remis/static-web-template -->