import { adminConfigured, masterConfigured, startAdminSession, verifyMasterPin, verifyPin } from '@/lib/auth';
import { callGas } from '@/lib/gas';
import { derive, hashEqual, toAuthRecord } from '@/lib/pin';
import { clientKey, rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * PIN 로그인.
 *
 * 설치 상태에 따라 판정 경로가 **완전히 갈린다** (v10.9):
 *
 * 【최초 설정을 마친 설치】 — 시트의 인증 레코드만 본다
 *   ① 마스터 해시와 일치 → 마스터관리자
 *   ② 관리자 해시와 일치 → 관리자
 *   ★ 환경변수 ADMIN_PIN / MASTER_PIN 은 **한 번도 보지 않는다.**
 *     이것이 이 기능의 핵심이다 — 앱을 세팅해 준 사람이 아는 값으로는
 *     들어올 수 없어야 길드가 PIN 을 직접 정한 의미가 있다.
 *
 * 【아직 설정 전인 설치】 — v10.8 까지의 방식 그대로
 *   ① MASTER_PIN (환경변수) → 마스터관리자
 *   ② 시트에 저장된 관리자 PIN(구 override) → 관리자
 *   ③ 없으면 ADMIN_PIN (환경변수) → 관리자
 *   기존 설치가 한 줄도 안 바뀐 채 계속 돌아가야 하므로 남겨둔 경로다.
 */
export async function POST(req: Request) {
  // 10분에 10번까지만 시도할 수 있다
  const limit = rateLimit(`login:${clientKey(req)}`, 10, 10 * 60_000);
  if (!limit.ok) {
    return Response.json(
      { ok: false, msg: `시도가 너무 많습니다. ${limit.retryAfterSec}초 후에 다시 시도해주세요.` },
      { status: 429 },
    );
  }

  let pin = '';
  try {
    const body = (await req.json()) as { pin?: unknown };
    // 폰 키보드·비밀번호 관리자가 앞뒤에 공백을 붙이는 일이 흔하다.
    // PIN 앞뒤 공백은 어떤 경우에도 의도된 값이 아니다.
    pin = String(body.pin ?? '').trim();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  if (!process.env.SESSION_SECRET) {
    return Response.json(
      { ok: false, msg: '서버에 SESSION_SECRET 환경변수가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }

  // 시트의 인증 레코드를 먼저 본다. 이 한 번의 왕복이 두 경로를 가른다.
  const raw = await callGas('getAuth');
  const auth = raw.ok === true ? toAuthRecord(raw) : null;

  if (auth?.configured) {
    // 소금값·반복횟수가 같으므로 해시는 한 번만 만들면 둘 다와 비교할 수 있다
    const hash = await derive(pin, auth.salt, auth.rounds);
    if (hashEqual(hash, auth.master)) {
      await startAdminSession('master');
      return Response.json({ ok: true, role: 'master', code: 'auth.master', msg: '👑 마스터관리자 모드가 켜졌습니다.' });
    }
    if (hashEqual(hash, auth.admin)) {
      await startAdminSession('admin');
      return Response.json({ ok: true, role: 'admin', code: 'auth.admin', msg: '🔓 관리자 모드가 켜졌습니다.' });
    }
    return Response.json({ ok: false, code: 'auth.badPin', msg: 'PIN이 올바르지 않습니다.' }, { status: 401 });
  }

  // ── 아직 최초 설정을 하지 않은 설치 (v10.8 까지의 경로) ──
  if (!adminConfigured()) {
    return Response.json(
      { ok: false, msg: '서버에 ADMIN_PIN / SESSION_SECRET 환경변수가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }

  if (masterConfigured() && (await verifyMasterPin(pin))) {
    await startAdminSession('master');
    return Response.json({ ok: true, role: 'master', code: 'auth.master', msg: '👑 마스터관리자 모드가 켜졌습니다.' });
  }

  // 시트에 PIN 이 저장돼 있으면 그쪽이 진실이다. 없을 때만 환경변수로 판정한다.
  const stored = await callGas('checkPin', { pin });
  const useStored = stored.ok === true && stored.hasOverride === true;
  const passed = useStored ? stored.match === true : await verifyPin(pin);

  if (!passed) {
    return Response.json({ ok: false, code: 'auth.badPin', msg: 'PIN이 올바르지 않습니다.' }, { status: 401 });
  }

  await startAdminSession('admin');
  return Response.json({ ok: true, role: 'admin', code: 'auth.admin', msg: '🔓 관리자 모드가 켜졌습니다.' });
}
