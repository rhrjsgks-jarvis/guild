import { callGas } from '@/lib/gas';
import { requireMaster } from '@/lib/auth';
import { syncStateCache } from '@/lib/fresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/**
 * 마스터관리자(개발자) 전용.
 *
 *  · appName — 앱 상단에 뜨는 이름
 *  · adminPin — 관리자 PIN. 시트에 저장되며, 그때부터 Vercel 의 ADMIN_PIN 환경변수보다
 *    우선한다. 관리자가 바뀌어도 재배포 없이 PIN 을 갈 수 있게 하기 위한 것이다.
 *    빈 문자열을 보내면 저장된 값을 지우고 환경변수 PIN 으로 돌아간다.
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

  if (action === 'adminPin') {
    const pin = value.trim();
    if (pin && !/^[0-9A-Za-z!@#$%^&*_-]{6,32}$/.test(pin)) {
      return Response.json(
        { ok: false, msg: 'PIN 은 6~32자여야 하며 공백은 쓸 수 없습니다.' },
        { status: 400 },
      );
    }
    const res = await callGas('setAdminPin', { pin, email });
    return Response.json(res, { status: res.ok ? 200 : 400 });
  }

  return Response.json({ ok: false, msg: '알 수 없는 요청입니다.' }, { status: 400 });
}
