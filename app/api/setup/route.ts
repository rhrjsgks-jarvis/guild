import { callGas } from '@/lib/gas';
import { startAdminSession } from '@/lib/auth';
import { derive, hashEqual, newSalt, toAuthRecord, PIN_RE, PIN_ROUNDS } from '@/lib/pin';
import { clientKey, rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/**
 * 🔐 최초 설정 — 길드가 직접 마스터·관리자 PIN 을 정한다 (v10.9).
 *
 * 【왜 만들었나】
 *   v10.8 까지 PIN 은 Vercel 환경변수로만 정해졌다. 즉 앱을 세팅해 준 사람이
 *   길드의 최고 권한 비밀번호를 알고 시작한다. 기능상 문제는 없지만 쓰는
 *   쪽에서는 그 자체가 불안 요소였다. 이제 PIN 은 이 화면에서 길드가 정하고,
 *   저장되는 것은 되돌릴 수 없는 해시뿐이다.
 *
 * 【누가 이 화면을 열 수 있나】
 *   설정을 마치지 않은 앱은 주소만 알면 누구나 열 수 있다. 그대로 두면
 *   링크를 먼저 받은 낯선 사람이 마스터를 선점한다. 그래서 문을 하나 둔다:
 *
 *     ① 아직 설정 전  → **설치 코드**(SETUP_CODE 환경변수)가 맞아야 한다.
 *        설치 코드는 PIN 이 아니다. 설정이 끝나는 순간 영구히 무효가 되므로,
 *        나중에 새 나가도 열리는 것이 없다.
 *     ② 이미 설정됨   → 구글시트 메뉴에서 연 **재설정 창**(10분) 안에서만.
 *        이때는 설치 코드를 묻지 않는다 — 시트를 열 수 있다는 것이 이미
 *        설치 코드보다 강한 증명이기 때문이다. (PIN 분실 복구 경로)
 *
 * 【서버가 반드시 지키는 것】
 *   · 평문 PIN 은 시트로 보내지 않는다. 보내는 것은 언제나 해시다
 *   · 설정 가능 여부 판정은 **시트가 돌려준 레코드**로 한다. 앱이 보낸 값이
 *     아니다 (앱은 고쳐서 우회할 수 있다)
 *   · 레코드를 못 받아오면 막는 쪽으로 간다 — "확인이 안 되니 일단 통과"는
 *     최고 권한을 넘기는 자리에서 절대 하면 안 된다
 */

/** 설치 코드는 붙여넣을 때 딸려온 공백을 항상 털어낸다 (PIN 과 같은 이유) */
function setupCode(): string {
  return String(process.env.SETUP_CODE ?? '').trim();
}

/** 시트에서 현재 인증 레코드를 읽는다. 실패하면 null — 부르는 쪽이 막는다. */
async function readAuth() {
  const res = await callGas('getAuth');
  if (res.ok !== true) return null;
  return toAuthRecord(res);
}

/**
 * 앱이 [최초 설정] 화면을 그려야 하는지 묻는다.
 * 값은 아무것도 내보내지 않는다 — "지금 설정할 수 있는지"와 "코드가 필요한지"뿐이다.
 */
export async function GET() {
  const auth = await readAuth();
  if (!auth) {
    // 시트를 못 읽은 상태에서 "설정하세요"를 띄우면, 연결 문제를
    // 최초 설정 화면으로 오인하게 된다. 조용히 닫아둔다.
    return Response.json({ ok: false, needsSetup: false, resetOpen: false, codeRequired: true, sheet: false });
  }
  return Response.json({
    ok: true,
    sheet: true,
    // 아직 안 정했거나(최초), 시트에서 재설정 창을 열었거나
    needsSetup: !auth.configured || auth.resetOpen,
    resetOpen: auth.resetOpen,
    // 재설정 창으로 들어온 경우엔 설치 코드를 묻지 않는다
    codeRequired: !auth.configured,
    // 설치 코드를 아직 안 넣었으면 최초 설정 자체가 불가능하다 — 미리 알려준다
    codeMissing: !auth.configured && !setupCode(),
  });
}

export async function POST(req: Request) {
  /*
   * 설치 코드를 무작위로 찔러보는 것을 막는다.
   *
   * 로그인(10분 10회)과 같은 폭으로 잡았다. 더 조이고 싶었지만, 이 화면은
   * 코드 한 번 + PIN 을 네 칸에 넣는 자리다. 오타 두어 번이면 잠기는 제한은
   * 처음 쓰는 사람을 그대로 막아 세운다. 대신 설치 코드를 길고 무작위하게
   * 만들면(문서에 그렇게 안내한다) 이 폭으로도 대입은 사실상 불가능하다.
   */
  const limit = rateLimit(`setup:${clientKey(req)}`, 10, 10 * 60_000);
  if (!limit.ok) {
    return Response.json(
      { ok: false, code: 'e.tooMany', msg: `시도가 너무 많습니다. ${limit.retryAfterSec}초 후에 다시 시도해주세요.` },
      { status: 429 },
    );
  }

  if (!process.env.SESSION_SECRET) {
    return Response.json(
      { ok: false, msg: '서버에 SESSION_SECRET 환경변수가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }

  let body: { code?: unknown; masterPin?: unknown; adminPin?: unknown; email?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  // 폰 키보드·비밀번호 관리자가 앞뒤에 공백을 붙이는 일이 흔하다
  const code = String(body.code ?? '').trim();
  const masterPin = String(body.masterPin ?? '').trim();
  const adminPin = String(body.adminPin ?? '').trim();
  const email = String(body.email ?? '').trim();

  // ── 지금 설정해도 되는 상태인가 — 판정은 시트 레코드로만 한다 ──
  const auth = await readAuth();
  if (!auth) {
    return Response.json(
      { ok: false, code: 'e.setupNoSheet', msg: '구글시트에 연결하지 못해 설정을 진행할 수 없습니다. 잠시 후 다시 시도해주세요.' },
      { status: 502 },
    );
  }
  if (auth.configured && !auth.resetOpen) {
    return Response.json(
      {
        ok: false,
        code: 'e.setupDone',
        msg: '이미 설정이 끝났습니다. PIN 을 잊었다면 구글시트 메뉴 [🔐 앱 PIN 재설정 창 열기]를 눌러주세요.',
      },
      { status: 409 },
    );
  }

  // ── 설치 코드 (최초 설정일 때만) ──
  // 재설정 창은 시트를 열 수 있는 사람만 열 수 있으므로 그 자체가 더 강한 증명이다.
  if (!auth.configured) {
    const expected = setupCode();
    if (!expected) {
      return Response.json(
        {
          ok: false,
          code: 'e.setupNoCode',
          msg: '서버에 SETUP_CODE 환경변수가 없습니다. Vercel → Settings → Environment Variables 에 넣고 Redeploy 해주세요.',
        },
        { status: 500 },
      );
    }
    if (!hashEqual(code, expected)) {
      return Response.json({ ok: false, code: 'e.badSetupCode', msg: '설치 코드가 올바르지 않습니다.' }, { status: 401 });
    }
  }

  // ── PIN 형식 ──
  for (const pin of [masterPin, adminPin]) {
    if (!PIN_RE.test(pin)) {
      return Response.json(
        { ok: false, code: 'e.badPin', msg: 'PIN 은 6~32자여야 하며 공백은 쓸 수 없습니다.' },
        { status: 400 },
      );
    }
  }
  // 둘이 같으면 등급을 나눈 의미가 없다 (환경변수 방식에서도 같은 규칙이었다)
  if (masterPin === adminPin) {
    return Response.json(
      { ok: false, code: 'e.pinSame', msg: '마스터 PIN 과 관리자 PIN 은 서로 다른 값이어야 합니다.' },
      { status: 400 },
    );
  }

  // ── 해시로 바꿔 저장한다. 평문은 여기서 끝이고 시트로 넘어가지 않는다 ──
  const salt = newSalt();
  const [master, admin] = await Promise.all([
    derive(masterPin, salt, PIN_ROUNDS),
    derive(adminPin, salt, PIN_ROUNDS),
  ]);

  const res = await callGas('setupAuth', { salt, master, admin, rounds: PIN_ROUNDS, email });
  if (res.ok !== true) return Response.json(res, { status: 400 });

  // 방금 마스터 PIN 을 정한 사람이 곧 마스터다. 여기서 바로 열어주지 않으면
  // 설정 직후 다시 PIN 을 입력해야 하는데, 그 한 단계에서 오타를 눈치채기 어렵다.
  await startAdminSession('master');
  return Response.json({ ...res, role: 'master' });
}
