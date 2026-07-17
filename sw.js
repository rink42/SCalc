const CACHE_VER = 'scalc-v13';

// 動態取得 base path（支援 GitHub Pages 子目錄部署）
const BASE = self.registration.scope;

const STATIC = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'icon.svg',
  BASE + 'css/style.css',
  BASE + 'js/app.js',
  BASE + 'js/evaluator.js',
  BASE + 'js/expression.js',
  BASE + 'js/ui.js',
  BASE + 'js/keypad.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VER).then(c => c.addAll(STATIC))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VER).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
