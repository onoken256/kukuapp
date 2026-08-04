// Service Worker
// ─────────────────────────────────────────────────────────────
// オフラインでも動くように、必要なファイルをぜんぶキャッシュしておく。
// ★ ファイルを更新して push したら、かならず CACHE_VERSION を上げること。
//   （上げないと、子どもの iPad に古い画面が残りつづける）
// ─────────────────────────────────────────────────────────────

const CACHE_VERSION = 'kuku-v3';

// すべて相対パス。GitHub Pages のサブディレクトリ配信でもそのまま動く。
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/main.js',
  './js/constants.js',
  './js/storage.js',
  './js/storage-local.js',
  './js/storage-remote.js',
  './js/config.js',
  './js/profiles.js',
  './js/questions.js',
  './js/mastery.js',
  './js/timer.js',
  './js/keypad.js',
  './js/quiz.js',
  './js/gridmode.js',
  './js/sortmode.js',
  './js/dialog.js',
  './js/heatmap.js',
  './js/teacher.js',
  './js/sounds.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // 1つでも失敗すると全部止まってしまうので、1件ずつ入れる
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (e) {
        console.warn('[sw] キャッシュできませんでした:', url, e);
      }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 古いバージョンのキャッシュを消す
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k !== CACHE_VERSION)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外部への通信はさわらない

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req, { ignoreSearch: true });

    // まずキャッシュを返し、うしろで新しいものを取りに行く
    const network = fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (cached) return cached;

    const fresh = await network;
    if (fresh) return fresh;

    // オフラインで、ページそのものが見つからないとき
    if (req.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response('オフラインです', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  })());
});
