// FicheDeMaire.fr — SPA core: i18n, routing, data fetching, chart helpers.
const STD = (window.STD = {});

// ── i18n & locale routing (URL is authoritative; FR owns the bare path) ─────
const LOCALES = ["fr", "en"];
const DEFAULT_LANG = "fr";
function cookie(name) {
  const m = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
  return m ? decodeURIComponent(m.pop()) : null;
}
STD.stripLocale = (p) => {
  const m = p.match(/^\/([a-z]{2})(\/.*)?$/);
  return m && LOCALES.includes(m[1]) ? m[2] || "/" : p || "/";
};
STD.localized = (p, lang) => {
  const bare = STD.stripLocale(p);
  const clean = bare === "/" ? "" : bare;
  return lang === DEFAULT_LANG ? clean || "/" : `/${lang}${clean}`;
};
function pathLang() {
  const m = location.pathname.match(/^\/([a-z]{2})(\/|$)/);
  return m && LOCALES.includes(m[1]) ? m[1] : null;
}
function queryLang() {
  const q = new URLSearchParams(location.search).get("lang");
  return LOCALES.includes(q) ? q : null;
}
STD.lang = pathLang() || queryLang() || DEFAULT_LANG;
if (!pathLang() && queryLang()) history.replaceState({}, "", STD.localized(location.pathname, STD.lang));
else if (!pathLang() && !queryLang()) {
  const c = cookie("zl-lang");
  if (c && c !== DEFAULT_LANG && LOCALES.includes(c)) {
    STD.lang = c;
    history.replaceState({}, "", STD.localized(location.pathname, c));
  }
}
document.cookie = `zl-lang=${STD.lang};path=/;domain=.zlef.fr;max-age=31536000`;
document.documentElement.lang = STD.lang;
const DICT = window.STD_I18N;
STD.t = (key, vars) => {
  let s = (DICT[STD.lang] && DICT[STD.lang][key]) || DICT.en[key] || key;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(vars[k]);
  return s;
};

// ── helpers ─────────────────────────────────────────────────────────────
STD.esc = (s) => (s == null ? "" : String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])));
STD.loc = () => (STD.lang === "en" ? "en-GB" : "fr-FR");
STD.fmt = (n) => (n == null ? "—" : Number(n).toLocaleString(STD.loc()));
STD.euro = (n) => (n == null ? "—" : Number(n).toLocaleString(STD.loc()) + " €");
STD.initials = (m) => ((m.prenom || " ")[0] + (m.nom || " ")[0]).toUpperCase();
STD.civ = (m) => (m.sexe === "F" ? STD.t("fiche.mme") : STD.t("fiche.man"));
STD.mayorName = (m) => `${m.prenom || ""} ${m.nom || ""}`.trim();

const cache = {};
STD.getJSON = async (url) => {
  if (cache[url]) return cache[url];
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status);
  const j = await r.json();
  cache[url] = j;
  return j;
};

STD.toast = (msg) => {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2200);
};

// ── financial-health classification (CRC reference thresholds) ─────────────
STD.desendetClass = (y, neg) => {
  if (neg) return { cls: "bad", tag: STD.t("fiche.negEp") };
  if (y == null) return { cls: "neutral", tag: STD.t("tag.na") };
  if (y <= 8) return { cls: "good", tag: STD.t("tag.sain") };
  if (y <= 12) return { cls: "warn", tag: STD.t("tag.surveiller") };
  return { cls: "bad", tag: STD.t("tag.tendu") };
};
STD.epargneClass = (pct) => {
  if (pct == null) return { cls: "neutral", tag: STD.t("tag.na") };
  if (pct >= 10) return { cls: "good", tag: STD.t("tag.sain") };
  if (pct >= 5) return { cls: "warn", tag: STD.t("tag.surveiller") };
  return { cls: "bad", tag: STD.t("tag.tendu") };
};

// ── dependency-free SVG charts (with interactive tooltips) ─────────────────
// Chart geometry (viewBox units). SVG scales to container width, aspect kept.
const CW = 640, CH = 190, CPL = 44, CPR = 14, CPT = 14, CPB = 26;
// Serialize tooltip payload into an HTML attribute (STD.esc turns " → &quot;).
const tipAttr = (o) => STD.esc(JSON.stringify(o));

