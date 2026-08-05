import { callGas } from '@/lib/gas';
import { cached } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * 지난 시즌 기록 — 조회 전용이라 길드원 누구나 볼 수 있다.
 *
 *   /api/seasons        → 보관된 시즌 목록
 *   /api/seasons?num=2  → 시즌 2 상세
 *
 * 시즌 기록은 종료된 시점에 고정되어 더 바뀌지 않으므로 넉넉히 캐시한다.
 */
export async function GET(req: Request) {
  const num = new URL(req.url).searchParams.get('num');

  if (num !== null) {
    const n = Number(num);
    if (!Number.isInteger(n) || n < 1) {
      return Response.json({ ok: false, msg: '시즌 번호가 올바르지 않습니다.' }, { status: 400 });
    }
    const res = await cached(`season:${n}`, 10 * 60_000, () => callGas('season', { num: n }), (r) => r.ok);
    return Response.json(res, { status: res.ok ? 200 : 404 });
  }

  // 목록은 시즌이 끝날 때만 바뀐다
  const res = await cached('seasons', 60_000, () => callGas('seasons'), (r) => r.ok);
  return Response.json(res, { status: res.ok ? 200 : 502 });
}
