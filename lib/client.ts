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
 * 참여자 칩 앞에 붙는 서버 배지가 먹는 폭(px) — v10.8.8.
 *
 * 배지를 공짜로 얹으면 그만큼 이름이 삐져나간다. 배지가 있는 줄은
 * 예산에서 이만큼 빼고 크기를 정한다 (없는 사람은 그대로 다 쓴다).
 */
export const CHIP_SVR_PX = 21;

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

/** `nameParts` 가 필요로 하는 최소한의 상태 — 화면마다 통째로 넘기지 않아도 되게 */
export type HanjaSource = { memberInfo?: { name: string; hanja?: string }[] };

/**
 * 화면에 쓸 이름 두 줄 — **모든 화면이 이 함수 하나만 쓴다** (v10.8).
 *
 * 한자 표기가 들어올 수 있는 자리는 두 곳이다.
 *
 *   ① 멤버DB **G열 "한자표기"** — 관리자가 [혈맹원 관리]에서 따로 넣는 값
 *   ② **아이디 자체의 괄호** — `SogeKing (狙击王)` 처럼 게임 이름에 이미 붙어 있는 경우
 *
 * 예전에는 화면이 ②만 봤다. 그래서 관리자가 ①에 정성껏 넣어도 잔액·아이템에는
 * 아무것도 안 나왔고, "한자표기 칸이 고장났다"로 보였다. 실제로 그랬다.
 *
 * ①을 먼저 본다 — 관리자가 **명시적으로 지정한 값**이므로 이름에서 유추한 것보다
 * 확실하다. ①이 비어 있을 때만 ②로 물러선다 (이름에 괄호를 붙여 쓰던 기존 방식 호환).
 *
 * ★ 없으면 빈 문자열이다. 절대 지어내지 않는다 (CLAUDE.md 규칙 7) —
 *   기계가 만든 한자는 다른 사람으로 읽혀 다이아가 엉뚱한 곳으로 간다.
 */
export function nameParts(state: HanjaSource | null | undefined, name: string): { main: string; sub: string } {
  const hit = (state?.memberInfo ?? []).find((m) => normName(m.name) === normName(name));
  return mergeName(name, hit?.hanja);
}

/**
 * 이름과 한자표기를 합쳐 두 줄로 — 규칙의 본체다.
 *
 * 명단을 이미 손에 들고 있는 화면([혈맹원 관리])은 `memberInfo` 를 뒤질 필요가
 * 없으므로 이걸 직접 쓴다. `nameParts` 도 결국 이 함수를 부른다 —
 * 규칙이 두 벌이 되면 화면마다 다르게 보이기 시작한다.
 */
export function mergeName(name: string, hanja?: string): { main: string; sub: string } {
  const parts = splitName(name);
  const listed = String(hanja ?? '').trim();
  // G열이 이름 괄호와 같은 값이면 두 번 쓰지 않는다 (`잠단(斬斷)` + hanja `斬斷`)
  if (listed && listed !== parts.sub) return { main: parts.main, sub: listed };
  return parts;
}

/** `serverOf` 가 필요로 하는 최소한의 상태 */
export type ServerSource = { memberInfo?: { name: string; server?: string }[] };

/** `classOf` 가 필요로 하는 최소한의 상태 (v11.5) */
export type ClassSource = { memberInfo?: { name: string; cls?: string }[] };

/**
 * 이름 정렬 — 한국어 ㄱ~ㅎ (v10.9.2).
 *
 * `Intl.Collator('ko')` 를 쓰는 이유: `<` 로 비교하면 유니코드 코드포인트 순이라
 * 라틴·한자·한글이 뒤섞이고, `ㄱ~ㅎ` 도 자모 분리된 이름에서 어긋난다.
 *
 * ★ `normName` 을 거친다 — `'잠단 (斬斷)'` 과 `'잠단(斬斷)'` 이 다른 자리에 가면
 *   같은 사람이 목록에서 멀어져 보인다 (CLAUDE.md 규칙 4).
 * ★ `numeric` — `유저2` 가 `유저10` 보다 앞에 온다. 글자로만 비교하면 뒤집힌다.
 */
const NAME_COLLATOR = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

export function byName(a: string, b: string): number {
  return NAME_COLLATOR.compare(normName(a), normName(b));
}

