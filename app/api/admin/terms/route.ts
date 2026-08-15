import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { invalidate } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/**
 * 용어 추가·수정·삭제 (v11.4) — **관리자 이상**.
 *
 * 마스터 전용으로 두지 않는 이유: 표기를 잘못 넣어도 다이아는 한 톨도 움직이지
 * 않고 한 줄 고치면 끝난다. 오히려 중국 혈맹원이 실제로 쓰는 표기를 아는 사람이
 * 바로 고칠 수 있어야 사전이 쓸모 있어진다 (되돌릴 수 있는가 — 권한 경계의 기준).
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: {
    row?: unknown;
    cat?: unknown;
    ko?: unknown;
    zh?: unknown;
    en?: unknown;
    note?: unknown;
    email?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const ko = String(body.ko ?? '').trim();
  if (!ko) return Response.json({ ok: false, msg: '한국어 표기를 넣어주세요.' }, { status: 400 });

  // row 를 주면 그 줄을 고치고, 없으면 새로 넣는다 (시트가 같은 판정을 한다)
  const row = Number(body.row);
  const res = await callGas('saveTerm', {
    row: Number.isInteger(row) && row >= 2 ? row : 0,
    cat: String(body.cat ?? '기타').trim(),
    ko,
    zh: String(body.zh ?? '').trim(),
    en: String(body.en ?? '').trim(),
    note: String(body.note ?? '').trim(),
    email: String(body.email ?? '').trim(),
  });

  if (res.ok) invalidate('terms');
  return Response.json(res, { status: res.ok ? 200 : 400 });
}

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
    return Response.json({ ok: false, msg: '지울 용어를 찾을 수 없습니다.' }, { status: 400 });
  }

  const res = await callGas('deleteTerm', { row, email: String(body.email ?? '').trim() });
  if (res.ok) invalidate('terms');
  return Response.json(res, { status: res.ok ? 200 : 400 });
}
