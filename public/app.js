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

// ── dependency-free SVG charts ─────────────────────────────────────────────
// Single-series line/area chart over {y, h} points.
STD.lineChart = (points, color = "#000091") => {
  const W = 640, H = 190, pl = 44, pr = 14, pt = 14, pb = 26;
  const pts = points.filter((p) => p.h != null);
  if (pts.length < 2) return `<div class="muted" style="font-size:13px">—</div>`;
  const xs = pts.map((p) => p.y), ys = pts.map((p) => p.h);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  let ymin = Math.min(...ys, 0), ymax = Math.max(...ys);
  if (ymax === ymin) ymax = ymin + 1;
  const X = (y) => pl + ((y - xmin) / (xmax - xmin || 1)) * (W - pl - pr);
  const Y = (v) => pt + (1 - (v - ymin) / (ymax - ymin)) * (H - pt - pb);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p.y).toFixed(1)},${Y(p.h).toFixed(1)}`).join(" ");
  const area = `M${X(pts[0].y).toFixed(1)},${Y(ymin).toFixed(1)} ` + pts.map((p) => `L${X(p.y).toFixed(1)},${Y(p.h).toFixed(1)}`).join(" ") + ` L${X(pts[pts.length - 1].y).toFixed(1)},${Y(ymin).toFixed(1)} Z`;
  const gy = [ymin, (ymin + ymax) / 2, ymax];
  const grid = gy.map((v) => `<line class="grid-line" x1="${pl}" y1="${Y(v).toFixed(1)}" x2="${W - pr}" y2="${Y(v).toFixed(1)}"/><text class="axis-label" x="${pl - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${Math.round(v).toLocaleString(STD.loc())}</text>`).join("");
  const xlab = pts.map((p) => `<text class="axis-label" x="${X(p.y).toFixed(1)}" y="${H - 8}" text-anchor="middle">${String(p.y).slice(2)}</text>`).join("");
  const dots = pts.map((p) => `<circle class="dot" cx="${X(p.y).toFixed(1)}" cy="${Y(p.h).toFixed(1)}" r="3.2" fill="${color}"/>`).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img"><defs><linearGradient id="g${color.replace('#','')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${grid}<path class="area" d="${area}" fill="url(#g${color.replace('#','')})"/><path class="linepath" d="${line}" stroke="${color}"/>${dots}${xlab}</svg></div>`;
};

// Two-series line chart (e.g. recettes vs dépenses).
STD.dualLine = (a, b, ca, cb) => {
  const W = 640, H = 190, pl = 44, pr = 14, pt = 14, pb = 26;
  const A = a.filter((p) => p.h != null), B = b.filter((p) => p.h != null);
  if (A.length < 2) return `<div class="muted" style="font-size:13px">—</div>`;
  const all = [...A, ...B], xs = all.map((p) => p.y), ys = all.map((p) => p.h);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  let ymin = Math.min(...ys, 0), ymax = Math.max(...ys); if (ymax === ymin) ymax = ymin + 1;
  const X = (y) => pl + ((y - xmin) / (xmax - xmin || 1)) * (W - pl - pr);
  const Y = (v) => pt + (1 - (v - ymin) / (ymax - ymin)) * (H - pt - pb);
  const path = (arr) => arr.map((p, i) => `${i ? "L" : "M"}${X(p.y).toFixed(1)},${Y(p.h).toFixed(1)}`).join(" ");
  const gy = [ymin, (ymin + ymax) / 2, ymax];
  const grid = gy.map((v) => `<line class="grid-line" x1="${pl}" y1="${Y(v).toFixed(1)}" x2="${W - pr}" y2="${Y(v).toFixed(1)}"/><text class="axis-label" x="${pl - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${Math.round(v).toLocaleString(STD.loc())}</text>`).join("");
  const xlab = A.map((p) => `<text class="axis-label" x="${X(p.y).toFixed(1)}" y="${H - 8}" text-anchor="middle">${String(p.y).slice(2)}</text>`).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img">${grid}<path class="linepath" d="${path(A)}" stroke="${ca}"/><path class="linepath" d="${path(B)}" stroke="${cb}" stroke-dasharray="1 5"/>${xlab}</svg></div>`;
};

// Bar chart over {y, h}.
STD.barChart = (points, color = "#18753c") => {
  const W = 640, H = 190, pl = 44, pr = 14, pt = 14, pb = 26;
  const pts = points.filter((p) => p.h != null);
  if (!pts.length) return `<div class="muted" style="font-size:13px">—</div>`;
  const ys = pts.map((p) => p.h);
  let ymin = Math.min(...ys, 0), ymax = Math.max(...ys, 0); if (ymax === ymin) ymax = ymin + 1;
  const bw = (W - pl - pr) / pts.length * 0.62;
  const X = (i) => pl + (i + 0.5) / pts.length * (W - pl - pr);
  const Y = (v) => pt + (1 - (v - ymin) / (ymax - ymin)) * (H - pt - pb);
  const gy = [ymin, (ymin + ymax) / 2, ymax];
  const grid = gy.map((v) => `<line class="grid-line" x1="${pl}" y1="${Y(v).toFixed(1)}" x2="${W - pr}" y2="${Y(v).toFixed(1)}"/><text class="axis-label" x="${pl - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${Math.round(v).toLocaleString(STD.loc())}</text>`).join("");
  const bars = pts.map((p, i) => {
    const y0 = Y(Math.max(0, p.h)), y1 = Y(Math.min(0, p.h));
    return `<rect class="barcol" x="${(X(i) - bw / 2).toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, y1 - y0).toFixed(1)}" rx="3" fill="${p.h < 0 ? '#c9302c' : color}"/>`;
  }).join("");
  const xlab = pts.map((p, i) => `<text class="axis-label" x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${String(p.y).slice(2)}</text>`).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img">${grid}${bars}${xlab}</svg></div>`;
};

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
