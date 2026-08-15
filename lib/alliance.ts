import 'server-only';

/**
 * 연합 서버 줄 파싱 (v11.3) — **관리자 라우트와 마스터 라우트가 한 벌을 쓴다.**
 *
 * 두 벌로 두면 한쪽만 고쳐져서 "등록에서는 되는데 정정에서는 안 되는" 상태가 된다.
 * 실제로 v11.1~v11.2 에서 두 라우트가 같은 검사를 각자 적어두고 있었다.
 *
 * ★ 인증샷은 **줄마다** 받는다. 어느 서버의 사진인지는 사람이 고르는 것이고,
 *   시스템이 짐작해서 흩뿌리면 틀린 값이 박힌다 (CLAUDE.md 규칙 7).
 * ★ 여기서 하는 것은 형식 검사뿐이다. "이미 정산된 건인가", "누가 고칠 수 있는가"는
 *   시트가 판정한다 — 라우트를 직접 부르는 길이 있으므로 여기서 끝내면 안 된다.
 */

export type AllyEntry = { server: string; people: number; photos: string[] };

/** 드라이브 주소만 통과시킨다 (앱이 아무 문자열이나 보내도 시트에 안 들어가게) */
export function photoLinks(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : [])
    .map((u) => String(u ?? '').trim())
    .filter((u) => /^https?:\/\//.test(u));
}

export function parseEntries(raw: unknown, emptyMsg: string): { entries: AllyEntry[] } | { error: string } {
  const list = Array.isArray(raw) ? raw : [];
  const entries: AllyEntry[] = [];

  for (const e of list) {
    const o = (e ?? {}) as { server?: unknown; people?: unknown; photos?: unknown };
    const server = String(o.server ?? '').trim();
    if (!server) continue;
    const people = Number(o.people);
    if (!Number.isInteger(people) || people < 0) {
      return { error: '인원수는 0 이상의 정수여야 합니다.' };
    }
    entries.push({ server, people, photos: photoLinks(o.photos) });
  }

  if (entries.length === 0) return { error: emptyMsg };

  // 같은 서버를 두 줄로 넣으면 인원이 갈려 분배 비율이 틀어진다 (시트도 같은 판정을 한다)
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.server)) return { error: `${e.server}서버가 두 번 들어갔습니다.` };
    seen.add(e.server);
  }

  return { entries };
}
