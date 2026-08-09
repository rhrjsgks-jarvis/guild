import { callGas } from '@/lib/gas';
import { requireMaster } from '@/lib/auth';
import { invalidate } from '@/lib/cache';
import { syncStateCache } from '@/lib/fresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 연합 항목 정정 (v11.1) — 마스터관리자 전용.
 *
 *   ⏳미분배 — 아이템명·서버별 인원만 고친다. 아직 아무 돈도 움직이지 않았다
 *   ✅분배완료 — 판매금액까지 고친다. 서버별 몫을 다시 계산하고,
 *               혈맹운영비에 적립했던 혈비를 **차액만** 조정한다
 *
 * 마스터에게 두는 이유는 정정·삭제와 같다 — 이미 끝난 정산을 되돌리는 작업이고,
 * 혈맹운영비 잔액이 실제로 움직인다 (CLAUDE.md 권한 경계).
 *
 * ★ `confirm` 은 앱이 "혈비가 얼마에서 얼마로 바뀌는지" 를 보여준 뒤에만 true 가 된다.
 *   여기서 임의로 채우면 안전장치가 통째로 무력화되므로 **그대로 전달만** 한다 (규칙 5).
 */
export async function POST(req: Request) {
  const denied = await requireMaster();
  if (denied) return denied;

  let body: {
    group?: unknown;
    item?: unknown;
    entries?: unknown;
    amount?: unknown;
    email?: unknown;
    confirm?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const group = String(body.group ?? '').trim();
  if (!group) {
    return Response.json({ ok: false, msg: '정정할 기록을 찾을 수 없습니다.' }, { status: 400 });
  }

  const item = String(body.item ?? '').trim();
  if (!item) return Response.json({ ok: false, msg: '아이템명을 입력해주세요.' }, { status: 400 });

  const raw = Array.isArray(body.entries) ? body.entries : [];
  const entries: { server: string; people: number }[] = [];
  for (const e of raw) {
    const o = (e ?? {}) as { server?: unknown; people?: unknown };
    const server = String(o.server ?? '').trim();
    if (!server) continue;
    const people = Number(o.people);
    if (!Number.isInteger(people) || people < 0) {
      return Response.json({ ok: false, msg: '인원수는 0 이상의 정수여야 합니다.' }, { status: 400 });
    }
    entries.push({ server, people });
  }
  if (entries.length === 0) {
    return Response.json({ ok: false, msg: '참여한 서버를 하나 이상 넣어주세요.' }, { status: 400 });
  }
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.server)) {
      return Response.json({ ok: false, msg: `${e.server}서버가 두 번 들어갔습니다.` }, { status: 400 });
    }
    seen.add(e.server);
  }

  // 금액은 정산된 건에서만 쓴다. 안 보내면 시트가 지금 금액을 그대로 쓴다
  let amount: number | null = null;
  if (body.amount !== undefined && body.amount !== null && body.amount !== '') {
    amount = Number(String(body.amount).replace(/,/g, ''));
    if (!Number.isInteger(amount) || amount <= 0) {
      return Response.json({ ok: false, msg: '금액은 양의 정수여야 합니다.' }, { status: 400 });
    }
  }

  const res = await callGas(
    'editAlliance',
    { group, item, entries, amount, email: String(body.email ?? '').trim(), confirm: body.confirm === true },
    { timeoutMs: 55_000, withState: true },
  );

  if (res.ok) {
    invalidate('alliance');
    syncStateCache(res);
  }
  // 되묻는 응답(needsConfirm)은 실패가 아니다 — 앱이 숫자를 보여주고 다시 부른다
  return Response.json(res, { status: res.ok || res.needsConfirm ? 200 : 400 });
}
