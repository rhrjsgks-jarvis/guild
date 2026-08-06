import { callGas } from '@/lib/gas';
import { requireAdmin, requireMaster } from '@/lib/auth';
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

/**
 * 마지막 지급 취소 — 분배완료 → 분배전으로 되돌린다.
 *
 * ★ 마스터관리자 전용. 이미 지급한 것을 되돌리는 작업이라,
 *   관리자가 잘못 만진 것을 바로잡는 자리다 (정정·삭제와 같은 성격).
 *   조회(GET)는 관리자도 할 수 있다 — 무엇이 잘못됐는지는 알아야 하므로.
 */
export async function POST(req: Request) {
  const denied = await requireMaster();
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
