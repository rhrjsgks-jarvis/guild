import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { invalidate } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 연합 정산 — 혈맹 아이템과 같은 순서로 2단계다 (v10.3).
 *
 *   op:'register' → 서버·아이템명·인증샷(인원수)까지만.   상태 ⏳미분배
 *   op:'credit'   → 등록해둔 건에 금액·비중을 넣어 누적.  상태 ✅분배완료
 *
 * 레이드 직후엔 아직 안 팔려서 금액을 모르는 것이 정상이다. 그때 금액을
 * 요구하면 등록 자체가 미뤄지고 그 사이에 인증샷을 잃어버린다.
 * 혈맹 내부 잔액에는 어느 단계에서도 손대지 않는다.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: {
    op?: unknown;
    server?: unknown;
    item?: unknown;
    row?: unknown;
    amount?: unknown;
    pct?: unknown;
    people?: unknown;
    photoLink?: unknown;
    email?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim();
  // op 를 안 보내면 등록으로 본다 (앱 구버전 호환)
  const op = String(body.op ?? 'register');

  if (op === 'register') {
    const server = String(body.server ?? '').trim();
    const item = String(body.item ?? '').trim();
    if (!server) return Response.json({ ok: false, msg: '서버를 선택해주세요.' }, { status: 400 });
    if (!item) return Response.json({ ok: false, msg: '아이템명을 입력해주세요.' }, { status: 400 });

    const res = await callGas(
      'addAlliance',
      { server, item, people: Number(body.people) || 0, photoLink: String(body.photoLink ?? '').trim(), email },
      { timeoutMs: 45_000 },
    );
    if (res.ok) invalidate('alliance');
    return Response.json(res, { status: res.ok ? 200 : 400 });
  }

  if (op === 'credit') {
    const row = Number(body.row);
    const amount = Number(String(body.amount ?? '').replace(/,/g, ''));
    const pct = Number(body.pct);

    if (!Number.isInteger(row) || row < 2) {
      return Response.json({ ok: false, msg: '정산할 기록을 찾을 수 없습니다.' }, { status: 400 });
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      return Response.json({ ok: false, msg: '금액은 양의 정수여야 합니다.' }, { status: 400 });
    }
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
      return Response.json({ ok: false, msg: '비중은 1~100 사이여야 합니다.' }, { status: 400 });
    }

    const res = await callGas('creditAlliance', { row, amount, pct, email }, { timeoutMs: 45_000 });
    if (res.ok) invalidate('alliance');
    return Response.json(res, { status: res.ok ? 200 : 400 });
  }

  return Response.json({ ok: false, msg: '알 수 없는 요청입니다.' }, { status: 400 });
}

/** 연합 기록 삭제 — 등록만 된 건도, 정산까지 끝난 건도 지울 수 있다 */
export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { row?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const row = Number(body.row);
  if (!Number.isInteger(row) || row < 2) {
    return Response.json({ ok: false, msg: '삭제할 기록을 찾을 수 없습니다.' }, { status: 400 });
  }

  const res = await callGas('deleteAlliance', { row, email: String(body.email ?? '').trim() });
  if (res.ok) invalidate('alliance');

  return Response.json(res, { status: res.ok ? 200 : 400 });
}
