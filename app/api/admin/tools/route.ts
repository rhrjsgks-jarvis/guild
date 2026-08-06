import { callGas } from '@/lib/gas';
import { requireAdmin, requireMaster } from '@/lib/auth';
import { cached } from '@/lib/cache';
import { syncStateCache } from '@/lib/fresh';

/**
 * 이 도구가 마스터관리자 전용인가 — **시트에 물어본다**.
 *
 * 앱이 보낸 값으로 판단하면 앱을 고쳐서 우회할 수 있으므로, 도구 목록을
 * 서버에서 직접 받아 그 안의 master 플래그로 판정한다.
 * 목록은 코드가 바뀔 때만 달라지므로 넉넉히 캐시한다.
 *
 * 목록을 못 받아오면 **막는 쪽**으로 판단한다 — 되돌릴 수 없는 작업을
 * "확인이 안 되니 일단 통과"시키는 것이 훨씬 위험하다.
 */
async function needsMaster(id: string): Promise<boolean> {
  const res = await cached('tools', 60_000, () => callGas('tools'), (r) => r.ok);
  if (!res.ok || !Array.isArray(res.data)) return true;
  const tool = (res.data as { id?: string; master?: boolean; danger?: number }[]).find((t) => t.id === id);
  if (!tool) return true;
  return tool.master === true || Number(tool.danger) >= 3;
}

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
 * 권한은 두 겹이다:
 *   · 관리자   — 위험도 1~2 도구 (참여횟수 재계산·시트 정돈·시즌 서버 설정 등)
 *   · 마스터   — 위 전부 + **되돌릴 수 없는 도구** (시즌 종료·이관·설치·초기화)
 *
 * 되돌릴 수 없는 도구(시즌 종료·초기화 등)는 Apps Script 가 정해진 확인 문구도
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

  // ★ 되돌릴 수 없는 도구는 마스터관리자만. 관리자가 실수로 눌러도
  //   복구할 방법이 없는 작업들이라 등급을 나눈 의미가 여기에 있다.
  if (await needsMaster(id)) {
    const notMaster = await requireMaster();
    if (notMaster) return notMaster;
  }

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
