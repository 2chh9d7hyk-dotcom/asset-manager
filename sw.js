const CACHE = 'asset-manager-v1';
const SHELL = [
  '/',
  '/index.html',
  '/input.html',
  '/history.html',
  '/simulation.html',
  '/css/style.css',
  '/js/firebase-config.js',
  '/js/storage.js',
  '/js/assets.js',
  '/js/charts.js',
  '/js/dashboard.js',
  '/js/input.js',
  '/js/history.js',
  '/js/simulation.js',
  '/js/simulation-ui.js',
  '/icon.svg',
  '/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Firebase・CDN はネットワーク優先
  if (url.includes('googleapis') || url.includes('gstatic') || url.includes('cdn.jsdelivr')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // アプリシェル: キャッシュ優先
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      });
    })
  );
});
