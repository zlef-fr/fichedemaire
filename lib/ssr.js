// Server-side render of the primary content for crawlers (and no-JS users).
// The SPA overwrites #app on boot; this HTML is a faithful, indexable snapshot —
// the numbers live in the initial HTML, not only after the client bundle runs.
const data = require("./data");
const { store } = data;

function esc(s) {
  return s == null ? "" : String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}
const fmt = (n, lang) => (n == null ? "—" : Number(n).toLocaleString(lang === "en" ? "en-GB" : "fr-FR"));
const pfx = (lang) => (lang === "en" ? "/en" : "");

const T = {
  fr: {
    mayor: "Maire", pop: "Population", debt: "Dette par habitant",
    saving: "Taux d'épargne brute", desendet: "Capacité de désendettement",
    perso: "Frais de personnel", years: "ans",
    age: "Âge", csp: "Profession déclarée", since: "Maire depuis",
    finH: "Finances de la commune", perHab: "€ par habitant", latest: "dernier exercice publié",
    rf: "Recettes de fonctionnement", df: "Dépenses de fonctionnement", eb: "Épargne brute",
    dette: "Dette", equip: "Équipement", persoRow: "Personnel",
    evoH: "Évolution sur 8 ans (€/hab)", year: "Année",
    electionH: "L'élection municipale 2026", turnout: "Participation", abst: "Abstention",
    lead: "Liste arrivée en tête", seats: "sièges",
    councilH: "Le conseil municipal", elus: "élus", women: "femmes", men: "hommes",
    adjoints: "adjoints", ageAvg: "âge moyen",
    epciH: "Intercommunalité",
    decpH: "Où va l'argent ? (commande publique)", decpTotal: "Total attribué", decpN: "marchés publics",
    suppliers: "Principaux fournisseurs", biggest: "Plus gros marchés", marche: "marché(s)",
    relatedH: "Communes comparables",
    src: "Données : Répertoire national des élus · OFGL · HATVP · DECP (licence Ouverte)",
    homeH1: "Votre commune, votre maire, en chiffres",
    homeLead: "Qui est le maire de votre commune, et dans quel état sont ses finances ? Chaque chiffre vient des données publiques officielles. Aucun avis, que des faits.",
    tracked: "communes et maires référencés",
    allCommunes: "Toutes les communes", byDep: "Par département",
    notFoundH1: "Page introuvable",
    notFoundLead: "Cette page n'existe pas (ou plus). Cherchez plutôt votre commune parmi les 34 600 référencées.",
    backHome: "Retour à l'accueil",
  },
  en: {
    mayor: "Mayor", pop: "Population", debt: "Debt per capita",
    saving: "Gross savings rate", desendet: "Debt-repayment capacity",
    perso: "Staff costs", years: "yrs",
    age: "Age", csp: "Declared occupation", since: "Mayor since",
    finH: "Town finances", perHab: "€ per capita", latest: "latest published year",
    rf: "Operating revenue", df: "Operating expenditure", eb: "Gross savings",
    dette: "Debt", equip: "Capital works", persoRow: "Staff",
    evoH: "8-year trend (€/capita)", year: "Year",
    electionH: "The 2026 municipal election", turnout: "Turnout", abst: "Abstention",
    lead: "Leading list", seats: "seats",
    councilH: "The municipal council", elus: "councillors", women: "women", men: "men",
    adjoints: "deputy mayors", ageAvg: "average age",
    epciH: "Inter-municipal body",
    decpH: "Where the money goes (public procurement)", decpTotal: "Total awarded", decpN: "public contracts",
    suppliers: "Main suppliers", biggest: "Largest contracts", marche: "contract(s)",
    relatedH: "Comparable towns",
    src: "Data: French elected-officials register · OFGL · HATVP · DECP (Licence Ouverte)",
    homeH1: "Your town, your mayor, in figures",
    homeLead: "Who runs your town, and how healthy are its finances? Every figure comes from official French open data. No opinions, only facts.",
    tracked: "towns and mayors listed",
    allCommunes: "All towns", byDep: "By department",
    notFoundH1: "Page not found",
    notFoundLead: "This page does not exist (or no longer does). Search your town among the 34,600 listed instead.",
    backHome: "Back to home",
  },
};

