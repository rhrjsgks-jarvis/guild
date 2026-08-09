import { callGas } from '@/lib/gas';
import { requireMaster } from '@/lib/auth';
import { syncStateCache } from '@/lib/fresh';
import { derive, toAuthRecord, PIN_RE } from '@/lib/pin';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/**
 * 마스터관리자(개발자) 전용.
 *
 *  · appName  — 앱 상단에 뜨는 이름
 *  · adminPin — 관리자 PIN 교체
 *  · masterPin — 마스터 PIN 교체 (v10.9 신규)
 *
 * PIN 이 어디에 저장되는지는 설치 상태에 따라 다르다:
 *   · 최초 설정을 마친 설치 → 시트에 **해시**로 (lib/pin.ts). 평문은 이 파일
 *     밖으로 나가지 않는다. 마스터 PIN 도 이 경로로만 바꿀 수 있다
 *   · 아직 설정 전인 설치 → v10.8 까지의 방식(시트에 평문 override). 빈 값을
 *     보내면 지우고 ADMIN_PIN 환경변수로 돌아간다. 마스터 PIN 은 환경변수뿐이라
 *     여기서 바꿀 수 없다
 *
 * PIN 값은 여기서도, Apps Script 쪽 작업기록에서도 절대 남기지 않는다.
 */
export async function POST(req: Request) {
  const denied = await requireMaster();
  if (denied) return denied;

  let body: { action?: unknown; value?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const action = String(body.action ?? '').trim();
  const value = String(body.value ?? '');
  const email = String(body.email ?? '').trim();

  if (action === 'appName') {
    const name = value.trim();
    if (!name) return Response.json({ ok: false, msg: '앱 이름을 입력해주세요.' }, { status: 400 });
    // 줄바꿈은 두 줄까지 허용한다 (긴 이름을 마스터가 직접 끊을 수 있게).
    // 글자 수는 줄바꿈을 빼고 센다.
    if (name.replace(/\n/g, '').length > 24) {
      return Response.json({ ok: false, msg: '앱 이름은 24자 이내여야 합니다.' }, { status: 400 });
    }
    if (name.split('\n').length > 2) {
      return Response.json({ ok: false, msg: '앱 이름은 두 줄까지만 됩니다.' }, { status: 400 });
    }

    const res = await callGas('setAppName', { name, email }, { withState: true });
    if (res.ok) syncStateCache(res);
    return Response.json(res, { status: res.ok ? 200 : 400 });
  }

  if (action === 'adminPin' || action === 'masterPin') {
    const which = action === 'masterPin' ? 'master' : 'admin';
    const pin = value.trim();

    // 어느 방식으로 저장할지는 시트가 정한다 — 앱이 보낸 값으로 판정하지 않는다
    const raw = await callGas('getAuth');
    const auth = raw.ok === true ? toAuthRecord(raw) : null;

    if (auth?.configured) {
      if (!PIN_RE.test(pin)) {
        return Response.json(
          { ok: false, code: 'e.badPin', msg: 'PIN 은 6~32자여야 하며 공백은 쓸 수 없습니다.' },
          { status: 400 },
        );
      }
      // 평문은 여기서 끝난다. 시트로 넘어가는 것은 해시뿐이다.
      const hash = await derive(pin, auth.salt, auth.rounds);
      const res = await callGas('setAuthPin', { which, hash, email });
      return Response.json(res, { status: res.ok ? 200 : 400 });
    }

    // ── 아직 최초 설정을 하지 않은 설치 ──
    if (which === 'master') {
      return Response.json(
        {
          ok: false,
          code: 'e.setupNone',
          msg: '마스터 PIN 은 최초 설정을 마친 뒤에만 앱에서 바꿀 수 있습니다. 아직은 Vercel 의 MASTER_PIN 환경변수를 쓰고 있습니다.',
        },
        { status: 409 },
      );
    }
    if (pin && !PIN_RE.test(pin)) {
      return Response.json(
        { ok: false, code: 'e.badPin', msg: 'PIN 은 6~32자여야 하며 공백은 쓸 수 없습니다.' },
        { status: 400 },
      );
    }
    const res = await callGas('setAdminPin', { pin, email });
    return Response.json(res, { status: res.ok ? 200 : 400 });
  }

  return Response.json({ ok: false, msg: '알 수 없는 요청입니다.' }, { status: 400 });
}
