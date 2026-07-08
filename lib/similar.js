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
// Indicator catalogue — the atomic comparison criteria the caller can pick from.
// Each maps to an axis (demo / fin / geo), a weight, and either a numeric feature
// (a key of NUM) or the special composite geographic proximity. The three axes are
// just groupings of these indicators; extended settings let the caller enable any
// subset. Population dominates démographie (town size is the primary comparability
// signal); the mayor's age is a lighter touch.
const IND = {
  pop:   { axis: "demo", w: 2, num: "logPop" },
  age:   { axis: "demo", w: 1, num: "age" },
  dette: { axis: "fin",  w: 1, num: "logDette" },
  ep:    { axis: "fin",  w: 1, num: "ep" },
  des:   { axis: "fin",  w: 1, num: "desC" },
  df:    { axis: "fin",  w: 1, num: "logDf" },
  perso: { axis: "fin",  w: 1, num: "logPerso" },
  geo:   { axis: "geo",  w: 1, geo: true },
};
const ALL_INDS = Object.keys(IND);
const AXIS_OF = ALL_INDS.reduce((m, k) => ((m[k] = IND[k].axis), m), {});
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

// Contribution of a single indicator to the pair score, reference-centric: the
// reference `a` must have the feature for the indicator to count (missing data on
// the reference → indicator dropped from the denominator). A candidate `b` missing
// a feature the reference has scores 0 on it (not comparable, not a free match).
// Returns { w, s } (s already weighted) or null when the reference lacks it.
function indContrib(a, b, key) {
  const spec = IND[key];
  if (spec.geo) return { w: spec.w, s: spec.w * geoScore(a, b) };
  const za = z(a, spec.num);
  if (za == null) return null;         // reference lacks it → drop from denominator
  const zb = z(b, spec.num);
  return { w: spec.w, s: spec.w * (zb == null ? 0 : gauss(za, zb)) };
}

// great-circle distance in km between two [lat, lon] points (haversine)
function haversineKm(latA, lonA, latB, lonB) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (latB - latA) * rad, dLon = (lonB - lonA) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
function distKm(a, b) {
  if (a.lat == null || b.lat == null) return null;
  return haversineKm(a.lat, a.lon, b.lat, b.lon);
}

// geographic proximity + typology match, in [0,1].
// Proximity is driven by REAL great-circle distance (centroids cover 100 % of
// communes), so towns that are physically close score high even across an EPCI or
// department boundary — e.g. Massy (91) and Noisy-le-Sec (93) are ~23 km apart and
// should read as geographically similar, which admin-bucket-only scoring missed
// (they only share a region → it buried Noisy under Massy's own-EPCI neighbours).
// Administrative belonging (same EPCI / department) acts as a FLOOR so intercommunal
// peers stay close even when a few km apart.
const GEO_TAU = 40; // km — gaussian bandwidth (10 km→.97, 25 km→.82, 40 km→.61, 80 km→.14)
function geoScore(a, b) {
  const km = distKm(a, b);
  const distSim = km == null ? null : Math.exp(-0.5 * (km / GEO_TAU) ** 2);
  let floor = 0;
  if (a.epci && b.epci && a.epci === b.epci) floor = 0.9;
  else if (a.dep && b.dep && a.dep === b.dep) floor = 0.4;
  else if (a.reg && b.reg && a.reg === b.reg) floor = 0.15;
  const prox = distSim == null ? floor : Math.max(distSim, floor);
  const typo = ((a.rural === b.rural) + (a.montagne === b.montagne) + (a.touristique === b.touristique)) / 3;
  return 0.85 * prox + 0.15 * typo;
}

// Full pair score over an arbitrary set of enabled indicators (`sel` = array of
// indicator keys). The overall match is the weighted mean of every enabled
// indicator's contribution; `groups` re-aggregates those same contributions by
// axis so the UI can still show a per-axis (demo/fin/geo) badge — a group is null
// when none of its enabled indicators applied to the reference.
function pairScore(a, b, sel) {
  const acc = { demo: { s: 0, w: 0 }, fin: { s: 0, w: 0 }, geo: { s: 0, w: 0 } };
  let sum = 0, wsum = 0;
  for (const key of sel) {
    const c = indContrib(a, b, key);
    if (!c) continue;
    sum += c.s; wsum += c.w;
    const ax = acc[AXIS_OF[key]];
    ax.s += c.s; ax.w += c.w;
  }
  const groups = {};
  for (const ax of ["demo", "fin", "geo"]) groups[ax] = acc[ax].w ? acc[ax].s / acc[ax].w : null;
  return { score: wsum ? sum / wsum : 0, groups };
}

