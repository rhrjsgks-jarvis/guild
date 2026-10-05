'use client';

import { api } from './client';
import type { ApiResult } from './client';
import { APP_VERSION } from './version';

/**
 * 화면끼리 나눠 쓰는 조회 (v11.10.2) — 연합·레이드·게시판·용어.
 *
 * 시트 한 번 읽는 데 3초 안팎이 든다. 그런데 같은 것을 두 번 읽고 있었다.
 *
 * | 전에는 | 이제는 |
 * |---|---|
 * | 홈이 연합·레이드를 읽고, 아이콘을 누르면 그 화면이 **또** 읽었다 | 홈이 받아둔 것을 화면이 바로 쓴다 |
 * | 용어 사전을 쓰는 화면 여럿이 동시에 열리면 **각자** 불렀다 | 진행 중인 요청 하나를 나눠 기다린다 |
 * | 앱을 다시 켜면 화면마다 3초씩 비어 있었다 | 마지막에 본 값을 먼저 띄우고 뒤에서 새로 받는다 |
 *
 * ★ 저장해 둔 값은 **아직 확인되지 않은 값**이다. 화면은 `live` 가 false 인 동안
 *   쓰기 버튼을 감춘다 — 잔액 화면이 낡은 상태에서 관리 기능을 막는 것과 같은 이유다
 *   (App.tsx 의 `canAdmin = admin && !stale`). 낡은 숫자를 보고 정산하면 안 된다.
 * ★ 못 읽은 것은 저장하지 않는다. 실패를 덮어쓰면 다음에 열 때 빈 목록이 "없음"으로 보인다.
 * ★ 앱 버전이 바뀌면 저장값을 버린다 — 데이터 모양이 바뀌었을 수 있다.
 */

type Hit = { data: unknown; at: number };

const mem = new Map<string, Hit>();
const inflight = new Map<string, Promise<ApiResult>>();
const PREFIX = 'gm_shared_';

/** 마지막으로 받은 값 — 메모리에 없으면 폰 저장소에서 꺼낸다. 확인 전 값이다. */
export function peekShared<T>(key: string): { data: T; at: number } | null {
  const hit = mem.get(key);
  if (hit) return hit as { data: T; at: number };
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const v = JSON.parse(raw) as { ver?: string; at?: number; data?: T };
    if (v.ver !== APP_VERSION || v.data == null || !v.at) return null;
    return { data: v.data, at: v.at };
  } catch {
    return null; // 깨졌거나 막혔으면 예전처럼 빈 화면부터
  }
}

/**
 * 시트에서 읽는다. 같은 것을 이미 읽는 중이면 그 결과를 함께 기다린다.
 * `fresh` 는 내가 방금 쓴 직후에만 — 서버 캐시를 건너뛴다 (규칙 6-2).
 */
export function loadShared(key: string, url: string, fresh = false): Promise<ApiResult> {
  // 쓴 직후의 조회는 진행 중인 (쓰기 전) 요청에 얹히면 안 된다
  if (!fresh) {
    const pending = inflight.get(key);
    if (pending) return pending;
  }
  const p = fetchAndKeep(key, url, fresh);
  inflight.set(key, p);
  // 끝나면 자리를 비운다 — 그사이 fresh 조회가 자리를 바꿨으면 그쪽 것은 남겨둔다
  const clear = () => {
    if (inflight.get(key) === p) inflight.delete(key);
  };
  p.then(clear, clear);
  return p;
}

async function fetchAndKeep(key: string, url: string, fresh: boolean): Promise<ApiResult> {
  const res = await api(fresh ? `${url}?fresh=1` : url);
  if (res.ok) {
    const hit = { data: res.data, at: Date.now() };
    mem.set(key, hit);
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify({ ver: APP_VERSION, ...hit }));
    } catch {
      /* 용량·사생활 보호 모드로 못 적어도 다음에 빈 화면이 잠깐 보일 뿐이다 */
    }
  }
  return res;
}
