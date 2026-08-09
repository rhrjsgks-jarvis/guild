import 'server-only';
import { cookies } from 'next/headers';

/**
 * Apps Script(구글시트) JSON API 호출 래퍼 — 서버 전용.
 *
 * 브라우저에서 Apps Script를 직접 부르지 않는 이유:
 *  1) Apps Script는 CORS 프리플라이트에 응답하지 않아 브라우저 POST가 막힌다
 *  2) API 토큰이 번들에 실려 노출된다
 * 그래서 항상 이 서버 라우트를 거쳐서 호출한다.
 */

export type GasAction =
  | 'ping'
  | 'state'
  | 'members'
  | 'lookup'
  | 'register'
  | 'distribute'
  | 'payout'
  | 'photo'
  | 'roster'
  | 'rename'
  | 'addMember'
  | 'removeMember'
  | 'itemsAll'
  | 'previewReverse'
  | 'correctItem'
  | 'deleteItem'
  | 'lastPayout'
  | 'undoPayout'
  | 'tools'
  | 'runTool'
  | 'seasons'
  | 'season'
  /* v10.0 */
  | 'renameHistory'
  | 'posts'
  | 'addPost'
  | 'deletePost'
  | 'alliance'
  | 'addAlliance'
  | 'creditAlliance'
  | 'analyzeMembers'
  | 'bulkAddMembers'
  | 'deleteAlliance'
  | 'countPhoto'
  | 'updateMember'
  | 'checkPin'
  /* v10.8 — 보스 시간표 */
  | 'raid'
  | 'addRaid'
  | 'updateRaid'
  | 'deleteRaid'
  | 'setAppName'
  | 'setAdminPin'
  | 'setSeasonServer'
  /* v10.9 — 최초 설정 (길드가 직접 정하는 PIN) */
  | 'getAuth'
  | 'setupAuth'
  | 'setAuthPin';

export type GasResponse = Record<string, unknown> & { ok: boolean; msg?: string };

/**
 * 화면 언어를 쿠키에서 읽는다. Apps Script 가 결과 메시지를 이 언어로 내려준다.
 * 라우트마다 따로 넘기지 않는 이유: 하나만 빠뜨려도 그 화면만 한국어로 남는다.
 */
async function currentLang(): Promise<'ko' | 'zh' | 'en'> {
  try {
    const v = (await cookies()).get('gm_lang')?.value;
    return v === 'zh' || v === 'en' ? v : 'ko';
  } catch {
    // 요청 바깥에서 불린 경우 — 기본값으로 둔다
    return 'ko';
  }
}

const DEFAULT_TIMEOUT_MS = 25_000;

export function gasConfigured(): boolean {
  return Boolean(process.env.GAS_URL && process.env.GAS_TOKEN);
}

/** 설정 실수를 사람이 읽을 수 있는 말로 바꿔준다 — 여기서 대부분의 초기 삽질이 걸린다 */
function diagnose(body: string): string {
  if (/accounts\.google\.com|ServiceLogin|Google 계정으로 로그인/i.test(body)) {
    return (
      '구글이 로그인 화면을 돌려줬습니다. Apps Script 배포의 [액세스] 설정이 ' +
      '"모든 사용자"가 아닙니다. [배포 관리] → 편집(✏️) → 액세스 권한이 있는 사용자: ' +
      '"모든 사용자" → 새 버전으로 배포해주세요.'
    );
  }
  if (/승인이 필요합니다|Authorization is required|<title>오류<\/title>|Script function not found/i.test(body)) {
    return (
      'Apps Script가 오류 페이지를 돌려줬습니다. 배포한 버전에 doPost 함수가 없을 수 있습니다. ' +
      'v8.0 코드를 붙여넣은 뒤 [배포 관리] → 편집 → 새 버전으로 다시 배포했는지 확인해주세요.'
    );
  }
  if (body.trimStart().startsWith('<')) {
    return 'Apps Script가 JSON 대신 HTML을 돌려줬습니다. GAS_URL이 /exec 로 끝나는 웹앱 주소가 맞는지 확인해주세요.';
  }
  return 'Apps Script 응답을 해석할 수 없습니다: ' + body.slice(0, 200);
}

export async function callGas(
  action: GasAction,
  payload: Record<string, unknown> = {},
  opts: {
    timeoutMs?: number;
    /**
     * 쓰기 응답에 최신 상태를 같이 받아온다 (v10.2 `_withState`).
     *
     * 쓰기 뒤에 앱이 화면 숫자를 맞추려면 상태를 다시 읽어야 하는데, 그걸
     * 두 번째 요청으로 하면 폰↔서버 왕복과 Apps Script 실행 준비 비용이
     * 한 번 더 든다. 시트가 같은 실행 안에서 읽어 보내주면 왕복이 사라진다.
     *
     * 상태를 실제로 화면에 반영하는 쓰기에만 켠다 — 켜면 시트가 매번
     * 전체 상태를 읽으므로 공짜가 아니다.
     */
    withState?: boolean;
  } = {},
): Promise<GasResponse> {
  const url = process.env.GAS_URL;
  const token = process.env.GAS_TOKEN;

  if (!url || !token) {
    return {
      ok: false,
      msg: '서버 설정이 비어 있습니다. Vercel 환경변수 GAS_URL / GAS_TOKEN 을 등록한 뒤 Redeploy 해주세요.',
    };
  }

  const lang = await currentLang();

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      // text/plain 이면 Apps Script가 postData.contents로 그대로 받아준다.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, action, token, lang, ...(opts.withState ? { withState: true } : {}) }),
      redirect: 'follow', // Apps Script는 googleusercontent.com 으로 302를 보낸다
      cache: 'no-store',
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { ok: false, msg: '구글시트 응답이 너무 느립니다. 잠시 후 다시 시도해주세요.' };
    }
    return { ok: false, msg: '구글시트에 연결하지 못했습니다: ' + (err instanceof Error ? err.message : String(err)) };
  }

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, msg: `구글시트 오류 (HTTP ${res.status}). ` + diagnose(text) };
  }

  try {
    const parsed = JSON.parse(text) as GasResponse;
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
    return parsed;
  } catch {
    return { ok: false, msg: diagnose(text) };
  }
}
