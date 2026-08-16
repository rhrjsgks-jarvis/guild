/**
 * 공식 아이템 아이콘 주소 모으기 — `npm run icons:official`
 *
 * 리니지W 공식 게임정보(api-lineagew.plaync.com)가 아이템마다 그림 주소를 준다.
 * 그것을 [용어] 시트의 `이미지` 칸에 넣을 수 있는 형태로 뽑아낸다.
 *
 * ★ **짝짓기는 국문 이름 정확 일치로만 한다.** 사전의 국문은 애초에 이 API 의
 *   ko-KR 응답에서 가져온 값이라 글자가 같아야 정상이다. 안 맞으면 **비운다** —
 *   비슷한 이름에 갖다 붙이면 엉뚱한 아이템 그림이 붙고, 아무도 못 알아챈다 (규칙 7).
 * ★ 한 이름이 여러 id 로 나오는 것은 흔하다 (같은 아이템의 판본 중복). 그것만으로는
 *   포기하지 않는다 — 판단할 대상은 id 가 아니라 **그림**이다. 그림이 하나로 모이면
 *   고를 것이 없으니 그대로 쓰고, **갈리면 비운다.**
 * ★ 보스는 그림이 안 나온다. 공식 API 에 NPC 그림을 주는 길이 없다 —
 *   그래서 보스 줄은 비워 둔다. 없는 것을 지어내지 않는다.
 *
 * 이 스크립트는 **읽기만** 한다. 시트에 넣는 것은 사람이 확인하고 따로 한다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'manual');
const APP = process.argv[2] || 'https://lineagewguildmanager.vercel.app';
const API = 'https://api-lineagew.plaync.com';

/** 사전이 이름을 맞추는 방식과 같은 규칙 (lib/terms.ts 의 normTerm) */
const norm = (s) => String(s ?? '').replace(/\s+/g, '').trim().toLowerCase();

/* ── ① 공식 API 에서 전설·신화 아이템을 모두 받는다 ────────────── */
const official = new Map(); // 정규화 이름 → { name, ids:Set, images:Set }

for (const gradeId of [5, 6]) {
  let page = 1;
  let last = 1;
  do {
    const url = `${API}/search/items?locale=ko-KR&gradeIds=${gradeId}&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`공식 API 응답 실패 (HTTP ${res.status}) — ${url}`);
    // 공식 API 는 `contents` 를 최상위에 준다. 다른 엔드포인트는 `data` 로 감싸므로
    // 둘 다 받아 준다 — 한쪽만 보면 조용히 0건이 되어 "없는 줄" 알게 된다
    const raw = await res.json();
    const d = raw?.contents ? raw : (raw?.data ?? {});
    last = d.pagination?.lastPage ?? 1;
    for (const it of d.contents ?? []) {
      const key = norm(it.name);
      const img = String(it.image ?? '').trim();
      if (!key || !img) continue;
      const hit = official.get(key);
      if (hit) {
        hit.ids.add(it.id);
        hit.images.add(img);
      } else {
        official.set(key, { name: it.name, ids: new Set([it.id]), images: new Set([img]) });
      }
    }
    page += 1;
  } while (page <= last);
  console.log(`  공식 ${gradeId === 5 ? '전설' : '신화'} — ${last}쪽`);
}
console.log(`공식 아이템 ${official.size}종 (그림 있는 것만)`);
// 0건이면 응답 모양이 바뀐 것이다. 그대로 두면 "짝지을 게 없다"로 보여 조용히 끝난다
if (official.size === 0) throw new Error('공식 API 에서 아이템을 하나도 못 받았습니다 — 응답 모양이 바뀌었는지 확인하세요.');

/* ── ② 지금 시트에 있는 용어를 읽는다 ──────────────────────────── */
const tRes = await fetch(`${APP}/api/terms?fresh=1`);
if (!tRes.ok) throw new Error(`용어를 읽지 못했습니다 (HTTP ${tRes.status})`);
const terms = (await tRes.json())?.data?.terms ?? [];
if (terms.length === 0) throw new Error('용어가 0건입니다 — 시트를 확인하세요.');

/* ── ③ 짝짓기 ─────────────────────────────────────────────────── */
const matched = [];
const missed = [];
const ambiguous = [];
let already = 0;

for (const t of terms) {
  if (t.cat === '보스') continue; // 공식 API 에 NPC 그림이 없다
  const hit = official.get(norm(t.ko));
  if (!hit) {
    missed.push(t);
    continue;
  }
  /**
   * 같은 이름이 여러 id 로 나오는 것은 흔하다 (같은 아이템의 판본 중복).
   * 문제가 되는 것은 id 가 여럿인 게 아니라 **그림이 갈리는 것**이다.
   * 그림이 하나로 모이면 고를 것이 없으니 그대로 쓰고, 갈리면 비운다 (규칙 7).
   */
  if (hit.images.size > 1) {
    ambiguous.push({ ...t, ids: [...hit.ids], images: [...hit.images] });
    continue;
  }
  const img = [...hit.images][0];
  if (String(t.img ?? '').trim() === img) already += 1;
  matched.push({ row: t.row, cat: t.cat, ko: t.ko, zh: t.zh, en: t.en, tier: t.tier, note: t.note, img });
}

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'icons.json'), JSON.stringify(matched, null, 1) + '\n', 'utf8');
writeFileSync(
  resolve(OUT, 'icons.tsv'),
  ['한국어\t이미지', ...matched.map((m) => `${m.ko}\t${m.img}`)].join('\n') + '\n',
  'utf8',
);

const bosses = terms.filter((t) => t.cat === '보스').length;
console.log(`\n용어 ${terms.length}건`);
console.log(`  보스        ${bosses}건 — 공식 그림 없음 (비워 둡니다)`);
console.log(`  ✅ 짝지음   ${matched.length}건 (이미 같은 값 ${already}건)`);
console.log(`  ⬜ 못 찾음  ${missed.length}건`);
console.log(`  ⚠️ 그림이 갈림 ${ambiguous.length}건 — 고를 근거가 없어 비웁니다`);
if (missed.length) console.log(`     예: ${missed.slice(0, 8).map((t) => t.ko).join(' / ')}`);
if (ambiguous.length) console.log(`     예: ${ambiguous.slice(0, 5).map((t) => `${t.ko}(그림 ${t.images.length}종)`).join(' / ')}`);
console.log(`\n→ manual/icons.tsv · manual/icons.json`);
