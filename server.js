// FicheDeMaire.fr — zero-dependency Node HTTP server (bar @resvg for OG PNGs).
// Serves the static PWA + a small read-only JSON API over the pre-computed data.
const http = require("http");
const fs = require("fs");
const path = require("path");
const data = require("./lib/data");
const similar = require("./lib/similar");
const og = require("./lib/og");
const tracker = require("./lib/tracker");
const seo = require("./lib/seo");
const locales = require("./lib/locales");
const faq = require("./lib/faq");
const { Resvg } = require("@resvg/resvg-js");

const isSlug = (s) => !!data.store.bySlug[s];
const PORT = process.env.PORT || 10117;
const PUB = path.join(__dirname, "public");
const VAR = process.env.VAR_DIR || path.join(__dirname, "var");

function renderPng(svg) {
  return new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" },
  }).render().asPng();
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon", ".xml": "application/xml; charset=utf-8", ".txt": "text/plain; charset=utf-8",
};

function send(res, code, body, headers = {}) { res.writeHead(code, headers); res.end(body); }
function json(res, obj, code = 200, cache = "public, max-age=300") {
  send(res, code, JSON.stringify(obj), { "content-type": MIME[".json"], "cache-control": cache });
}
function sendShell(res, pathname) {
  fs.readFile(path.join(PUB, "index.html"), "utf8", (e, html) =>
    e ? send(res, 404, "not found")
      : send(res, 200, seo.injectMeta(html, pathname), { "content-type": MIME[".html"], "cache-control": "no-cache" })
  );
}
function serveStatic(req, res, urlPath) {
  const pathname = decodeURIComponent(urlPath.split("?")[0]);
  if (pathname === "/") return sendShell(res, "/");
  const file = path.join(PUB, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(PUB)) return send(res, 403, "forbidden");
  fs.readFile(file, (err, buf) => {
    if (err) return sendShell(res, pathname); // SPA fallback → client router
    const ext = path.extname(file);
    const cache = ext === ".html" ? "no-cache" : "public, max-age=3600";
    send(res, 200, buf, { "content-type": MIME[ext] || "application/octet-stream", "cache-control": cache });
  });
}

