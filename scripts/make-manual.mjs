/**
 * 설명서 → 휴대폰용 이미지 (PNG)
 *
 *   npm run manual
 *
 * ★ 원본은 `docs/manual/*.html` 이고 색은 `docs/manual/style.css` 한 곳에서 정한다.
 *   이미지를 손으로 그리면 문서를 고칠 때마다 둘이 어긋나고, 어느 쪽이 맞는지
 *   아무도 모르게 된다.
 * ★ `.page` 하나가 **한 장**이다. 긴 이미지 하나는 폰에서 찾아보기 어렵고,
 *   단톡방에 한 장씩 올리기도 좋다.
 * ★ 460px 을 ×3 해상도로 찍어 1,380px PNG 가 된다 — 폰에서 확대하지 않고
 *   읽히는 것이 목적이다.
 *
 * `file://` 로 열기 때문에 `style.css` · `icon.png` 같은 상대 경로가 그대로 산다.
 * (`setContent()` 로 그리면 페이지에 주소가 없어 전부 깨진다.)
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'docs/manual');
// 폴더·파일명을 영문으로 두는 이유: 한글이 들어가면 GitHub·카톡에서 링크가
// 퍼센트 인코딩으로 3배 길어져 200자 제한에 걸리고, 도구에 따라 깨지기도 한다.
const OUT = resolve(ROOT, 'manual');

const BOOKS = [
  { file: 'member.html', out: 'member', label: '혈맹원 안내' },
  { file: 'admin.html', out: 'admin', label: '관리 설명서' },
];

for (const b of BOOKS) {
  if (!existsSync(resolve(SRC, b.file))) throw new Error(`원본이 없습니다: docs/manual/${b.file}`);
}

// 촬영본(manual/shots)과 다른 사람이 넣어둔 것을 지우지 않는다 — 내가 만드는 것만 지운다
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) {
  if (/^(member|admin)-\d+\.png$/.test(f)) rmSync(resolve(OUT, f));
}

// 브라우저 위치는 다른 촬영 스크립트와 같은 방법으로 찾는다 — 없으면 기본값으로
// 떨어지므로 윈도우(직접 설치한 경우)에서도 그대로 돌아간다
const browser = await chromium.launch({
  executablePath: [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium']
    .filter(Boolean)
    .find((p) => existsSync(p)),
});
const ctx = await browser.newContext({ viewport: { width: 520, height: 900 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();

console.log('\n📖 설명서\n');
const made = [];

for (const book of BOOKS) {
  await page.goto(pathToFileURL(resolve(SRC, book.file)).href, { waitUntil: 'networkidle' });

  const pages = await page.locator('.page').all();
  if (pages.length === 0) throw new Error(`장이 하나도 없습니다 (.page 가 필요합니다): ${book.file}`);

  for (let i = 0; i < pages.length; i++) {
    const name = `${book.out}-${String(i + 1).padStart(2, '0')}.png`;
    await pages[i].screenshot({ path: resolve(OUT, name) });
    // 무슨 내용이 담긴 장인지 남겨두면 나중에 어느 장을 고칠지 바로 찾는다
    const what = (await pages[i].locator('.pnum > span').nth(1).textContent()) ?? '';
    console.log(`  ${name}  ${book.label} — ${what.trim()}`);
    made.push(name);
  }
}

writeFileSync(
  resolve(OUT, 'README.txt'),
  [
    '설명서 이미지 — 폰에서 그대로 보내면 됩니다.',
    '',
    ...made.map((n) => `  ${n}`),
    '',
    '원본은 docs/manual/member.html · docs/manual/admin.html 이고',
    '색은 docs/manual/style.css 한 곳에서 정합니다.',
    '고친 뒤에는 npm run manual 을 다시 돌리세요.',
    '',
  ].join('\n'),
);

await browser.close();
console.log(`\n총 ${made.length}장 → ${OUT}\n`);