// Single-series line/area chart over {y, h} points. opts: { label, fmt }.
STD.lineChart = (points, color = "#000091", opts = {}) => {
  const pts = points.filter((p) => p.h != null);
  if (pts.length < 2) return `<div class="muted" style="font-size:13px">—</div>`;
  const fmtV = opts.fmt || STD.euro;
  const xs = pts.map((p) => p.y), ys = pts.map((p) => p.h);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  let ymin = Math.min(...ys, 0), ymax = Math.max(...ys);
  if (ymax === ymin) ymax = ymin + 1;
  const X = (y) => CPL + ((y - xmin) / (xmax - xmin || 1)) * (CW - CPL - CPR);
  const Y = (v) => CPT + (1 - (v - ymin) / (ymax - ymin)) * (CH - CPT - CPB);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p.y).toFixed(1)},${Y(p.h).toFixed(1)}`).join(" ");
  const area = `M${X(pts[0].y).toFixed(1)},${Y(ymin).toFixed(1)} ` + pts.map((p) => `L${X(p.y).toFixed(1)},${Y(p.h).toFixed(1)}`).join(" ") + ` L${X(pts[pts.length - 1].y).toFixed(1)},${Y(ymin).toFixed(1)} Z`;
  const grid = gridSvg(ymin, ymax, Y);
  const mnd = STD.mandateOverlay(X, xmin, xmax);
  const xlab = pts.map((p) => `<text class="axis-label" x="${X(p.y).toFixed(1)}" y="${CH - 8}" text-anchor="middle">${String(p.y).slice(2)}</text>`).join("");
  const dots = pts.map((p, i) => `<circle class="dot" data-i="${i}" cx="${X(p.y).toFixed(1)}" cy="${Y(p.h).toFixed(1)}" r="3.4" fill="${color}"/>`).join("");
  const band = (CW - CPL - CPR) / pts.length;
  const hits = pts.map((p, i) => {
    const tip = tipAttr({ y: p.y, rows: [{ c: color, l: opts.label || "", v: fmtV(p.h) }] });
    return `<rect class="tip-hit" data-i="${i}" data-tip="${tip}" x="${(X(p.y) - band / 2).toFixed(1)}" y="${CPT}" width="${band.toFixed(1)}" height="${(CH - CPT - CPB).toFixed(1)}"/>`;
  }).join("");
  const gid = "g" + color.replace("#", "");
  return `<div class="chart"><svg viewBox="0 0 ${CW} ${CH}" role="img"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${grid}<path class="area" d="${area}" fill="url(#${gid})"/><path class="linepath" d="${line}" stroke="${color}"/>${mnd}${dots}${xlab}${hits}</svg></div>`;
};

// Two-series line chart (e.g. recettes vs dépenses). opts: { la, lb }.
STD.dualLine = (a, b, ca, cb, opts = {}) => {
  const A = a.filter((p) => p.h != null), B = b.filter((p) => p.h != null);
  if (A.length < 2) return `<div class="muted" style="font-size:13px">—</div>`;
  const la = opts.la || STD.t("legend.rf"), lb = opts.lb || STD.t("legend.df");
  const bByYear = {}; B.forEach((p) => (bByYear[p.y] = p.h));
  const all = [...A, ...B], xs = all.map((p) => p.y), ys = all.map((p) => p.h);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  let ymin = Math.min(...ys, 0), ymax = Math.max(...ys); if (ymax === ymin) ymax = ymin + 1;
  const X = (y) => CPL + ((y - xmin) / (xmax - xmin || 1)) * (CW - CPL - CPR);
  const Y = (v) => CPT + (1 - (v - ymin) / (ymax - ymin)) * (CH - CPT - CPB);
  const path = (arr) => arr.map((p, i) => `${i ? "L" : "M"}${X(p.y).toFixed(1)},${Y(p.h).toFixed(1)}`).join(" ");
  const grid = gridSvg(ymin, ymax, Y);
  const mnd = STD.mandateOverlay(X, xmin, xmax);
  const xlab = A.map((p) => `<text class="axis-label" x="${X(p.y).toFixed(1)}" y="${CH - 8}" text-anchor="middle">${String(p.y).slice(2)}</text>`).join("");
  const dotsB = B.map((p) => `<circle class="dot dot-b" cx="${X(p.y).toFixed(1)}" cy="${Y(p.h).toFixed(1)}" r="3" fill="${cb}"/>`).join("");
  const dotsA = A.map((p, i) => `<circle class="dot" data-i="${i}" cx="${X(p.y).toFixed(1)}" cy="${Y(p.h).toFixed(1)}" r="3.4" fill="${ca}"/>`).join("");
  const band = (CW - CPL - CPR) / A.length;
  const hits = A.map((p, i) => {
    const rows = [{ c: ca, l: la, v: STD.euro(p.h) }];
    if (bByYear[p.y] != null) rows.push({ c: cb, l: lb, v: STD.euro(bByYear[p.y]) });
    const tip = tipAttr({ y: p.y, rows });
    return `<rect class="tip-hit" data-i="${i}" data-tip="${tip}" x="${(X(p.y) - band / 2).toFixed(1)}" y="${CPT}" width="${band.toFixed(1)}" height="${(CH - CPT - CPB).toFixed(1)}"/>`;
  }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${CW} ${CH}" role="img">${grid}<path class="linepath" d="${path(A)}" stroke="${ca}"/><path class="linepath" d="${path(B)}" stroke="${cb}" stroke-dasharray="1 5"/>${mnd}${dotsB}${dotsA}${xlab}${hits}</svg></div>`;
};

