import { callGas } from '@/lib/gas';
import { cached } from '@/lib/cache';
import { currentRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** 공개 조회 — 길드원 누구나 잔액·아이템 현황을 볼 수 있다 */
export async function GET() {
  // 성공만 캐시한다 — 실패까지 캐시하면 일시적인 오류가 8초 동안 굳어버린다
  const res = await cached('state', 8_000, () => callGas('state'), (r) => r.ok);
  const role = await currentRole();
  const admin = role !== null;
  const master = role === 'master';

  if (!res.ok) {
    return Response.json({ ok: false, msg: res.msg ?? '불러오지 못했습니다.', admin, master }, { status: 502 });
  }
  return Response.json({ ok: true, data: res.data, admin, master });
}
