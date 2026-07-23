/* =========================================================
   Static site template
   business-jsonld.mjs — pure spec → schema.org JSON-LD derivation

   ONE implementation, TWO consumers:
     - engine.js (browser) imports it for the runtime <script> tag
       (renderJsonLd), and reuses isExternalUrl/absoluteUrl generally.
     - generate-static.mjs (Node, dev-only) imports it to stamp the same
       object statically into index.html for crawlers that don't run JS.
   Keeping the builder here is what stops the two copies from drifting —
   don't duplicate this logic into either consumer.

   Everything in this file must stay pure and DOM-free (no document/window),
   or the Node consumer breaks. The .mjs extension is required so Node treats
   it as an ES module without a package.json (which the no-build rule forbids);
   browsers don't care about the extension.
   ========================================================= */

export const isExternalUrl = (url = "") => /^https?:\/\//i.test(url);

// Resolve a possibly-relative asset path (e.g. "assets/og_image.jpg") against
// the canonical domain. Crawlers and social scrapers require absolute URLs in
// og:image and JSON-LD `image`; relative ones are silently dropped by many.
// Already-absolute URLs and missing bases pass through untouched.
export const absoluteUrl = (url, base) => {
    if (!url || isExternalUrl(url) || !base) return url;
    return `${String(base).replace(/\/+$/, "")}/${String(url).replace(/^\/+/, "")}`;
};

export const JSONLD_DAY_NAMES = {
    mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
    fri: "Friday", sat: "Saturday", sun: "Sunday",
};

/* Parse a "9:00–17:00" style range (en/em dash or hyphen) into zero-padded
   {opens, closes}. Free-form values ("Closed", "By appointment") return
   null — those days are simply not emitted, which schema.org reads as
   closed/unspecified. */
export function parseHoursRange(value) {
    const m = /^\s*(\d{1,2})[:.](\d{2})\s*[–—-]\s*(\d{1,2})[:.](\d{2})\s*$/.exec(String(value || ""));
    if (!m) return null;
    const pad = (h) => h.padStart(2, "0");
    return {opens: `${pad(m[1])}:${m[2]}`, closes: `${pad(m[3])}:${m[4]}`};
}

/* Strip the spec's small inline HTML (<em>, <a>…) — table cells may carry it,
   JSON-LD strings must not. Deliberately minimal; mirrors the fuller
   stripHtml() in generate-static.mjs for the tag-removal part only. */
const stripTags = (s = "") => String(s).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/* Parse a price cell into {price, unit}. Whole prices ("12 €", "9,50 €")
   give unit: null; per-unit prices ("35 €/hod") carry the unit text.
   Free-form cells ("dohodou") return null — the offer is emitted without a
   price, which schema.org reads as price-on-request. */
export function parsePriceCell(value) {
    const m = /^(\d+(?:[.,]\d+)?)\s*€(?:\s*\/\s*(.+))?$/.exec(String(value == null ? "" : value).trim());
    if (!m) return null;
    return {price: m[1].replace(",", "."), unit: m[2] ? m[2].trim() : null};
}

/* Collect table blocks flagged `offerCatalog: true` into schema.org
   OfferCatalog objects (one per table, in section order). Row shape follows
   the table contract: first cell = service name, last cell = price, anything
   between = description. Rows without a name are skipped, like buildTable
   skips nothing but llms.txt skips unnamed rows. */
export function buildOfferCatalogs(site) {
    const catalogs = [];
    (site.sections || []).forEach((section) => {
        ((section && section.blocks) || []).forEach((block) => {
            if (!block || block.type !== "table" || block.offerCatalog !== true) return;
            const offers = (block.rows || [])
                .map((row) => {
                    const cells = (Array.isArray(row) ? row : [row]).map((c) => stripTags(c == null ? "" : String(c)));
                    if (!cells[0]) return null;
                    const service = {"@type": "Service", name: cells[0]};
                    const description = cells.slice(1, -1).filter(Boolean).join(" ");
                    if (description) service.description = description;
                    const offer = {"@type": "Offer", itemOffered: service};
                    const parsed = cells.length > 1 ? parsePriceCell(cells[cells.length - 1]) : null;
                    if (parsed && parsed.unit) {
                        offer.priceSpecification = {
                            "@type": "UnitPriceSpecification",
                            price: parsed.price,
                            priceCurrency: "EUR",
                            unitText: parsed.unit,
                        };
                    } else if (parsed) {
                        offer.price = parsed.price;
                        offer.priceCurrency = "EUR";
                    }
                    return offer;
                })
                .filter(Boolean);
            if (!offers.length) return;
            const catalog = {"@type": "OfferCatalog", itemListElement: offers};
            if (block.name) catalog.name = stripTags(block.name);
            catalogs.push(catalog);
        });
    });
    return catalogs;
}

