// In-memory data layer. Loads the light mayor index + stats + cumul + HATVP at
// boot; the heavy per-commune finance detail lives in department shards loaded
// (and cached) lazily on the first fiche request that needs them.
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "data");
const FIN = path.join(DATA, "finances");
const DECP = path.join(DATA, "decp");

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function tryJSON(p, fallback) {
  try { return readJSON(p); } catch { return fallback; }
}

const store = { ready: false };
const shardCache = {};
const decpCache = {};

// diacritic-insensitive normaliser for search + HATVP name matching
function norm(s) {
  return (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
// URL slug — mirrors pipeline/build_rne.py slugify() so city slugs stay stable.
function slugify(s) {
  s = (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  s = s.replace(/[’'`]/g, " ");
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-");
  return s || "commune";
}
function hkey(nom, prenom) {
  const up = (s) => (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
  return up(nom) + "|" + up(prenom);
}

// A commune's shard file name is its INSEE prefix (dep code, "2A"/"2B", "97"…).
function shardOf(insee) {
  return (insee || "").slice(0, 2);
}
function shard(insee) {
  const sh = shardOf(insee);
  if (!(sh in shardCache)) shardCache[sh] = tryJSON(path.join(FIN, sh + ".json"), {});
  return shardCache[sh];
}
// v2 DECP — public-contracts ("où va l'argent") detail, same lazy shard scheme.
function decpShard(insee) {
  const sh = shardOf(insee);
  if (!(sh in decpCache)) decpCache[sh] = tryJSON(path.join(DECP, sh + ".json"), {});
  return decpCache[sh];
}

// Build the leaderboards once at boot. Finance boards apply a population floor
// so the extremes aren't dominated by tiny communes with volatile ratios.
function buildBoards(maires) {
  const withFin = maires.filter((m) => m.fin && m.pop);
  const POP = 10000;
  const big = withFin.filter((m) => m.pop >= POP);
  const light = (m, extra) => ({
    insee: m.insee, slug: m.slug, path: m.path, commune: m.commune, dep: m.dep, depNom: m.depNom,
    prenom: m.prenom, nom: m.nom, sexe: m.sexe, pop: m.pop, ...extra,
  });
  const top = (arr, key, dir, n = 25, extra) =>
    [...arr].filter((m) => m.fin[key] != null)
      .sort((a, b) => dir * (b.fin[key] - a.fin[key]))
      .slice(0, n)
      .map((m) => light(m, { value: m.fin[key], ...(extra ? extra(m) : {}) }));

  return {
    popFloor: POP,
    dettePlus: top(big, "dettePerHab", 1),
    detteMoins: top(big, "dettePerHab", -1),
    epargneTop: top(big, "tauxEpargne", 1),
    desendetTendu: top(big.filter((m) => !m.fin.epargneNegative), "desendet", 1),
    // demographics (no population floor — every mayor counts)
    jeunes: [...maires].filter((m) => m.age != null)
      .sort((a, b) => a.age - b.age).slice(0, 25).map((m) => light(m, { value: m.age, unit: "ans" })),
    doyens: [...maires].filter((m) => m.age != null)
      .sort((a, b) => b.age - a.age).slice(0, 25).map((m) => light(m, { value: m.age, unit: "ans" })),
    villes: [...withFin].sort((a, b) => b.pop - a.pop).slice(0, 25).map((m) => light(m, { value: m.pop })),
  };
}

function load() {
  const doc = readJSON(path.join(DATA, "maires.json"));
  const maires = doc.maires;
  const stats = tryJSON(path.join(DATA, "stats.json"), {});
  const cumul = tryJSON(path.join(DATA, "cumul.json"), {});
  const hatvp = tryJSON(path.join(DATA, "hatvp.json"), {});
  const history = tryJSON(path.join(DATA, "history.json"), {});

  const bySlug = {}, byInsee = {};
  maires.forEach((m) => { bySlug[m.slug] = m; byInsee[m.insee] = m; });

  // Canonical SEO path per fiche: /maire/<commune>/<prénom-nom>. Adding the
  // mayor's name puts a real search term in the URL and lets several same-named
  // communes coexist (each disambiguated by its mayor). Full-path collisions
  // (same town name AND same mayor name) fall back to an INSEE suffix.
  maires.forEach((m) => {
    m.citySlug = slugify(m.commune);
    m.mayorSlug = slugify(`${m.prenom || ""} ${m.nom || ""}`);
  });
  const pathCount = {};
  for (const m of maires) { const p = `${m.citySlug}/${m.mayorSlug}`; pathCount[p] = (pathCount[p] || 0) + 1; }
  const byPath = {};
  for (const m of maires) {
    if (pathCount[`${m.citySlug}/${m.mayorSlug}`] > 1) m.mayorSlug += "-" + m.insee;
    m.path = `${m.citySlug}/${m.mayorSlug}`;
    byPath[m.path] = m;
  }

  // department directory for the browse view
  const depMap = {};
  for (const m of maires) {
    const d = (depMap[m.dep] = depMap[m.dep] || { dep: m.dep, depNom: m.depNom, count: 0, pop: 0 });
    d.count++;
    d.pop += m.pop || 0;
  }
  const deps = Object.values(depMap).sort((a, b) => a.dep.localeCompare(b.dep, "fr", { numeric: true }));

  Object.assign(store, {
    ready: true,
    generatedAt: doc.generatedAt,
    maires,
    stats,
    cumul,
    hatvp,
    history,
    bySlug,
    byInsee,
    byPath,
    deps,
    boards: buildBoards(maires),
  });
  return store;
}

// Light list of a department's communes (alpha by commune name).
function communesOfDep(dep) {
  return store.maires
    .filter((m) => m.dep === dep)
    .sort((a, b) => b.pop - a.pop || a.commune.localeCompare(b.commune, "fr"))
    .map((m) => ({
      insee: m.insee, slug: m.slug, path: m.path, commune: m.commune, dep: m.dep, depNom: m.depNom,
      prenom: m.prenom, nom: m.nom, sexe: m.sexe, pop: m.pop,
      fin: m.fin ? { dettePerHab: m.fin.dettePerHab, tauxEpargne: m.fin.tauxEpargne, desendet: m.fin.desendet, epargneNegative: m.fin.epargneNegative } : null,
    }));
}

// Assemble a full fiche: identity + commune finance detail + cumul + HATVP.
function fiche(key) {
  const m = store.byPath[key] || store.bySlug[key] || store.byInsee[key];
  if (!m) return null;
  const fin = shard(m.insee)[m.insee] || null;
  const decl = store.hatvp[hkey(m.nomRaw, m.prenom)] || null;
  const mandates = store.cumul[m.insee] || [];
  const decp = decpShard(m.insee)[m.insee] || null;
  const hist = store.history[m.insee] || null;
  // Internal cross-links (SEO + discovery): other communes of the same department.
  const related = store.maires
    .filter((x) => x.dep === m.dep && x.insee !== m.insee)
    .sort((a, b) => (b.pop || 0) - (a.pop || 0))
    .slice(0, 8)
    .map((x) => ({ path: x.path, commune: x.commune, dep: x.dep, prenom: x.prenom, nom: x.nom }));
  return { ...m, finances: fin, hatvp: decl, cumul: mandates, decp, hist, related };
}

// Search over commune name (primary), mayor name, department.
function search(q, limit = 30) {
  const nq = norm(q);
  if (!nq) return [];
  const light = (m) => ({
    insee: m.insee, slug: m.slug, path: m.path, commune: m.commune, dep: m.dep, depNom: m.depNom,
    prenom: m.prenom, nom: m.nom, sexe: m.sexe, pop: m.pop,
    fin: m.fin ? { dettePerHab: m.fin.dettePerHab, tauxEpargne: m.fin.tauxEpargne, desendet: m.fin.desendet } : null,
  });
  return store.maires
    .map((m) => {
      const commune = norm(m.commune);
      const person = norm(`${m.prenom} ${m.nom}`);
      let score = 0;
      if (commune === nq) score = 120;
      else if (commune.startsWith(nq)) score = 100;
      else if (person.startsWith(nq)) score = 80;
      else if (commune.includes(nq)) score = 55;
      else if (person.includes(nq)) score = 40;
      else if (norm(m.depNom).startsWith(nq)) score = 20;
      // popularity tie-break: bigger communes first
      if (score) score += Math.min(15, Math.log10((m.pop || 1) + 1) * 2);
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.m.commune.localeCompare(b.m.commune))
    .slice(0, limit)
    .map((x) => light(x.m));
}

module.exports = { load, fiche, search, communesOfDep, shard, store };
