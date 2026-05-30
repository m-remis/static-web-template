# Static site template

A small, fast, static site template. No frameworks, no build step,
no dependencies — just HTML, CSS, and vanilla JS. Clone it, edit one block of
text, drop in a couple of images, and deploy.

## Quick start (≈ 5 minutes)

1. **Edit your content.** Open `script.js` and edit the `SITE` object at the
   very top (marked `◀━━ EDIT THIS BLOCK`). That's brand name, all section
   text, projects, contact info, the map, and background image list. You rarely
   need to touch anything else.

2. **Set your map.** In `SITE.findMe.mapEmbed`, paste an embed URL from Google
   Maps → *Share* → *Embed a map* → copy the `src`. Or just change the address
   in the existing `?q=...` URL.

3. **Add background images.** Drop images into `assets/background/` and list
   their paths in `SITE.backgrounds`. One is picked at random per visit. Missing
   images fail silently to a plain background.

4. **Swap the favicon.** Replace `assets/favicon.ico` with your own.

5. **Update the metadata (for SEO/sharing).** Search the project for
   `example.com` and replace it with your real domain in three places:
   `index.html` (look for the `TODO` comment), `sitemap.xml`, and `robots.txt`.
   Also update `site.webmanifest` (name/description) and the `LICENSE`
   copyright line. The site works fine before you do this — it only affects
   search engines and social link previews.

That's it. Open `index.html` in a browser, or serve it:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Customizing the look

All colors live as CSS variables in `styles.css` under `[data-theme="dark"]`
and `[data-theme="light"]`, grouped by what they affect (backgrounds, text,
menu, accents). Change those to re-skin the entire site — both themes, every
page including the 404, and the browser-chrome color all update from that one
block. Nothing is duplicated elsewhere. Fonts are loaded from Google Fonts in
`index.html`.

## Loading content from your own backend (optional)

By default all content lives in the inline `SITE` object. If you'd rather serve
it from an API, set `SITE.dataUrl` (top of `script.js`) to a JSON endpoint:

```js
dataUrl: "/api/site.json",
```

On load, the site fetches that URL and overlays the JSON on top of the inline
defaults: any keys the JSON returns win, anything it omits falls back to what's
in the file. Arrays (like `services.items`) are replaced wholesale. The JSON
mirrors the `SITE` shape — you can send the whole object or just the parts that
change:

```json
{
  "brand": "Acme Corp",
  "intro": {
    "eyebrow": "Live data",
    "title": "Served <em>from</em> the backend."
  }
}
```

If the fetch fails (backend down, bad response), the page silently keeps the
inline content instead of breaking — so a deploy is never at the mercy of your
API being up.

## Features

- Tab-style navigation (each section is its own view; the URL hash deep-links
  to a tab, and back/forward work)
- Separate desktop and mobile navigation, frosted sticky header
- Light / dark theme toggle, saved to `localStorage` (respects system
  preference on first visit)
- Embedded map section
- Random background image with graceful fallback
- Custom 404 page that matches the site
- SEO basics: `sitemap.xml`, `robots.txt`, semantic metadata, PWA manifest
- Accessible: real buttons, ARIA tab roles, keyboard arrow navigation, skip
  link, focus states, reduced-motion support

## Deploying to GitHub Pages

1. Push to a repo and enable Pages (Settings → Pages → deploy from branch).
2. The included `.nojekyll` file is already set up so Pages serves the files
   as-is.
3. **Custom domain?** Create a file named `CNAME` (no extension) in the project
   root containing just your domain, e.g. `mysite.com`. Leave it out entirely
   if you're using the default `username.github.io/repo` URL. (This template
   ships without a CNAME on purpose, so it never claims a domain you don't own.)

Works equally well on Netlify, Vercel, Cloudflare Pages, or any static host —
just point it at the folder.

## File overview

| File                         | What it's for                                                   |
|------------------------------|-----------------------------------------------------------------|
| `index.html`                 | Page shell (mostly empty; content is injected by JS)            |
| `script.js`                  | **Your content** (`SITE` object) + all UI logic                 |
| `styles.css`                 | Styling + theme variables                                       |
| `404.html` / `404.css`       | Custom not-found page (inherits theme tokens from `styles.css`) |
| `AGENTS.md`                  | Instructions for AI coding agents working on the project        |
| `site.webmanifest`           | PWA metadata                                                    |
| `sitemap.xml` / `robots.txt` | SEO                                                             |
| `assets/`                    | Favicon + background images                                     |

<details>
<summary>Why this even exists</summary>

Because fuck my life, that's why.

I am a seasoned backend engineer, and somehow 90% of the time I am asked to create
a website, fix a printer, or explain why someone's computer is "acting weird."

This template gets a clean static site running in five minutes without centering
a div from scratch or managing 3000 npm packages for a technology stack that
should have never been even invented in the first place.

This way I have more time for fixing the printers.

</details>