function fiche(m, lang) {
  const t = T[lang] || T.fr;
  const p = pfx(lang);
  const f = data.fiche(m.path) || m;
  const fin = f.fin || {};
  const F = f.finances || {};
  const r = F.ratios || {};

  const des = fin.epargneNegative ? (lang === "en" ? "negative savings" : "épargne négative")
    : (fin.desendet != null ? `${fin.desendet} ${t.years}` : "—");
  const since = (f.hist && f.hist.since) || f.foncStart || f.mandatStart;
  const rows = [
    [t.mayor, esc(`${m.prenom} ${m.nom}`)],
    [t.age, f.age != null ? `${f.age}${lang === "en" ? "" : " ans"}` : null],
    [t.csp, f.cspLabel ? esc(f.cspLabel) : null],
    [t.since, since ? esc(since.slice(0, 4)) : null],
    [t.pop, m.pop != null ? fmt(m.pop, lang) : "—"],
    [t.debt, fin.dettePerHab != null ? fmt(fin.dettePerHab, lang) + " €" : "—"],
    [t.saving, fin.tauxEpargne != null ? fin.tauxEpargne + " %" : "—"],
    [t.desendet, des],
    [t.perso, r.partPerso != null ? r.partPerso + " %" : null],
  ].filter(([, v]) => v != null);

  const sections = [];

  // finances: latest per-capita line + the 8-year series table
  if (F.ratios) {
    const latest = [
      [t.rf, r.rfPerHab], [t.df, r.dfPerHab], [t.eb, r.ebPerHab],
      [t.equip, r.equipPerHab], [t.persoRow, r.persoPerHab], [t.dette, r.dettePerHab],
    ].filter(([, v]) => v != null);
    sections.push(`<section><h2>${esc(t.finH)}</h2>
    <p>${esc(t.perHab)} (${esc(t.latest)} : ${F.latest || "—"}, OFGL) : ${latest.map(([k, v]) => `${esc(k)} ${fmt(v, lang)} €`).join(" · ")}</p></section>`);
  }
  const S = F.series || {};
  const years = (S.dette || S.rf || []).map((x) => x.y);
  if (years.length > 1) {
    const rowsDef = [[t.dette, S.dette], [t.eb, S.eb], [t.rf, S.rf], [t.df, S.df], [t.equip, S.equip], [t.persoRow, S.perso]]
      .filter(([, s]) => s && s.length);
    const byYear = (s, y) => { const it = (s || []).find((x) => x.y === y); return it ? fmt(Math.round(it.h), lang) : "—"; };
    sections.push(`<section><h2>${esc(t.evoH)}</h2>
    <table class="ssr-table"><thead><tr><th>${esc(t.year)}</th>${years.map((y) => `<th>${y}</th>`).join("")}</tr></thead>
    <tbody>${rowsDef.map(([label, s]) => `<tr><td>${esc(label)}</td>${years.map((y) => `<td>${byYear(s, y)}</td>`).join("")}</tr>`).join("\n")}</tbody></table></section>`);
  }

  if (f.election && f.election.votantsPct != null) {
    const e = f.election;
    sections.push(`<section><h2>${esc(t.electionH)}</h2>
    <p>${esc(t.turnout)} ${e.votantsPct} % · ${esc(t.abst)} ${e.abstentionPct} %${e.listLabel ? ` · ${esc(t.lead)} : ${esc(e.listLabel)}${e.nuanceLabel ? ` (${esc(e.nuanceLabel)})` : ""}${e.pctExp != null ? `, ${e.pctExp} %` : ""}${e.seats != null ? `, ${e.seats}/${e.totalSeats} ${esc(t.seats)}` : ""}` : ""}</p></section>`);
  }

  if (f.council && f.council.size) {
    const c = f.council;
    sections.push(`<section><h2>${esc(t.councilH)}</h2>
    <p>${c.size} ${esc(t.elus)} · ${c.women} ${esc(t.women)} (${c.womenPct} %) / ${c.men} ${esc(t.men)} · ${c.adjoints} ${esc(t.adjoints)} · ${esc(t.ageAvg)} ${c.ageAvg}${lang === "en" ? "" : " ans"}</p></section>`);
  }

  if (f.epci && f.epci.nom) {
    sections.push(`<section><h2>${esc(t.epciH)}</h2><p>${esc(f.epci.natureLabel || f.epci.nature || "")} — ${esc(f.epci.nom)}</p></section>`);
  }

  if (f.decp && f.decp.count) {
    const d = f.decp;
    const sup = (d.suppliers || []).slice(0, 5).map((s) => `<li>${esc(s.name)} — ${fmt(s.total, lang)} € (${s.count} ${esc(t.marche)})</li>`).join("\n      ");
    const big = (d.marches || []).slice(0, 5).map((x) => `<li>${esc(x.objet)} — ${fmt(x.montant, lang)} € (${esc(x.titulaire || "")}${x.date ? ", " + esc(x.date.slice(0, 4)) : ""})</li>`).join("\n      ");
    sections.push(`<section><h2>${esc(t.decpH)}</h2>
    <p>${esc(t.decpTotal)} : ${fmt(d.total, lang)} € · ${fmt(d.count, lang)} ${esc(t.decpN)}</p>
    ${sup ? `<h3>${esc(t.suppliers)}</h3><ul class="ssr-list">
      ${sup}
    </ul>` : ""}
    ${big ? `<h3>${esc(t.biggest)}</h3><ul class="ssr-list">
      ${big}
    </ul>` : ""}</section>`);
  }

  if (f.related && f.related.length) {
    const rel = f.related.map((x) => `<a href="${p}/maire/${esc(x.path)}">${esc(x.commune)} (${esc(x.dep)})</a>`).join(" · ");
    sections.push(`<section><h2>${esc(t.relatedH)}</h2><p>${rel}</p></section>`);
  }

  return `<article class="wrap ssr-fiche">
  <h1>${esc(m.commune)}</h1>
  <p class="ssr-sub">${esc(m.dep)} · ${esc(m.depNom)}${m.pop != null ? ` — ${fmt(m.pop, lang)} hab.` : ""}</p>
  <dl class="ssr-stats">
    ${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("\n    ")}
  </dl>
  ${sections.join("\n  ")}
  <p class="ssr-src">${esc(t.src)}</p>
</article>`;
}

