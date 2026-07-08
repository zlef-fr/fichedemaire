// similar.js — the "communes similaires" comparator engine.
//
// Loads the compact data/features.json (one row per commune) at boot, z-scores
// the numeric axes over the whole population, then scores any commune against
// every other one on three independent axes the caller can toggle:
//
//   • démographie  — size of the town (log population) + the mayor's age
//   • finances     — debt/hab, savings rate, debt-repayment capacity, operating
//                    spend/hab, staff spend/hab  (all per-habitant, log where skewed)
//   • géographie   — locational proximity (same EPCI ≫ same department ≫ same
//                    region) plus a light typology match (rural / mountain / tourist)
//
// Per-axis scores are means of per-feature Gaussian similarities in [0,1]; the
// overall match is the (weighted) mean of the enabled axes. Scoring all 34 637
// candidates for one commune is a few ms, so it runs live per request — no need
// to precompute neighbour lists, and the axis weights stay fully interactive.
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "data");

const state = { ready: false, feats: [], byInsee: {}, norm: {} };

const log10p = (v) => (v == null ? null : Math.log10(Math.max(0, v) + 1));

// Numeric axes fed to the z-scorer. `get` pulls the (possibly transformed) raw
// value from a feature row; null means "not comparable on this feature".
const NUM = {
  logPop: (f) => (f.pop != null ? log10p(f.pop) : null),
  age: (f) => (f.age != null ? f.age : null),
  logDette: (f) => (f.fin && f.fin.dette != null ? log10p(f.fin.dette) : null),
  ep: (f) => (f.fin && f.fin.ep != null ? f.fin.ep : null),
  // repayment capacity: cap the tail and treat negative-savings as worst-case
  desC: (f) => (f.fin ? (f.fin.epn ? 25 : f.fin.des != null ? Math.min(f.fin.des, 25) : null) : null),
  logDf: (f) => (f.fin && f.fin.df != null ? log10p(f.fin.df) : null),
  logPerso: (f) => (f.fin && f.fin.perso != null ? log10p(f.fin.perso) : null),
};
// Per-axis feature weights. Population dominates the demographic axis (town size
// is the primary comparability signal); the mayor's age is a lighter touch.
const AXES = {
  demo: { logPop: 2, age: 1 },
  fin: { logDette: 1, ep: 1, desC: 1, logDf: 1, logPerso: 1 },
};
const BW = 1.15; // Gaussian bandwidth in z units (a 1σ gap → ~0.63 similarity)

function computeNorm(feats) {
  const norm = {};
  for (const key of Object.keys(NUM)) {
    const get = NUM[key];
    let n = 0, sum = 0, sumsq = 0;
    for (const f of feats) {
      const v = get(f);
      if (v == null || !isFinite(v)) continue;
      n++; sum += v; sumsq += v * v;
    }
    const mean = n ? sum / n : 0;
    const varr = n > 1 ? Math.max(1e-9, sumsq / n - mean * mean) : 1;
    norm[key] = { mean, std: Math.sqrt(varr) };
  }
  return norm;
}

function load() {
  const doc = JSON.parse(fs.readFileSync(path.join(DATA, "features.json"), "utf8"));
  const feats = doc.features || [];
  const byInsee = {};
  for (const f of feats) byInsee[f.insee] = f;
  Object.assign(state, {
    ready: true,
    generatedAt: doc.generatedAt,
    feats,
    byInsee,
    norm: computeNorm(feats),
  });
  return state;
}

// z-score of one numeric feature for a row (or null if incomparable)
function z(f, key) {
  const v = NUM[key](f);
  if (v == null || !isFinite(v)) return null;
  const { mean, std } = state.norm[key];
  return (v - mean) / (std || 1);
}
// Gaussian similarity in [0,1] between two z-scores
const gauss = (za, zb) => Math.exp(-0.5 * ((za - zb) / BW) ** 2);

