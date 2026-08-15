import { callGas } from '@/lib/gas';
import { lootMeta } from '@/lib/alliance';
import { requireAdmin } from '@/lib/auth';
import { syncStateCache } from '@/lib/fresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 아이템 등록 (⏳미분배로 저장) */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: {
    itemName?: unknown;
    participants?: unknown;
    photoLink?: unknown;
    photoLinks?: unknown;
    meta?: unknown;
    email?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const itemName = String(body.itemName ?? '').trim();
  const participants = Array.isArray(body.participants)
    ? body.participants.map((p) => String(p).trim()).filter(Boolean)
    : [];

  if (!itemName) return Response.json({ ok: false, msg: '아이템명을 입력해주세요.' }, { status: 400 });
  if (participants.length === 0) {
    return Response.json({ ok: false, msg: '참여 멤버를 한 명 이상 선택해주세요.' }, { status: 400 });
  }

  // v11.0 부터 한 아이템에 인증샷 여러 장. photoLink(한 장)는 옛 앱 호환으로 남긴다.
  const photoLinks = (Array.isArray(body.photoLinks) ? body.photoLinks : [])
    .map((u) => String(u ?? '').trim())
    .filter((u) => /^https?:\/\//.test(u));

  const res = await callGas(
    'register',
    {
      itemName,
      participants,
      photoLink: String(body.photoLink ?? '').trim(),
      photoLinks,
      // 레이드일·보스·루팅 (v11.6) — 값 판정은 시트가 한다 (규칙 5-3)
      meta: lootMeta(body.meta),
      email: String(body.email ?? '').trim(),
    },
    { timeoutMs: 45_000, withState: true },
  );

  syncStateCache(res);
  return Response.json(res, { status: res.ok ? 200 : 400 });
}