// public shape for one commune (ref or result). `ref` (optional) adds the
// great-circle distance from the reference commune, for display.
function pub(f, ref) {
  const p = require("./data").store.byInsee[f.insee];
  const km = ref && ref !== f ? distKm(ref, f) : null;
  return {
    insee: f.insee,
    path: p ? p.path : null,
    commune: f.commune,
    dep: f.dep,
    depNom: f.depNom,
    reg: f.reg,
    epci: f.epci,
    metro: f.metro,
    pop: f.pop,
    age: f.age,
    km: km == null ? null : Math.round(km),
    fin: f.fin ? { dette: f.fin.dette, ep: f.fin.ep, des: f.fin.des, epn: f.fin.epn, df: f.fin.df } : null,
  };
}

// Geographic scope (search amplitude). `radiusKm` only used when scope==='radius'.
// Returns true if candidate `c` is inside the scope around reference `ref`.
const SCOPES = ["france", "region", "dep", "metro", "radius"];
function scopeAvail(ref) {
  return { france: true, region: !!ref.reg, dep: !!ref.dep, metro: !!ref.metro, radius: ref.lat != null };
}
function inScope(ref, c, scope, radiusKm) {
  switch (scope) {
    case "region": return !!ref.reg && c.reg === ref.reg;
    case "dep": return c.dep === ref.dep;
    case "metro": return !!ref.metro && c.metro === ref.metro;
    case "radius": { const d = distKm(ref, c); return d != null && d <= radiusKm; }
    default: return true; // france — no filter
  }
}

// Rank the communes most similar to `insee`.
//   opts: { inds (array of indicator keys — extended settings), or the legacy axis
//           booleans demo/fin/geo, limit, scope, radiusKm }
// Returns { ref, inds, indsAvail, axes, results:[{...pub, score, groups}] } or null.
function similar(insee, opts = {}) {
  if (!state.ready) return null;
  const ref = state.byInsee[insee];
  if (!ref) return null;

  // Which indicator can the reference actually be compared on? (it has the feature)
  const indsAvail = {};
  for (const k of ALL_INDS) indsAvail[k] = IND[k].geo ? true : z(ref, IND[k].num) != null;

  // Build the enabled indicator set. Explicit `inds` (extended settings) wins;
  // otherwise fall back to the legacy per-axis booleans (whole axis on/off).
  let sel;
  if (Array.isArray(opts.inds) && opts.inds.length) {
    sel = opts.inds.filter((k) => IND[k]);
  } else {
    const on = { demo: opts.demo !== false, fin: opts.fin !== false, geo: opts.geo !== false };
    sel = ALL_INDS.filter((k) => on[IND[k].axis]);
  }
  // keep only indicators the reference supports (drops finances when it has no OFGL)
  sel = sel.filter((k) => indsAvail[k]);
  // never score nothing: fall back to every indicator the reference DOES support
  // (geo is always available), then to pop as a last resort
  if (!sel.length) sel = ALL_INDS.filter((k) => indsAvail[k]);
  if (!sel.length) sel = ["pop"];
  // axes summary (back-compat + UI master toggles): axis on if any of its inds enabled
  const axes = { demo: false, fin: false, geo: false };
  for (const k of sel) axes[IND[k].axis] = true;
  const limit = Math.min(Math.max(1, opts.limit || 6), 40);

  // geographic amplitude: fall back to "france" if the requested scope isn't
  // available for this reference (e.g. radius but no coordinates, metro but none)
  const avail = scopeAvail(ref);
  let scope = SCOPES.includes(opts.scope) ? opts.scope : "france";
  if (!avail[scope]) scope = "france";
  const radiusKm = Math.min(Math.max(1, opts.radiusKm || 25), 500);

  const zRefPop = z(ref, "logPop");
  const scored = [];
  let inScopeCount = 0;
  for (const c of state.feats) {
    if (c.insee === insee) continue;
    if (!inScope(ref, c, scope, radiusKm)) continue;
    inScopeCount++;
    const { score, groups } = pairScore(ref, c, sel);
    // size closeness as a stable tiebreak (keeps results sensible when an axis ties)
    const zc = z(c, "logPop");
    const popTie = zRefPop != null && zc != null ? -Math.abs(zRefPop - zc) : -99;
    scored.push({ c, score, groups, popTie });
  }
  scored.sort((x, y) => y.score - x.score || y.popTie - x.popTie || (y.c.pop || 0) - (x.c.pop || 0));
  const results = scored.slice(0, limit).map((s) => ({
    ...pub(s.c, ref),
    score: Math.round(s.score * 100),
    groups: {
      demo: s.groups.demo == null ? null : Math.round(s.groups.demo * 100),
      fin: s.groups.fin == null ? null : Math.round(s.groups.fin * 100),
      geo: s.groups.geo == null ? null : Math.round(s.groups.geo * 100),
    },
  }));
  return { ref: pub(ref), inds: sel, indsAvail, axes, scope, radiusKm, scopeAvail: avail, inScopeCount, results };
}

module.exports = { load, similar, state, IND, ALL_INDS };
