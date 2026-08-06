'use client';

/** 브라우저 → 우리 서버 라우트 호출 헬퍼. 항상 { ok, msg } 형태로 정규화해서 돌려준다. */

export type ApiResult = Record<string, unknown> & { ok: boolean; msg?: string };

export async function api(
  path: string,
  body?: unknown,
  method?: 'POST' | 'PATCH' | 'DELETE',
): Promise<ApiResult> {
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

/**
 * 표시용 이름을 국문·한문 두 줄로 쪼갠다.
 *
 * 멤버DB의 이름은 `잡이K (卡尔K)` 처럼 괄호 안에 한자 표기가 붙어 있다.
 * 한 줄로 두면 좁은 화면에서 잘려서 정작 누구인지 알아볼 수 없다.
 * 괄호가 없으면 두 번째 줄은 빈 문자열이다 — 절대 지어내지 않는다 (규칙 7).
 */
export function splitName(name: string): { main: string; sub: string } {
  const m = String(name ?? '').match(/^\s*(.+?)\s*[（(]\s*([^）)]+?)\s*[）)]\s*$/);
  if (!m) return { main: String(name ?? '').trim(), sub: '' };
  // '(미등록)' 은 한자 표기가 아니라 상태 표시다 — 본체에 붙여둔다
  if (m[2] === '미등록') return { main: String(name ?? '').trim(), sub: '' };
  return { main: m[1], sub: m[2] };
}

/**
 * 글자가 차지하는 **폭**을 재서 정한 글씨 크기(px).
 *
 * 칩 너비는 거의 고정인데 이름은 2자에서 12자까지 제각각이라, 한 크기로 두면
 * 긴 이름이 잘린다. 잘린 이름은 다른 사람으로 오인돼 엉뚱한 사람이 참여자로
 * 체크되므로 잘리게 두면 안 된다.
 *
 * 글자 **수**가 아니라 폭으로 재는 이유: 한글·한자는 라틴 문자보다 두 배 가까이
 * 넓다. 개수로만 세면 `PlusS`(5자)와 `선륙소농포`(5자)를 같게 보는데, 실제로
 * 뒤쪽이 1.8배 넓어서 그쪽만 잘린다.
 *
 * @param text 표시할 문자열
 * @param base 짧은 이름에 쓸 크기
 * @param min  이 아래로는 줄이지 않는다 (읽을 수 없어지므로)
 * @param fits 이 폭(전각 글자 기준 개수)까지는 base 를 그대로 쓴다
 */
/**
 * 참여자 칩에서 이름이 실제로 쓸 수 있는 가로 폭(px).
 * 칩 너비에서 체크박스와 여백을 뺀 값이고, 두 줄(국문·한문)이 이 하나를 나눠 쓴다.
 *
 * 이 값을 두고 크기를 정하는 이유: 국문과 한문의 기본 크기가 다르기 때문이다.
 * 예전처럼 "몇 글자까지는 그대로"(fits)를 줄마다 손으로 맞추면, 한쪽 크기를
 * 바꿀 때 다른 쪽 fits 를 같이 고쳐야 하는데 그걸 잊으면 글자가 삐져나간다.
 */
export const CHIP_NAME_PX = 64;

/**
 * 정해진 **폭(px)** 안에 들어가는 가장 큰 글씨 크기.
 * `base` 보다 커지지 않고 `min` 보다 작아지지도 않는다.
 */
export function fitIn(text: string, maxPx: number, base: number, min: number): number {
  return fitFont(text, base, min, maxPx / base);
}

export function fitFont(text: string, base: number, min: number, fits = 4.6): number {
  const width = [...String(text ?? '')].reduce((sum, ch) => {
    // 한글·한자·가나·전각기호는 전각(1), 나머지는 대략 0.55
    return sum + (/[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uff60]/.test(ch) ? 1 : 0.55);
  }, 0);
  if (width <= fits) return base;
  return Math.round(Math.max((base * fits) / width, min) * 10) / 10;
}

/**
 * 사진 보정 방식 (v10.7).
 *
 *   'text'  이름을 **읽어야** 할 때 (아이템 참여자·명단 일괄 추가)
 *   'count' 줄 수만 **세면** 될 때 (연합 인원수)
 */
export type PhotoMode = 'text' | 'count';

/**
 * 사진을 OCR 이 읽기 좋게 손본다.
 *
 * ★ 한자는 한글보다 훨씬 조심해서 다뤄야 한다.
 *   `鮮`·`籠` 같은 글자는 같은 크기 안에 획이 몇 배로 들어차 있어서,
 *   ① 조금만 줄여도 획이 뭉개지고
 *   ② 대비를 세게 올리면 획 사이 빈 공간이 메워져 통글자가 된다.
 *   원래 값(1600px 축소 + 대비 160%)은 한글 명단 기준으로 정한 것이라,
 *   한자가 섞인 명단에서는 오히려 인식률을 떨어뜨리고 있었다.
 *
 * 그래서 '읽기'용은 크게·부드럽게, '세기'용만 예전처럼 강하게 간다.
 *
 * @returns data URL (실패하면 빈 문자열)
 */
