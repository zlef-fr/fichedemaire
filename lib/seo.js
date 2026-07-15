// SEO layer: sitemap index + per-department child sitemaps (34k communes),
// robots, a localized <head> (title/description/canonical/OG/Twitter/hreflang),
// JSON-LD (GovernmentOrganization + Person on a fiche, FAQPage on /methode) and a
// server-rendered content snapshot so crawlers see the numbers without the SPA.
const data = require("./data");
const { store } = data;
const faq = require("./faq");
const L = require("./locales");
const ssr = require("./ssr");

const BASE = L.BASE;
const OG_DEFAULT = `${BASE}/og.png`;

const STATIC = [
  { path: "/", priority: "1.0", freq: "daily" },
  { path: "/communes", priority: "0.9", freq: "weekly" },
  { path: "/comparateur", priority: "0.8", freq: "weekly" },
  { path: "/classements", priority: "0.8", freq: "weekly" },
  { path: "/methode", priority: "0.4", freq: "monthly" },
  { path: "/presse", priority: "0.3", freq: "monthly" },
];

function xmlEscape(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}
function attr(s) {
  return String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}
function alternateLinks(routePath) {
  const links = L.LOCALES.map(
    (lang) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${BASE}${L.localized(routePath, lang)}"/>`
  );
  links.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE}${L.localized(routePath, L.DEFAULT)}"/>`);
  return links.join("\n");
}

// distinct department buckets present in the data (INSEE prefix)
function depBuckets() {
  const set = {};
  for (const m of store.maires || []) {
    const d = (m.dep || m.insee.slice(0, 2)).toString();
    (set[d] = set[d] || []).push(m);
  }
  return set;
}