/**
 * 혈맹운영비 계정을 목록 맨 위로 (v10.8.7).
 *
 * 혈비는 사람이 아니라 **길드의 금고**다. 사람들 사이에 섞여 있으면 인원이
 * 늘수록 아래로 밀려 찾아 내려가야 한다. 매번 보는 값이므로 위에 고정한다.
 *
 * ★ 걸러진 목록 안에서만 올린다. 검색·필터에 걸려 빠진 것을 억지로 되살리면,
 *   "받을 사람만 보기"를 켰는데 혈비가 튀어나오는 식으로 필터가 거짓말을 한다.
 *
 * 무엇이 혈비인지는 **화면이 정한다** — [잔액]은 이름으로(`normName` 경유, 규칙 4),
 * [혈맹원 관리]는 시트가 내려준 `isFund` 로. 판정 방식은 달라도 옮기는 규칙은 한 벌이다.
 */
export function fundFirst<T>(items: T[], isFund: (x: T) => boolean): T[] {
  const fund = items.filter(isFund);
  if (fund.length === 0) return items;
  // 나머지 순서는 건드리지 않는다 — 정렬 규칙은 화면이 이미 정해 놓았다
  return [...fund, ...items.filter((x) => !isFund(x))];
}

/**
 * 서버 표기를 하나로 (v10.8.7).
 *
 * 시트에 `1` 로 들어간 사람과 `01` 로 들어간 사람이 섞여 있다. 사람이 손으로
 * 넣는 칸이라 앞의 0 이 빠지는 것은 막을 수 없다. 그래서 **읽는 쪽에서** 맞춘다.
 *
 * 예전에는 [잔액]만 `padStart` 를 했고 [아이템]은 안 했다. 그래서 `1` 인 사람이
 * 잔액에서는 `01` 로 보이는데 아이템의 `01` 칩에는 안 잡혀 "01 서버 0명" 이 나왔다.
 * 이제 서버 값을 쓰는 모든 화면이 이 함수 하나를 지난다.
 *
 * ★ 숫자로 읽히는 것만 맞춘다. 그 외에는 **손대지 않고 그대로** 돌려준다 —
 *   알아볼 수 없는 값을 그럴듯하게 바꾸면 엉뚱한 서버로 분류된다 (규칙 7).
 */
export function normServer(v: string | undefined | null): string {
  const s = String(v ?? '').trim();
  return /^\d{1,2}$/.test(s) ? s.padStart(2, '0') : s;
}

/**
 * 리니지W 공식 클래스 13종 (v11.5) — 공식 게임정보의 표기 그대로.
 *
 * ★ .gs 의 CLASS_LIST 와 **같은 목록이어야 한다.** 한쪽만 고치면 앱에서 고른
 *   클래스를 시트가 거부해, 저장 버튼이 아무 일도 안 하는 것처럼 보인다.
 *   npm run verify:gs 가 두 벌을 대조한다 (분배 산식을 다루는 방식과 같다).
 * ★ 클래스는 아이템명·보스명과 같은 고유명사라 번역하지 않고 그대로 보여준다.
 */
export const CLASS_LIST = [
  '기사', '요정', '마법사', '다크엘프', '전사', '군주', '수라',
  '총사', '마격사', '성기사', '나찰', '귀검사', '혈법사',
];

/**
 * 클래스의 세 언어 표기 — 리니지W 공식 게임정보의 값 그대로다 (v11.5).
 *
 * 아이템명은 **열린 집합**이라 [용어] 시트에 모으지만, 클래스는 **닫힌 13종**이고
 * 공식이 세 언어를 모두 제공한다. 그래서 사전이 아니라 여기에 둔다 —
 * 사전에 넣으면 관리자가 13줄을 손으로 채워야 하고, 하나라도 비면
 * 그 클래스만 대만 혈맹원에게 한국어로 보인다.
 *
 * ★ 시트에 저장되는 값은 **언제나 국문**이다 (아이템명과 같은 규칙).
 *   여기 표는 보여줄 때만 쓴다.
 */
export const CLASS_I18N: Record<string, { zh: string; en: string }> = {
  기사: { zh: '騎士', en: 'Knight' },
  요정: { zh: '妖精', en: 'Elf' },
  마법사: { zh: '魔法師', en: 'Magician' },
  다크엘프: { zh: '黑暗妖精', en: 'Dark Elf' },
  전사: { zh: '戰士', en: 'Warrior' },
  군주: { zh: '王族', en: 'Monarch' },
  수라: { zh: '修羅', en: 'Sura' },
  총사: { zh: '槍手', en: 'Gunslinger' },
  마격사: { zh: '魔鬥士', en: 'Mana Striker' },
  성기사: { zh: '聖騎士', en: 'Paladin' },
  나찰: { zh: '羅剎', en: 'Nachal' },
  귀검사: { zh: '鬼劍士', en: 'Spirit Blader' },
  혈법사: { zh: '血法師', en: 'Blood Magician' },
};

