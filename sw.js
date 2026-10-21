// Uygulama dosyalarını önbelleğe alır; internet yokken de açılır.
// Dosyalar değiştiğinde CACHE adını artır.
const CACHE = 'plaklarim-v27';
const FILES = [
  './',
  'index.html',
  'styles.css',
  'db.js',
  'buyuk-harf.js',
  'buyuk-harf-v1.js',
  'app.js',
  'katman.js',
  'kirpma.js',
  'kapak-okuma.js',
  'internetten-bilgi.js',
  'bulut.js',
  'vendor/anthropic-sdk.min.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

// GitHub Pages dosyaları tarayıcıya "10 dakika saklayabilirsin" diyerek gönderir. Ağdan
// alırken tarayıcının bu kısa süreli kopyası atlanır (sunucuya sorulur; değişmediyse
// dosya yeniden inmez). Yoksa yayından sonraki ilk dakikalarda eski sürüm açılabilir.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'no-cache' })))));
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
    fetch(new Request(event.request, { cache: 'no-cache' }))
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
