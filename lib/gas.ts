import 'server-only';

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
  | 'photo';

export type GasResponse = Record<string, unknown> & { ok: boolean; msg?: string };

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
  opts: { timeoutMs?: number } = {},
): Promise<GasResponse> {
  const url = process.env.GAS_URL;
  const token = process.env.GAS_TOKEN;

  if (!url || !token) {
    return {
      ok: false,
      msg: '서버 설정이 비어 있습니다. Vercel 환경변수 GAS_URL / GAS_TOKEN 을 등록한 뒤 Redeploy 해주세요.',
    };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      // text/plain 이면 Apps Script가 postData.contents로 그대로 받아준다.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, action, token }),
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
