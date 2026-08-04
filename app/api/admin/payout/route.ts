import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { invalidate } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 지급 처리 — 분배전 → 분배완료로 옮긴다 (금액 생략 시 전액) */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { name?: unknown; amount?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  if (!name) return Response.json({ ok: false, msg: '멤버를 선택해주세요.' }, { status: 400 });

  // amount 를 비우면 Apps Script 쪽에서 전액 지급으로 처리한다
  let amount: number | null = null;
  if (body.amount !== undefined && body.amount !== null && body.amount !== '') {
    amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      return Response.json({ ok: false, msg: '지급액은 양의 정수여야 합니다.' }, { status: 400 });
    }
  }

  const res = await callGas('payout', { name, amount, email: String(body.email ?? '').trim() }, { timeoutMs: 45_000 });

  invalidate('state');
  return Response.json(res, { status: res.ok ? 200 : 400 });
}
