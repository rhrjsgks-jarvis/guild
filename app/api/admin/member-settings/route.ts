import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { syncStateCache } from '@/lib/fresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/**
 * 멤버 설정 변경 — 분배비중(%) · 서버 · 한자표기.
 *
 * 비중은 다음 분배부터 적용된다. 이미 분배된 아이템의 금액은 [분배대기중] 시트
 * "분배내역" 열에 그대로 남아 있어서, 나중에 정정·삭제해도 그때 준 금액대로 되돌아간다.
 *
 * 한자표기는 관리자가 화면에서 눈으로 확인하고 저장한 값만 올라온다.
 * 서버가 이름을 추측해서 채우는 일은 없다 — 표기가 틀리면 엉뚱한 사람으로 읽히기 때문.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: {
    name?: unknown;
    weight?: unknown;
    server?: unknown;
    hanja?: unknown;
    cls?: unknown;
    email?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  if (!name) return Response.json({ ok: false, msg: '대상을 선택해주세요.' }, { status: 400 });

  const patch: Record<string, unknown> = {};

  if (body.weight !== undefined && body.weight !== null && body.weight !== '') {
    const w = Number(body.weight);
    if (!Number.isInteger(w) || w < 1 || w > 100) {
      return Response.json({ ok: false, msg: '분배비중은 1~100 사이의 정수여야 합니다.' }, { status: 400 });
    }
    patch.weight = w;
  }
  if (body.server !== undefined && body.server !== null) patch.server = String(body.server).trim();
  if (body.hanja !== undefined && body.hanja !== null) patch.hanja = String(body.hanja).trim();
  // 클래스는 시트가 목록 대조로 막는다 — 라우트는 그대로 전달만 한다 (규칙 5-3)
  if (body.cls !== undefined && body.cls !== null) patch.cls = String(body.cls).trim();

  if (Object.keys(patch).length === 0) {
    return Response.json({ ok: false, msg: '바꿀 항목이 없습니다.' }, { status: 400 });
  }

  const res = await callGas('updateMember', { name, patch, email: String(body.email ?? '').trim() }, { withState: true });
  if (res.ok) syncStateCache(res);

  return Response.json(res, { status: res.ok ? 200 : 400 });
}