/**
 * 화면 언어로 보여줄 클래스 표기.
 * 표에 없는 값(옛 시트에 손으로 적어둔 것 등)은 **그대로** 돌려준다 —
 * 지우거나 바꾸면 관리자가 넣어둔 값이 화면에서 사라진다 (규칙 7).
 */
export function classLabel(cls: string, lang: 'ko' | 'zh' | 'en'): string {
  const v = String(cls ?? '').trim();
  if (!v || lang === 'ko') return v;
  const hit = CLASS_I18N[v];
  return hit ? hit[lang] : v;
}

/** 멤버DB F열의 서버. 없으면 빈 문자열 — 지어내지 않는다 */
export function serverOf(state: ServerSource | null | undefined, name: string): string {
  const hit = (state?.memberInfo ?? []).find((m) => normName(m.name) === normName(name));
  return normServer(hit?.server);
}

/**
 * 멤버DB H열의 클래스 (v11.5). 없으면 빈 문자열 — 지어내지 않는다.
 *
 * `serverOf` 와 같은 자리에 같은 모양으로 둔다. 화면마다 memberInfo 를 직접
 * 뒤지면 이름 비교가 제각각이 되어(규칙 4) 같은 사람이 화면마다 다르게 보인다.
 *
 * ★ 이름 옆이 아니라 **아랫줄**에 붙이는 용도다. 이름 옆은 서버 배지와 한자가
 *   이미 차지했고, 참여자 칩에는 폭 예산이 걸려 있어 하나 더 얹으면 이름이
 *   잘린다 — 잘린 이름은 다른 사람으로 오인된다.
 */
export function classOf(state: ClassSource | null | undefined, name: string): string {
  const hit = (state?.memberInfo ?? []).find((m) => normName(m.name) === normName(name));
  return String(hit?.cls ?? '').trim();
}

/**
 * 값별 인원 세기 — 필터에 붙는 숫자를 한 벌로 만든다 (v11.6.1).
 *
 * 클래스 필터가 [잔액]·[아이템]·[관리] 세 곳에 붙는데, 화면마다 세는 코드를
 * 따로 두면 같은 명단인데 화면마다 숫자가 다르게 나온다 — 어느 쪽이 맞는지
 * 아무도 모르게 된다. 서버 칩이 `foldServers` 한 벌을 쓰는 것과 같은 이유다.
 *
 * ★ 빈 값은 `none` 으로 따로 센다. `counts['']` 에 섞으면 "클래스 미지정"이
 *   13종 사이에 끼어 하나의 클래스처럼 보인다.
 */
export function tally(values: Iterable<string>): { counts: Record<string, number>; none: number } {
  const counts: Record<string, number> = {};
  let none = 0;
  for (const v of values) {
    const k = String(v ?? '').trim();
    if (!k) none += 1;
    else counts[k] = (counts[k] ?? 0) + 1;
  }
  return { counts, none };
}

/**
 * 안 쓰는 서버를 접는 규칙 — 한 벌만 둔다 (v10.8.6).
 *
 * [혈맹원 관리]의 한 개 고르기(`ServerPicker`)와 [아이템 등록]의 여러 개
 * 고르기(`ServerFilter`)가 같은 규칙을 써야 한다. 두 벌로 두면 한쪽만 고쳐져
 * 화면마다 다르게 접힌다.
 *
 * @param all      전체 서버 목록 ('01'~'12')
 * @param inUse    실제로 인원이 있는 서버 — **접을지 말지는 이것만 보고 정한다**
 * @param pinned   접힌 쪽에 있어도 반드시 보여야 하는 것 (지금 고른 값)
 */
export function foldServers(
  all: string[],
  inUse: string[],
  pinned: string[] = [],
): { primary: string[]; rest: string[] } {
  const live = inUse.filter((s) => all.includes(s));
  // 쓰는 서버가 하나뿐이거나 아예 없으면 접을 이유가 없다 — 접으면 고를 것이 없어진다.
  // ★ 판정에 pinned 를 넣으면 안 된다. 아무도 배정되지 않은 상태에서 하나를 고르는
  //   순간 나머지 열한 개가 접혀버려, 다음 사람을 다른 서버로 지정할 수가 없다.
  if (live.length < 2) return { primary: all, rest: [] };
  const primary = all.filter((s) => live.includes(s) || pinned.includes(s));
  return { primary, rest: all.filter((s) => !primary.includes(s)) };
}

