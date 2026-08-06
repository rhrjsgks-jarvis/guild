import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { syncStateCache } from '@/lib/fresh';

export const dynamic = 'force-dynamic';
// 시즌 종료·데이터 이관은 시트를 통째로 다시 쓰므로 오래 걸린다
export const maxDuration = 60;

/** 실행 가능한 관리 도구 목록 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const res = await callGas('tools');
  return Response.json(res, { status: res.ok ? 200 : 502 });
}

/**
 * 도구 실행.
 *
 * 되돌릴 수 없는 도구(시즌 종료·초기화 등)는 Apps Script 가 정해진 확인 문구를
 * 요구한다. 앱이 사용자에게 직접 입력받은 값을 그대로 넘길 뿐, 여기서 지어내지 않는다.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { id?: unknown; params?: unknown; email?: unknown; confirmText?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const id = String(body.id ?? '').trim();
  if (!id) return Response.json({ ok: false, msg: '실행할 도구를 선택해주세요.' }, { status: 400 });

  const params =
    body.params && typeof body.params === 'object' ? (body.params as Record<string, unknown>) : {};

  const res = await callGas(
    'runTool',
    {
      id,
      params,
      email: String(body.email ?? '').trim(),
      // 사용자가 입력한 문구를 그대로 — 서버가 채워 넣으면 확인 절차가 무의미해진다
      confirmText: String(body.confirmText ?? ''),
    },
    { timeoutMs: 55_000, withState: true },
  );

  if (res.ok) syncStateCache(res);
  return Response.json(res, { status: res.ok || res.needsConfirm ? 200 : 400 });
}
