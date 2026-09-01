import { callGas } from '@/lib/gas';
import { requireMaster } from '@/lib/auth';
import { invalidate } from '@/lib/cache';
import { syncStateCache } from '@/lib/fresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/**
 * 연합 기록 삭제 (v11.8) — **마스터관리자 전용**.
 *
 * v11.7 까지는 관리자도 지울 수 있었다. 권한을 가르는 기준을 하나로 다시 세우면서
 * 옮겼다 — **고치는 것은 관리자, 지우는 것은 마스터**다. 고친 것은 기록이 남아
 * 되돌릴 수 있지만, 지운 것은 되돌릴 방법이 없다.
 *
 * ★ **정산이 끝난 건은 마스터도 못 지운다.** 혈비가 이미 혈맹운영비 잔액에 적립된
 *   뒤라, 지우면 "그때 얼마가 들어왔다" 는 사실까지 사라진다. 시트의
 *   `api_deleteAlliance` 가 거부한다 (`e.allyNoDelete`) — 이 라우트를 직접 불러도
 *   막힌다. 잘못된 것은 [수정]으로 고친다 (`/api/admin/alliance`, op:'edit').
 *
 * 그래서 지울 수 있는 것은 **아직 금액을 안 넣은 건**뿐이고, 그 건은 혈맹운영비에
 * 적립된 것이 없어 잔액이 움직이지 않는다. 그래도 상태를 함께 받아 오는 이유는
 * 옛 시트(v11.7 이하)가 아직 적립분을 회수하는 경로를 갖고 있기 때문이다.
 */
export async function DELETE(req: Request) {
  const denied = await requireMaster();
  if (denied) return denied;

  let body: { group?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const group = String(body.group ?? '').trim();
  if (!group) {
    return Response.json({ ok: false, msg: '삭제할 기록을 찾을 수 없습니다.' }, { status: 400 });
  }

  const res = await callGas('deleteAlliance', { group, email: String(body.email ?? '').trim() }, { withState: true });
  if (res.ok) {
    invalidate('alliance');
    syncStateCache(res);
  }

  return Response.json(res, { status: res.ok ? 200 : 400 });
}