/* Build the JSON-LD object from the spec, or null when there's nothing
   worth emitting. Pure (takes `site`, no globals) so it can be exercised
   standalone. Empty-string fields are skipped, matching how the spec leaves
   unknown values blank (e.g. postalCode: ""). */
export function buildBusinessJsonLd(site) {
    const b = site.business && typeof site.business === "object" ? site.business : {};
    const meta = site.meta || {};
    const name = site.brand || b.legalName;
    if (!name) return null;

    const data = {
        "@context": "https://schema.org",
        "@type": "Store",
        name,
    };

    if (b.legalName) data.legalName = b.legalName;
    if (b.phone) data.telephone = b.phone;
    if (b.email) data.email = b.email;
    if (meta.description) data.description = meta.description;
    if (meta.domain) data.url = meta.domain;

    // Image must be absolute for crawlers; same resolution rule as og:image
    // in renderHead() — one helper owns it.
    if (meta.ogImage) {
        data.image = absoluteUrl(meta.ogImage, meta.domain);
    }

    const addr = b.address;
    if (addr && typeof addr === "object") {
        const postal = {"@type": "PostalAddress"};
        if (addr.street) postal.streetAddress = addr.street;
        if (addr.city) postal.addressLocality = addr.city;
        if (addr.postalCode) postal.postalCode = addr.postalCode;
        if (addr.country) postal.addressCountry = addr.country;
        if (Object.keys(postal).length > 1) data.address = postal;
    }

    if (b.mapUrl) data.hasMap = b.mapUrl;

    // Exact pin coordinates — local "near me" queries resolve on these, not
    // on the street string. Both must be present and numeric.
    if (b.geo && Number.isFinite(b.geo.lat) && Number.isFinite(b.geo.lng)) {
        data.geo = {"@type": "GeoCoordinates", latitude: b.geo.lat, longitude: b.geo.lng};
    }

    // Entity linking: sameAs ties the site to its social profiles, so a
    // crawler knows the Instagram and the website are one business.
    const sameAs = [...new Set(
        (Array.isArray(site.socials) ? site.socials : [])
            .map((s) => s && s.url)
            .filter((u) => u && isExternalUrl(u))
    )];
    if (sameAs.length) data.sameAs = sameAs;

    if (b.priceRange) data.priceRange = b.priceRange;
    if (b.areaServed) data.areaServed = b.areaServed;
    // Slovak DIČ maps to schema.org taxID; IČO has no dedicated property, so
    // it rides along as a named PropertyValue.
    if (b.dic) data.taxID = b.dic;
    if (b.ico) data.identifier = {"@type": "PropertyValue", propertyID: "IČO", value: b.ico};

    if (b.hours && typeof b.hours === "object") {
        const spec = Object.entries(JSONLD_DAY_NAMES)
            .map(([key, day]) => {
                const range = parseHoursRange(b.hours[key]);
                return range && {
                    "@type": "OpeningHoursSpecification",
                    dayOfWeek: day,
                    opens: range.opens,
                    closes: range.closes,
                };
            })
            .filter(Boolean);
        if (spec.length) data.openingHoursSpecification = spec;
    }

    // Price lists: tables flagged offerCatalog:true become an OfferCatalog,
    // so an AI assistant can quote exact service prices with a source.
    // One table hangs directly off hasOfferCatalog; several nest under a
    // wrapper catalog (the pattern schema.org documents for service menus).
    const catalogs = buildOfferCatalogs(site);
    if (catalogs.length === 1) {
        data.hasOfferCatalog = catalogs[0];
    } else if (catalogs.length > 1) {
        data.hasOfferCatalog = {"@type": "OfferCatalog", name: "Price list", itemListElement: catalogs};
    }
    // Only claim a currency when at least one offer actually states a price.
    const anyPriced = catalogs.some((c) =>
        c.itemListElement.some((o) => o.price || o.priceSpecification));
    if (anyPriced) data.currenciesAccepted = "EUR";

    return data;
}

/*
 * Built from m-remis/static-web-template
 * https://github.com/m-remis/static-web-template
 */
