import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { syncStateCache } from '@/lib/fresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 혈맹원 일괄 추가 (v10.4) — 두 단계다.
 *
 *   op:'analyze' → 아무것도 쓰지 않고 **판정만** 한다 (신규·이미있음·중복·개명후보·확인필요)
 *   op:'apply'   → 관리자가 표를 보고 확정한 것만 실행한다
 *
 * 판정을 앱에서만 하면 앱을 고쳐 우회할 수 있어서, 실제 판정은 시트가 한다.
 * 여기서는 형식만 걸러 시트로 넘긴다.
 *
 * ★ confirm 은 절대 서버가 채우지 않는다. 사용자가 실제로 누른 값만
 *   그대로 전달한다 — 채워 넣으면 재확인 절차가 통째로 무의미해진다.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: {
    op?: unknown;
    text?: unknown;
    base64?: unknown;
    entries?: unknown;
    server?: unknown;
    email?: unknown;
    confirm?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const op = String(body.op ?? 'analyze');

  if (op === 'analyze') {
    const text = String(body.text ?? '');
    const base64 = String(body.base64 ?? '');
    if (!text.trim() && !base64) {
      return Response.json({ ok: false, msg: '명단을 붙여넣거나 사진을 첨부해주세요.' }, { status: 400 });
    }
    if (text.length > 20_000) {
      return Response.json({ ok: false, msg: '붙여넣은 내용이 너무 깁니다.' }, { status: 400 });
    }
    // 앱이 알아서 줄여 보내지만, 손으로 만든 요청까지 통과시킬 이유는 없다
    if (base64.length > 3_500_000) {
      return Response.json(
        { ok: false, msg: '사진이 너무 큽니다. 명단 부분만 잘라서 다시 찍어주세요.' },
        { status: 413 },
      );
    }
    // 판정은 읽기만 한다 — 캐시를 건드릴 이유가 없다
    const res = await callGas('analyzeMembers', { text, base64 }, { timeoutMs: 55_000 });
    return Response.json(res, { status: res.ok ? 200 : 400 });
  }

  if (op === 'apply') {
    const raw = Array.isArray(body.entries) ? body.entries : [];
    if (raw.length === 0) {
      return Response.json({ ok: false, msg: '처리할 대상이 없습니다.' }, { status: 400 });
    }
    if (raw.length > 200) {
      return Response.json({ ok: false, msg: '한 번에 처리하기에 너무 많습니다.' }, { status: 400 });
    }

    const entries = raw.map((e) => {
      const item = (e ?? {}) as { name?: unknown; op?: unknown; from?: unknown };
      const kind = String(item.op ?? 'skip');
      return {
        name: String(item.name ?? '').trim(),
        op: kind === 'add' || kind === 'rename' ? kind : 'skip',
        from: String(item.from ?? '').trim(),
      };
    });

    // 개명인데 대상이 없으면 시트까지 갈 이유가 없다 — 여기서 걸러 실수를 빨리 알린다
    const brokenRename = entries.find((e) => e.op === 'rename' && !e.from);
    if (brokenRename) {
      return Response.json(
        { ok: false, msg: `"${brokenRename.name}" 을(를) 개명으로 지정했는데 바뀌기 전 이름이 없습니다.` },
        { status: 400 },
      );
    }
    if (entries.some((e) => e.op !== 'skip' && !e.name)) {
      return Response.json({ ok: false, msg: '이름이 비어 있는 항목이 있습니다.' }, { status: 400 });
    }

    const server = String(body.server ?? '').trim();

    const res = await callGas(
      'bulkAddMembers',
      // ★ confirm 은 사용자가 누른 값 그대로 — 서버가 true 로 만들지 않는다
      { entries, server, email: String(body.email ?? '').trim(), confirm: body.confirm === true },
      { timeoutMs: 55_000, withState: true },
    );
    if (res.ok) syncStateCache(res);

    // needsConfirm 은 오류가 아니라 "한 번 더 물어보라"는 신호다
    return Response.json(res, { status: res.ok || res.needsConfirm ? 200 : 400 });
  }

  return Response.json({ ok: false, msg: '알 수 없는 요청입니다.' }, { status: 400 });
}
