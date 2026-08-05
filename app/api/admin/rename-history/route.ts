import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** 아이디 변경 이력 (변경 전 → 변경 후) — [작업기록] 시트에서 개명 기록만 추린다 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const res = await callGas('renameHistory');
  return Response.json(res, { status: res.ok ? 200 : 502 });
}