function home(lang) {
  const t = T[lang] || T.fr;
  const p = pfx(lang);
  const n = (store.maires || []).length;
  return `<section class="wrap ssr-home">
  <h1>${esc(t.homeH1)}</h1>
  <p>${esc(t.homeLead)}</p>
  <p>${fmt(n, lang)} ${esc(t.tracked)}. <a href="${p}/communes">${esc(t.allCommunes)}</a></p>
</section>`;
}

// Department directory — a link per department (crawl mesh + no-JS navigation).
function communes(lang) {
  const t = T[lang] || T.fr;
  const p = pfx(lang);
  const items = (store.deps || []).map((d) =>
    `<li><a href="${p}/communes?dep=${esc(encodeURIComponent(d.dep))}">${esc(d.dep)} · ${esc(d.depNom)}</a> — ${fmt(d.count, lang)} communes</li>`
  ).join("\n    ");
  return `<section class="wrap ssr-home">
  <h1>${esc(t.allCommunes)}</h1>
  <h2>${esc(t.byDep)}</h2>
  <ul class="ssr-list">
    ${items}
  </ul>
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

function comparateur(lang) {
  const en = lang === "en";
  return `<section class="wrap ssr-home">
  <h1>${en ? "Town comparator" : "Comparateur de communes"}</h1>
  <p>${en
    ? "Find the French towns most like yours — by size and demographics, by financial health, by geography. Every score is computed from official open data across all 34,637 communes."
    : "Trouvez les communes françaises les plus semblables à la vôtre — par taille et démographie, par santé financière, par situation géographique. Chaque score est calculé à partir des données publiques sur les 34 637 communes."}</p>
</section>`;
}

function notFound(lang) {
  const t = T[lang] || T.fr;
  const p = pfx(lang);
  return `<section class="wrap ssr-home ssr-404">
  <h1>${esc(t.notFoundH1)}</h1>
  <p>${esc(t.notFoundLead)}</p>
  <p><a href="${p}/">${esc(t.backHome)}</a> · <a href="${p}/communes">${esc(t.allCommunes)}</a></p>
</section>`;
}

function render(path, lang) {
  const p = (path || "/").replace(/\/+$/, "") || "/";
  if (p === "/") return home(lang);
  if (p === "/communes") return communes(lang);
  if (p === "/presse") return presse(lang);
  if (p === "/comparateur") return comparateur(lang);
  const m = p.match(/^\/(?:maire|commune)\/([^/]+)(?:\/([^/]+))?$/);
  if (m) {
    const key = m[2] ? `${m[1]}/${m[2]}` : m[1];
    const rec = store.byPath[decodeURIComponent(key)] || store.bySlug[decodeURIComponent(m[1])];
    if (rec) return fiche(rec, lang);
  }
  return "";
}
module.exports = { render, notFound };