// Numeric-axis similarity, reference-centric: the denominator is the weighted set
// of features the REFERENCE `a` actually has, so a candidate `b` that is *missing*
// a feature the reference has scores 0 on it (missing data = not comparable, not a
// free match) instead of inflating the mean off whatever it happens to share.
// Returns null only when the reference itself has none of the axis features.
function numAxisScore(a, b, weights) {
  let s = 0, w = 0;
  for (const k in weights) {
    const za = z(a, k);
    if (za == null) continue;          // reference lacks it → drop from denominator
    const wk = weights[k];
    w += wk;
    const zb = z(b, k);
    if (zb == null) continue;          // candidate lacks it → contributes 0
    s += wk * gauss(za, zb);
  }
  return w ? s / w : null;
}

// geographic proximity + typology match, in [0,1]
function geoScore(a, b) {
  let loc = 0;
  if (a.epci && b.epci && a.epci === b.epci) loc = 1;
  else if (a.dep && b.dep && a.dep === b.dep) loc = 0.62;
  else if (a.reg && b.reg && a.reg === b.reg) loc = 0.32;
  const typoMatch = (a.rural === b.rural) + (a.montagne === b.montagne) + (a.touristique === b.touristique);
  const typo = typoMatch / 3;
  return 0.8 * loc + 0.2 * typo;
}

// Full pair score. `axes` = { demo, fin, geo } booleans; `weights` optional.
// Returns { score, groups:{demo,fin,geo} } with each part in [0,1] (null if off/NA).
function pairScore(a, b, axes, weights) {
  const g = { demo: null, fin: null, geo: null };
  if (axes.demo) g.demo = numAxisScore(a, b, AXES.demo);
  if (axes.fin) g.fin = numAxisScore(a, b, AXES.fin);
  if (axes.geo) g.geo = geoScore(a, b);
  let sum = 0, wsum = 0;
  for (const k of ["demo", "fin", "geo"]) {
    if (g[k] == null) continue;
    const w = (weights && weights[k]) || 1;
    sum += g[k] * w; wsum += w;
  }
  return { score: wsum ? sum / wsum : 0, groups: g };
}

// public shape for one commune (ref or result)
function pub(f) {
  const p = require("./data").store.byInsee[f.insee];
  return {
    insee: f.insee,
    path: p ? p.path : null,
    commune: f.commune,
    dep: f.dep,
    depNom: f.depNom,
    reg: f.reg,
    epci: f.epci,
    pop: f.pop,
    age: f.age,
    fin: f.fin ? { dette: f.fin.dette, ep: f.fin.ep, des: f.fin.des, epn: f.fin.epn, df: f.fin.df } : null,
  };
}

// Rank the communes most similar to `insee`.
//   opts: { demo, fin, geo (booleans), limit }
// Returns { ref, axes, results:[{...pub, score, groups}] } or null if unknown insee.
function similar(insee, opts = {}) {
  if (!state.ready) return null;
  const ref = state.byInsee[insee];
  if (!ref) return null;
  // requested axes, but silently drop finances if the reference has none
  const axes = {
    demo: opts.demo !== false,
    fin: opts.fin !== false && !!ref.fin,
    geo: opts.geo !== false,
  };
  if (!axes.demo && !axes.fin && !axes.geo) axes.demo = true; // never score nothing
  const limit = Math.min(Math.max(1, opts.limit || 6), 40);

  const zRefPop = z(ref, "logPop");
  const scored = [];
  for (const c of state.feats) {
    if (c.insee === insee) continue;
    const { score, groups } = pairScore(ref, c, axes);
    // size closeness as a stable tiebreak (keeps results sensible when an axis ties)
    const zc = z(c, "logPop");
    const popTie = zRefPop != null && zc != null ? -Math.abs(zRefPop - zc) : -99;
    scored.push({ c, score, groups, popTie });
  }
  scored.sort((x, y) => y.score - x.score || y.popTie - x.popTie || (y.c.pop || 0) - (x.c.pop || 0));
  const results = scored.slice(0, limit).map((s) => ({
    ...pub(s.c),
    score: Math.round(s.score * 100),
    groups: {
      demo: s.groups.demo == null ? null : Math.round(s.groups.demo * 100),
      fin: s.groups.fin == null ? null : Math.round(s.groups.fin * 100),
      geo: s.groups.geo == null ? null : Math.round(s.groups.geo * 100),
    },
  }));
  return { ref: pub(ref), axes, results };
}

module.exports = { load, similar, state };
