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

/**
 * 분배 미리보기 — Apps Script 의 `_calcSplit` 과 **반드시 같은 산식**이어야 한다.
 * 한쪽만 고치면 사용자가 확인 버튼을 누를 때 본 숫자와 실제 결과가 달라진다.
 * `npm run verify:gs` 가 두 구현을 무작위 대조한다.
 *
 *   운영비   = floor(총액 × 0.1)
 *   분배가능 = 총액 - 운영비
 *   기본1인당 = floor(분배가능 / 인원)
 *   각자     = floor(기본1인당 × 비중% / 100)
 *   잔여     = 분배가능 - Σ각자      → 전액 운영비로 귀속
 *
 * @param weights 참여자별 비중(%) 배열. 숫자를 넘기면 전원 100% 로 본다.
 */
export function calcSplit(total: number, weights: number | number[], fundRate: number) {
  const w = normWeights(weights);
  const n = w.length;
  const fund = Math.floor(total * fundRate);
  const distributable = total - fund;
  const perPerson = n > 0 ? Math.floor(distributable / n) : 0;
  const shares = w.map((p) => Math.floor((perPerson * p) / 100));
  const paid = shares.reduce((a, b) => a + b, 0);
  const remainder = distributable - paid;
  return { fund, distributable, perPerson, weights: w, shares, remainder, fundTotal: fund + remainder };
}

function normWeights(weights: number | number[]): number[] {
  if (typeof weights === 'number') return Array.from({ length: Math.max(weights, 0) }, () => 100);
  return (weights ?? []).map((p) => {
    const v = Math.round(Number(p));
    if (!Number.isFinite(v) || v < 1) return 1;
    return v > 100 ? 100 : v;
  });
}

/** 이름을 정규화해 비교한다 — Apps Script 의 `_normName` 과 같은 규칙 */
export function normName(s: string): string {
  return String(s ?? '')
    .replace(' (미등록)', '')
    .replace(/\s+/g, '');
}

/** 참여자 명단 → 비중(%) 배열. 멤버DB에 없으면 기본값(100%). */
export function weightsOf(
  state: { memberInfo?: { name: string; weight: number }[]; defaultWeight?: number },
  names: string[],
): number[] {
  const map = new Map<string, number>();
  (state.memberInfo ?? []).forEach((m) => map.set(normName(m.name), m.weight));
  const fallback = state.defaultWeight ?? 100;
  return names.map((n) => map.get(normName(n)) ?? fallback);
}

/** 이름 옆에 한자를 병기한다 — 한자가 비어 있으면 이름만 */
export function withHanja(
  state: { memberInfo?: { name: string; hanja: string }[] },
  name: string,
  on: boolean,
): string {
  if (!on) return name;
  const hit = (state.memberInfo ?? []).find((m) => normName(m.name) === normName(name));
  return hit?.hanja ? `${name} (${hit.hanja})` : name;
}

/** 연합 적립액 — Apps Script 의 `_calcAlliance` 와 같은 산식 */
export function calcAlliance(amount: number, pct: number) {
  const a = Math.floor(Number(amount) || 0);
  let p = Math.round(Number(pct));
  if (!Number.isFinite(p) || p < 1) p = 1;
  if (p > 100) p = 100;
  return { amount: a, pct: p, credited: Math.floor((a * p) / 100) };
}
