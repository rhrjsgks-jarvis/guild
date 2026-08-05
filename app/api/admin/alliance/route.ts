import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { invalidate } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 연합 정산 등록 — 서버별로 누적된다. 혈맹 내부 잔액에는 손대지 않는다. */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: {
    server?: unknown;
    item?: unknown;
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

  const server = String(body.server ?? '').trim();
  const item = String(body.item ?? '').trim();
  const amount = Number(String(body.amount ?? '').replace(/,/g, ''));
  const pct = Number(body.pct);

  if (!server) return Response.json({ ok: false, msg: '서버를 선택해주세요.' }, { status: 400 });
  if (!item) return Response.json({ ok: false, msg: '아이템명을 입력해주세요.' }, { status: 400 });
  if (!Number.isInteger(amount) || amount <= 0) {
    return Response.json({ ok: false, msg: '금액은 양의 정수여야 합니다.' }, { status: 400 });
  }
  if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
    return Response.json({ ok: false, msg: '비중은 1~100 사이여야 합니다.' }, { status: 400 });
  }

  const res = await callGas(
    'addAlliance',
    {
      server,
      item,
      amount,
      pct,
      people: Number(body.people) || 0,
      photoLink: String(body.photoLink ?? '').trim(),
      email: String(body.email ?? '').trim(),
    },
    { timeoutMs: 45_000 },
  );
  if (res.ok) invalidate('alliance');

  return Response.json(res, { status: res.ok ? 200 : 400 });
}

/** 연합 기록 삭제 */
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
