import { adminConfigured, startAdminSession, verifyPin } from '@/lib/auth';
import { clientKey, rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

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
    pin = String(body.pin ?? '');
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  if (!(await verifyPin(pin))) {
    return Response.json({ ok: false, msg: 'PIN이 올바르지 않습니다.' }, { status: 401 });
  }

  await startAdminSession();
  return Response.json({ ok: true, msg: '🔓 관리자 모드가 켜졌습니다.' });
}
