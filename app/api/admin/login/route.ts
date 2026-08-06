import { adminConfigured, masterConfigured, startAdminSession, verifyMasterPin, verifyPin } from '@/lib/auth';
import { callGas } from '@/lib/gas';
import { clientKey, rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * PIN 로그인.
 *
 * 판정 순서가 중요하다:
 *   ① MASTER_PIN (환경변수) → 마스터관리자
 *   ② 시트에 저장된 관리자 PIN → 관리자
 *      마스터가 앱에서 PIN 을 바꾸면 여기 저장되고, 그때부터 환경변수보다 우선한다.
 *      (관리자가 교체돼도 Vercel 재배포 없이 PIN 을 갈 수 있어야 하기 때문)
 *   ③ 시트에 저장된 값이 없을 때만 ADMIN_PIN (환경변수) → 관리자
 */
export async function POST(req: Request) {
  if (!adminConfigured()) {
    return Response.json(
      { ok: false, msg: '서버에 ADMIN_PIN / SESSION_SECRET 환경변수가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }

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
