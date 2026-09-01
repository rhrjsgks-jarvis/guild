import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { syncStateCache } from '@/lib/fresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 아이템 수정 (v11.0 → v11.1 → v11.7) — **관리자 이상**.
 *
 *   ⏳미분배 — 아이템명·참여자. 아직 아무 돈도 움직이지 않았다
 *   ✅분배완료 — 아이템명·참여자·**판매금액**까지. 시트가 분배 시점 금액 그대로
 *               회수한 뒤 새 명단·새 금액으로 다시 나누고, 혈맹운영비도 함께 맞춘다
 *
 * v11.6 까지는 마스터관리자 전용이었다. v11.7 부터 **분배완료 건의 삭제를 없애고**
 * 그 자리를 수정이 대신하기 때문에 관리자에게 연다 — 잘못 나눈 것을 바로잡을 길이
 * 관리자에게 하나도 없으면, 고칠 사람을 기다리는 동안 잔액이 틀린 채로 남는다.
 *
 * 여는 근거는 "안전해서"가 아니라 **되돌릴 수 있어서**다. 수정은 기록을 지우지
 * 않는다. 분배 시점 스냅샷(O열)이 그대로 남아 있고 작업기록에도 남으므로,
 * 잘못 고쳤으면 다시 고치면 된다. 삭제는 그렇지 않아서 없앴다.
 *
 * 안전장치는 그대로다:
 *  · 분배완료 건은 시트가 `confirm === true` 없이는 실행하지 않고, 바뀔 숫자를
 *    먼저 돌려준다 (규칙 5-1). 라우트는 그 값을 **임의로 채우지 않는다**
 *  · 이미 지급✓ 된 사람이 있어 되돌릴 수 없으면 시트가 막는다
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
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
