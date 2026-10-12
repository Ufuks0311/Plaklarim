// Uygulama dosyalarını önbelleğe alır; internet yokken de açılır.
// Dosyalar değiştiğinde CACHE adını artır.
const CACHE = 'plaklarim-v10';
const FILES = [
  './',
  'index.html',
  'styles.css',
  'db.js',
  'app.js',
  'kirpma.js',
  'kapak-okuma.js',
  'internetten-bilgi.js',
  'vendor/anthropic-sdk.min.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Önce ağ, olmazsa önbellek: güncellemeler hemen gelir, çevrimdışı da çalışır.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
