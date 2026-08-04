import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { invalidate } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 아이템 등록 (⏳미분배로 저장) */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { itemName?: unknown; participants?: unknown; photoLink?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const itemName = String(body.itemName ?? '').trim();
  const participants = Array.isArray(body.participants)
    ? body.participants.map((p) => String(p).trim()).filter(Boolean)
    : [];

  if (!itemName) return Response.json({ ok: false, msg: '아이템명을 입력해주세요.' }, { status: 400 });
  if (participants.length === 0) {
    return Response.json({ ok: false, msg: '참여 멤버를 한 명 이상 선택해주세요.' }, { status: 400 });
  }

  const res = await callGas(
    'register',
    {
      itemName,
      participants,
      photoLink: String(body.photoLink ?? '').trim(),
      email: String(body.email ?? '').trim(),
    },
    { timeoutMs: 45_000 },
  );

  invalidate('state');
  return Response.json(res, { status: res.ok ? 200 : 400 });
}
