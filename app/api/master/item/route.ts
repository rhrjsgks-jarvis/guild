import { callGas } from '@/lib/gas';
import { requireMaster } from '@/lib/auth';
import { syncStateCache } from '@/lib/fresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 아이템 수정 (v11.0 → v11.1) — 마스터관리자 전용.
 *
 *   ⏳미분배 — 아이템명·참여자. 아직 아무 돈도 움직이지 않았다
 *   ✅분배완료 — 참여자·**분배금액**까지. 시트가 분배 시점 금액 그대로 회수한 뒤
 *               새 명단·새 금액으로 다시 나누고, 혈맹운영비도 함께 맞춘다
 *
 * 마스터에게 두는 이유: 참여자를 고치면 그 사람들의 **참여횟수**가 함께 다시 계산되고,
 * 분배완료 건이면 실제 잔액이 움직인다 (CLAUDE.md 권한 경계 — 정정은 마스터).
 */
export async function POST(req: Request) {
  const denied = await requireMaster();
  if (denied) return denied;

  let body: {
    row?: unknown;
    itemName?: unknown;
    participants?: unknown;
    amount?: unknown;
    email?: unknown;
    confirm?: unknown;
  };
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

  // 분배완료 건에서만 쓴다. 안 보내면 시트가 지금 금액을 그대로 쓴다
  let amount: number | null = null;
  if (body.amount !== undefined && body.amount !== null && body.amount !== '') {
    amount = Number(String(body.amount).replace(/,/g, ''));
    if (!Number.isInteger(amount) || amount <= 0) {
      return Response.json({ ok: false, msg: '금액은 양의 정수여야 합니다.' }, { status: 400 });
    }
  }

  const res = await callGas(
    'editItem',
    {
      row,
      itemName,
      participants,
      amount,
      email: String(body.email ?? '').trim(),
      // ★ 앱이 바뀔 숫자를 보여준 뒤에만 true 가 된다 — 여기서 채우면 안전장치가 무력화된다
      confirm: body.confirm === true,
    },
    { timeoutMs: 55_000, withState: true },
  );

  if (res.ok) syncStateCache(res);
  // 되묻는 응답(needsConfirm)은 실패가 아니다
  return Response.json(res, { status: res.ok || res.needsConfirm ? 200 : 400 });
}
