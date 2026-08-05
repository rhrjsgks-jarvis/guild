import { callGas } from '@/lib/gas';
import { cached, invalidate } from '@/lib/cache';
import { isAdmin } from '@/lib/auth';
import { clientKey, rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** 게시판 조회 — 누구나 */
export async function GET() {
  const res = await cached('posts', 15_000, () => callGas('posts'), (r) => r.ok);
  return Response.json(res, { status: res.ok ? 200 : 502 });
}

/**
 * 글쓰기 — 혈맹원 누구나 (PIN 불필요).
 *
 * 이 라우트는 앱에서 유일하게 인증 없이 쓰기가 되는 경로다. 그래서
 *  · 공지(isNotice)는 관리자 세션이 있을 때만 붙는다 — 요청 본문은 믿지 않는다
 *  · 한 기기당 10분에 5건으로 제한한다
 *  · 길이 제한은 Apps Script 쪽에서도 한 번 더 검사한다
 * 정산 데이터(잔액·아이템)에는 접근하지 않는다.
 */
export async function POST(req: Request) {
  const limit = rateLimit(`board:${clientKey(req)}`, 5, 10 * 60_000);
  if (!limit.ok) {
    return Response.json(
      { ok: false, msg: `글쓰기가 너무 잦습니다. ${limit.retryAfterSec}초 후에 다시 시도해주세요.` },
      { status: 429 },
    );
  }

  let body: { title?: unknown; body?: unknown; author?: unknown; notice?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, msg: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const title = String(body.title ?? '').trim();
  const text = String(body.body ?? '').trim();
  if (!title) return Response.json({ ok: false, msg: '제목을 입력해주세요.' }, { status: 400 });
  if (title.length > 60) return Response.json({ ok: false, msg: '제목은 60자 이내여야 합니다.' }, { status: 400 });
  if (text.length > 1500) return Response.json({ ok: false, msg: '내용은 1500자 이내여야 합니다.' }, { status: 400 });

  // ★ 공지 권한은 쿠키로만 결정한다. 요청 본문의 notice 값은 그 자체로는 아무 힘이 없다.
  const isNotice = body.notice === true && (await isAdmin());

  const res = await callGas('addPost', {
    title,
    body: text,
    author: String(body.author ?? '').trim(),
    isNotice,
  });

  if (res.ok) {
    invalidate('posts');
    invalidate('state'); // 헤더 공지가 바뀔 수 있다
  }
  return Response.json(res, { status: res.ok ? 200 : 400 });
}
