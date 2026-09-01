import { requireAdmin } from '@/lib/auth';
import { shotEntries } from '@/lib/alliance';
import { callGas } from '@/lib/gas';
import { syncStateCache } from '@/lib/fresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/**
 * 📷 아이템 인증샷 더 붙이기 (v11.7) — **관리자 이상**.
 *
 * 레이드 직후에는 사진을 다 못 모은다. 다른 서버 파티가 나중에 보내주는 일이 흔한데,
 * 그때마다 등록을 지웠다 다시 하면 참여횟수가 통째로 흔들린다 (규칙 3).
 *
 * 관리자에게 여는 근거는 **구조적으로 안전하다**는 것이다 — 시트의
 * `api_addItemPhotos` 는 인증샷 칸에 **잇는 것** 말고는 손댈 길이 없다.
 * 금액·참여자·상태를 만질 수 없으므로 분배가 끝난 건에도 열 수 있다
 * (같은 근거로 열려 있는 `/api/admin/item-meta` 와 나란한 자리다).
 *
 * 서버 값 판정(01~12 인가)은 시트가 한다. 라우트를 직접 부르는 길이 있으므로
 * 여기서 끝내면 안 된다 (규칙 5-3).
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { row?: unknown; entries?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const row = Number(body.row);
  if (!Number.isInteger(row) || row < 2) {
    return Response.json({ ok: false, msg: '기록을 찾을 수 없습니다.' }, { status: 400 });
  }

  const entries = shotEntries(body.entries);
  if (entries.length === 0) {
    return Response.json({ ok: false, msg: '추가할 인증샷이 없습니다.' }, { status: 400 });
  }

  // 아이템 목록(인증샷 포함)은 상태에 실려 있다 — 붙인 직후 화면이 바로 맞아야 한다
  const res = await callGas(
    'addItemPhotos',
    { row, entries, email: String(body.email ?? '').trim() },
    { withState: true },
  );
  syncStateCache(res);
  return Response.json(res, { status: res.ok ? 200 : 400 });
}
