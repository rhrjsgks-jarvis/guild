import { callGas } from '@/lib/gas';
import { requireAdmin } from '@/lib/auth';
import { invalidate } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/**
 * 보스 시간표 편집 (v10.8) — 관리자·마스터관리자 모두 할 수 있다.
 *
 * 되돌릴 수 있는 작업이라(잘못 지웠으면 한 줄 다시 넣으면 끝) 마스터 전용으로
 * 두지 않았다. 정산 데이터에는 전혀 손대지 않는다 — 시간표만 바뀐다.
 */

/** 요일(1=월 … 7=일)과 시간('HH:MM')은 여기서 형식만 본다. 판정은 시트가 한다. */
function readBody(body: {
  day?: unknown;
  time?: unknown;
  boss?: unknown;
  note?: unknown;
}): { ok: true; day: number; time: string; boss: string; note: string } | { ok: false; msg: string } {
  const day = Number(body.day);
  if (!Number.isInteger(day) || day < 1 || day > 7) {
    return { ok: false, msg: '요일을 골라주세요.' };
  }
  const time = String(body.time ?? '').trim();
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) {
    return { ok: false, msg: '시간을 24시간 형식(예 20:20)으로 넣어주세요.' };
  }
  const boss = String(body.boss ?? '').trim();
  if (!boss) return { ok: false, msg: '보스 이름을 입력해주세요.' };
  if (boss.length > 40) return { ok: false, msg: '보스 이름이 너무 깁니다 (40자 이내).' };

  const note = String(body.note ?? '').trim();
  if (note.length > 60) return { ok: false, msg: '비고가 너무 깁니다 (60자 이내).' };

  return { ok: true, day, time, boss, note };
}

async function parse(req: Request) {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 새 보스 한 줄 추가 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await parse(req);
  if (!body) return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });

  const f = readBody(body);
  if (!f.ok) return Response.json({ ok: false, msg: f.msg }, { status: 400 });

  const res = await callGas('addRaid', {
    day: f.day,
    time: f.time,
    boss: f.boss,
    note: f.note,
    email: String(body.email ?? '').trim(),
  });
  if (res.ok) invalidate('raid');
  return Response.json(res, { status: res.ok ? 200 : 400 });
}

/** 기존 줄 수정 — 요일·시간·보스·비고를 통째로 덮어쓴다 */
export async function PATCH(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await parse(req);
  if (!body) return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });

  const row = Number(body.row);
  if (!Number.isInteger(row) || row < 2) {
    return Response.json({ ok: false, msg: '수정할 기록을 찾을 수 없습니다.' }, { status: 400 });
  }

  const f = readBody(body);
  if (!f.ok) return Response.json({ ok: false, msg: f.msg }, { status: 400 });

  const res = await callGas('updateRaid', {
    row,
    day: f.day,
    time: f.time,
    boss: f.boss,
    note: f.note,
    email: String(body.email ?? '').trim(),
  });
  if (res.ok) invalidate('raid');
  return Response.json(res, { status: res.ok ? 200 : 400 });
}

/** 한 줄 삭제 */
export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await parse(req);
  if (!body) return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });

  const row = Number(body.row);
  if (!Number.isInteger(row) || row < 2) {
    return Response.json({ ok: false, msg: '삭제할 기록을 찾을 수 없습니다.' }, { status: 400 });
  }

  const res = await callGas('deleteRaid', { row, email: String(body.email ?? '').trim() });
  if (res.ok) invalidate('raid');
  return Response.json(res, { status: res.ok ? 200 : 400 });
}
