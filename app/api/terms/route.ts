import { callGas } from '@/lib/gas';
import { cached } from '@/lib/cache';
import { dropIfFresh } from '@/lib/fresh';
import { isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * 용어 사전 조회 (v11.4) — 누구나 볼 수 있다 (고치는 것은 관리자 이상).
 *
 * 아이템·보스·서버 이름의 국문 · 中文 · English 표기다. 중국 혈맹원이 자기 언어로
 * 찾아 고르면 앱이 **국문을 넣어** 기록을 한 종류로 유지한다.
 *
 * 목록은 자주 바뀌지 않으므로 캐시를 길게(30초) 둔다 — 아이템명 칸에 글자를
 * 칠 때마다 시트를 읽으면 Apps Script 실행 할당량이 순식간에 마른다.
 * `?fresh=1` 은 추가·수정·삭제 직후에만 쓴다 (lib/fresh.ts).
 */
export async function GET(req: Request) {
  dropIfFresh(req, 'terms');
  const res = await cached('terms', 30_000, () => callGas('terms'), (r) => r.ok);
  const admin = await isAdmin();
  if (!res.ok) {
    return Response.json({ ok: false, msg: res.msg ?? '불러오지 못했습니다.', admin }, { status: 502 });
  }
  return Response.json({ ok: true, data: res.data, admin });
}
