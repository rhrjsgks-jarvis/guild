/*
 * 서비스워커 — 홈 화면 설치와 "앱 껍데기" 오프라인 표시를 담당한다.
 *
 * 핵심 원칙: /api 응답은 절대 캐시하지 않는다.
 * 잔액·분배 숫자를 오래된 값으로 보여주는 것은 아예 안 보여주는 것보다 나쁘다.
 *
 * 화면을 크게 바꿔서 옛 캐시를 확실히 버리고 싶으면 CACHE 값을 올리면 된다.
 */
const CACHE = 'guild-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 데이터는 언제나 네트워크에서 — 캐시에 손대지 않는다
  if (url.pathname.startsWith('/api/')) return;

  // 페이지 이동: 네트워크 우선, 끊겼으면 캐시된 껍데기라도 띄운다
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((hit) => hit || Response.error())),
    );
    return;
  }

  // 정적 자산(JS/CSS/아이콘): 캐시 우선 — 해시가 붙어 있어 낡을 일이 없다
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
