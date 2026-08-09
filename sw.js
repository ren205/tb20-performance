/* Service worker — makes offline deterministic rather than leaving it to the
   browser's cache heuristics, which is the whole point of this tool.

   Strategy: precache the shell on install, then serve cache-first. The app has
   no server data to go stale, so a cached hit is always correct.

   A new version deliberately does NOT take over on its own. Swapping the page
   under someone midway through a mass-and-balance or a departure calculation
   is worse than running a build that is a few minutes old, so the new worker
   waits and the page offers an explicit "update" instead.

   Bump CACHE when the app changes; the build script does that automatically. */
const CACHE = "tb20-v2026.08.09.1407";
const SHELL = ["./", "./index.html", "./manifest.webmanifest",
               "./icon-192.png", "./icon-512.png", "./icon-180.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));   // no skipWaiting: see above
});

self.addEventListener("message", e => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();   // user asked for it
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;  // never touch the forecast API
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || net;      // cache-first, refresh in the background
    })
  );
});
