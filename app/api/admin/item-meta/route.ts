import { lootMeta } from '@/lib/alliance';
import { requireAdmin } from '@/lib/auth';
import { invalidate } from '@/lib/cache';
import { callGas } from '@/lib/gas';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/**
 * 아이템의 레이드일·보스·루팅서버·루팅캐릭터만 고친다 (v11.6) — **관리자 이상**.
 *
 * 참여자·금액을 다루는 /api/master/item 과 **일부러 나눴다.** 시트의
 * `api_setItemMeta` 는 이 4칸 말고는 손댈 길이 없어서, 분배가 끝난 건이라도
 * 관리자에게 열 수 있다 (틀려도 다이아가 안 움직이고 한 줄 고치면 끝난다).
 *
 * 라우트는 형식만 정리해 그대로 넘긴다 — 값 판정(루팅서버가 01~12 인가)은
 * 시트가 한다. 라우트를 직접 부르는 길이 있으므로 여기서 끝내면 안 된다 (규칙 5-3).
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { row?: unknown; meta?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const row = Number(body.row);
  if (!Number.isInteger(row) || row < 2) {
    return Response.json({ ok: false, msg: '기록을 찾을 수 없습니다.' }, { status: 400 });
  }

  const res = await callGas('setItemMeta', {
    row,
    meta: lootMeta(body.meta),
    email: String(body.email ?? '').trim(),
  });
  // 아이템 목록은 상태 캐시에 실려 있다 — 고친 직후 조회가 옛 값을 보면 안 된다
  if (res.ok) invalidate('state');
  return Response.json(res, { status: res.ok ? 200 : 400 });
}
