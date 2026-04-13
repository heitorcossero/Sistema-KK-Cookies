const CACHE_NAME = 'controle-estoque-v4';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './app_config.js',
  './manifest.json'
];

// Instalação e Cache
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Limpeza de caches antigos
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    })
  );
});

// Estratégia: Network First (Tenta internet, se falhar usa cache)
// Isso é melhor para apps que mudam muito como o seu
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  
  e.respondWith(
    fetch(e.request).catch(() => {
      return caches.match(e.request);
    })
  );
});
