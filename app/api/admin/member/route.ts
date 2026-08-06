import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { syncStateCache } from '@/lib/fresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 혈맹원 추가 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { name?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  if (!name) return Response.json({ ok: false, msg: '아이디를 입력해주세요.' }, { status: 400 });
  if (name.length > 30) {
    return Response.json({ ok: false, msg: '아이디는 30자 이내여야 합니다.' }, { status: 400 });
  }

  const res = await callGas('addMember', { name, email: String(body.email ?? '').trim() }, { timeoutMs: 45_000, withState: true });
  if (res.ok) syncStateCache(res);

  return Response.json(res, { status: res.ok ? 200 : 400 });
}

/**
 * 혈맹원 탈퇴 처리.
 *
 * 잔액이 남아 있거나 분배 나머지가 귀속되는 사람이면 Apps Script 가
 * `needsConfirm` 을 돌려주고, 앱이 한 번 더 확인받은 뒤 `confirmRemove: true`
 * 로 다시 호출한다. 여기서는 그 값을 그대로 전달만 한다.
 */
export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { name?: unknown; email?: unknown; confirmRemove?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  if (!name) return Response.json({ ok: false, msg: '대상을 선택해주세요.' }, { status: 400 });

  const res = await callGas(
    'removeMember',
    { name, email: String(body.email ?? '').trim(), confirmRemove: body.confirmRemove === true },
    { timeoutMs: 45_000, withState: true },
  );
  if (res.ok) syncStateCache(res);

  // needsConfirm 은 오류가 아니라 "한 번 더 물어보라"는 신호다
  return Response.json(res, { status: res.ok || res.needsConfirm ? 200 : 400 });
}