// sitemap index → one child sitemap per department + a static one
function sitemapIndex() {
  const lm = store.generatedAt ? `\n    <lastmod>${store.generatedAt}</lastmod>` : "";
  const deps = Object.keys(depBuckets()).sort();
  const entries = [`  <sitemap>\n    <loc>${BASE}/sitemap-static.xml</loc>${lm}\n  </sitemap>`];
  for (const d of deps) entries.push(`  <sitemap>\n    <loc>${BASE}/sitemap-${xmlEscape(d)}.xml</loc>${lm}\n  </sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</sitemapindex>\n`;
}

function urlset(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
}
function urlEntry(routePath, freq, priority) {
  const lm = store.generatedAt ? `\n    <lastmod>${store.generatedAt}</lastmod>` : "";
  return `  <url>\n    <loc>${BASE}${L.localized(routePath, L.DEFAULT)}</loc>${lm}\n${alternateLinks(routePath)}\n    <changefreq>${freq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}
function sitemapStatic() {
  return urlset(STATIC.map((r) => urlEntry(r.path, r.freq, r.priority)));
}
function sitemapDep(dep) {
  const bucket = depBuckets()[dep];
  if (!bucket) return null;
  return urlset(bucket.map((m) => urlEntry(`/maire/${m.path}`, "monthly", "0.7")));
}
function robots() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`;
}

// ── localized <head> meta ─────────────────────────────────────────────────
const PAGES = {
  fr: {
    "/": ["FicheDeMaire.fr — La fiche vivante de votre commune et de son maire", "Qui est votre maire et dans quel état sont les finances de votre commune ? 34 600 communes, 100 % sourcé (RNE, OFGL, HATVP)."],
    "/communes": ["Toutes les communes — FicheDeMaire.fr", "Cherchez votre commune parmi 34 600 : maire, population, dette par habitant, épargne et capacité de désendettement."],
    "/comparateur": ["Comparateur de communes — FicheDeMaire.fr", "Trouvez les communes les plus semblables à la vôtre : par taille et démographie, santé financière et situation géographique. À vous de choisir les critères."],
    "/classements": ["Classements des communes — FicheDeMaire.fr", "Les communes les plus et les moins endettées, la meilleure épargne, les maires les plus jeunes et les doyens."],
    "/methode": ["Méthode & sources — FicheDeMaire.fr", "D'où viennent les chiffres : Répertoire national des élus, OFGL et HATVP — données publiques en licence Ouverte."],
    "/presse": ["Kit média — FicheDeMaire.fr", "Logos, couleurs, captures d'écran et descriptif de FicheDeMaire.fr. Libre d'utilisation avec mention de la source."],
  },
  en: {
    "/": ["FicheDeMaire.fr — The living record of your town and its mayor", "Who runs your town and how healthy are its finances? 34,600 French communes, fully sourced (RNE, OFGL, HATVP)."],
    "/communes": ["All towns — FicheDeMaire.fr", "Search your town among 34,600: mayor, population, debt per capita, savings and debt-repayment capacity."],
    "/comparateur": ["Town comparator — FicheDeMaire.fr", "Find the towns most like yours: by size and demographics, financial health and geography. You choose the criteria."],
    "/classements": ["Town rankings — FicheDeMaire.fr", "The most and least indebted towns, the best savers, the youngest mayors and the elders."],
    "/methode": ["Method & sources — FicheDeMaire.fr", "Where the figures come from: the French elected-officials register, OFGL and HATVP — open data (Licence Ouverte)."],
    "/presse": ["Media kit — FicheDeMaire.fr", "Logos, colours, screenshots and description for FicheDeMaire.fr. Free to use with attribution."],
  },
};

function ficheMeta(m, lang) {
  const f = m.fin || {};
  const debt = f.dettePerHab != null ? f.dettePerHab.toLocaleString(lang === "en" ? "en-GB" : "fr-FR") : "—";
  if (lang === "en") {
    return {
      title: `${m.commune} (${m.dep}) — mayor & town finances — FicheDeMaire.fr`,
      desc: `${m.commune}: mayor ${m.prenom} ${m.nom}, ${m.pop != null ? m.pop.toLocaleString("en-GB") + " inhabitants, " : ""}debt ${debt} €/capita${f.tauxEpargne != null ? `, ${f.tauxEpargne}% savings rate` : ""} — fully sourced open data.`,
    };
  }
  return {
    title: `${m.commune} (${m.dep}) — maire & finances — FicheDeMaire.fr`,
    desc: `${m.commune} : maire ${m.prenom} ${m.nom}, ${m.pop != null ? m.pop.toLocaleString("fr-FR") + " habitants, " : ""}dette ${debt} €/hab${f.tauxEpargne != null ? `, ${f.tauxEpargne} % d'épargne` : ""} — 100 % sourcé (données publiques).`,
  };
}

function ficheOf(routePath) {
  const p = (routePath || "/").replace(/\/+$/, "") || "/";
  const mm = p.match(/^\/(?:maire|commune)\/([^/]+)(?:\/([^/]+))?$/);
  if (!mm) return null;
  const key = mm[2] ? `${mm[1]}/${mm[2]}` : mm[1];
  return store.byPath[decodeURIComponent(key)] || store.bySlug[decodeURIComponent(mm[1])] || null;
}

// Unknown routes get status 404 (real not-found, not a soft-404 home clone).
function metaFor(routePath, lang) {
  const p = (routePath || "/").replace(/\/+$/, "") || "/";
  const m = ficheOf(p);
  if (m) {
    const meta = ficheMeta(m, lang);
    return { ...meta, routePath: `/maire/${m.path}`, og: `${BASE}/og/${m.slug}.png`, status: 200 };
  }
  const dict = PAGES[lang] || PAGES[L.DEFAULT];
  const entry = dict[p] || PAGES[L.DEFAULT][p];
  if (entry) return { title: entry[0], desc: entry[1], routePath: p, og: OG_DEFAULT, status: 200 };
  const nf = lang === "en"
    ? ["Page not found — FicheDeMaire.fr", "This page does not exist. Search your town among the 34,600 French communes listed instead."]
    : ["Page introuvable — FicheDeMaire.fr", "Cette page n'existe pas. Cherchez plutôt votre commune parmi les 34 600 référencées."];
  return { title: nf[0], desc: nf[1], routePath: p, og: OG_DEFAULT, status: 404 };
}

// ── JSON-LD ───────────────────────────────────────────────────────────────
function orgJsonLd(routePath, lang) {
  const m = ficheOf(routePath);
  if (!m) return "";
  const url = `${BASE}${L.localized(`/maire/${m.path}`, lang)}`;
  const communesUrl = `${BASE}${L.localized("/communes", lang)}`;
  const org = {
    "@context": "https://schema.org",
    "@type": "GovernmentOrganization",
    name: lang === "en" ? `Town of ${m.commune}` : `Mairie de ${m.commune}`,
    url,
    address: { "@type": "PostalAddress", addressLocality: m.commune, addressRegion: m.depNom, addressCountry: "FR" },
    employee: {
      "@type": "Person",
      name: `${m.prenom} ${m.nom}`,
      givenName: m.prenom,
      familyName: m.nom,
      jobTitle: lang === "en" ? "Mayor" : "Maire",
      ...(m.sexe === "F" || m.sexe === "M" ? { gender: m.sexe === "F" ? "female" : "male" } : {}),
    },
  };
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: lang === "en" ? "Home" : "Accueil", item: `${BASE}${L.localized("/", lang)}` },
      { "@type": "ListItem", position: 2, name: lang === "en" ? "Towns" : "Communes", item: communesUrl },
      { "@type": "ListItem", position: 3, name: `${m.dep} · ${m.depNom}`, item: `${communesUrl}?dep=${encodeURIComponent(m.dep)}` },
      { "@type": "ListItem", position: 4, name: m.commune, item: url },
    ],
  };
  const wrap = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
  return wrap(org) + "\n" + wrap(crumbs);
}
function faqJsonLd(routePath, lang) {
  const p = (routePath || "/").replace(/\/+$/, "") || "/";
  if (p !== "/methode") return "";
  const list = faq[lang] || faq.fr;
  const strip = (s) => String(s).replace(/<[^>]+>/g, "");
  const ld = {
    "@context": "https://schema.org", "@type": "FAQPage", inLanguage: lang,
    mainEntity: list.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: strip(x.a) } })),
  };
  return `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
}
function hreflangTags(routePath) {
  const tags = L.LOCALES.map((lang) => `<link rel="alternate" hreflang="${lang}" href="${attr(BASE + L.localized(routePath, lang))}">`);
  tags.push(`<link rel="alternate" hreflang="x-default" href="${attr(BASE + L.localized(routePath, L.DEFAULT))}">`);
  return tags.join("\n");
}
function ogLocaleTags(lang) {
  const cur = `<meta property="og:locale" content="${L.OG_LOCALE[lang] || L.OG_LOCALE[L.DEFAULT]}">`;
  const alt = L.LOCALES.filter((x) => x !== lang).map((x) => `<meta property="og:locale:alternate" content="${L.OG_LOCALE[x]}">`);
  return [cur, ...alt].join("\n");
}

// WebSite + SearchAction + Organization on the homepage (sitelinks searchbox).
function homeJsonLd(routePath, lang) {
  const p = (routePath || "/").replace(/\/+$/, "") || "/";
  if (p !== "/") return "";
  const wrap = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
  const site = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "FicheDeMaire.fr",
    url: `${BASE}/`,
    inLanguage: lang,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${BASE}${L.localized("/communes", lang)}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "FicheDeMaire.fr",
    url: `${BASE}/`,
    logo: `${BASE}/icon-180.png`,
  };
  return wrap(site) + "\n" + wrap(org);
}

// Returns { html, status } — status is 404 for unknown routes (real not-found).
function injectMeta(html, pathname) {
  const { lang, path } = L.parsePath(pathname);
  const m = metaFor(path, lang);
  const notFound = m.status === 404;
  const canonical = `${BASE}${L.localized(m.routePath, lang)}`;
  const t = attr(m.title), d = attr(m.desc), c = attr(canonical), o = attr(m.og);
  const headExtra = [
    notFound ? `<meta name="robots" content="noindex">` : "",
    notFound ? "" : hreflangTags(m.routePath),
    ogLocaleTags(lang),
    orgJsonLd(m.routePath, lang),
    homeJsonLd(m.routePath, lang),
    faqJsonLd(m.routePath, lang),
  ].filter(Boolean).join("\n");

  html = html
    .replace(/<html lang="[^"]*"/, `<html lang="${lang}"`)
    .replace("</head>", `${headExtra}\n</head>`)
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${d}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${c}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${t}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${d}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${c}$2`)
    .replace(/(<meta property="og:image" content=")[^"]*(">)/, `$1${o}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(">)/, `$1${t}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(">)/, `$1${d}$2`)
    .replace(/(<meta name="twitter:image" content=")[^"]*(">)/, `$1${o}$2`);

  const body = notFound ? ssr.notFound(lang) : ssr.render(path, lang);
  if (body) html = html.replace(/(<main id="app">)[\s\S]*?(<\/main>)/, `$1${body}$2`);
  return { html, status: notFound ? 404 : 200 };
}

// ── /llms.txt — a plain-text map of the site for AI crawlers ──────────────
function llms() {
  const n = (store.maires || []).length;
  const gen = store.generatedAt || "";
  return `# FicheDeMaire.fr

> La fiche vivante de chaque commune française et de son maire : identité du maire
> (âge, profession, ancienneté), finances de la commune 2017-2024 (dette, épargne,
> capacité de désendettement, frais de personnel, € par habitant), élection municipale
> 2026, conseil municipal, intercommunalité, commande publique (« où va l'argent ? »)
> et communes comparables. ${n.toLocaleString("fr-FR")} communes. 100 % sourcé depuis
> l'open data officiel (RNE, OFGL, HATVP, DECP — licence Ouverte). Aucun avis, que des
> faits.${gen ? " Dernière génération des données : " + gen + "." : ""}

English: the living record of every French commune and its mayor — identity, town
finances, 2026 election, council, public procurement. English pages live under /en/.

## Pages clés

- [Accueil](${BASE}/) : recherche parmi les 34 600 communes
- [Toutes les communes](${BASE}/communes) : annuaire par département
- [Comparateur](${BASE}/comparateur) : communes les plus semblables, critères au choix
- [Classements](${BASE}/classements) : dette, épargne, âge des maires
- [Méthode & sources](${BASE}/methode) : d'où viennent les chiffres, définitions exactes
- [Kit média](${BASE}/presse)

## Fiches commune / maire

- Format d'URL : ${BASE}/maire/<commune>/<prenom-nom> (ex. ${BASE}/maire/amberieu-en-bugey/daniel-fabre)
- Chaque fiche contient les chiffres à jour dans le HTML initial (pas besoin de JavaScript).
- Version anglaise : ${BASE}/en/maire/<commune>/<prenom-nom>

## API JSON publique (lecture seule)

- ${BASE}/api/fiche/<commune>/<prenom-nom> : fiche complète (finances 8 ans, élection, conseil, DECP)
- ${BASE}/api/communes : export complet de l'index (34 637 communes, identité + ratios + géo)
- ${BASE}/api/search?q=<nom> · ${BASE}/api/dep?dep=<code> · ${BASE}/api/boards · ${BASE}/api/stats
- ${BASE}/api/similar?insee=<code> : communes comparables (axes demo/fin/geo)

## Sources

- Répertoire national des élus (RNE) — data.gouv.fr · OFGL — data.ofgl.fr
- HATVP — hatvp.fr · DECP (commande publique) — data.economie.gouv.fr
- Sites frères : https://fichedepute.fr (députés) · https://senat.fichedepute.fr (sénateurs) · https://fichedepute.eu (eurodéputés)
`;
}

module.exports = { sitemapIndex, sitemapStatic, sitemapDep, robots, llms, metaFor, injectMeta, BASE };
