import { callGas } from '@/lib/gas';
import { cached } from '@/lib/cache';
import { dropIfFresh } from '@/lib/fresh';
import { isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * 연합 누적 현황 조회 — 누구나 볼 수 있다 (등록은 관리자 전용).
 * `?fresh=1` 은 등록·삭제 직후에만 쓴다 (lib/fresh.ts).
 */
export async function GET(req: Request) {
  dropIfFresh(req, 'alliance');
  const res = await cached('alliance', 8_000, () => callGas('alliance'), (r) => r.ok);
  const admin = await isAdmin();
  if (!res.ok) {
    return Response.json({ ok: false, msg: res.msg ?? '불러오지 못했습니다.', admin }, { status: 502 });
  }
  return Response.json({ ok: true, data: res.data, admin });
}
