import { callGas } from '@/lib/gas';
import { cached } from '@/lib/cache';
import { isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** 연합 누적 현황 조회 — 누구나 볼 수 있다 (등록은 관리자 전용) */
export async function GET() {
  const res = await cached('alliance', 10_000, () => callGas('alliance'), (r) => r.ok);
  const admin = await isAdmin();
  if (!res.ok) {
    return Response.json({ ok: false, msg: res.msg ?? '불러오지 못했습니다.', admin }, { status: 502 });
  }
  return Response.json({ ok: true, data: res.data, admin });
}
