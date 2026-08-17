/**
 * 앱 안 설명서에 넣을 **줄인 화면** — `npm run guide:shots`
 *
 * 촬영본(manual/shots)은 폰 화면을 2배 해상도로 찍은 것이라 장당 250KB 가 넘는다.
 * 그대로 앱에 실으면 설명서를 여는 순간 몇 MB 를 받아오게 된다.
 *
 * ★ 가로 420px 로 줄여 `public/guide/` 에 넣는다. 설명서에서 실제로 그려지는
 *   크기가 그 정도라, 더 큰 그림은 데이터만 쓰고 눈에는 차이가 없다.
 * ★ 서비스워커는 정해진 5개만 미리 받는다(SHELL). 여기 그림은 **설명서를 열 때만**
 *   내려온다 — 안 여는 사람은 한 장도 받지 않는다.
 * ★ 촬영본과 마찬가지로 **모의 데이터**다. 혈맹원 실명·실제 금액이 앱 번들에
 *   들어가는 일이 없다.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'manual/shots');
const OUT = resolve(ROOT, 'public/guide');
const WIDTH = 420;

if (!existsSync(SRC)) throw new Error('촬영본이 없습니다 — 먼저 npm run manual:shots 를 돌리세요.');

/** 설명서에 실제로 쓰는 것만 옮긴다. 안 쓰는 그림을 앱에 실을 이유가 없다 */
const WANTED = [
  'home', 'balance', 'items', 'alliance', 'raid', 'me', 'board', 'items-zh',
  'admin-locked', 'admin-unlocked', 'items-admin', 'distribute',
  'admin-roster', 'admin-terms', 'admin-tools', 'loot-edit',
];

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.png')) rmSync(resolve(OUT, f));

const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const page = await ctx.newPage();

console.log('\n🖼️  설명서용 줄인 화면\n');
let total = 0;

for (const name of WANTED) {
  const src = resolve(SRC, `${name}.png`);
  if (!existsSync(src)) throw new Error(`촬영본이 없습니다: ${name}.png`);

  /*
   * 브라우저에 그려서 줄인다 — 그림 처리 라이브러리를 새로 들이지 않는다.
   * ★ `setContent` 로 만든 페이지(about:blank)에서는 크로미움이 file:// 그림을
   *   **막는다.** 촬영본과 **같은 폴더에** 임시 문서를 두고 그것을 열어야 한다.
   */
  const tmp = resolve(SRC, '_resize.html');
  writeFileSync(
    tmp,
    `<meta charset="utf-8"><style>*{margin:0;padding:0}img{width:${WIDTH}px;display:block}</style>` +
      `<img src="./${name}.png">`,
    'utf8',
  );
  await page.setViewportSize({ width: WIDTH, height: 100 });
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const i = document.querySelector('img');
    return i && i.complete && i.naturalWidth > 0;
  });
  const h = await page.evaluate(() => document.querySelector('img').getBoundingClientRect().height);
  await page.setViewportSize({ width: WIDTH, height: Math.ceil(h) });
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });

  const before = statSync(src).size / 1024;
  const after = statSync(resolve(OUT, `${name}.png`)).size / 1024;
  total += after;
  console.log(`  ${name.padEnd(16)} ${before.toFixed(0)}KB → ${after.toFixed(0)}KB`);
}

await browser.close();
console.log(`\n${WANTED.length}장 · 합계 ${(total / 1024).toFixed(1)}MB → public/guide/\n`);
