/**
 * 웹툰 설명서 → 세로 스크롤 이미지 (PNG)
 *
 *   npm run webtoon        (먼저 npm run manual:shots 로 화면을 찍어둬야 한다)
 *
 * ★ 원본은 `docs/웹툰-*.md` 다. 이미지를 손으로 그리면 문서를 고칠 때마다 둘이
 *   어긋나고, 어느 쪽이 맞는지 아무도 모르게 된다 (설명서와 같은 규칙).
 * ★ `##` 한 절이 **한 화(話)** = PNG 한 장이다. 세로로 길어도 된다 —
 *   웹툰은 원래 그렇게 읽고, 단톡방에 한 화씩 올리기도 좋다.
 * ★ 화면은 **진짜 앱을 찍은 것**만 쓴다. 그림을 지어내면 실제와 어긋나고,
 *   어긋난 설명서는 없는 것보다 나쁘다 (규칙 7).
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'manual');
const SHOTS = resolve(OUT, 'shots');

/** 폰에서 읽는 폭. ×2 해상도로 찍어 1080px PNG 가 된다 */
const W = 540;
/** 앱 촬영본의 논리 크기 (390×844 @2배) — 잘라내기 좌표의 기준이다 */
const APP_W = 390;
const APP_H = 844;

/**
 * 등장인물 — **한 곳에서만** 정한다.
 *
 * 말풍선 방향까지 여기서 정하는 이유: 같은 사람이 화마다 좌우로 왔다 갔다 하면
 * 누가 말하는지 매번 이름을 읽어야 한다. 자리가 고정돼 있으면 눈으로 따라온다.
 */
const CAST = {
  막내: { em: '🐣', name: '막내', side: 'l', tone: 'egg' },
  군주: { em: '👑', name: '군주', side: 'r', tone: 'lord' },
  샤오룽: { em: '🐉', name: '샤오룽', side: 'l', tone: 'dragon' },
  // 배우는 쪽(막내·총무)은 왼쪽, 가르치는 쪽(군주)은 오른쪽으로 고정한다 —
  // 둘 다 오른쪽에 두면 이름을 읽기 전에는 같은 사람이 계속 말하는 것처럼 보인다
  총무: { em: '🧾', name: '총무', side: 'l', tone: 'clerk' },
};

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 대사 안의 **굵게** · `코드` 는 그대로 살린다 */
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

/**
 * 촬영본을 data URI 로 박아 넣는다.
 *
 * `setContent()` 로 그리므로 페이지에 주소가 없다 — 상대 경로는 아무것도
 * 가리키지 못해 깨진 그림이 된다.
 * ★ 파일이 없으면 **바로 멈춘다.** 조용히 넘어가면 그림 없는 웹툰이 말없이
 *   만들어져, 다 만들고 나서야 알게 된다.
 */
function dataUri(rel) {
  const full = resolve(SHOTS, rel);
  if (!existsSync(full)) {
    const have = existsSync(SHOTS) ? readdirSync(SHOTS).join(', ') : '(폴더 없음)';
    throw new Error(
      `웹툰이 부르는 화면이 없습니다: ${rel}\n     먼저 npm run manual:shots 를 돌리세요.\n     지금 있는 것: ${have}`,
    );
  }
  return `data:image/png;base64,${readFileSync(full).toString('base64')}`;
}

/**
 * 화면 한 컷.
 *
 * `slice` 는 앱 화면(390×844 기준)의 세로 범위다. 웹툰에서 폰 전체를 매번
 * 통째로 보여주면 글씨가 작아져 정작 봐야 할 곳이 안 읽힌다 — 필요한 데만
 * 잘라서 크게 보여준다. 범위를 안 주면 전체를 쓴다.
 */
function shotPanel(file, caption, slice) {
  const uri = dataUri(file);
  const [y0, y1] = slice ?? [0, APP_H];
  const innerW = W - 56; // 좌우 여백
  const scale = innerW / APP_W;
  const h = Math.round((y1 - y0) * scale);
  const cap = caption ? `<figcaption>${inline(caption)}</figcaption>` : '';
  return `<figure class="shot">
    <div class="phone" style="height:${h}px">
      <img src="${uri}" style="width:${innerW}px;margin-top:${-Math.round(y0 * scale)}px" alt="">
    </div>${cap}
  </figure>`;
}

