import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { invalidate } from '@/lib/cache';
import { syncStateCache } from '@/lib/fresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 연합 정산 — 혈맹 아이템과 같은 순서로 2단계다 (v10.3, v11.0 에서 확장).
 *
 *   op:'register' → 아이템명 + **서버별 참여 인원** + 인증샷 여러 장.  상태 ⏳미분배
 *   op:'credit'   → 그 묶음에 판매금액을 넣어 혈비 공제 후 인원수 비례로 서버에 누적.
 *
 * 레이드 직후엔 아직 안 팔려서 금액을 모르는 것이 정상이다. 그때 금액을
 * 요구하면 등록 자체가 미뤄지고 그 사이에 인증샷을 잃어버린다.
 * 인증샷은 없어도 등록된다 — 증거를 못 찍었다고 기록을 통째로 막을 이유가 없다.
 *
 * 정산은 혈맹운영비 **잔액**을 실제로 늘린다 (혈비 10% + 원단위 잔여).
 * 그래서 상태 캐시도 함께 맞춰준다 (규칙 6-2·6-3).
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: {
    op?: unknown;
    item?: unknown;
    entries?: unknown;
    photoLinks?: unknown;
    group?: unknown;
    amount?: unknown;
    email?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim();
  // op 를 안 보내면 등록으로 본다 (앱 구버전 호환)
  const op = String(body.op ?? 'register');

  if (op === 'register') {
    const item = String(body.item ?? '').trim();
    if (!item) return Response.json({ ok: false, msg: '아이템명을 입력해주세요.' }, { status: 400 });

    const raw = Array.isArray(body.entries) ? body.entries : [];
    const entries: { server: string; people: number }[] = [];
    for (const e of raw) {
      const o = (e ?? {}) as { server?: unknown; people?: unknown };
      const server = String(o.server ?? '').trim();
      if (!server) continue;
      const people = Number(o.people);
      if (!Number.isInteger(people) || people < 0) {
        return Response.json({ ok: false, msg: '인원수는 0 이상의 정수여야 합니다.' }, { status: 400 });
      }
      entries.push({ server, people });
    }
    if (entries.length === 0) {
      return Response.json({ ok: false, msg: '참여한 서버를 하나 이상 넣어주세요.' }, { status: 400 });
    }
    // 같은 서버를 두 줄로 넣으면 인원이 갈려 분배 비율이 틀어진다 (시트도 같은 판정을 한다)
    const seen = new Set<string>();
    for (const e of entries) {
      if (seen.has(e.server)) {
        return Response.json({ ok: false, msg: `${e.server}서버가 두 번 들어갔습니다.` }, { status: 400 });
      }
      seen.add(e.server);
    }

    // 인증샷은 선택이다. 없으면 빈 배열로 그대로 보낸다.
    const photoLinks = (Array.isArray(body.photoLinks) ? body.photoLinks : [])
      .map((u) => String(u ?? '').trim())
      .filter((u) => /^https?:\/\//.test(u));

    const res = await callGas('addAlliance', { item, entries, photoLinks, email }, { timeoutMs: 45_000 });
    if (res.ok) invalidate('alliance');
    return Response.json(res, { status: res.ok ? 200 : 400 });
  }

  // ➕ 참여 서버 추가 — 줄을 더하기만 한다. 기존 값은 시트가 못 바꾸게 막는다
  // (값을 고치는 것은 /api/master/alliance 의 몫이다)
  if (op === 'addServers') {
    const group = String(body.group ?? '').trim();
    if (!group) {
      return Response.json({ ok: false, msg: '기록을 찾을 수 없습니다.' }, { status: 400 });
    }
    const raw = Array.isArray(body.entries) ? body.entries : [];
    const entries: { server: string; people: number }[] = [];
    for (const e of raw) {
      const o = (e ?? {}) as { server?: unknown; people?: unknown };
      const server = String(o.server ?? '').trim();
      if (!server) continue;
      const people = Number(o.people);
      if (!Number.isInteger(people) || people < 0) {
        return Response.json({ ok: false, msg: '인원수는 0 이상의 정수여야 합니다.' }, { status: 400 });
      }
      entries.push({ server, people });
    }
    if (entries.length === 0) {
      return Response.json({ ok: false, msg: '추가할 서버를 하나 이상 넣어주세요.' }, { status: 400 });
    }
    const dup = new Set<string>();
    for (const e of entries) {
      if (dup.has(e.server)) {
        return Response.json({ ok: false, msg: `${e.server}서버가 두 번 들어갔습니다.` }, { status: 400 });
      }
      dup.add(e.server);
    }

    const res = await callGas('addAllianceServers', { group, entries, email }, { timeoutMs: 45_000 });
    if (res.ok) invalidate('alliance');
    return Response.json(res, { status: res.ok ? 200 : 400 });
  }

  if (op === 'credit') {
    const group = String(body.group ?? '').trim();
    const amount = Number(String(body.amount ?? '').replace(/,/g, ''));

    if (!group) {
      return Response.json({ ok: false, msg: '정산할 기록을 찾을 수 없습니다.' }, { status: 400 });
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      return Response.json({ ok: false, msg: '금액은 양의 정수여야 합니다.' }, { status: 400 });
    }

    const res = await callGas('creditAlliance', { group, amount, email }, { timeoutMs: 45_000, withState: true });
    if (res.ok) {
      invalidate('alliance');
      syncStateCache(res);
    }
    return Response.json(res, { status: res.ok ? 200 : 400 });
  }

  return Response.json({ ok: false, msg: '알 수 없는 요청입니다.' }, { status: 400 });
}

/** 연합 기록 삭제 — 등록만 된 건도, 정산까지 끝난 건도 묶음 단위로 지운다 */
export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { group?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const group = String(body.group ?? '').trim();
  if (!group) {
    return Response.json({ ok: false, msg: '삭제할 기록을 찾을 수 없습니다.' }, { status: 400 });
  }

  // 이미 정산된 건이면 시트가 혈맹운영비 적립을 되돌린다 — 잔액이 바뀌므로 상태를 함께 받아온다
  const res = await callGas('deleteAlliance', { group, email: String(body.email ?? '').trim() }, { withState: true });
  if (res.ok) {
    invalidate('alliance');
    syncStateCache(res);
  }

  return Response.json(res, { status: res.ok ? 200 : 400 });
}
