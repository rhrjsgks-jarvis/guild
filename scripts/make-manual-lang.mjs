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

/*
 * 꼬리말은 **없는 곳을 가리키지 않는다.** 예전에는 "채팅방 링크에서 볼 수 있습니다"
 * 라고 적었는데, 이 그림 자체가 그 링크로 오는 물건이라 제자리를 맴도는 말이었다.
 * 앱 안에 같은 설명서가 있다는 것만 알려준다 — 거기는 언제나 최신이다.
 */
const TITLE = {
  ko: ['길드정산 — 설명서', '관리자용', '같은 내용을 앱 안 [설명서] 에서도 볼 수 있습니다 — 그쪽이 언제나 최신입니다.'],
  zh: ['血盟結算 — 使用說明', '管理員專用', '相同內容也可在 App 內的「使用說明」查看 — 那裡永遠是最新版。'],
  en: ['Guild Ledger — Guide', 'Admin only', 'The same guide lives inside the app under "Guide" — always up to date.'],
}[LANG];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const bold = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

/* 한 장에 절 3개씩 — 표와 흐름이 들어가 절 하나가 길어졌다 */
const PER_PAGE = 3;
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
    margin:20px 0 3px;letter-spacing:-.2px}
  h2::before{content:"";width:3px;height:13px;border-radius:1px;
    background:linear-gradient(180deg,#8a6114,transparent)}
  h2 .tag{margin-left:auto;font-size:9.5px;font-weight:700;color:#574227;
    background:#ece2cb;border-radius:3px;padding:2px 7px;letter-spacing:0}
  .sub{margin:0 0 8px 10px;font-size:11.5px;color:#8a8377}
  .card{background:#fcf8ef;border:1px solid #d8cdb4;border-radius:6px;
    box-shadow:0 1px 2px rgba(40,32,16,.06);padding:13px 15px;position:relative;overflow:hidden}
  .card::before{content:"";position:absolute;inset:0 0 auto;height:2px;
    background:linear-gradient(90deg,transparent,rgba(166,124,42,.7) 16%,rgba(166,124,42,.7) 84%,transparent)}
  p{margin:0 0 10px;font-size:13.5px;line-height:1.7;color:#55504a}
  p:last-child{margin-bottom:0}
  b{color:#1a1815}
  .flow{display:flex;flex-direction:column;margin:2px 0 4px}
  .step{display:flex;gap:11px}
  .step .rail{flex:0 0 26px;display:flex;flex-direction:column;align-items:center}
  .step .dot{width:26px;height:26px;border-radius:50%;border:1.5px solid #574227;
    background:#ece2cb;color:#574227;font-size:12.5px;font-weight:800;
    display:flex;align-items:center;justify-content:center}
  .step .bar{width:2px;flex:1;background:#d8cdb4;margin:3px 0}
  .step .body{flex:1;padding-bottom:14px}
  .step h4{font-size:14px;font-weight:700;margin-bottom:3px}
  .step p{font-size:13px;line-height:1.65}
  table{border-collapse:collapse;width:100%;font-size:13px;margin:4px 0 12px}
  th,td{border:1px solid #d8cdb4;padding:8px 10px;text-align:left;vertical-align:top;line-height:1.6}
  th{background:#574227;color:#f7edd6;font-weight:700;white-space:nowrap}
  td{color:#55504a}
  tbody tr:nth-child(even) td{background:#f2ebdb}
  .note{margin:4px 0 12px;padding:11px 13px;border-left:3px solid #8a6114;background:#f2ebdb;
    border-radius:0 4px 4px 0}
  .note.warn{border-left-color:#d1620a;background:#fdefe0}
  .note h4{font-size:13.5px;font-weight:700;margin-bottom:4px}
  .note p{font-size:13px}
  .note :last-child,.flow:last-child,table:last-child{margin-bottom:0}
  .foot{margin-top:20px;padding:11px 14px;border-left:3px solid #8a6114;background:#f2ebdb;
    font-size:12px;line-height:1.6;color:#55504a}
`;

/** 블록 하나를 HTML 로. 앱 화면(ManualTab)과 같은 구조다 */
const blockHtml = (b) => {
  if ('p' in b) return `<p>${bold(b.p[IDX])}</p>`;
  if ('steps' in b) {
    return (
      '<div class="flow">' +
      b.steps
        .map(
          (st, i) =>
            '<div class="step"><div class="rail"><div class="dot">' + (i + 1) + '</div>' +
            (i < b.steps.length - 1 ? '<div class="bar"></div>' : '') +
            '</div><div class="body"><h4>' + bold(st.h[IDX]) + '</h4><p>' + bold(st.d[IDX]) + '</p></div></div>',
        )
        .join('') +
      '</div>'
    );
  }
  if ('table' in b) {
    return (
      '<table><thead><tr>' +
      b.table.head.map((h) => `<th>${bold(h[IDX])}</th>`).join('') +
      '</tr></thead><tbody>' +
      b.table.rows.map((r) => '<tr>' + r.map((c) => `<td>${bold(c[IDX])}</td>`).join('') + '</tr>').join('') +
      '</tbody></table>'
    );
  }
  return (
    `<div class="note${b.warn ? ' warn' : ''}">` +
    (b.h ? `<h4>${bold(b.h[IDX])}</h4>` : '') +
    `<p>${bold(b.note[IDX])}</p></div>`
  );
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 460, height: 800 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();

console.log(`\n📖 ${TITLE[0]}\n`);
const made = [];

for (let i = 0; i < pages.length; i++) {
  const secs = pages[i]
    .map(
      (sec) =>
        `<h2>${esc(sec.title[IDX])}${sec.admin ? `<span class="tag">${esc(TITLE[1])}</span>` : ''}</h2>` +
        (sec.sub ? `<div class="sub">${esc(sec.sub[IDX])}</div>` : '') +
        `<div class="card">${sec.blocks.map(blockHtml).join('')}</div>`,
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
