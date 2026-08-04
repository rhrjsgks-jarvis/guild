import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
// OCR은 드라이브 업로드 + 문서 변환이라 느리다 — 넉넉히 잡는다
export const maxDuration = 60;

/** 인증샷 분석 — 드라이브 저장 + OCR로 참여자 자동 감지 */
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
  // 넉넉잡아 6MB(base64 기준) 이상은 애초에 보내지 않는다
  if (base64.length > 6_000_000) {
    return Response.json({ ok: false, msg: '사진 용량이 너무 큽니다. 다시 촬영해주세요.' }, { status: 413 });
  }

  const res = await callGas('photo', { base64 }, { timeoutMs: 55_000 });
  return Response.json(res, { status: res.ok ? 200 : 400 });
}
