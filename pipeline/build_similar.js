// build_similar.js — compact global feature index for the "communes similaires"
// comparator. Reads the already-built data/maires.json + the per-department
// finance shards (data/finances/<dep>.json) — NOT the raw open data — and emits
// a single small data/features.json the server loads whole at boot. Keeping this
// index separate lets the comparator score every commune against every other one
// in memory without pulling the 136 MB of lazy finance shards into RAM.
//
//   node pipeline/build_similar.js
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "data");
const FIN = path.join(DATA, "finances");

function readJSON(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

const doc = readJSON(path.join(DATA, "maires.json"));
const maires = doc.maires;

// Preload every finance shard once (this offline build can afford the full read).
const shards = {};
for (const f of fs.readdirSync(FIN)) {
  if (f.endsWith(".json")) shards[f.replace(/\.json$/, "")] = readJSON(path.join(FIN, f));
}
function finOf(insee) {
  const sh = shards[(insee || "").slice(0, 2)];
  return sh ? sh[insee] : null;
}

const round = (n, d = 1) => (n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

const features = maires.map((m) => {
  const fin = finOf(m.insee);
  const meta = (fin && fin.meta) || {};
  const r = (fin && fin.ratios) || {};
  return {
    insee: m.insee,
    path: m.path,               // set by lib/data.load(); regenerated there anyway
    commune: m.commune,
    dep: m.dep,
    depNom: m.depNom,
    pop: m.pop != null ? m.pop : null,
    // geography / typology
    reg: meta.reg || null,
    epci: meta.epci || null,
    tranche: meta.tranche != null && meta.tranche !== "" ? Number(meta.tranche) : null,
    rural: meta.rural ? 1 : 0,
    montagne: meta.montagne ? 1 : 0,
    touristique: meta.touristique ? 1 : 0,
    // demographics of the mayor
    age: m.age != null ? m.age : null,
    sexe: m.sexe || null,
    csp: m.cspFamily || m.cspLabel || null,
    // finances headline (per-habitant + ratios) — nulls where OFGL has no record
    fin: r && Object.keys(r).length ? {
      dette: r.dettePerHab != null ? r.dettePerHab : null,
      ep: r.tauxEpargne != null ? r.tauxEpargne : null,
      des: r.desendet != null ? r.desendet : null,
      epn: r.epargneNegative ? 1 : 0,
      df: r.dfPerHab != null ? r.dfPerHab : null,
      rf: r.rfPerHab != null ? r.rfPerHab : null,
      eb: r.ebPerHab != null ? r.ebPerHab : null,
      perso: r.persoPerHab != null ? r.persoPerHab : null,
      part: r.partPerso != null ? r.partPerso : null,
    } : null,
  };
});

// path may be absent on maires.json until lib/data.load() computes it; recompute
// nothing here — the server always resolves paths itself. Strip empties to save space.
for (const f of features) if (f.path == null) delete f.path;

const out = { generatedAt: doc.generatedAt, count: features.length, features };
fs.writeFileSync(path.join(DATA, "features.json"), JSON.stringify(out));
const withFin = features.filter((f) => f.fin).length;
const withGeo = features.filter((f) => f.reg).length;
console.log(`features.json — ${features.length} communes · ${withFin} with finances · ${withGeo} with region/EPCI`);
