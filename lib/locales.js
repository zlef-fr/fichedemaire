// Locale model shared by the server (URL routing) and the SEO layer.
// FR owns the bare path (fichedemaire.fr); EN lives under "/en".
const BASE = process.env.SITE_BASE || "https://fichedemaire.fr";
const DEFAULT = "fr";
const LOCALES = ["fr", "en"];
const OG_LOCALE = { fr: "fr_FR", en: "en_GB" };

function parsePath(pathname) {
  const m = (pathname || "/").match(/^\/([a-z]{2})(\/.*)?$/);
  if (m && LOCALES.includes(m[1])) return { lang: m[1], path: m[2] || "/" };
  return { lang: DEFAULT, path: pathname || "/" };
}
function localized(path, lang) {
  const clean = !path || path === "/" ? "" : path.replace(/\/+$/, "");
  if (lang === DEFAULT) return clean || "/";
  return `/${lang}${clean}`;
}
module.exports = { BASE, DEFAULT, LOCALES, OG_LOCALE, parsePath, localized };
