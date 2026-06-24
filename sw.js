// Bump CACHE_VERSION whenever you deploy new assets.
const CACHE_VERSION = "v2";
const CACHE_NAME    = `canopeo-field-${CACHE_VERSION}`;

// Base path — must match the GitHub Pages subdirectory.
const BASE = "/canopeo-field";

// ── Shell assets ──────────────────────────────────────────────────────────────
// Fetched and cached at install time. If any fail, the SW won't install.
const SHELL_ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/manifest.json`,
];

// ── Icon assets ───────────────────────────────────────────────────────────────
// Cached lazily on first fetch (not required for install).
const ICON_PATHS = [
  `${BASE}/icons/icon.ico`,
  `${BASE}/icons/icon_64.png`,
  `${BASE}/icons/icon_128.png`,
  `${BASE}/icons/icon_256.png`,
  `${BASE}/icons/icon_512.png`,
];

// ── CDN origins ───────────────────────────────────────────────────────────────
const CDN_ORIGINS = [
  "https://cdn.jsdelivr.net",
  "https://unpkg.com",
];

// ── Google Fonts origins ──────────────────────────────────────────────────────
const FONTS_ORIGINS = [
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then(keys =>
        Promise.all(keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        }))
      ),
    ])
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // CDN libraries: stale-while-revalidate
  if (CDN_ORIGINS.some(o => url.origin === o)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Google Fonts: stale-while-revalidate
  if (FONTS_ORIGINS.some(o => url.origin === o)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Same-origin only from here on
  if (url.origin !== self.location.origin) return;

  // Only handle requests under /canopeo-field/
  if (!url.pathname.startsWith(BASE)) return;

  // HTML navigations: network-first, fall back to cached shell
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstThenCache(event.request, `${BASE}/index.html`));
    return;
  }

  // Icons: cache-first (fine to serve stale indefinitely)
  if (ICON_PATHS.some(p => url.pathname === p)) {
    event.respondWith(cacheFirstThenNetwork(event.request));
    return;
  }

  // manifest.json: stale-while-revalidate
  if (url.pathname === `${BASE}/manifest.json`) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Everything else under /canopeo-field/: cache-first
  event.respondWith(cacheFirstThenNetwork(event.request));
});

// ── Strategies ────────────────────────────────────────────────────────────────

async function staleWhileRevalidate(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(response => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  const fresh = await networkPromise;
  return fresh || new Response("Resource unavailable offline", { status: 503 });
}

async function networkFirstThenCache(request, fallbackPath) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request)
                || await cache.match(fallbackPath);
    return cached || new Response("Offline", { status: 503 });
  }
}

async function cacheFirstThenNetwork(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}
