export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * 인증샷 중계 (v11.10.1) — 누구나 볼 수 있다 (조회 전용).
 *
 * 중국 본토에서는 `drive.google.com` 이 막혀 있어서, 폰이 썸네일을 직접 부르면
 * 사진이 하나도 안 열린다. 정산 데이터가 그렇듯 사진도 **서버가 대신 받아** 건넨다
 * — 폰은 우리 주소 하나에만 닿으면 된다.
 *
 * ★ 드라이브 파일 ID 만 받는다. 아무 주소나 받으면 남의 사이트를 대신 긁어 주는
 *   열린 중계기가 된다.
 * ★ 사진은 한 번 올라가면 바뀌지 않으므로 CDN 에 길게 둔다. 같은 사진을 여러 명이
 *   열어도 드라이브까지 가는 것은 처음 한 번이다.
 * ★ 못 받아왔으면 실패로 돌려준다. 화면(PhotoStrip)이 "안 열림"을 띄운다 (규칙 5-10).
 */
const ID = /^[A-Za-z0-9_-]{10,128}$/;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const id = q.get('id') ?? '';
  if (!ID.test(id)) return new Response('bad id', { status: 400 });
  // 너비는 몇 가지로 묶는다 — 아무 값이나 받으면 같은 사진이 캐시에 수백 벌 생긴다
  const want = Number(q.get('w')) || 1200;
  const w = [120, 400, 1200, 1600].find((x) => x >= want) ?? 1600;

  let up: Response;
  try {
    up = await fetch(`https://drive.google.com/thumbnail?id=${id}&sz=w${w}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return new Response('upstream unreachable', { status: 502 });
  }
  const type = up.headers.get('content-type') ?? '';
  // 비공개 파일이면 드라이브가 로그인 페이지(HTML)를 준다 — 그림이 아니면 실패다
  if (!up.ok || !type.startsWith('image/')) {
    return new Response('not an image', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  return new Response(up.body, {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=86400, s-maxage=2592000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
