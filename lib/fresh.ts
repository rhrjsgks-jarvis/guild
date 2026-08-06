import 'server-only';
import { invalidate, put } from './cache';
import type { GasResponse } from './gas';

/** 상태 캐시 유효시간 — 조회 라우트와 쓰기 응답 저장이 같은 값을 써야 한다 */
export const STATE_TTL_MS = 4_000;

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

/**
 * 쓰기 응답에 딸려 온 최신 상태를 캐시에 반영한다 (v10.2).
 *
 * 시트(`_withState`)가 쓰기와 같은 실행 안에서 상태를 읽어 보내주므로,
 * 그 값을 그대로 캐시에 넣는다. 다른 사람의 다음 조회도 구글시트를 거치지
 * 않고 바로 최신 값을 받는다.
 *
 * 상태가 안 왔으면 (옛 버전 시트이거나 시트 쪽 읽기가 실패한 경우) 캐시를
 * 버리기만 한다 — 그때는 앱이 `?fresh=1` 로 한 번 더 읽어 간다.
 */
export function syncStateCache(res: GasResponse): void {
  if (res?.ok && res.state) put('state', { ok: true, data: res.state }, STATE_TTL_MS);
  else invalidate('state');
}