export async function prepPhoto(file: File, mode: PhotoMode = 'text'): Promise<string> {
  // 읽기용은 해상도를 최대한 지킨다. 세기용은 줄 수만 세면 되므로 작아도 된다.
  const maxDim = mode === 'text' ? 2600 : 1600;
  const minDim = mode === 'text' ? 1500 : 0; // 이보다 작으면 키운다 (작은 글자는 OCR 이 놓친다)
  const quality = mode === 'text' ? 0.92 : 0.82;
  // 대비를 세게 주면 한자 획이 서로 붙는다. 읽기용은 최소한만 손댄다.
  const filter =
    mode === 'text' ? 'contrast(118%) brightness(104%)' : 'contrast(160%) brightness(112%) saturate(105%)';

  const dataUrl = await new Promise<string>((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => resolve('');
    fr.readAsDataURL(file);
  });
  if (!dataUrl) return '';

  const img = new Image();
  img.src = dataUrl;
  try {
    await img.decode();
  } catch {
    return '';
  }

  let { width: w, height: h } = img;
  const long = Math.max(w, h);
  let scale = 1;
  if (long > maxDim) scale = maxDim / long;
  // 작게 찍힌 화면은 오히려 키워야 읽힌다 — OCR 은 글자 높이가 너무 작으면 포기한다
  else if (minDim && long < minDim) scale = Math.min(minDim / long, 2);
  w = Math.round(w * scale);
  h = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl; // 보정만 못 할 뿐, 원본이라도 보내는 편이 낫다
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  try {
    ctx.filter = filter;
  } catch {
    /* 미지원 브라우저는 원본 그대로 */
  }
  ctx.drawImage(img, 0, 0, w, h);

  /*
   * 요청 본문에는 상한이 있다. 해상도를 올린 만큼 용량도 커지므로,
   * 넘치면 화질부터 낮추고 그래도 크면 크기를 줄인다.
   * 여기서 알아서 맞추지 않으면 "왜 안 되는지 모를 실패"가 된다.
   */
  const LIMIT = 2_600_000; // base64 로 부풀어도 서버 상한 안쪽
  let out = canvas.toDataURL('image/jpeg', quality);
  for (let q = quality - 0.1; out.length > LIMIT && q >= 0.6; q -= 0.1) {
    out = canvas.toDataURL('image/jpeg', q);
  }
  if (out.length > LIMIT) {
    const shrunk = document.createElement('canvas');
    shrunk.width = Math.round(w * 0.7);
    shrunk.height = Math.round(h * 0.7);
    const sctx = shrunk.getContext('2d');
    if (sctx) {
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(canvas, 0, 0, shrunk.width, shrunk.height);
      out = shrunk.toDataURL('image/jpeg', 0.8);
    }
  }
  return out;
}

/**
 * 화면 내용을 밖으로 내보낸다 (v10.8) — 카카오톡·디스코드에 그대로 붙일 용도.
 *
 * 폰에서는 `navigator.share` 가 있으면 그걸 쓴다. 공유 시트가 떠서 어느 앱으로
 * 보낼지 사람이 고르는 편이, 클립보드에 넣고 "복사했습니다" 만 띄우는 것보다
 * 한 단계 짧다. 데스크톱·미지원 브라우저는 클립보드로 물러선다.
 *
 * ★ 사용자가 공유 시트를 그냥 닫는 것은 실패가 아니다 (AbortError).
 *   그걸 오류로 띄우면 "안 됐나?" 싶어 같은 걸 여러 번 보내게 된다.
 *
 * @returns 'shared' 공유 시트로 보냄 · 'copied' 클립보드에 복사 ·
 *          'cancelled' 사용자가 닫음 · 'failed' 둘 다 안 됨
 */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const body = String(text ?? '').trim();
  if (!body) return 'failed';

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text: body });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
      /* 공유가 막힌 환경이면 아래 클립보드로 넘어간다 */
    }
  }

  try {
    await navigator.clipboard.writeText(body);
    return 'copied';
  } catch {
    /* 권한이 없거나 보안 컨텍스트가 아닌 경우 — 옛 방식으로 한 번 더 */
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = body;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok ? 'copied' : 'failed';
  } catch {
    return 'failed';
  }
}

/** 연합 적립액 — Apps Script 의 `_calcAlliance` 와 같은 산식 */
export function calcAlliance(amount: number, pct: number) {
  const a = Math.floor(Number(amount) || 0);
  let p = Math.round(Number(pct));
  if (!Number.isFinite(p) || p < 1) p = 1;
  if (p > 100) p = 100;
  return { amount: a, pct: p, credited: Math.floor((a * p) / 100) };
}
