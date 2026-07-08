// Minimal service worker: network-first for navigations, cache-first for static.
const CACHE = "fdm-v4";
const ASSETS = ["/styles.css?v=4", "/app.js?v=4", "/views.js?v=4", "/i18n.js?v=4", "/favicon.svg?v=4"];
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {}))); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/og/")) return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
    if (r.ok && (url.pathname.endsWith(".css") || url.pathname.endsWith(".js") || url.pathname.endsWith(".svg"))) {
      const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp));
    }
    return r;
  }).catch(() => caches.match("/"))));
});