// Bar chart over {y, h}. opts: { label, fmt }.
STD.barChart = (points, color = "#18753c", opts = {}) => {
  const pts = points.filter((p) => p.h != null);
  if (!pts.length) return `<div class="muted" style="font-size:13px">—</div>`;
  const fmtV = opts.fmt || STD.euro;
  const ys = pts.map((p) => p.h);
  let ymin = Math.min(...ys, 0), ymax = Math.max(...ys, 0); if (ymax === ymin) ymax = ymin + 1;
  const bw = (CW - CPL - CPR) / pts.length * 0.62;
  const X = (i) => CPL + (i + 0.5) / pts.length * (CW - CPL - CPR);
  const Y = (v) => CPT + (1 - (v - ymin) / (ymax - ymin)) * (CH - CPT - CPB);
  const grid = gridSvg(ymin, ymax, Y);
  const bstep = (CW - CPL - CPR) / pts.length;
  const mnd = STD.mandateOverlay((yr) => CPL + (yr - pts[0].y + 0.5) * bstep, pts[0].y, pts[pts.length - 1].y);
  const bars = pts.map((p, i) => {
    const y0 = Y(Math.max(0, p.h)), y1 = Y(Math.min(0, p.h));
    return `<rect class="barcol" data-i="${i}" x="${(X(i) - bw / 2).toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, y1 - y0).toFixed(1)}" rx="3" fill="${p.h < 0 ? '#c9302c' : color}"/>`;
  }).join("");
  const xlab = pts.map((p, i) => `<text class="axis-label" x="${X(i).toFixed(1)}" y="${CH - 8}" text-anchor="middle">${String(p.y).slice(2)}</text>`).join("");
  const band = (CW - CPL - CPR) / pts.length;
  const hits = pts.map((p, i) => {
    const tip = tipAttr({ y: p.y, rows: [{ c: p.h < 0 ? "#c9302c" : color, l: opts.label || "", v: fmtV(p.h) }] });
    return `<rect class="tip-hit" data-i="${i}" data-tip="${tip}" x="${(X(i) - band / 2).toFixed(1)}" y="${CPT}" width="${band.toFixed(1)}" height="${(CH - CPT - CPB).toFixed(1)}"/>`;
  }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${CW} ${CH}" role="img">${grid}${bars}${mnd}${xlab}${hits}</svg></div>`;
};

// shared Y grid + labels
function gridSvg(ymin, ymax, Y) {
  return [ymin, (ymin + ymax) / 2, ymax].map((v) =>
    `<line class="grid-line" x1="${CPL}" y1="${Y(v).toFixed(1)}" x2="${CW - CPR}" y2="${Y(v).toFixed(1)}"/><text class="axis-label" x="${CPL - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${Math.round(v).toLocaleString(STD.loc())}</text>`).join("");
}

// ── municipal-mandate overlay (terms are national: 2014 · 2020 · 2026) ──────
// French councils all renew on the same 6-yr cycle, so any finance timeline can
// be sliced into mandate periods — a "bilan par mandat". `xAt` maps a (fractional)
// calendar year to px in this chart's own coordinate space; the transition line
// sits at E-0.5, i.e. between the last pre-election year and the election year.
const ELECTIONS = [2008, 2014, 2020, 2026, 2032];
const CUR_TERM = 2026;
STD.mandateOverlay = (xAt, dom0, dom1) => {
  const clamp = (x) => Math.max(CPL, Math.min(CW - CPR, x));
  const hBand = CH - CPT - CPB;
  let bands = "", lines = "", labels = "";
  for (let k = 0; k < ELECTIONS.length - 1; k++) {
    const s = ELECTIONS[k], e = ELECTIONS[k + 1];
    if (e - 1 < dom0 || s > dom1) continue;                 // period out of view
    const x0 = clamp(xAt(s - 0.5)), x1 = clamp(xAt(e - 0.5));
    if (x1 - x0 < 3) continue;
    bands += `<rect class="mnd-band${k % 2 ? " alt" : ""}" x="${x0.toFixed(1)}" y="${CPT}" width="${(x1 - x0).toFixed(1)}" height="${hBand}"/>`;
    if (x1 - x0 > 48) {
      const lab = s >= CUR_TERM ? STD.t("mnd.current") : `${s}–${e}`;
      labels += `<text class="mnd-label" x="${((x0 + x1) / 2).toFixed(1)}" y="${CPT + 11}" text-anchor="middle">${STD.esc(lab)}</text>`;
    }
  }
  ELECTIONS.forEach((E) => {
    const b = E - 0.5;
    if (b <= dom0 || b >= dom1) return;                     // interior dividers only
    const x = xAt(b);
    lines += `<line class="mnd-div" x1="${x.toFixed(1)}" y1="${CPT}" x2="${x.toFixed(1)}" y2="${(CH - CPB).toFixed(1)}"/>`;
  });
  return `<g class="mnd">${bands}${lines}${labels}</g>`;
};

// ── shared floating chart tooltip (hover on desktop, tap on touch) ──────────
function ensureTip() {
  if (STD._tip && document.body.contains(STD._tip)) return STD._tip;
  const el = document.createElement("div");
  el.id = "chart-tip";
  el.setAttribute("role", "tooltip");
  document.body.appendChild(el);
  return (STD._tip = el);
}
function hideTip() {
  if (STD._tip) STD._tip.classList.remove("show");
  document.querySelectorAll(".tip-hit.on").forEach((h) => h.classList.remove("on"));
  document.querySelectorAll(".dot.tip-active").forEach((d) => d.classList.remove("tip-active"));
  STD._tipActive = null;
}
function markerFor(hit) {
  const svg = hit.ownerSVGElement;
  if (!svg) return null;
  return svg.querySelector(`.dot[data-i="${hit.dataset.i}"]`) || svg.querySelector(`.barcol[data-i="${hit.dataset.i}"]`) || hit;
}
// place the tooltip above (or below, when clipped) the point, clamped to the viewport
function placeTip(el, mr) {
  const tr = el.getBoundingClientRect();
  let left = mr.left + mr.width / 2 - tr.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
  let top = mr.top - tr.height - 10;
  if (top < 8) top = mr.bottom + 10;
  el.style.left = Math.round(left) + "px";
  el.style.top = Math.round(top) + "px";
}
function showTipFor(hit) {
  let data;
  try { data = JSON.parse(hit.dataset.tip); } catch { return; }
  const marker = markerFor(hit);
  if (!marker) return;
  const el = ensureTip();
  el.innerHTML = `<div class="tip-y">${STD.esc(String(data.y))}</div>` + data.rows.map((r) =>
    `<div class="tip-row"><span class="sw" style="background:${STD.esc(r.c)}"></span>${r.l ? `<span class="lb">${STD.esc(r.l)}</span>` : ""}<span class="vl">${STD.esc(r.v)}</span></div>`).join("");
  el.style.left = "-9999px"; el.style.top = "-9999px"; // measure off-screen first
  placeTip(el, marker.getBoundingClientRect());
  el.classList.add("show");
  hit.classList.add("on");
  if (marker.classList.contains("dot")) marker.classList.add("tip-active");
  STD._tipActive = hit;
}
// keep the tooltip glued to its point while the page scrolls; drop it once off-screen
function repositionTip() {
  const hit = STD._tipActive;
  if (!hit || !STD._tip || !STD._tip.classList.contains("show")) return;
  const marker = markerFor(hit);
  if (!marker) { hideTip(); return; }
  const mr = marker.getBoundingClientRect();
  if (mr.bottom < 36 || mr.top > window.innerHeight - 8) { hideTip(); return; }
  placeTip(STD._tip, mr);
}
document.addEventListener("pointerover", (e) => {
  const hit = e.target.closest && e.target.closest(".tip-hit");
  if (hit && e.pointerType !== "touch") showTipFor(hit);
});
document.addEventListener("pointerout", (e) => {
  const hit = e.target.closest && e.target.closest(".tip-hit");
  if (!hit || e.pointerType === "touch") return;
  const to = e.relatedTarget;
  if (to && to.closest && to.closest(".tip-hit")) return; // sliding to a sibling band
  hideTip();
});
document.addEventListener("pointerdown", (e) => {
  const hit = e.target.closest && e.target.closest(".tip-hit");
  if (hit) {
    if (e.pointerType === "touch" || e.pointerType === "pen") { STD._tipActive === hit ? hideTip() : showTipFor(hit); }
    return;
  }
  if (!(e.target.closest && e.target.closest("#chart-tip"))) hideTip();
});
window.addEventListener("scroll", repositionTip, { passive: true });
window.addEventListener("resize", hideTip);
STD.hideTip = hideTip;

// ── router ──────────────────────────────────────────────────────────────
const routes = [
  { re: /^\/$/, view: "home" },
  { re: /^\/communes\/?$/, view: "communes" },
  { re: /^\/classements\/?$/, view: "classements" },
  { re: /^\/methode\/?$/, view: "methode" },
  { re: /^\/(?:maire|commune)\/([^/]+)\/?$/, view: "fiche" },
];
STD.go = (path, replace) => {
  const full = STD.localized(path, STD.lang);
  if (replace) history.replaceState({}, "", full);
  else history.pushState({}, "", full);
  render();
};
STD.setLang = (lang) => {
  if (!LOCALES.includes(lang) || lang === STD.lang) return;
  STD.lang = lang;
  document.cookie = `zl-lang=${lang};path=/;domain=.zlef.fr;max-age=31536000`;
  document.documentElement.lang = lang;
  history.replaceState({}, "", STD.localized(location.pathname, lang));
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = STD.t(el.dataset.i18n)));
  render();
};
function highlightNav(view) {
  document.querySelectorAll("nav.main a").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  document.querySelector("nav.main")?.classList.remove("open");
}
async function render() {
  if (STD.hideTip) STD.hideTip();
  const path = STD.stripLocale(location.pathname);
  const root = document.getElementById("app");
  const match = routes.find((r) => r.re.test(path)) || routes[0];
  const m = path.match(match.re);
  highlightNav(match.view);
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  root.innerHTML = `<div class="wrap"><div class="spinner"></div></div>`;
  try {
    await STD.views[match.view](root, m);
    STD.track(path);
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="wrap block"><div class="prose"><h1>${STD.t("err.title")}</h1><p>${STD.t("err.load")}</p><a class="btn btn-primary" href="/" data-link>${STD.t("fiche.back")}</a></div></div>`;
  }
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-link]");
  if (a && a.getAttribute("href")?.startsWith("/")) {
    e.preventDefault();
    STD.go(a.getAttribute("href"));
  }
});
window.addEventListener("popstate", render);

// ── per-page view counter ────────────────────────────────────────────────
STD.track = async (path) => {
  try {
    const r = await fetch("/api/view", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) });
    const { count } = await r.json();
    const s = STD.lang === "fr" ? (count > 1 ? "s" : "") : (count === 1 ? "" : "s");
    const label = STD.t("footer.views", { n: count == null ? "" : count.toLocaleString(STD.loc()), s });
    document.querySelectorAll("[data-views]").forEach((el) => {
      if (count == null) { el.hidden = true; return; }
      el.textContent = label; el.hidden = false;
    });
  } catch {}
};

STD.render = render;
STD.boot = () => {
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = STD.t(el.dataset.i18n)));
  render();
};
