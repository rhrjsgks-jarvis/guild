import 'server-only';

/**
 * 아주 얇은 메모리 캐시.
 *
 * 길드원 여러 명이 동시에 앱을 열면 그만큼 Apps Script가 호출되는데,
 * Apps Script에는 일일 실행 할당량이 있고 시트 읽기도 느리다.
 * 몇 초짜리 캐시만 씌워도 새로고침 연타를 흡수할 수 있다.
 *
 * 서버리스라 인스턴스가 죽으면 캐시도 사라지지만, 그래도 손해는 없다.
 */

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  // 같은 키로 동시에 여러 요청이 들어오면 한 번만 호출하고 결과를 나눠 쓴다
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const p = (async () => {
    try {
      const value = await load();
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

/** 쓰기 작업 직후에 불러서, 다음 조회가 낡은 값을 보지 않게 한다 */
export function invalidate(key: string): void {
  store.delete(key);
}
