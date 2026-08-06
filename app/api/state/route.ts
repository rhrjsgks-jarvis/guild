import { callGas } from '@/lib/gas';
import { cached } from '@/lib/cache';
import { dropIfFresh, STATE_TTL_MS } from '@/lib/fresh';
import { currentRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * 공개 조회 — 길드원 누구나 잔액·아이템 현황을 볼 수 있다.
 *
 * `?fresh=1` 은 캐시를 건너뛴다. 앱이 등록·분배·지급 **직후**에만 이걸 쓴다
 * (자세한 이유는 lib/fresh.ts).
 */
export async function GET(req: Request) {
  dropIfFresh(req, 'state');
  // 성공만 캐시한다 — 실패까지 캐시하면 일시적인 오류가 TTL 동안 굳어버린다
  const res = await cached('state', STATE_TTL_MS, () => callGas('state'), (r) => r.ok);
  const role = await currentRole();
  const admin = role !== null;
  const master = role === 'master';

  if (!res.ok) {
    return Response.json({ ok: false, msg: res.msg ?? '불러오지 못했습니다.', admin, master }, { status: 502 });
  }
  return Response.json({ ok: true, data: res.data, admin, master });
}
