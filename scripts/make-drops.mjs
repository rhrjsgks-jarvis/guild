/**
 * 보스 드롭표를 **아이템 → 보스** 로 뒤집는다 — `npm run drops`
 *
 * `manual/boss-drops.tsv` 는 공식 게임정보에서 뽑은 `보스 → 주는 아이템` 표다.
 * 아이템을 고른 뒤 보스 칸을 채우려면 반대 방향이 필요하다.
 *
 * ★ 짝짓기는 **국문 이름 정확 일치**로만 한다. 드롭표의 이름도 [용어] 시트의
 *   이름도 같은 공식 API(ko-KR)에서 왔으니 글자가 같아야 정상이다.
 *   안 맞으면 **버린다** — 비슷한 이름에 갖다 붙이면 엉뚱한 보스가 기록에 남고,
 *   그건 아무도 못 알아챈다 (규칙 7).
 * ★ **사전에 있는 것만** 남긴다. 사전에 없는 이름은 화면에서 고를 수가 없어
 *   실어봐야 폰으로 내려보내는 짐만 된다.
 * ★ 보스도 **사전에 있는 보스만** 남긴다. 없는 보스를 제안하면 눌렀을 때
 *   검정 테두리(사전에 없음)가 되어 오히려 잘못 넣은 것처럼 보인다.
 *
 * 결과는 `lib/drops.ts`. 손으로 고치지 마세요 — 다시 돌리면 덮어씁니다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.argv[2] || 'https://lineagewguildmanager.vercel.app';

/** 사전이 이름을 맞추는 방식과 같은 규칙 (lib/terms.ts 의 normTerm) */
const norm = (s) => String(s ?? '').replace(/\s+/g, '').trim().toLowerCase();

/* ── ① 지금 사전에 무엇이 있는지 ─────────────────────────────── */
const res = await fetch(`${APP}/api/terms?fresh=1`);
if (!res.ok) throw new Error(`용어를 읽지 못했습니다 (HTTP ${res.status})`);
const terms = (await res.json())?.data?.terms ?? [];
if (terms.length === 0) throw new Error('용어가 0건입니다 — 시트를 확인하세요.');

// 정규화 이름 → 시트에 적힌 그대로의 국문 (저장되는 이름은 언제나 국문이다)
const itemKo = new Map();
const bossKo = new Map();
for (const t of terms) {
  (t.cat === '보스' ? bossKo : itemKo).set(norm(t.ko), String(t.ko).trim());
}

/* ── ② 드롭표를 뒤집는다 ─────────────────────────────────────── */
const lines = readFileSync(resolve(ROOT, 'manual/boss-drops.tsv'), 'utf8').trim().split('\n').slice(1);
const byItem = new Map(); // 아이템 국문 → Set(보스 국문)
let pairs = 0;
const missItem = new Set();
const missBoss = new Set();

for (const line of lines) {
  const [bossRaw, , itemsRaw] = line.split('\t');
  const boss = bossKo.get(norm(bossRaw));
  if (!boss) {
    missBoss.add(String(bossRaw).trim());
    continue;
  }
  for (const chunk of String(itemsRaw ?? '').split('·')) {
    // `전설 제작 비법서(전설)` — 뒤의 등급 괄호를 뗀다
    const name = chunk.replace(/\([^)]*\)\s*$/, '').trim();
    if (!name) continue;
    const item = itemKo.get(norm(name));
    if (!item) {
      missItem.add(name);
      continue;
    }
    // 같은 보스가 같은 아이템을 여러 판본으로 주는 일이 흔하다 — Set 이 접는다
    if (!byItem.has(item)) byItem.set(item, new Set());
    if (!byItem.get(item).has(boss)) pairs += 1;
    byItem.get(item).add(boss);
  }
}

/* ── ③ 파일로 ────────────────────────────────────────────────── */
const sorted = [...byItem.entries()]
  .map(([item, set]) => [item, [...set].sort((a, b) => a.localeCompare(b, 'ko'))])
  .sort((a, b) => a[0].localeCompare(b[0], 'ko'));

const body = sorted.map(([item, bosses]) => `  ${JSON.stringify(item)}: ${JSON.stringify(bosses)},`).join('\n');
const only1 = sorted.filter(([, b]) => b.length === 1).length;

writeFileSync(
  resolve(ROOT, 'lib/drops.ts'),
  `/**
 * 아이템을 주는 보스 — **공식 게임정보에서 뽑은 표다.** (자동 생성)
 *
 *   npm run drops   ← 이 파일을 다시 만든다. 손으로 고치지 마세요.
 *
 * 원본은 \`manual/boss-drops.tsv\` (보스 → 주는 아이템) 이고, 그것을 뒤집었다.
 * [용어] 사전에 **양쪽 다 있는 것만** 남겼다 — 사전에 없는 이름을 제안하면
 * 눌렀을 때 검정 테두리가 되어 오히려 잘못 넣은 것처럼 보인다.
 *
 * ★ 여기 없는 아이템은 **모르는 것**이지 "보스가 없는 것"이 아니다.
 *   화면은 모를 때 아무 말도 하지 않는다 — 지어내지 않는다 (규칙 7).
 * ★ 시트에 넣지 않는 이유: 이건 길드 자료가 아니라 게임 자료다. 시트에 두면
 *   길드마다 같은 표를 따로 채워야 하고, 게임이 바뀔 때마다 전부 고쳐야 한다.
 */

/** 아이템 국문 → 그 아이템을 주는 보스 국문 (가나다순) */
export const ITEM_BOSSES: Record<string, string[]> = {
${body}
};

/**
 * 이 아이템을 주는 보스들. 모르면 **빈 배열**이다.
 *
 * 이름 비교는 사전과 같은 규칙을 쓴다 — \`불변의 목걸이\` 와 \`불변의목걸이\` 는
 * 같은 것이다 (규칙 4). 직접 \`ITEM_BOSSES[name]\` 로 찾으면 공백 하나에 빗나간다.
 */
export function bossesOf(item: string): string[] {
  const key = String(item ?? '').replace(/\\s+/g, '').trim().toLowerCase();
  if (!key) return [];
  for (const [ko, bosses] of Object.entries(ITEM_BOSSES)) {
    if (ko.replace(/\\s+/g, '').trim().toLowerCase() === key) return bosses;
  }
  return [];
}
`,
  'utf8',
);

console.log(`드롭표 ${lines.length}줄 → 아이템 ${sorted.length}종 · 짝 ${pairs}개`);
console.log(`  보스가 하나뿐인 아이템 ${only1}종 (자동으로 채울 수 있는 것)`);
console.log(`  사전에 없어 버린 아이템 ${missItem.size}종 · 보스 ${missBoss.size}종`);
if (missItem.size) console.log(`    예: ${[...missItem].slice(0, 5).join(' / ')}`);
if (missBoss.size) console.log(`    예: ${[...missBoss].slice(0, 5).join(' / ')}`);
console.log(`→ lib/drops.ts`);
