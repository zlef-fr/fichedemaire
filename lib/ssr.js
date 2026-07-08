// Server-side render of the primary content for crawlers (and no-JS users).
// The SPA overwrites #app on boot; this HTML is a faithful, indexable snapshot —
// the numbers live in the initial HTML, not only after the client bundle runs.
const { store } = require("./data");

function esc(s) {
  return s == null ? "" : String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}
const fmt = (n, lang) => (n == null ? "—" : Number(n).toLocaleString(lang === "en" ? "en-GB" : "fr-FR"));

const T = {
  fr: {
    mayor: "Maire", pop: "Population", debt: "Dette par habitant",
    saving: "Taux d'épargne brute", desendet: "Capacité de désendettement",
    years: "ans", src: "Données : Répertoire national des élus · OFGL · HATVP (licence Ouverte)",
    homeH1: "Votre commune, votre maire, en chiffres",
    homeLead: "Qui est le maire de votre commune, et dans quel état sont ses finances ? Chaque chiffre vient des données publiques officielles. Aucun avis, que des faits.",
    tracked: "communes et maires référencés",
  },
  en: {
    mayor: "Mayor", pop: "Population", debt: "Debt per capita",
    saving: "Gross savings rate", desendet: "Debt-repayment capacity",
    years: "yrs", src: "Data: French elected-officials register · OFGL · HATVP (Licence Ouverte)",
    homeH1: "Your town, your mayor, in figures",
    homeLead: "Who runs your town, and how healthy are its finances? Every figure comes from official French open data. No opinions, only facts.",
    tracked: "towns and mayors listed",
  },
};

function fiche(m, lang) {
  const t = T[lang] || T.fr;
  const f = m.fin || {};
  const des = f.epargneNegative ? (lang === "en" ? "negative savings" : "épargne négative")
    : (f.desendet != null ? `${f.desendet} ${t.years}` : "—");
  const rows = [
    [t.mayor, esc(`${m.prenom} ${m.nom}`)],
    [t.pop, m.pop != null ? fmt(m.pop, lang) : "—"],
    [t.debt, f.dettePerHab != null ? fmt(f.dettePerHab, lang) + " €" : "—"],
    [t.saving, f.tauxEpargne != null ? f.tauxEpargne + " %" : "—"],
    [t.desendet, des],
  ];
  return `<article class="wrap ssr-fiche">
  <h1>${esc(m.commune)}</h1>
  <p class="ssr-sub">${esc(m.dep)} · ${esc(m.depNom)}</p>
  <dl class="ssr-stats">
    ${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("\n    ")}
  </dl>
  <p class="ssr-src">${esc(t.src)}</p>
</article>`;
}

function home(lang) {
  const t = T[lang] || T.fr;
  const n = (store.maires || []).length;
  return `<section class="wrap ssr-home">
  <h1>${esc(t.homeH1)}</h1>
  <p>${esc(t.homeLead)}</p>
  <p>${fmt(n, lang)} ${esc(t.tracked)}.</p>
</section>`;
}

function presse(lang) {
  const en = lang === "en";
  return `<section class="wrap ssr-home">
  <h1>${en ? "Media kit" : "Kit média"}</h1>
  <p>${en
    ? "Everything you need to write about FicheDeMaire.fr — logos, colours, screenshots and a ready-to-use description. Free to use with attribution."
    : "Tout pour parler de FicheDeMaire.fr — logos, couleurs, captures d'écran et une description prête à l'emploi. Libre d'utilisation avec mention de la source."}</p>
</section>`;
}

function render(path, lang) {
  const p = (path || "/").replace(/\/+$/, "") || "/";
  if (p === "/") return home(lang);
  if (p === "/presse") return presse(lang);
  const m = p.match(/^\/(?:maire|commune)\/([^/]+)(?:\/([^/]+))?$/);
  if (m) {
    const key = m[2] ? `${m[1]}/${m[2]}` : m[1];
    const rec = store.byPath[decodeURIComponent(key)] || store.bySlug[decodeURIComponent(m[1])];
    if (rec) return fiche(rec, lang);
  }
  return "";
}
module.exports = { render };
