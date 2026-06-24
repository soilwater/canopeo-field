const CACHE_NAME = "canopeo-field-v1";

// Critical shell assets — if ANY of these fail, the SW won't install.
const SHELL_ASSETS = [
  "/index.html",
];

// Icon assets cached lazily on first fetch.
const LAZY_ASSETS = [
  "/icons/icon.ico",
  "/icons/icon_64.png",
  "/icons/icon_128.png",
  "/icons/icon_256.png",
  "/icons/icon_512.png",
];

// Model file uses stale-while-revalidate.
const MODEL_ASSETS = [
  "/app/models/model_v202601.onnx",
];

// CDN libraries — cached with stale-while-revalidate after first fetch.
// These are the main source of startup latency on repeat launches.
const CDN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js",
  "https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css",
  "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
];

const CDN_ORIGINS = [
  "https://cdn.jsdelivr.net",
  "https://unpkg.com",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      ))
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // CDN libraries: stale-while-revalidate
  if (CDN_ORIGINS.some(origin => url.origin === origin)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Only intercept same-origin requests under /app/ from here on
  if (!url.pathname.startsWith('/app')) return;

  // Model file: stale-while-revalidate
  if (MODEL_ASSETS.some(suffix => url.pathname === suffix)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Everything else under /app/: cache-first, fallback to network
  event.respondWith(cacheFirstThenNetwork(event.request));
});


async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) return cached;
  const networkResponse = await networkPromise;
  return networkResponse || new Response("Resource unavailable offline", { status: 503 });
}


async function cacheFirstThenNetwork(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    return new Response("Offline", { status: 503 });
  }
}
