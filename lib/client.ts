'use client';

/** 브라우저 → 우리 서버 라우트 호출 헬퍼. 항상 { ok, msg } 형태로 정규화해서 돌려준다. */

export type ApiResult = Record<string, unknown> & { ok: boolean; msg?: string };

export async function api(path: string, body?: unknown, method?: 'POST' | 'DELETE'): Promise<ApiResult> {
  try {
    const res = await fetch(path, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });

    let parsed: ApiResult;
    try {
      parsed = (await res.json()) as ApiResult;
    } catch {
      return { ok: false, msg: `서버 응답을 읽지 못했습니다 (HTTP ${res.status}).` };
    }
    return parsed;
  } catch {
    return { ok: false, msg: '네트워크에 연결할 수 없습니다. 통신 상태를 확인해주세요.' };
  }
}

/* ── 기록용 이메일: 누가 등록·분배·지급했는지 시트에 남기기 위해 한 번만 물어본다 ── */

const EMAIL_KEY = 'gm_email';

export function getStoredEmail(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(EMAIL_KEY) ?? '';
}

export function setStoredEmail(email: string): void {
  const v = email.trim();
  if (v) window.localStorage.setItem(EMAIL_KEY, v);
  else window.localStorage.removeItem(EMAIL_KEY);
}

/* ── 개인 조회 탭에서 마지막에 본 이름을 기억한다 ── */

const NAME_KEY = 'gm_my_name';

export function getStoredName(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(NAME_KEY) ?? '';
}

export function setStoredName(name: string): void {
  if (name) window.localStorage.setItem(NAME_KEY, name);
  else window.localStorage.removeItem(NAME_KEY);
}

export function fmt(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString('ko-KR');
}

/** 분배 미리보기 — Apps Script 의 _calcSplit 과 반드시 같은 산식이어야 한다 */
export function calcSplit(total: number, n: number, fundRate: number) {
  const fund = Math.floor(total * fundRate);
  const distributable = total - fund;
  const perPerson = n > 0 ? Math.floor(distributable / n) : 0;
  const remainder = distributable - perPerson * n;
  return { fund, distributable, perPerson, remainder };
}
