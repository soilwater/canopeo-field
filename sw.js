// Canopeo-Field service worker.
//
// The app is updated only when the user asks for it:
//
//   • The installed copy of the app lives in one cache (APP_CACHE) and is
//     always served from there, online or offline. Opening the app never
//     fetches a newer version by itself.
//   • "Check for updates" in the About window compares the running version
//     with the published one. If the user accepts, the page sends
//     APPLY_UPDATE and this worker downloads the complete new copy into a
//     staging cache, swaps it in only if every file arrived, and the page
//     reloads. If the user declines, nothing changes.
//
// Releasing a new version therefore needs only one edit: APP_VERSION in
// index.html. This file does not need a version bump. Change it only when the
// worker's own logic or the asset lists below change; replacing the worker
// does not replace an installed copy of the app.

const APP_CACHE     = "canopeo-field-app";
const STAGING_CACHE = "canopeo-field-staging";

// Base path — must match the GitHub Pages subdirectory.
const BASE = "/canopeo-field";

// ── Shell assets ──────────────────────────────────────────────────────────────
const SHELL_ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/manifest.json`,
];

// ── Library assets ────────────────────────────────────────────────────────────
// Self-hosted, so they are part of the installed copy alongside the shell.
const LIB_ASSETS = [
  `${BASE}/libs/leaflet/leaflet.js`,
  `${BASE}/libs/leaflet/leaflet.css`,
  `${BASE}/libs/swiper/swiper-bundle.min.js`,
  `${BASE}/libs/swiper/swiper-bundle.min.css`,
  `${BASE}/libs/jsqr/jsqr.js`,
  `${BASE}/libs/jspdf/jspdf.min.js`,
  `${BASE}/libs/jszip.min.js`,
  `${BASE}/libs/FileSaver.js`,
];

const APP_ASSETS = [...SHELL_ASSETS, ...LIB_ASSETS];

// ── Google Fonts origins ──────────────────────────────────────────────────────
const FONTS_ORIGINS = [
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
];

// Download every app asset into `cacheName`, bypassing the browser's HTTP
// cache so the files are the ones currently published. Rejects if any file
// fails, leaving whatever was in the cache before untouched by the caller.
async function downloadAppInto(cacheName) {
  const cache = await caches.open(cacheName);
  await Promise.all(APP_ASSETS.map(async url => {
    const response = await fetch(url, { cache: "reload" });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    await cache.put(url, response);
  }));
}

async function hasInstalledApp() {
  const cache = await caches.open(APP_CACHE);
  return !!(await cache.match(`${BASE}/index.html`));
}

// ── Install ───────────────────────────────────────────────────────────────────
// First install on this device (or first run after the releases that used
// per-version caches): download the app. If a copy is already installed, keep
// it — only the user replaces it.
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    hasInstalledApp().then(installed => installed ? null : downloadAppInto(APP_CACHE))
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      // Remove caches left by earlier releases ("canopeo-field-v2.7.0", …)
      // and any staging cache from an interrupted update.
      caches.keys().then(keys =>
        Promise.all(keys.map(key => {
          if (key !== APP_CACHE) return caches.delete(key);
        }))
      ),
    ])
  );
});

// ── Update on request ─────────────────────────────────────────────────────────
// The page posts { type: "APPLY_UPDATE" } with a MessagePort and gets back
// { ok: true } or { ok: false, error }.
self.addEventListener("message", event => {
  if (!event.data || event.data.type !== "APPLY_UPDATE") return;
  const port = event.ports && event.ports[0];
  event.waitUntil(
    applyUpdate()
      .then(() => { if (port) port.postMessage({ ok: true }); })
      .catch(err => { if (port) port.postMessage({ ok: false, error: String(err && err.message || err) }); })
  );
});

async function applyUpdate() {
  await caches.delete(STAGING_CACHE);
  try {
    // 1. Get the complete new copy first. A dropped connection stops here and
    //    the installed copy is untouched.
    await downloadAppInto(STAGING_CACHE);

    // 2. Swap it in.
    const staging = await caches.open(STAGING_CACHE);
    const app     = await caches.open(APP_CACHE);
    for (const url of APP_ASSETS) {
      const response = await staging.match(url);
      await app.put(url, response);
    }
    // Drop files cached on demand (icons, …) so they are fetched fresh too.
    for (const request of await app.keys()) {
      const path = new URL(request.url).pathname;
      if (!APP_ASSETS.includes(path)) await app.delete(request);
    }
  } finally {
    await caches.delete(STAGING_CACHE);
  }
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Google Fonts: stale-while-revalidate
  if (FONTS_ORIGINS.some(o => url.origin === o)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Same-origin only from here on
  if (url.origin !== self.location.origin) return;

  // Only handle requests under /canopeo-field/
  if (!url.pathname.startsWith(BASE)) return;

  // The update check must see what is published, not the installed copy.
  if (url.searchParams.has("update-check")) return;

  // Opening the app: always the installed copy.
  if (event.request.mode === "navigate") {
    event.respondWith(installedThenNetwork(`${BASE}/index.html`, event.request));
    return;
  }

  // Everything else under /canopeo-field/: installed copy, else network.
  event.respondWith(installedThenNetwork(event.request, event.request));
});

// ── Strategies ────────────────────────────────────────────────────────────────

async function staleWhileRevalidate(request) {
  const cache  = await caches.open(APP_CACHE);
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

// Serve `cacheKey` from the installed copy. If it is not there (an icon not
// fetched yet, or the cache was cleared by the browser), fetch `request` and
// keep it.
async function installedThenNetwork(cacheKey, request) {
  const cache  = await caches.open(APP_CACHE);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(cacheKey, response.clone());
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}
