/* Service worker: the site keeps working offline in the shop.
 * Versioned assets (?v=build): cache first — the URL changes every build.
 * Pages, data and everything else: network first, falling back to cache.
 * "Download for offline" (from /app/ or the installed app) saves every page
 * listed in /offline-pages.json, and re-saves them after each update. */
const VERSION = 'muqrln3t';
const CACHE = 'hw-' + VERSION;
const META = 'hw-meta';           // survives updates; remembers the offline choice
const FLAG = '/__offline-all';
const PRECACHE = ["/","/check/","/e-numbers/","/ingredients/","/settings/","/offline/","/blog/","/quiz/","/assets/style.css?v=muqrln3t","/assets/app.js?v=muqrln3t","/assets/core.js?v=muqrln3t","/assets/checker.js?v=muqrln3t","/assets/list.js?v=muqrln3t","/assets/search-page.js?v=muqrln3t","/assets/home.js?v=muqrln3t","/assets/quiz.js?v=muqrln3t","/assets/blog.js?v=muqrln3t","/assets/app-page.js?v=muqrln3t","/assets/product.js?v=muqrln3t","/assets/prayer.js?v=muqrln3t","/assets/prayer-page.js?v=muqrln3t","/data/db.json","/data/products-min.json","/icon.svg","/manifest.webmanifest","/app/"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('hw-') && k !== CACHE && k !== META).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => caches.open(META).then((c) => c.match(FLAG)))
      .then((flag) => { if (flag) saveAll(broadcast); }) // refresh the offline library in the background
  );
});

function broadcast(msg) {
  return self.clients.matchAll({ includeUncontrolled: true }).then((cs) => cs.forEach((c) => c.postMessage(msg)));
}

let saving = null;
function saveAll(notify) {
  if (saving) return saving;
  saving = (async () => {
    const data = await fetch('/offline-pages.json', { cache: 'no-store' }).then((r) => r.json());
    const list = data.pages || data;
    const cache = await caches.open(CACHE);
    const BATCH = 6;
    for (let i = 0; i < list.length; i += BATCH) {
      await Promise.all(list.slice(i, i + BATCH).map((u) =>
        cache.match(u).then((hit) => hit || fetch(u).then((r) => (r.ok ? cache.put(u, r) : null))).catch(() => null)));
      notify({ type: 'offline-progress', done: Math.min(list.length, i + BATCH), total: list.length });
    }
    await (await caches.open(META)).put(FLAG, new Response(JSON.stringify({ date: Date.now(), total: list.length, version: VERSION })));
    notify({ type: 'offline-done', total: list.length });
  })().catch((err) => notify({ type: 'offline-error', message: String(err) })).finally(() => { saving = null; });
  return saving;
}

self.addEventListener('message', (e) => {
  if (e.data === 'offline-save') e.waitUntil(saveAll(broadcast));
  if (e.data === 'offline-off') e.waitUntil(caches.open(META).then((c) => c.delete(FLAG)).then(() => broadcast({ type: 'offline-off' })));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // The blog editor needs a live connection (and your project folder) — never cache it.
  if (url.pathname.startsWith('/admin')) return;

  const save = (res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  };

  if (url.searchParams.has('v')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(save)));
    return;
  }

  e.respondWith(
    fetch(req).then(save).catch(() =>
      caches.match(req, { ignoreSearch: req.mode === 'navigate' })
        .then((r) => r || (req.mode === 'navigate' ? caches.match('/offline/') : Response.error())))
  );
});
