import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { invalidate } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** 글 삭제 — 관리자·마스터만 */
export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { id?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ ok: false, msg: '삭제할 글을 찾을 수 없습니다.' }, { status: 400 });
  }

  const res = await callGas('deletePost', { id, email: String(body.email ?? '').trim() });
  if (res.ok) {
    invalidate('posts');
    invalidate('state');
  }
  return Response.json(res, { status: res.ok ? 200 : 400 });
}