const server = http.createServer((req, res) => {
  const url = req.url;
  const pathOnly = url.split("?")[0];

  // default locale owns the bare path; a redundant "/fr" prefix 301s to it
  const defPrefix = new RegExp(`^/${locales.DEFAULT}(/|$)`);
  if (defPrefix.test(pathOnly)) {
    let stripped = pathOnly.replace(new RegExp(`^/${locales.DEFAULT}`), "") || "/";
    if (!stripped.startsWith("/") || stripped.startsWith("//")) stripped = "/";
    const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    return send(res, 301, "", { location: stripped + qs });
  }

  // ---- API ----------------------------------------------------------------
  if (url.startsWith("/api/")) {
    const u = new URL(url, "http://x");
    const p = u.pathname;

    if (p === "/api/stats") return json(res, { ...data.store.stats, generatedAt: data.store.generatedAt }, 200, "public, max-age=3600");
    if (p === "/api/boards") return json(res, data.store.boards, 200, "public, max-age=3600");
    if (p === "/api/deps") return json(res, { deps: data.store.deps }, 200, "public, max-age=3600");
    if (p === "/api/faq") return json(res, faq, 200, "public, max-age=3600");
    if (p === "/api/dep") {
      const dep = u.searchParams.get("dep") || "";
      const list = data.communesOfDep(dep);
      return json(res, { dep, communes: list }, 200, "public, max-age=600");
    }
    if (p === "/api/search") {
      const q = u.searchParams.get("q") || "";
      return json(res, { results: data.search(q, 40) }, 200, "public, max-age=60");
    }
    if (p === "/api/similar") {
      const insee = u.searchParams.get("insee") || "";
      const ax = (u.searchParams.get("axes") || "demo,fin,geo").split(",");
      const indsParam = u.searchParams.get("inds"); // extended per-indicator selection
      const inds = indsParam != null ? indsParam.split(",").map((s) => s.trim()).filter(Boolean) : null;
      const limit = parseInt(u.searchParams.get("limit"), 10) || 6;
      const out = similar.similar(insee, {
        inds,
        demo: ax.includes("demo"), fin: ax.includes("fin"), geo: ax.includes("geo"), limit,
        scope: u.searchParams.get("scope") || "france",
        radiusKm: parseInt(u.searchParams.get("radius"), 10) || 25,
      });
      return out ? json(res, out, 200, "public, max-age=1800") : json(res, { error: "not found" }, 404, "no-cache");
    }
    if (p.startsWith("/api/fiche/")) {
      const key = decodeURIComponent(p.slice("/api/fiche/".length));
      const f = data.fiche(key);
      return f ? json(res, f) : json(res, { error: "not found" }, 404, "no-cache");
    }
    if (p === "/api/view") {
      if (req.method === "POST") {
        let body = "";
        req.on("data", (c) => { body += c; if (body.length > 2000) req.destroy(); });
        req.on("end", () => {
          let target = "/";
          try { target = JSON.parse(body || "{}").path || "/"; } catch {}
          const count = tracker.hit(target, isSlug);
          json(res, { count, total: tracker.total() }, 200, "no-cache");
        });
        return;
      }
      const count = tracker.get(u.searchParams.get("path") || "/", isSlug);
      return json(res, { count, total: tracker.total() }, 200, "no-cache");
    }
    return json(res, { error: "unknown endpoint" }, 404, "no-cache");
  }

  // ---- SEO: sitemap index + children + robots ----------------------------
  if (pathOnly === "/sitemap.xml") return send(res, 200, seo.sitemapIndex(), { "content-type": MIME[".xml"], "cache-control": "public, max-age=3600" });
  if (pathOnly === "/sitemap-static.xml") return send(res, 200, seo.sitemapStatic(), { "content-type": MIME[".xml"], "cache-control": "public, max-age=3600" });
  const smDep = pathOnly.match(/^\/sitemap-([0-9AB]{2,3})\.xml$/);
  if (smDep) {
    const body = seo.sitemapDep(smDep[1]);
    return body ? send(res, 200, body, { "content-type": MIME[".xml"], "cache-control": "public, max-age=3600" }) : send(res, 404, "not found");
  }
  if (pathOnly === "/robots.txt") return send(res, 200, seo.robots(), { "content-type": MIME[".txt"], "cache-control": "public, max-age=3600" });

  // ---- dynamic OG share image — PNG (cached) or SVG ----------------------
  if (url.startsWith("/og/")) {
    const slug = url.slice("/og/".length).replace(/\.(svg|png).*$/, "");
    const wantPng = /\.png/.test(url);
    const m = data.store.bySlug[decodeURIComponent(slug)];
    if (!m) return send(res, 404, "not found");
    if (!wantPng) return send(res, 200, og.card(m), { "content-type": MIME[".svg"], "cache-control": "public, max-age=3600" });
    const dir = path.join(VAR, "og");
    const file = path.join(dir, slug + ".png");
    return fs.readFile(file, (err, buf) => {
      if (!buf) {
        try { buf = renderPng(og.card(m)); }
        catch (e) {
          console.error("og png render failed:", e.message);
          return send(res, 200, og.card(m), { "content-type": MIME[".svg"], "cache-control": "public, max-age=600" });
        }
        fs.mkdir(dir, { recursive: true }, () => fs.writeFile(file, buf, () => {}));
      }
      send(res, 200, buf, { "content-type": MIME[".png"], "cache-control": "public, max-age=86400" });
    });
  }

  // ---- fiche URL canonicalisation ----------------------------------------
  // Canonical form is /maire/<commune>/<prénom-nom>. Redirect the old single-
  // segment /maire|/commune/<slug>, and the /commune/<city>/<mayor> alias, to it.
  const fm = pathOnly.match(/^(\/en)?\/(maire|commune)\/(.+?)\/?$/);
  if (fm) {
    const langPfx = fm[1] || "";
    const kind = fm[2];
    const rest = fm[3];
    const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    if (!rest.includes("/")) {
      // legacy single segment (old commune slug or INSEE) → canonical path
      const m = data.store.bySlug[decodeURIComponent(rest)] || data.store.byInsee[decodeURIComponent(rest)];
      if (m) return send(res, 301, "", { location: `${langPfx}/maire/${m.path}${qs}` });
    } else if (kind === "commune") {
      // /commune/<city>/<mayor> alias → /maire/<city>/<mayor>
      if (data.store.byPath[decodeURIComponent(rest)]) return send(res, 301, "", { location: `${langPfx}/maire/${rest}${qs}` });
    }
    // /maire/<city>/<mayor> falls through to the SPA shell (SSR-injected)
  }

  serveStatic(req, res, url);
});

data.load();
similar.load();
server.listen(PORT, () => console.log(`FicheDeMaire on :${PORT} — ${data.store.maires.length} maires`));
