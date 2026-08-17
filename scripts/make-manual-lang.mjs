/**
 * 앱 안 설명서를 **그림으로** — `npm run manual:lang`
 *
 *   node scripts/make-manual-lang.mjs zh     → manual/guide-zh-01.png …
 *   node scripts/make-manual-lang.mjs en
 *
 * ★ 원본은 `lib/manual.ts` 하나다 — 앱 화면과 **같은 글**이다.
 *   번역본을 따로 손으로 쓰면 앱과 그림이 어긋나고, 어느 쪽이 맞는지 아무도 모르게 된다.
 * ★ 한국어는 `docs/manual/*.html` 의 **자세한 그림 설명서**가 따로 있다 (npm run manual).
 *   여기서 뽑는 것은 그 요약판이고, 그림 설명서가 없는 언어를 위한 것이다.
 * ★ 관리자용 절도 **함께** 넣는다. 그림 파일은 관리자에게 따로 건네는 물건이라
 *   앱 화면과 달리 숨길 대상이 아니다 — 대신 절 제목에 표시를 남긴다.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'manual');
const LANG = (process.argv[2] || 'zh').toLowerCase();
const IDX = { ko: 0, zh: 1, en: 2 }[LANG];
if (IDX === undefined) throw new Error(`모르는 언어: ${LANG} (ko | zh | en)`);

/**
 * `lib/manual.ts` 를 읽어 낸다.
 *
 * TypeScript 라 그대로 import 할 수 없다. 파일에서 배열 부분만 떼어 평가한다 —
 * 내용은 순수한 데이터라 이렇게 읽어도 안전하고, 원본을 두 벌로 만들지 않아도 된다.
 */
const src = readFileSync(resolve(ROOT, 'lib/manual.ts'), 'utf8');
const body = src.slice(src.indexOf('export const MANUAL'));
const arr = body.slice(body.indexOf('['), body.lastIndexOf('];') + 1);
const MANUAL = new Function(`return ${arr}`)();

const TITLE = {
  ko: ['길드정산 — 설명서', '관리자용', '더 자세한 그림 설명서는 혈맹 채팅방 링크에서 볼 수 있습니다.'],
  zh: ['血盟結算 — 使用說明', '管理員專用', '更詳細的圖解說明，請見血盟聊天室分享的連結。'],
  en: ['Guild Ledger — Guide', 'Admin only', 'A fuller illustrated guide is linked in the guild chat.'],
}[LANG];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const bold = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

/* 한 장에 절 4개씩 — 폰에서 한 장이 너무 길면 스크롤하다 어디였는지 잃는다 */
const PER_PAGE = 4;
const pages = [];
for (let i = 0; i < MANUAL.length; i += PER_PAGE) pages.push(MANUAL.slice(i, i + PER_PAGE));

const CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:460px;background:#e7e0d0;color:#1a1815;
    font:15px/1.68 -apple-system,"Malgun Gothic","Microsoft JhengHei","PingFang TC",sans-serif;
    padding:22px 20px 26px}
  .top{display:flex;align-items:center;gap:8px;font-size:11.5px;color:#8a8377;margin-bottom:16px}
  .top .n{background:#574227;color:#f7edd6;border-radius:99px;padding:2px 9px;font-weight:700}
  .top .ln{flex:1;height:1px;background:rgba(166,124,42,.4)}
  h2{display:flex;align-items:center;gap:7px;font-size:15px;font-weight:800;color:#1a1815;
    margin:20px 0 8px;letter-spacing:-.2px}
  h2::before{content:"";width:3px;height:13px;border-radius:1px;
    background:linear-gradient(180deg,#8a6114,transparent)}
  h2 .tag{margin-left:auto;font-size:9.5px;font-weight:700;color:#574227;
    background:#ece2cb;border-radius:3px;padding:2px 7px;letter-spacing:0}
  .card{background:#fcf8ef;border:1px solid #d8cdb4;border-radius:6px;
    box-shadow:0 1px 2px rgba(40,32,16,.06);padding:13px 15px;position:relative;overflow:hidden}
  .card::before{content:"";position:absolute;inset:0 0 auto;height:2px;
    background:linear-gradient(90deg,transparent,rgba(166,124,42,.7) 16%,rgba(166,124,42,.7) 84%,transparent)}
  p{margin:0 0 9px;font-size:13.5px;line-height:1.7;color:#55504a}
  p:last-child{margin-bottom:0}
  b{color:#1a1815}
  .foot{margin-top:20px;padding:11px 14px;border-left:3px solid #8a6114;background:#f2ebdb;
    font-size:12px;line-height:1.6;color:#55504a}
`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 460, height: 800 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();

console.log(`\n📖 ${TITLE[0]}\n`);
const made = [];

for (let i = 0; i < pages.length; i++) {
  const secs = pages[i]
    .map(
      (s) =>
        `<h2>${esc(s.title[IDX])}${s.admin ? `<span class="tag">${esc(TITLE[1])}</span>` : ''}</h2>` +
        `<div class="card">${s.lines.map((l) => `<p>${bold(l[IDX])}</p>`).join('')}</div>`,
    )
    .join('');
  const last = i === pages.length - 1;
  const html =
    `<!doctype html><meta charset="utf-8"><style>${CSS}</style><body>` +
    `<div class="top"><span class="n">${i + 1} / ${pages.length}</span><span>${esc(TITLE[0])}</span>` +
    `<span class="ln"></span><span>v${JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version}</span></div>` +
    secs +
    (last ? `<div class="foot">${esc(TITLE[2])}</div>` : '') +
    `</body>`;

  await page.setContent(html, { waitUntil: 'load' });
  const name = `guide-${LANG}-${String(i + 1).padStart(2, '0')}.png`;
  await page.screenshot({ path: resolve(OUT, name), fullPage: true });
  console.log(`  ${name}  ${pages[i].map((s) => s.title[IDX]).join(' · ')}`);
  made.push(name);
}

await browser.close();
writeFileSync(
  resolve(OUT, `guide-${LANG}.txt`),
  [`${TITLE[0]} — lib/manual.ts 에서 자동 생성 (npm run manual:lang ${LANG})`, '', ...made.map((n) => `  ${n}`), ''].join('\n'),
  'utf8',
);
console.log(`\n총 ${made.length}장 → ${OUT}\n`);