/**
 * 사람을 가리키는 한 줄 표기 — `01 잡이K (卡尔K)` (v10.8.8).
 *
 * 서버가 갈리면서 **비슷한 이름이 서버마다 생겼다.** 이름만 보고 고르면
 * 엉뚱한 사람에게 다이아가 간다. [잔액]에는 이미 서버 번호가 붙어 있었는데
 * 다른 화면에는 없어서, 같은 사람이 화면마다 다르게 보였다.
 *
 * "누구인지 확인하는 자리"는 전부 이 함수 하나를 쓴다 —
 * 지급 창 · 등록 확인 · 분배 확인 · 내 정보 목록.
 *
 * ★ 서버가 없으면 **붙이지 않는다.** 빈 자리를 만들거나 `--` 를 넣으면
 *   지정된 사람과 아닌 사람이 같아 보인다.
 */
export function personLabel(
  state: (HanjaSource & ServerSource) | null | undefined,
  name: string,
): string {
  const { main, sub } = nameParts(state, name);
  const who = sub ? `${main} (${sub})` : main;
  const sv = serverOf(state, name);
  return sv ? `${sv} ${who}` : who;
}

/** 한 줄로 붙인 표시용 이름 — `잡이K (卡尔K)`. 한자가 없으면 이름만 */
export function fullName(name: string, hanja?: string): string {
  const { main, sub } = mergeName(name, hanja);
  return sub ? `${main} (${sub})` : main;
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

/**
 * 연합 적립액 (v11.0) — Apps Script 의 `_calcAlliance` 와 **반드시 같아야 한다** (CLAUDE.md 규칙 1).
 *
 *   혈비     = floor(판매금액 × 10%)
 *   분배가능 = 판매금액 − 혈비
 *   서버별   = floor(분배가능 × 그 서버 인원 ÷ 총 인원)
 *   잔여     = 분배가능 − Σ서버별   → 전액 혈비로 추가 귀속
 *
 * 불변식: `fundTotal + Σshares = amount`
 */
export function calcAlliance(amount: number, counts: number[], fundRate: number) {
  const a = Math.max(Math.floor(Number(amount) || 0), 0);
  const list = (counts || []).map((n) => Math.max(Math.floor(Number(n) || 0), 0));
  const people = list.reduce((t, n) => t + n, 0);
  const fund = Math.floor(a * fundRate);
  const pool = a - fund;
  // 인원이 하나도 없으면 나눌 기준이 없다 — 전액 혈비로 둔다 (지어내지 않는다)
  const shares = list.map((n) => (people > 0 ? Math.floor((pool * n) / people) : 0));
  const given = shares.reduce((t, v) => t + v, 0);
  const remainder = pool - given;
  return { amount: a, fund, pool, shares, remainder, fundTotal: fund + remainder, people };
}

/**
 * 인증샷을 화면에 바로 띄우기 위한 주소 (v11.1).
 *
 * 시트에 저장되는 값은 `https://drive.google.com/file/d/<id>/view` 인데,
 * 이건 **이미지가 아니라 구글 드라이브 뷰어 페이지**다. `<img>` 에 그대로 넣으면
 * 아무것도 안 나온다. 드라이브가 내주는 썸네일 주소로 바꿔야 보인다.
 * (파일은 업로드할 때 "링크가 있는 모든 사용자 · 보기" 로 공유된다 — `.gs` 의 setSharing)
 *
 * ★ 드라이브 링크가 아니면 **그대로 돌려준다.** 관리자가 손으로 붙여넣은
 *   다른 주소일 수 있고, 거기에 드라이브 규칙을 씌우면 멀쩡한 링크가 깨진다 (규칙 7).
 */
export function photoView(url: string, width = 1200): string {
  const u = String(url ?? '').trim();
  const id =
    u.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/)?.[1] ??
    u.match(/[?&]id=([A-Za-z0-9_-]{10,})/)?.[1] ??
    u.match(/^https:\/\/drive\.google\.com\/open\?id=([A-Za-z0-9_-]{10,})/)?.[1];
  if (!id) return u;
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`;
}
