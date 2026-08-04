import { callGas } from '@/lib/gas';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** 개인 잔액 조회 — 이름 하나로 본인 분배전/분배완료/참여횟수만 돌려준다 */
export async function POST(req: Request) {
  let name = '';
  try {
    const body = (await req.json()) as { name?: unknown };
    name = String(body.name ?? '').trim();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  if (!name) return Response.json({ ok: false, msg: '이름을 선택해주세요.' }, { status: 400 });

  const res = await callGas('lookup', { name });
  return Response.json(res, { status: res.ok ? 200 : 400 });
}
