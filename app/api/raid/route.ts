import { callGas } from '@/lib/gas';
import { cached } from '@/lib/cache';
import { dropIfFresh } from '@/lib/fresh';
import { isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * 보스 시간표 조회 (v10.8) — 누구나 볼 수 있다 (수정은 관리자 이상).
 *
 * 요일 필터는 **앱이** 한다. 서버가 오늘 요일만 골라 보내면 폰과 서버의
 * 시간대가 다를 때(중국 접속) 엉뚱한 요일이 나오고, 요일 칩을 눌러
 * 다른 요일을 볼 때마다 왕복이 생긴다. 표 전체는 46건 남짓이라 한 번에 보낸다.
 *
 * `?fresh=1` 은 추가·수정·삭제 직후에만 쓴다 (lib/fresh.ts).
 */
export async function GET(req: Request) {
  dropIfFresh(req, 'raid');
  const res = await cached('raid', 8_000, () => callGas('raid'), (r) => r.ok);
  const admin = await isAdmin();
  if (!res.ok) {
    return Response.json({ ok: false, msg: res.msg ?? '불러오지 못했습니다.', admin }, { status: 502 });
  }
  return Response.json({ ok: true, data: res.data, admin });
}
