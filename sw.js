const CACHE_NAME = 'kk-cookies-v14';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './js/vendor/supabase.js',
  './js/config.js',
  './js/utils.js',
  './js/data.js',
  './js/auth.js',
  './js/render.js',
  './js/actions.js',
  './js/chart.js',
  './js/finance.js',
  './js/main.js',
  './manifest.json',
  './assets/logo-creme.png',
  './assets/simbolo-creme.png',
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
        // Guarda uma cópia fresca para uso offline. Vale também para outros
        // domínios (as fontes do Google), desde que a resposta seja legível —
        // respostas opacas têm ok === false e ficam de fora sozinhas.
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copia)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
