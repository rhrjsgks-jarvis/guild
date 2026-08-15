import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { invalidate } from '@/lib/cache';
import { syncStateCache } from '@/lib/fresh';
import { lootMeta, parseEntries, photoLinks as parsePhotos } from '@/lib/alliance';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 연합 정산 — 혈맹 아이템과 같은 순서로 2단계다 (v10.3, v11.0 에서 확장).
 *
 *   op:'register'   → 아이템명 + **서버별 참여 인원 · 서버별 인증샷**.  상태 ⏳미분배
 *   op:'addServers' → 참여 서버 줄만 더한다 (기존 값은 못 고친다)
 *   op:'edit'       → **아직 금액을 안 넣은 건만** 고친다 (v11.3)
 *   op:'credit'     → 그 묶음에 판매금액을 넣어 혈비 공제 후 인원수 비례로 서버에 누적.
 *
 * ★ op:'edit' 로 **정산된 건은 못 고친다.** 그건 혈맹운영비 잔액이 실제로 움직이는
 *   작업이라 마스터 전용이다 (/api/master/alliance). 여기서는 `asMaster: false` 를
 *   보내고, 실제 판정은 **시트가** 한다 — 이 라우트를 직접 불러도 뚫리지 않는다.
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
    meta?: unknown;
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

  /**
   * 🏷️ 레이드일·보스·루팅서버·루팅캐릭터만 고친다 (v11.6) — **관리자 이상**.
   *
   * 돈을 다루는 edit 와 일부러 나눴다. 시트의 api_setAllianceMeta 는 이 4칸 말고는
   * 손댈 길이 없어서, 정산이 끝난 건이라도 관리자에게 열 수 있다.
   */
  if (op === 'setMeta') {
    const group = String(body.group ?? '').trim();
    if (!group) return Response.json({ ok: false, msg: '기록을 찾을 수 없습니다.' }, { status: 400 });
    const res = await callGas('setAllianceMeta', { group, meta: lootMeta(body.meta), email });
    if (res.ok) invalidate('alliance');
    return Response.json(res, { status: res.ok ? 200 : 400 });
  }

  if (op === 'register') {
    const item = String(body.item ?? '').trim();
    if (!item) return Response.json({ ok: false, msg: '아이템명을 입력해주세요.' }, { status: 400 });

    const parsed = parseEntries(body.entries, '참여한 서버를 하나 이상 넣어주세요.');
    if ('error' in parsed) return Response.json({ ok: false, msg: parsed.error }, { status: 400 });

    // 인증샷은 선택이고 줄마다 따로 붙는다. photoLinks 는 묶음 공용(옛 앱 호환)
    const res = await callGas(
      'addAlliance',
      // 레이드일·보스·루팅 (v11.6) — 값 판정(서버는 01~12, 나머지는 자유)은 시트가 한다 (규칙 5-3)
      { item, entries: parsed.entries, photoLinks: parsePhotos(body.photoLinks), email, meta: lootMeta(body.meta) },
      { timeoutMs: 45_000 },
    );
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
    const parsed = parseEntries(body.entries, '추가할 서버를 하나 이상 넣어주세요.');
    if ('error' in parsed) return Response.json({ ok: false, msg: parsed.error }, { status: 400 });

    const res = await callGas(
      'addAllianceServers',
      { group, entries: parsed.entries, email, photoLinks: parsePhotos(body.photoLinks) },
      { timeoutMs: 45_000 },
    );
    if (res.ok) invalidate('alliance');
    return Response.json(res, { status: res.ok ? 200 : 400 });
  }

  /*
   * ✏️ 미정산 건 수정 (v11.3) — **관리자**도 할 수 있다.
   *
   * 아직 금액이 하나도 안 들어간 건이라 다이아가 움직이지 않는다. 틀리면 고치면 끝이고,
   * 그때마다 마스터를 불러야 하면 등록 자체가 미뤄진다.
   * 정산된 건은 시트가 거부한다 — 여기서 asMaster 를 false 로 **고정**해 보내고,
   * 실제 판정은 시트가 상태를 직접 보고 한다.
   */
  if (op === 'edit') {
    const group = String(body.group ?? '').trim();
    if (!group) return Response.json({ ok: false, msg: '기록을 찾을 수 없습니다.' }, { status: 400 });

    const item = String(body.item ?? '').trim();
    if (!item) return Response.json({ ok: false, msg: '아이템명을 입력해주세요.' }, { status: 400 });

    const parsed = parseEntries(body.entries, '참여한 서버를 하나 이상 넣어주세요.');
    if ('error' in parsed) return Response.json({ ok: false, msg: parsed.error }, { status: 400 });

    const res = await callGas(
      'editAlliance',
      {
        group,
        item,
        entries: parsed.entries,
        // 금액은 정산된 건에서만 쓰는 값이다 — 관리자 경로에서는 아예 보내지 않는다
        amount: null,
        email,
        // confirm 은 보내지 않는다 — 되묻기가 필요한 것은 정산된 건뿐이고,
        // 그건 애초에 이 경로로 들어올 수 없다 (시트가 막는다)
        asMaster: false,
      },
      { timeoutMs: 45_000 },
    );
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
