import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { syncStateCache } from '@/lib/fresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 혈맹원 아이디 변경.
 *
 * 바꿀 이름이 이미 명단에 있으면 두 계정의 잔액·참여횟수가 합쳐진다.
 * 그 경우 Apps Script 가 `needsConfirm` 을 돌려주고, 앱이 한 번 더 확인받은 뒤
 * `confirmMerge: true` 로 다시 호출한다. 여기서는 그 값을 그대로 전달만 한다
 * (서버가 임의로 true 로 만들면 안전장치가 무력화된다).
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { oldName?: unknown; newName?: unknown; email?: unknown; confirmMerge?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const oldName = String(body.oldName ?? '').trim();
  const newName = String(body.newName ?? '').trim();

  if (!oldName || !newName) {
    return Response.json({ ok: false, msg: '기존 이름과 새 이름을 모두 입력해주세요.' }, { status: 400 });
  }
  if (newName.length > 30) {
    return Response.json({ ok: false, msg: '이름은 30자 이내여야 합니다.' }, { status: 400 });
  }

  const res = await callGas(
    'rename',
    {
      oldName,
      newName,
      email: String(body.email ?? '').trim(),
      confirmMerge: body.confirmMerge === true,
    },
    { timeoutMs: 45_000, withState: true },
  );

  if (res.ok) syncStateCache(res);

  // needsConfirm 은 오류가 아니라 "한 번 더 물어보라"는 신호다 — 200 으로 내려보낸다
  return Response.json(res, { status: res.ok || res.needsConfirm ? 200 : 400 });
}
