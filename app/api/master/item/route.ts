import { callGas } from '@/lib/gas';
import { requireMaster } from '@/lib/auth';
import { syncStateCache } from '@/lib/fresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 미분배 아이템의 아이템명·참여자 수정 (v11.0) — 마스터관리자 전용.
 *
 * 이미 분배된 아이템은 여기서 못 고친다. 그쪽은 [정정]이 담당한다 —
 * 금액을 회수했다가 다시 나눠줘야 해서 절차가 완전히 다르고, 시트도 거부한다.
 *
 * 마스터에게 두는 이유: 참여자를 고치면 그 사람들의 **참여횟수**가 함께 다시 계산된다.
 * 등록을 잘못한 관리자가 스스로 지우고 다시 만드는 대신 조용히 고칠 수 있으면
 * "누가 언제 무엇을 바꿨는지"가 흐려진다 (작업기록에는 남지만, 권한은 나눠 둔다).
 */
export async function POST(req: Request) {
  const denied = await requireMaster();
  if (denied) return denied;

  let body: { row?: unknown; itemName?: unknown; participants?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const row = Number(body.row);
  if (!Number.isInteger(row) || row < 2) {
    return Response.json({ ok: false, msg: '아이템을 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.' }, { status: 400 });
  }

  const itemName = String(body.itemName ?? '').trim();
  if (!itemName) return Response.json({ ok: false, msg: '아이템명을 입력해주세요.' }, { status: 400 });

  const participants = Array.isArray(body.participants)
    ? body.participants.map((p) => String(p).trim()).filter(Boolean)
    : [];
  if (participants.length === 0) {
    return Response.json({ ok: false, msg: '참여자를 한 명 이상 골라주세요.' }, { status: 400 });
  }

  const res = await callGas(
    'editItem',
    { row, itemName, participants, email: String(body.email ?? '').trim() },
    { timeoutMs: 45_000, withState: true },
  );

  if (res.ok) syncStateCache(res);
  return Response.json(res, { status: res.ok ? 200 : 400 });
}
