import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** 혈맹원 명단 (이름 · 게임표시명 · 남은 잔액) — 이름을 바꾸려면 관리자여야 한다 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const res = await callGas('roster');
  return Response.json(res, { status: res.ok ? 200 : 502 });
}
