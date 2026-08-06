import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { syncStateCache } from '@/lib/fresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 분배 실행 — 판매금액에서 혈비를 떼고 참여자에게 1/N */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { row?: unknown; amount?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const row = Number(body.row);
  const amount = Number(body.amount);

  if (!Number.isInteger(row) || row < 2) {
    return Response.json({ ok: false, msg: '아이템을 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.' }, { status: 400 });
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return Response.json({ ok: false, msg: '판매금액은 양의 정수여야 합니다.' }, { status: 400 });
  }

  const res = await callGas('distribute', { row, amount, email: String(body.email ?? '').trim() }, { timeoutMs: 45_000, withState: true });

  syncStateCache(res);
  return Response.json(res, { status: res.ok ? 200 : 400 });
}
