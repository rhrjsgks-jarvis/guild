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
    img?: unknown;
    note?: unknown;
    tier?: unknown;
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
    // 🐛 img 는 v11.4 부터 여기서 빠져 있었다 — 용어를 한 번 수정하면
    //    관리자가 넣어둔 아이콘 주소가 조용히 지워졌다 (시트는 받은 값으로 덮어쓴다).
    img: String(body.img ?? '').trim(),
    note: String(body.note ?? '').trim(),
    // 티어도 그대로 전달만 한다 — 값 판정(0~3, 알 수 없으면 빈칸)은 시트가 한다 (규칙 5-3)
    tier: String(body.tier ?? '').trim(),
    email: String(body.email ?? '').trim(),
  });

  if (res.ok) invalidate('terms');
  return Response.json(res, { status: res.ok ? 200 : 400 });
}

/**
 * 붙여넣기로 여러 개 등록 (v11.4).
 *
 * 공식 홈페이지 표를 복사해 오는 길이다. 앱이 남의 사이트를 긁어오지 않는다 —
 * 사람이 보고 복사한 것이 가장 정확하고, 남의 서버를 두드릴 이유도 없다.
 * ★ 이미 있는 국문은 시트가 건드리지 않는다 (사람이 고쳐둔 표기를 지키기 위해).
 */
export async function PATCH(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { rows?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const raw = Array.isArray(body.rows) ? body.rows : [];
  const rows: { cat: string; ko: string; zh: string; en: string; tier: string }[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as { cat?: unknown; ko?: unknown; zh?: unknown; en?: unknown; tier?: unknown };
    const ko = String(o.ko ?? '').trim();
    if (!ko) continue;
    rows.push({
      cat: String(o.cat ?? '기타').trim(),
      ko,
      zh: String(o.zh ?? '').trim(),
      en: String(o.en ?? '').trim(),
      // 티어도 함께 — 붙여넣기 한 번으로 티어까지 들어간다 (판정은 시트가 한다)
      tier: String(o.tier ?? '').trim(),
    });
  }
  if (rows.length === 0) {
    return Response.json({ ok: false, msg: '넣을 용어가 없습니다.' }, { status: 400 });
  }
  // 한 번에 너무 많이 보내면 Apps Script 실행 시간이 넘는다 — 앱이 나눠 보낸다
  if (rows.length > 300) {
    return Response.json({ ok: false, msg: '한 번에 300개까지 넣을 수 있습니다.' }, { status: 400 });
  }

  const res = await callGas('bulkTerms', { rows, email: String(body.email ?? '').trim() }, { timeoutMs: 55_000 });
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
