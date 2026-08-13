const CACHE_NAME = 'kk-cookies-v7';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './js/config.js',
  './js/utils.js',
  './js/data.js',
  './js/auth.js',
  './js/render.js',
  './js/actions.js',
  './js/chart.js',
  './js/main.js',
  './manifest.json',
  './assets/logo-creme.png',
  './assets/icone-192.png',
  './assets/icone-512.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    })
  );
});

// Rede primeiro (sempre revalida, ignorando cache HTTP); offline usa o cache
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((resp) => {
        // guarda uma cópia fresca para uso offline
        if (resp.ok && e.request.url.startsWith(self.location.origin)) {
          const copia = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copia));
        }
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
