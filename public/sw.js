/*
 * 서비스워커 — 홈 화면 설치와 "앱 껍데기" 오프라인 표시를 담당한다.
 *
 * 핵심 원칙: /api 응답은 절대 캐시하지 않는다.
 * 잔액·분배 숫자를 오래된 값으로 보여주는 것은 아예 안 보여주는 것보다 나쁘다.
 *
 * 화면을 크게 바꿔서 옛 캐시를 확실히 버리고 싶으면 CACHE 값을 올리면 된다.
 */
const CACHE = 'guild-shell-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png'];

/*
 * ★ 주소에 해시가 없는 파일들 (v10.8.3).
 *
 * JS·CSS 는 파일명에 빌드 해시가 붙어서 캐시 우선으로 둬도 낡을 일이 없다.
 * 그런데 아이콘과 manifest 는 주소가 늘 같아서, 한 번 캐시에 들어가면
 * 파일을 바꿔도 **영원히 옛 그림이 나온다.** 실제로 아이콘을 갈았는데
 * 폰에는 그대로였다.
 *
 * 그래서 이것들만 네트워크를 먼저 본다. 아이콘은 설치할 때나 탭을 열 때만
 * 읽히므로 왕복이 늘어도 부담이 없고, 오프라인이면 캐시로 물러선다.
 */
const NO_HASH = /^\/(manifest\.webmanifest|favicon\.ico|icon[\w.-]*\.png|apple-icon[\w.-]*\.png)$/;

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

  // 아이콘·manifest: 네트워크 우선 — 주소가 늘 같아 캐시 우선이면 갱신되지 않는다
  if (NO_HASH.test(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || Response.error())),
    );
    return;
  }

  // 그 밖의 정적 자산(JS/CSS): 캐시 우선 — 파일명에 빌드 해시가 붙어 낡을 일이 없다
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
