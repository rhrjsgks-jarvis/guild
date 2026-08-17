/**
 * 클로드 디자인에 올릴 묶음을 만든다 — `npm run design`
 *
 * ★ **부품의 원본은 언제나 `app/globals.css` 다.** 이 스크립트는 그것을 그대로
 *   복사해 올 뿐, 디자인용으로 따로 손보지 않는다. 두 벌로 두면 어느 쪽이
 *   진짜인지 아무도 모르게 되고, 디자인 시스템은 그 순간 쓸모가 없어진다
 *   (분배 산식을 두 곳에 두지 않는 것과 같은 이유 — 규칙 1).
 * ★ 미리보기 HTML(`design/components/*.html`)만 사람이 쓴다. 거기서는 클래스
 *   이름만 빌려 쓰고 색·모서리를 다시 정하지 않는다.
 */
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'design');

/* ── ① 앱 CSS 를 그대로 복사 ── */
copyFileSync(resolve(ROOT, 'app/globals.css'), resolve(OUT, 'app.css'));

/* ── ② 토큰만 따로 뽑아 둔다 (색 카드가 이것만 읽는다) ── */
const css = readFileSync(resolve(ROOT, 'app/globals.css'), 'utf8');
const root = (css.match(/^:root \{[\s\S]*?\n\}/m) ?? [])[0];
const dark = (css.match(/@media \(prefers-color-scheme: dark\) \{[\s\S]*?\n {2}\}\n\}/m) ?? [])[0];
if (!root || !dark) throw new Error('globals.css 에서 토큰 블록을 찾지 못했습니다.');
writeFileSync(resolve(OUT, 'tokens.css'), `${root}\n\n${dark}\n`, 'utf8');

/* ── ③ 카드가 실제로 붙어 있는지 확인 ──
   @dsCard 표식이 없으면 클로드 디자인 화면에 그 부품이 아예 안 나온다.
   조용히 빠지면 "올렸는데 안 보인다"가 되므로 여기서 막는다. */
const dir = resolve(OUT, 'components');
const files = readdirSync(dir).filter((f) => f.endsWith('.html'));
if (files.length === 0) throw new Error('design/components 에 미리보기가 없습니다.');

const cards = [];
for (const f of files) {
  const head = readFileSync(resolve(dir, f), 'utf8').split('\n')[0];
  const m = head.match(/<!--\s*@dsCard\s+group="([^"]+)"\s*-->/);
  if (!m) throw new Error(`${f} 첫 줄에 @dsCard 표식이 없습니다.`);
  cards.push({ file: f, group: m[1] });
}

console.log(`\n🎨 디자인 묶음 (design/)\n`);
console.log(`  app.css     ${(css.length / 1024).toFixed(0)}KB — app/globals.css 복사본`);
console.log(`  tokens.css  ${((root.length + dark.length) / 1024).toFixed(1)}KB`);
for (const c of cards) console.log(`  ${c.file.padEnd(16)} ${c.group}`);
console.log(`\n총 ${cards.length}장\n`);
