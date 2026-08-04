import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { invalidate } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 전체 아이템 목록 (미분배 + 분배완료) — 정정·삭제 대상을 고르기 위한 것 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const res = await callGas('itemsAll');
  return Response.json(res, { status: res.ok ? 200 : 502 });
}

/**
 * 아이템 정정 / 삭제 / 되돌리기 미리보기.
 *
 * `confirm` 은 앱이 사용자에게 구체적인 숫자를 보여준 뒤에만 true 가 된다.
 * 여기서 임의로 true 를 만들면 안전장치가 무력화되므로 그대로 전달만 한다.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: {
    op?: unknown;
    row?: unknown;
    newAmount?: unknown;
    email?: unknown;
    confirm?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const row = Number(body.row);
  if (!Number.isInteger(row) || row < 2) {
    return Response.json({ ok: false, msg: '아이템을 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.' }, { status: 400 });
  }

  const op = String(body.op ?? '');
  const email = String(body.email ?? '').trim();
  const confirm = body.confirm === true;

  if (op === 'preview') {
    const res = await callGas('previewReverse', { row });
    return Response.json(res, { status: res.ok ? 200 : 400 });
  }

  if (op === 'correct') {
    // 빈 값이면 "되돌리기만" — 재분배하지 않는다
    let newAmount: number | null = null;
    if (body.newAmount !== undefined && body.newAmount !== null && body.newAmount !== '') {
      newAmount = Number(body.newAmount);
      if (!Number.isInteger(newAmount) || newAmount <= 0) {
        return Response.json({ ok: false, msg: '새 판매금액은 양의 정수여야 합니다.' }, { status: 400 });
      }
    }
    const res = await callGas('correctItem', { row, newAmount, email, confirm }, { timeoutMs: 55_000 });
    if (res.ok) invalidate('state');
    return Response.json(res, { status: res.ok || res.needsConfirm ? 200 : 400 });
  }

  if (op === 'delete') {
    const res = await callGas('deleteItem', { row, email, confirm }, { timeoutMs: 55_000 });
    if (res.ok) invalidate('state');
    return Response.json(res, { status: res.ok || res.needsConfirm ? 200 : 400 });
  }

  return Response.json({ ok: false, msg: '알 수 없는 요청입니다.' }, { status: 400 });
}
