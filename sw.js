/* Fixpre Service Worker — uygulama kabuğunu önbelleğe alır, API'yi ağdan çeker */
const CACHE = "fixpre-v1";
const ASSETS = [
  "/", "/index.html", "/app.js", "/style.css", "/i18n.js",
  "/manifest.json", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // API çağrıları her zaman ağdan (önbelleğe alınmaz)
  if (url.pathname.startsWith("/api/")) return;
  if (e.request.method !== "GET") return;
  // Uygulama kabuğu: önce ağ (güncel kal), olmazsa önbellek (çevrimdışı)
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/index.html")))
  );
});
