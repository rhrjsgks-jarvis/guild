import 'server-only';
import { invalidate } from './cache';

/**
 * "방금 내가 넣은 값이 안 보인다" 를 없애기 위한 장치.
 *
 * 캐시는 서버 인스턴스 **메모리**에 있다. Vercel 은 요청마다 다른 인스턴스로
 * 보낼 수 있어서, 쓰기를 처리한 인스턴스에서 invalidate 를 해도 그 다음 조회가
 * 아직 낡은 값을 들고 있는 **다른 인스턴스**로 갈 수 있다. 그러면 사용자는
 * 등록·분배를 해놓고도 TTL 만큼 옛 숫자를 본다.
 *
 * 그래서 쓰기 직후의 조회만 `?fresh=1` 로 부른다. 어느 인스턴스에 떨어지든
 * 그 인스턴스의 캐시를 먼저 버리고 시트에서 다시 읽는다.
 *
 * 평소 조회에는 쓰지 않는다 — 모두가 항상 fresh 로 부르면 캐시가 없는 것과
 * 같아져서 Apps Script 실행 할당량을 그대로 태운다.
 */
export function wantsFresh(req: Request): boolean {
  try {
    return new URL(req.url).searchParams.get('fresh') === '1';
  } catch {
    return false;
  }
}

/** `?fresh=1` 이면 해당 키의 캐시를 버린다. 그 뒤의 `cached(...)` 가 시트를 다시 읽는다. */
export function dropIfFresh(req: Request, ...keys: string[]): void {
  if (!wantsFresh(req)) return;
  keys.forEach(invalidate);
}