function bubble(who, text) {
  const c = CAST[who];
  return `<div class="say ${c.side === 'l' ? 'left' : 'right'} ${c.tone}">
    <div class="who"><span class="em">${c.em}</span><span class="nm">${esc(c.name)}</span></div>
    <div class="bub">${inline(text)}</div>
  </div>`;
}

/** `## 화 제목` 마다 하나씩 잘라 HTML 조각으로 */
function toEpisodes(md) {
  const lines = md.split('\n');
  const eps = [];
  let cur = null;
  let table = null;

  const closeTable = () => {
    if (!table) return;
    const head = table.head.map((c) => `<th>${inline(c)}</th>`).join('');
    const body = table.rows
      .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
      .join('');
    cur.html.push(`<table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
    table = null;
  };

  for (const raw of lines) {
    const ln = raw.trim();
    if (!ln) continue;
    if (ln.startsWith('# ')) continue; // 문서 제목은 화마다 머리글로 따로 붙인다

    if (ln.startsWith('## ')) {
      closeTable();
      if (cur) eps.push(cur);
      cur = { title: ln.slice(3).trim(), html: [] };
      continue;
    }
    if (!cur) continue;

    const m = ln.match(/^@(\S+)\s*(.*)$/);
    if (!m) {
      closeTable();
      cur.html.push(`<p class="plain">${inline(ln)}</p>`);
      continue;
    }
    const [, tag, rest] = m;

    if (tag !== '행') closeTable();

    if (CAST[tag]) {
      cur.html.push(bubble(tag, rest));
    } else if (tag === '나레') {
      cur.html.push(`<div class="narr">${inline(rest)}</div>`);
    } else if (tag === '화면') {
      const [file, caption, range] = rest.split('|').map((s) => s.trim());
      // 범위는 `120-520` 처럼 앱 화면(844 기준)의 세로 픽셀이다
      const slice = range ? range.split('-').map((n) => Number(n)) : null;
      if (slice && (slice.length !== 2 || slice.some((n) => !Number.isFinite(n)))) {
        throw new Error(`@화면 범위를 읽을 수 없습니다: "${range}" (예: 120-520)`);
      }
      cur.html.push(shotPanel(file, caption, slice));
    } else if (tag === '팁') {
      cur.html.push(`<div class="box tip">${inline(rest)}</div>`);
    } else if (tag === '주의') {
      cur.html.push(`<div class="box warn">${inline(rest)}</div>`);
    } else if (tag === '컷') {
      cur.html.push('<div class="cut"></div>');
    } else if (tag === '표') {
      table = { head: rest.split('|').map((s) => s.trim()), rows: [] };
    } else if (tag === '행') {
      if (!table) throw new Error(`@행 앞에 @표 가 없습니다: ${ln}`);
      table.rows.push(rest.split('|').map((s) => s.trim()));
    } else if (tag === '끝') {
      cur.html.push(`<div class="fin">${inline(rest)}</div>`);
    } else {
      throw new Error(`모르는 표시입니다: @${tag}  (${ln})`);
    }
  }
  closeTable();
  if (cur) eps.push(cur);
  return eps;
}

const CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    width:${W}px;background:#eeeae1;color:#1a1815;
    font-family:'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;
    font-size:17px;line-height:1.62;-webkit-font-smoothing:antialiased;
  }
  .ep{padding:0 0 28px}
  .hd{
    background:#12313f;color:#fdfbf6;padding:20px 22px 18px;
    border-bottom:5px solid #a5761a;
  }
  .hd .kicker{font-size:13px;letter-spacing:2px;color:#d9a740;font-weight:800}
  .hd h1{font-size:25px;font-weight:800;letter-spacing:-.6px;margin-top:5px;line-height:1.28}
  .body{padding:20px 20px 0}
  .narr{
    background:#12313f;color:#f2efe6;border-radius:12px;
    padding:12px 15px;margin:16px 0;font-size:16px;line-height:1.55;
  }
  .plain{margin:12px 2px}
  /* ── 말풍선 ── */
  .say{display:flex;flex-direction:column;margin:16px 0;max-width:88%}
  .say.left{align-items:flex-start;margin-right:auto}
  .say.right{align-items:flex-end;margin-left:auto}
  .who{display:flex;align-items:center;gap:6px;margin-bottom:5px}
  .say.right .who{flex-direction:row-reverse}
  .who .em{
    width:40px;height:40px;border-radius:50%;display:flex;align-items:center;
    justify-content:center;font-size:23px;border:2px solid #1a1815;background:#fdfbf6;
  }
  .who .nm{font-size:13px;font-weight:800;color:#6a6559}
  .bub{
    position:relative;background:#fdfbf6;border:2px solid #1a1815;border-radius:16px;
    padding:11px 15px;box-shadow:3px 3px 0 rgba(26,24,21,.14);
  }
  .say.left .bub{border-top-left-radius:4px}
  .say.right .bub{border-top-right-radius:4px}
  .egg .bub{background:#fdefe0}
  .lord .bub{background:#dfeaef}
  .dragon .bub{background:#e4f3ea}
  .clerk .bub{background:#f5f1e8}
  .bub b{font-weight:800}
  code{
    font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em;
    background:rgba(26,24,21,.08);padding:1px 5px;border-radius:5px;
  }
  /* ── 화면 컷 ── */
  .shot{margin:18px 0}
  .phone{
    width:${W - 56}px;margin:0 auto;overflow:hidden;
    border:3px solid #1a1815;border-radius:14px;background:#fdfbf6;
    box-shadow:4px 4px 0 rgba(26,24,21,.16);
  }
  .phone img{display:block}
  figcaption{
    margin-top:8px;text-align:center;font-size:14px;color:#6a6559;font-weight:700;
  }
  /* ── 상자 ── */
  .box{border-radius:12px;padding:12px 15px;margin:16px 0;font-size:16px;line-height:1.55}
  .tip{background:#fdefe0;border:2px dashed #d1620a}
  .tip::before{content:'💡 ';font-weight:800}
  .warn{background:#fbe4e6;border:2px solid #bf2a3a}
  .warn::before{content:'⚠️ ';font-weight:800}
  /* ── 표 ── */
  .tbl{
    width:100%;border-collapse:collapse;margin:16px 0;font-size:15px;
    background:#fdfbf6;border:2px solid #1a1815;border-radius:10px;overflow:hidden;
  }
  .tbl th{background:#12313f;color:#fdfbf6;padding:9px 11px;text-align:left;font-weight:800}
  .tbl td{padding:9px 11px;border-top:1px solid #e1dace;vertical-align:top}
  /* ── 장면 전환 ── */
  .cut{height:2px;background:repeating-linear-gradient(90deg,#1a1815 0 12px,transparent 12px 22px);margin:24px 0}
  .fin{
    margin:22px 0 0;padding:14px;text-align:center;font-weight:800;font-size:17px;
    background:#a5761a;color:#fff;border-radius:12px;
  }
  .ft{
    margin-top:22px;padding:12px 20px;background:#12313f;color:#9a9488;
    font-size:12px;text-align:center;letter-spacing:.4px;
  }
`;

function page(doc, ep, i, total) {
  return `<style>${CSS}</style>
  <div class="ep">
    <div class="hd">
      <div class="kicker">${esc(doc)} · ${i + 1}/${total}</div>
      <h1>${esc(ep.title)}</h1>
    </div>
    <div class="body">${ep.html.join('\n')}</div>
    <div class="ft">길드정산 v${JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version} · 화면은 실제 앱을 찍은 것입니다</div>
  </div>`;
}

/* ───────── 실행 ───────── */
const BOOKS = [
  { md: 'docs/웹툰-혈맹원.md', out: 'webtoon-member', doc: '혈맹원 편' },
  { md: 'docs/웹툰-관리자.md', out: 'webtoon-admin', doc: '관리자 편' },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium']
    .filter(Boolean)
    .find((p) => existsSync(p)),
});
// 뷰포트를 낮게 둔다 — fullPage 는 뷰포트보다 작아지지 않아, 짧은 장에 빈 공간이 남는다
const ctx = await browser.newContext({ viewport: { width: W, height: 200 }, deviceScaleFactor: 2 });
const tab = await ctx.newPage();

/**
 * 한 화가 너무 길면 나눈다.
 *
 * 세로로 긴 것 자체는 웹툰이라 괜찮지만, 메신저·업로더가 **아주 긴 그림을
 * 거부**한다 (실제로 9,000px 짜리가 되돌아왔다). 받는 사람이 못 여는 설명서는
 * 없는 것과 같으므로 여기서 미리 나눈다.
 *
 * 자르는 자리는 **덩어리 사이**다 — 말풍선이나 표를 반으로 자르면 읽을 수 없다.
 * 그래서 한 번 그려서 실제 높이를 재고, 그 경계로만 나눈다.
 */
const MAX_H = 3100; // CSS px (×2 해상도라 6,200px 그림이 된다)

async function split(ep, doc, i, total) {
  await tab.setContent(page(doc, ep, i, total), { waitUntil: 'load' });
  const [h, sizes] = await tab.evaluate(() => [
    document.body.scrollHeight,
    [...document.querySelectorAll('.body > *')].map((el) => el.getBoundingClientRect().height),
  ]);
  if (h <= MAX_H) return [ep.html];

  // 머리글·꼬리말이 매 장에 다시 붙으므로 그만큼 뺀 예산으로 나눈다
  const content = sizes.reduce((a, b) => a + b, 0);
  const room = Math.max(900, MAX_H - (h - content));

  /*
   * ★ 앞에서부터 예산이 찰 때까지 담는 방식(greedy)은 **마지막 장이 한 줄짜리로**
   *   남는다 (실제로 900px 짜리 꼬리가 나왔다). 몇 장이 필요한지 먼저 정하고,
   *   각 덩어리의 **한가운데가 어느 장에 속하는지**로 배정하면 고르게 나뉜다.
   */
  const n = Math.ceil(content / room);
  const per = content / n;
  const parts = Array.from({ length: n }, () => []);
  let acc = 0;
  for (let k = 0; k < ep.html.length; k++) {
    const size = sizes[k] ?? 0;
    const at = Math.min(n - 1, Math.floor((acc + size / 2) / per));
    parts[at].push(ep.html[k]);
    acc += size;
  }
  return parts.filter((p) => p.length > 0);
}

console.log('\n🎬 웹툰 설명서\n');
const made = [];
for (const book of BOOKS) {
  const full = resolve(ROOT, book.md);
  if (!existsSync(full)) throw new Error(`원고가 없습니다: ${book.md}`);
  const eps = toEpisodes(readFileSync(full, 'utf8'));
  if (eps.length === 0) throw new Error(`화가 하나도 없습니다 (## 로 시작하는 줄이 필요합니다): ${book.md}`);

  for (let i = 0; i < eps.length; i++) {
    const parts = await split(eps[i], book.doc, i, eps.length);
    for (let k = 0; k < parts.length; k++) {
      const ep = parts.length === 1 ? eps[i] : { ...eps[i], title: `${eps[i].title} (${k + 1}/${parts.length})`, html: parts[k] };
      await tab.setContent(page(book.doc, ep, i, eps.length), { waitUntil: 'load' });
      const name =
        parts.length === 1
          ? `${book.out}-${String(i + 1).padStart(2, '0')}.png`
          : `${book.out}-${String(i + 1).padStart(2, '0')}${'abcdefgh'[k]}.png`;
      await tab.screenshot({ path: resolve(OUT, name), fullPage: true });
      const h = await tab.evaluate(() => document.body.scrollHeight);
      console.log(`  🎞️  ${name}  ${ep.title}  (${h}px)`);
      made.push(name);
    }
  }
}

writeFileSync(
  resolve(OUT, 'WEBTOON.txt'),
  [
    '웹툰 설명서 — 세로로 내리며 읽습니다.',
    '',
    ...made.map((n) => `  ${n}`),
    '',
    '원고는 docs/웹툰-혈맹원.md · docs/웹툰-관리자.md 입니다.',
    '고친 뒤에는 npm run manual:shots && npm run webtoon 을 돌리세요.',
    '',
  ].join('\n'),
);

await browser.close();
console.log(`\n→ ${OUT}\n`);
