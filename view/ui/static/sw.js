// the service worker: the app opens with no connection (technical-design.md →
// offline). the server puts VERSION and FILES above this: every file the app
// loads, and a hash of them all. a new version installs in the background and
// takes over on the next launch, never mid-use: no skipWaiting, no reload
// while shopping. the data never passes here: it is in indexeddb, and
// /api/sync always goes to the network.

const CACHE = "poki-" + VERSION;

self.addEventListener("install", (e) => {
  // reload: past the browser's http cache, so the cache holds this version
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("poki-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || !FILES.includes(url.pathname)) return;
  e.respondWith(caches.match(url.pathname, { cacheName: CACHE }).then((hit) => hit || fetch(e.request)));
});
