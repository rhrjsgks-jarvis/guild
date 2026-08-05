import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 연합 인증샷 — 인원수만 센다.
 * 누가 찍혔는지는 판별하지 않는다 (연합은 우리 혈맹원 명단과 무관하기 때문).
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let base64 = '';
  try {
    const body = (await req.json()) as { base64?: unknown };
    base64 = String(body.base64 ?? '');
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  if (!base64) return Response.json({ ok: false, msg: '이미지 데이터가 없습니다.' }, { status: 400 });
  if (base64.length > 6_000_000) {
    return Response.json({ ok: false, msg: '사진 용량이 너무 큽니다. 다시 촬영해주세요.' }, { status: 413 });
  }

  const res = await callGas('countPhoto', { base64 }, { timeoutMs: 55_000 });
  return Response.json(res, { status: res.ok ? 200 : 400 });
}
