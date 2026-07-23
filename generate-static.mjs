#!/usr/bin/env node
/* =========================================================
   Static site template
   generate-static.mjs — dev-only generator for the static AI/crawler mirrors

   Derives four artifacts from site-spec.json (the single source of truth):

     1. The static JSON-LD <script> in index.html — the same schema.org
        object renderJsonLd() emits at runtime, stamped statically so
        crawlers that don't run JS see it too. Built by the SAME code
        (business-jsonld.mjs), so the two can't drift; at boot the engine
        upserts this exact tag (matched by its data-jsonld marker).

     2. The LCP-image <link rel="preload"> in index.html — the default tab's
        first carousel/gallery image, stamped so the browser starts the
        download at HTML-parse time instead of after the engine renders
        (matched by its data-preload marker).

     3. llms.txt — the plain-text site summary for AI agents, generated
        from the spec's sections instead of hand-maintained.

     4. sitemap.xml — one <url> for the canonical root, with <lastmod>
        taken from the spec file's mtime (the spec IS the content, so its
        last edit is the page's last modification).

   Usage:
     node generate-static.mjs           # rewrite both artifacts
     node generate-static.mjs --check   # exit 2 + list if either is stale
                                        # (launch-check runs this mode)

   Like launch-check.js this is a dev tool: Node built-ins only, never
   served, run by hand (or by launch-check) — it does not violate the
   no-build rule; the runtime site stays plain static files.

   NOTE the Slovak strings below are presentation labels (day names, section
   scaffolding), same precedent as KIND_LABELS/HOURS_DAYS in engine.js —
   the CONTENT all comes from the spec.
   ========================================================= */

