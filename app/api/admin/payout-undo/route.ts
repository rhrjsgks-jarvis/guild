import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { syncStateCache } from '@/lib/fresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 되돌릴 수 있는 마지막 지급 내역 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const res = await callGas('lastPayout');
  // 기록이 없는 것은 오류가 아니다
  return Response.json(res, { status: 200 });
}

/** 마지막 지급 취소 — 분배완료 → 분배전으로 되돌린다 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { email?: unknown; confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const res = await callGas(
    'undoPayout',
    { email: String(body.email ?? '').trim(), confirm: body.confirm === true },
    { timeoutMs: 45_000, withState: true },
  );
  if (res.ok) syncStateCache(res);

  return Response.json(res, { status: res.ok || res.needsConfirm ? 200 : 400 });
}
