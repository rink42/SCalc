const CACHE_VER = 'scalc-v15';

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
    caches.open(CACHE_VER).then(c =>
      // 逐一快取，單一檔 404 不會讓整個 install 失敗（addAll 會全部 reject）
      Promise.all(STATIC.map(url => c.add(url).catch(() => {})))
    )
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
  const req = e.request;
  if (req.method !== 'GET') return;

  // HTML 導航：network-first，畫面永遠拿最新版；離線才退快取
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_VER).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(c => c || caches.match(BASE)))
    );
    return;
  }

  // 靜態資源：cache-first
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});