import {readFileSync, statSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {buildBusinessJsonLd} from "./business-jsonld.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CHECK = process.argv.includes("--check");

const SPEC_PATH = join(ROOT, "site-spec.json");
const HTML_PATH = join(ROOT, "index.html");
const LLMS_PATH = join(ROOT, "llms.txt");
const SITEMAP_PATH = join(ROOT, "sitemap.xml");

/* ---- small helpers ------------------------------------------------------ */

/* Flatten the spec's small inline HTML (<em>, <a>, <br>…) to plain text. */
function stripHtml(s = "") {
    return String(s)
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const DAY_LABELS = [
    ["mon", "pondelok"], ["tue", "utorok"], ["wed", "streda"], ["thu", "štvrtok"],
    ["fri", "piatok"], ["sat", "sobota"], ["sun", "nedeľa"],
];

/* ---- llms.txt ------------------------------------------------------------

   Header (title + description + how-this-site-works note), a contact block
   from SITE.business (the SSOT), then a walk over the sections rendering the
   text-bearing blocks. Blocks whose data is already in the contact block
   (`links` SSOT refs, `hours`, `map`) and image-only blocks are skipped. */

function buildLlmsTxt(spec) {
    const meta = spec.meta || {};
    const b = spec.business || {};
    const out = [];

    out.push(`# ${stripHtml(meta.title || spec.brand || "")}`);
    out.push("");
    if (meta.description) {
        out.push(`> ${stripHtml(meta.description)}`);
        out.push("");
    }
    out.push("Stránka je jednostránková aplikácia renderovaná JavaScriptom — tento súbor");
    out.push("zhŕňa jej obsah v čistom texte." + (meta.author ? ` Vedie ju ${meta.author}.` : ""));
    out.push("");

    // ---- Contact block from the business SSOT ----
    const contact = [];
    if (b.address && (b.address.label || b.address.street)) {
        const label = b.address.label || [b.address.street, b.address.city].filter(Boolean).join(", ");
        const country = b.address.country ? `, ${b.address.country}` : "";
        contact.push(`- Adresa: ${label}${country}`);
    }
    if (b.phone) contact.push(`- Telefón: ${b.phone}`);
    if (b.email) contact.push(`- E-mail: ${b.email}`);
    (spec.socials || []).forEach((s) => {
        if (!s || !s.url) return;
        const kind = s.icon ? s.icon.charAt(0).toUpperCase() + s.icon.slice(1) : (s.label || "Odkaz");
        contact.push(`- ${kind}: ${s.url}`);
    });
    if (b.mapUrl) contact.push(`- Mapa: ${b.mapUrl}`);
    if (b.hours && typeof b.hours === "object") {
        const days = DAY_LABELS
            .map(([key, label]) => {
                const v = typeof b.hours[key] === "string" ? b.hours[key].trim() : "";
                return v ? `  - ${label}: ${v}` : null;
            })
            .filter(Boolean);
        if (days.length) {
            contact.push("- Otváracie hodiny:");
            contact.push(...days);
        }
    }
    if (contact.length) {
        out.push("## Kontakt a otváracie hodiny");
        out.push("");
        out.push(...contact);
        out.push("");
    }

    // ---- Section walk ----
    (spec.sections || []).forEach((section) => {
        if (!section || !Array.isArray(section.blocks)) return;

        const lines = [];
        section.blocks.forEach((block) => {
            if (!block || !block.type) return;

            switch (block.type) {
                case "hero":
                    if (block.lead) lines.push(stripHtml(block.lead), "");
                    break;
                case "text":
                    if (block.name) lines.push(`### ${stripHtml(block.name)}`, "");
                    // <br/> is a deliberate line break in the spec — keep each
                    // line its own llms.txt line instead of fusing them.
                    if (block.text) {
                        lines.push(...String(block.text).split(/<br\s*\/?>/gi).map(stripHtml), "");
                    }
                    break;
                case "cards":
                    (block.items || []).forEach((it) => {
                        if (it && it.title && it.body) {
                            lines.push(`- **${stripHtml(it.title)}** — ${stripHtml(it.body)}`);
                        }
                    });
                    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
                    break;
                case "table": {
                    const headings = block.headings || [];
                    const rows = block.rows || [];
                    if (!headings.length || !rows.length) break;
                    if (block.name) lines.push(`### ${stripHtml(block.name)}`, "");
                    if (block.blurb) lines.push(stripHtml(block.blurb), "");
                    rows.forEach((row) => {
                        const cells = (Array.isArray(row) ? row : [row]).map((c) => stripHtml(c == null ? "" : String(c)));
                        if (!cells[0]) return;
                        const mid = cells.slice(1, -1).filter(Boolean).join("; ");
                        const last = cells.length > 1 ? cells[cells.length - 1] : "";
                        lines.push(`- ${cells[0]}${mid ? ` (${mid})` : ""}${last ? `: ${last}` : ""}`);
                    });
                    lines.push("");
                    break;
                }
                case "faq":
                    if (block.name) lines.push(`### ${stripHtml(block.name)}`, "");
                    (block.items || []).forEach((it) => {
                        if (it && it.q != null && it.a != null) {
                            lines.push(`- **${stripHtml(it.q)}** ${stripHtml(it.a)}`);
                        }
                    });
                    lines.push("");
                    break;
                case "links":
                    // SSOT refs (`use`) are already in the contact block; only
                    // inline items (e.g. the podcast links) are section content.
                    (block.items || []).forEach((it) => {
                        if (it && it.url) {
                            const kind = it.kind ? `${stripHtml(it.kind)}: ` : "";
                            lines.push(`- ${kind}[${stripHtml(it.label || it.url)}](${it.url})`);
                        }
                    });
                    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
                    break;
                case "review":
                    (block.items || []).forEach((it) => {
                        if (it && it.url && it.label) lines.push(`- [${stripHtml(it.label)}](${it.url})`);
                    });
                    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
                    break;
                case "video": {
                    // `url` (pinned video) links as-is; `playlist` (auto-newest)
                    // links the playlist page — a bare id gets wrapped into the
                    // canonical playlist URL, a full URL passes through.
                    const label = stripHtml(block.title || block.name || "Video");
                    const target = block.url
                        || (block.playlist && (/^[A-Za-z0-9_-]{13,42}$/.test(String(block.playlist).trim())
                            ? `https://www.youtube.com/playlist?list=${String(block.playlist).trim()}`
                            : block.playlist));
                    if (target) lines.push(`- Video: [${label}](${target})`, "");
                    break;
                }
                default:
                    // slideshow / gallery / photo / map / hours: images or data
                    // already covered by the contact block — nothing to add.
                    break;
            }
        });

        if (lines.length) {
            out.push(`## ${stripHtml(section.title || section.label || section.id)}`);
            out.push("");
            out.push(...lines);
            while (out[out.length - 1] === "") out.pop();
            out.push("");
        }
    });

    // ---- Machine-readable pointers ----
    if (meta.domain) {
        const domain = meta.domain.replace(/\/+$/, "");
        out.push("## Odkazy");
        out.push("");
        out.push(`- [Web](${domain}/): hlavná stránka (obsah renderuje JavaScript zo site-spec.json)`);
        out.push(`- [site-spec.json](${domain}/site-spec.json): kompletný obsah stránky v strojovo čitateľnom JSON`);
        out.push("");
    }

    out.push("<!-- GENEROVANÉ zo site-spec.json (node generate-static.mjs) — needituj ručne. -->");
    return out.join("\n") + "\n";
}

/* ---- LCP image preload in index.html --------------------------------------

   The default tab's first carousel/gallery image is the page's likely LCP
   element, but the browser can't discover it until engine.js has run and
   built the DOM from the spec. Stamping a <link rel="preload"> for it into
   index.html starts that download at HTML-parse time instead. Mirrors the
   engine's eager-image choice (renderContent()'s priority pass gives this
   same image fetchpriority=high): first slideshow/gallery/photo block of the
   FIRST section, in block order. Booting into another tab via #hash wastes
   this one preload — accepted tradeoff, the default tab is the common entry. */

function firstSectionLcpImage(spec) {
    const section = (spec.sections || [])[0];
    if (!section || !Array.isArray(section.blocks)) return null;
    for (const block of section.blocks) {
        if (!block) continue;
        if (block.type === "slideshow" && block.slides && block.slides[0] && block.slides[0].src) {
            return block.slides[0].src;
        }
        if (block.type === "gallery" && block.images && block.images[0]) {
            return block.images[0].thumb || block.images[0].src || null;
        }
        if (block.type === "photo" && block.src) {
            return block.src;
        }
    }
    return null;
}

const PRELOAD_TAG_RE = /<link rel="preload" data-preload="lcp"[^>]*\/>/;

function buildLcpPreload(html, spec) {
    const src = firstSectionLcpImage(spec);
    if (!src) {
        // No image-bearing block in the first section — drop a stale tag.
        return html.replace(PRELOAD_TAG_RE, "").replace(/\n +\n/g, "\n");
    }

    const tag = `<link rel="preload" data-preload="lcp" as="image" href="${src}" fetchpriority="high"/>`;

    if (PRELOAD_TAG_RE.test(html)) {
        return html.replace(PRELOAD_TAG_RE, tag);
    }
    return html.replace(
        "\n</head>",
        "\n    <!-- Preload of the default tab's first image (the likely LCP element),\n" +
        "         so it downloads in parallel with engine.js instead of waiting for\n" +
        "         the render. GENERATED — do not edit: run `node generate-static.mjs`. -->\n" +
        `    ${tag}\n</head>`
    );
}

/* ---- sitemap.xml -----------------------------------------------------------

   Single-page site → single <url>, but with a <lastmod> so crawlers can
   schedule recrawls instead of guessing. The date is the spec file's mtime
   (day granularity): the spec is the only content source, so its last write
   IS the page's last modification. Tradeoff: a fresh git clone resets mtimes,
   so --check may flag the sitemap stale there — rerun the generator once and
   it settles; day granularity keeps that churn rare. */

function buildSitemapXml(spec) {
    const domain = String((spec.meta || {}).domain || "").replace(/\/+$/, "");
    if (!domain) return null;
    const lastmod = statSync(SPEC_PATH).mtime.toISOString().slice(0, 10);
    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<!-- GENERATED from site-spec.json (node generate-static.mjs) — do not edit by hand. -->`,
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
        `    <url>`,
        `        <loc>${domain}/</loc>`,
        `        <lastmod>${lastmod}</lastmod>`,
        `        <changefreq>monthly</changefreq>`,
        `        <priority>1.0</priority>`,
        `    </url>`,
        `</urlset>`,
    ].join("\n") + "\n";
}

/* ---- static JSON-LD in index.html ---------------------------------------- */

const JSONLD_TAG_RE = /<script type="application\/ld\+json" data-jsonld="business">[\s\S]*?<\/script>/;

function buildIndexHtml(html, spec) {
    const data = buildBusinessJsonLd(spec);
    if (!data) return html;

    // Compact stringify to byte-match what renderJsonLd() writes at runtime.
    const tag = `<script type="application/ld+json" data-jsonld="business">${JSON.stringify(data)}</script>`;

    if (JSONLD_TAG_RE.test(html)) {
        return html.replace(JSONLD_TAG_RE, tag);
    }
    return html.replace(
        "\n</head>",
        "\n    <!-- Static mirror of the runtime JSON-LD for crawlers that don't run JS.\n" +
        "         GENERATED — do not edit: run `node generate-static.mjs`. The engine\n" +
        "         upserts this same tag (by its data-jsonld marker) at boot. -->\n" +
        `    ${tag}\n</head>`
    );
}

/* ---- main ----------------------------------------------------------------- */

const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));

// Sitemap is skipped (not marked stale) when meta.domain is unset — no
// domain, no valid <loc> to emit.
const sitemapNext = buildSitemapXml(spec);

const outputs = [
    {path: LLMS_PATH, name: "llms.txt", next: buildLlmsTxt(spec)},
    {path: HTML_PATH, name: "index.html", next: buildLcpPreload(buildIndexHtml(readFileSync(HTML_PATH, "utf8"), spec), spec)},
    ...(sitemapNext != null ? [{path: SITEMAP_PATH, name: "sitemap.xml", next: sitemapNext}] : []),
];

const stale = outputs.filter((o) => {
    let current = "";
    try {
        current = readFileSync(o.path, "utf8");
    } catch {
        // missing file counts as stale
    }
    return current !== o.next;
});

if (CHECK) {
    if (stale.length) {
        console.error(`STALE: ${stale.map((o) => o.name).join(", ")} — run \`node generate-static.mjs\``);
        process.exit(2);
    }
    console.log("generated artifacts up to date");
    process.exit(0);
}

if (!stale.length) {
    console.log("nothing to do — generated artifacts already up to date");
} else {
    stale.forEach((o) => {
        writeFileSync(o.path, o.next);
        console.log(`wrote ${o.name}`);
    });
}

/*
 * Built from m-remis/static-web-template
 * https://github.com/m-remis/static-web-template
 */
