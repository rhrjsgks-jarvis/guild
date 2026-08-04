import { callGas } from '@/lib/gas';
import { cached } from '@/lib/cache';
import { isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** 공개 조회 — 길드원 누구나 잔액·아이템 현황을 볼 수 있다 */
export async function GET() {
  const res = await cached('state', 8_000, () => callGas('state'));
  const admin = await isAdmin();

  if (!res.ok) {
    return Response.json({ ok: false, msg: res.msg ?? '불러오지 못했습니다.', admin }, { status: 502 });
  }
  return Response.json({ ok: true, data: res.data, admin });
}
