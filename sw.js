// Bump CACHE_VERSION whenever you deploy new assets.
// The old cache is deleted on activate, forcing a fresh fetch of everything.
const CACHE_VERSION = "v2";
const CACHE_NAME    = `canopeo-field-${CACHE_VERSION}`;

// ── Shell assets ──────────────────────────────────────────────────────────────
// Fetched and cached at install time. If any fail, the SW won't install,
// preventing a broken offline shell.
const SHELL_ASSETS = [
  "/index.html",
  "/manifest.json",
];

// ── CDN libraries ─────────────────────────────────────────────────────────────
// Served stale-while-revalidate so the app starts instantly from cache
// and quietly refreshes in the background.
const CDN_ORIGINS = [
  "https://cdn.jsdelivr.net",
  "https://unpkg.com",
];

// ── Google Fonts ──────────────────────────────────────────────────────────────
// Cached with stale-while-revalidate so the app works offline with its chosen
// typeface. Font CSS + actual font binaries both go through this path.
const FONTS_ORIGINS = [
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
];

// ── Icon assets ───────────────────────────────────────────────────────────────
// Not required at install — cached lazily on first fetch.
const ICON_PATHS = [
  "/icons/icon.ico",
  "/icons/icon_64.png",
  "/icons/icon_128.png",
  "/icons/icon_256.png",
  "/icons/icon_512.png",
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener("install", event => {
  // skipWaiting() makes the new SW take over immediately instead of waiting
  // for all existing tabs to close.
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
      // Claim all open clients so they switch to this SW without a reload.
      clients.claim(),
      // Delete every cache that isn't this version.
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

  // CDN libraries: stale-while-revalidate (fast start, background refresh)
  if (CDN_ORIGINS.some(o => url.origin === o)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Google Fonts CSS + binaries: stale-while-revalidate
  if (FONTS_ORIGINS.some(o => url.origin === o)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Same-origin only from here on
  if (url.origin !== self.location.origin) return;

  // HTML navigation requests: network-first so the user always gets a fresh
  // shell when online; fall back to the cached shell if offline.
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstThenCache(event.request, "/index.html"));
    return;
  }

  // Icon files: lazy cache-first (fine to serve stale indefinitely)
  if (ICON_PATHS.some(p => url.pathname === p)) {
    event.respondWith(cacheFirstThenNetwork(event.request));
    return;
  }

  // manifest.json: stale-while-revalidate
  if (url.pathname === "/manifest.json") {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Anything else under the same origin: cache-first
  event.respondWith(cacheFirstThenNetwork(event.request));
});

// ── Strategies ────────────────────────────────────────────────────────────────

// Serve from cache immediately; refresh cache in background.
// Falls back to network on first fetch (nothing in cache yet).
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
    // Kick off background refresh but don't await it
    networkPromise.catch(() => {});
    return cached;
  }

  const fresh = await networkPromise;
  return fresh || new Response("Resource unavailable offline", { status: 503 });
}

// Try network first; on failure serve from cache; ultimate fallback = 503.
// Used for HTML navigations so the user gets the latest shell when online.
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

// Serve from cache; on miss fetch, cache, and return.
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
