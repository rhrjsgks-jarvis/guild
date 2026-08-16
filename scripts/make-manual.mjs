/**
 * 설명서 → 휴대폰용 이미지 (PNG)
 *
 *   npm run manual
 *
 * ★ 원본은 언제나 `docs/*.md` 다. 이미지를 손으로 그리면 문서를 고칠 때마다
 *   둘이 어긋나고, 어느 쪽이 맞는지 아무도 모르게 된다.
 * ★ `##` 제목마다 **한 장**으로 끊는다. 긴 이미지 하나는 폰에서 찾아보기 어렵고,
 *   단톡방에 한 장씩 올리기도 좋다.
 * ★ 글씨는 크게(17px 기준 × 2배 해상도) — 폰에서 확대하지 않고 읽히는 것이 목적이다.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// 폴더·파일명을 영문으로 두는 이유: 한글이 들어가면 GitHub·카톡에서 링크가
// 퍼센트 인코딩으로 3배 길어져 200자 제한에 걸리고, 도구에 따라 깨지기도 한다.
const OUT = resolve(ROOT, 'manual');

/** 마크다운 인라인 — 굵게 · 코드 · 링크(글자만 남김) */
function inline(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    // 링크는 이미지에서 누를 수 없다 — 글자만 남긴다
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/**
 * 촬영본을 **data URI 로 박아 넣는다.**
 *
 * `page.setContent()` 로 그리기 때문에 페이지에 주소(base URL)가 없다 —
 * `shots/home.png` 같은 상대 경로는 아무것도 가리키지 못해 깨진 그림이 된다.
 * ★ 파일이 없으면 **바로 멈춘다.** 조용히 넘어가면 그림 없는 설명서가
 *   아무 말 없이 만들어져, 다 만들고 나서야 알게 된다.
 */
function dataUri(rel) {
  const full = resolve(ROOT, 'manual', rel);
  if (!existsSync(full)) {
    throw new Error(`설명서가 부르는 화면이 없습니다: ${rel}\n     먼저 npm run manual:shots 로 찍으세요.`);
  }
  return `data:image/png;base64,${readFileSync(full).toString('base64')}`;
}

/**
 * 폰 화면 한 줄이 차지하는 **세로 무게** (글자 수 환산).
 *
 * pack() 은 글자 수로 장을 나눈다. data URI 는 한 장에 1MB 가 넘어서 그대로
 * 세면 그림 하나 있는 절이 다른 절 전체보다 무거워져 배치가 망가진다.
 * 그림은 실제로 차지하는 **높이**만큼만 세게 한다.
 */
const SHOT_WEIGHT = 900;

/**
 * 문서를 `##` 기준으로 잘라 HTML 조각 목록으로.
 * 표·코드블록·목록·인용·화면을 다룬다 (설명서가 쓰는 문법만).
 */
function toPages(md, title) {
  const lines = md.split('\n');
  const pages = [];
  let cur = { head: title, html: [], wt: 0 };
  let i = 0;

  const push = () => {
    if (cur.html.join('').trim()) pages.push(cur);
  };

  while (i < lines.length) {
    const ln = lines[i];

    if (ln.startsWith('# ')) { i++; continue; }          // 문서 제목은 각 장 머리로 따로 붙인다
    if (ln.startsWith('---')) { i++; continue; }          // 구분선은 장이 대신한다

    if (ln.startsWith('## ')) {
      push();
      cur = { head: ln.slice(3).trim(), html: [], wt: 0 };
      i++;
      continue;
    }
    if (ln.startsWith('### ')) {
      cur.html.push(`<h3>${inline(ln.slice(4))}</h3>`);
      i++;
      continue;
    }

    /* 화면 — 이어진 줄은 **나란히** 놓는다 (①②③ 단계를 한눈에 보여주기 위해).
       `![설명](shots/home.png)` 형태만 받는다. */
    if (/^!\[[^\]]*\]\([^)]+\)\s*$/.test(ln)) {
      const figs = [];
      while (i < lines.length && /^!\[[^\]]*\]\([^)]+\)\s*$/.test(lines[i])) {
        const [, alt, src] = lines[i++].match(/^!\[([^\]]*)\]\(([^)]+)\)/);
        figs.push(
          `<figure><img src="${dataUri(src)}" alt="">` +
            (alt ? `<figcaption>${inline(alt)}</figcaption>` : '') +
            '</figure>',
        );
      }
      cur.html.push(`<div class="shots">${figs.join('')}</div>`);
      // 나란히 놓인 것들은 한 줄을 차지하므로 **줄 단위로** 센다 (장수가 아니라)
      cur.wt += SHOT_WEIGHT;
      continue;
    }

    // 코드블록
    if (ln.startsWith('```')) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      cur.html.push(`<pre>${buf.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`);
      continue;
    }

    // 표 — 헤더 | 구분 | 본문
    if (ln.includes('|') && lines[i + 1] && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1])) {
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(ln);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].includes('|')) body.push(cells(lines[i++]));
      cur.html.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` +
          `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
      );
      continue;
    }

    // 인용
    if (ln.startsWith('> ')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      cur.html.push(`<blockquote>${buf.map(inline).join('<br>')}</blockquote>`);
      continue;
    }

    // 목록
    if (/^\s*[-*] /.test(ln)) {
      const buf = [];
      while (i < lines.length && /^\s*[-*] /.test(lines[i])) {
        buf.push(lines[i++].replace(/^\s*[-*] /, ''));
        // 들여쓴 다음 줄은 **같은 항목의 이어짐**이다.
        // 따로 문단으로 떼면 "검정이면 사전에 없는 이름" 같은 단서가 앞 항목과 끊겨,
        // 무엇에 대한 설명인지 알 수 없게 된다.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*] /.test(lines[i])) {
          buf[buf.length - 1] += ' ' + lines[i++].trim();
        }
      }
      cur.html.push(`<ul>${buf.map((b) => `<li>${inline(b)}</li>`).join('')}</ul>`);
      continue;
    }
    if (/^\s*\d+\. /.test(ln)) {
      const buf = [];
      while (i < lines.length && /^\s*\d+\. /.test(lines[i])) buf.push(lines[i++].replace(/^\s*\d+\.\s*/, ''));
      cur.html.push(`<ol>${buf.map((b) => `<li>${inline(b)}</li>`).join('')}</ol>`);
      continue;
    }

    if (ln.trim()) cur.html.push(`<p>${inline(ln)}</p>`);
    i++;
  }
  push();
  return pages;
}

/* 앱과 같은 돌·양피지 + 금색 계열 — 설명서만 딴 세상처럼 보이지 않게 한다 */
const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 960px; background: #eeeae1; color: #1a1815;
    font: 17px/1.72 -apple-system, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    padding: 34px 38px 44px;
  }
  .doc { font-size: 15px; color: #6a6559; letter-spacing: .02em; margin-bottom: 6px; }
  h2 {
    font-size: 30px; line-height: 1.3; color: #12313f; font-weight: 800;
    border-bottom: 3px solid rgba(217,167,64,.55); padding-bottom: 12px; margin-bottom: 20px;
  }
  h3 { font-size: 20px; margin: 22px 0 10px; color: #1f6d8a; }
  p { margin: 9px 0; }
  ul, ol { margin: 9px 0 9px 24px; }
  li { margin: 5px 0; }
  b { color: #12313f; }
  code {
    background: #f5f1e8; border: 1px solid #e1dace; border-radius: 3px;
    padding: 1px 6px; font-family: Consolas, monospace; font-size: .92em;
  }
  pre {
    background: #fdfbf6; border: 1px solid #e1dace; border-left: 4px solid #a5761a;
    border-radius: 4px; padding: 14px 16px; margin: 14px 0;
    font-family: Consolas, monospace; font-size: 15px; line-height: 1.6; white-space: pre-wrap;
  }
  blockquote {
    background: #f5f1e8; border-left: 4px solid #1f6d8a;
    padding: 12px 16px; margin: 14px 0; color: #3a3630;
  }
  table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 16px; }
  th, td { border: 1px solid #ddd5c6; padding: 9px 12px; text-align: left; vertical-align: top; }
  th { background: #12313f; color: #fff; font-weight: 700; }
  tr:nth-child(even) td { background: #f7f4ed; }
  /* 폰 화면 촬영본 — 실제 폰처럼 모서리를 둥글리고 그림자를 준다.
     여러 장이 이어지면 나란히 놓여 ①②③ 단계가 한눈에 들어온다. */
  .shots { display: flex; flex-wrap: wrap; gap: 18px; margin: 18px 0 22px; }
  .shots figure { flex: 0 0 auto; }
  .shots img {
    width: 268px; display: block;
    border: 1px solid #ddd5c6; border-radius: 18px;
    box-shadow: 0 2px 6px rgba(40,32,16,.10), 0 10px 28px rgba(40,32,16,.13);
  }
  .shots figcaption {
    width: 268px; margin-top: 8px; text-align: center;
    font-size: 14px; line-height: 1.45; color: #6a6559;
  }
  h2.more { margin-top: 46px; }
  .foot { margin-top: 26px; font-size: 14px; color: #9a9488; text-align: right; }
`;

/**
 * `pages` = 최종 장수.
 *
 * ★ `##` 마다 한 장으로 끊으면 19장이 되어 **너무 잘게 쪼개진다.**
 *   폰은 어차피 스크롤하는 물건이라, 한 장이 조금 길어도 넘기는 것보다 낫다.
 *   혈맹원 2장 · 관리자 4장은 예전에 쓰던 구성이다.
 */
const DOCS = [
  { file: 'docs/혈맹원-설명서.md', title: '혈맹원 설명서', slug: 'member', pages: 2 },
  { file: 'docs/관리자-설명서.md', title: '관리자 설명서', slug: 'admin', pages: 4 },
];

/**
 * 절(##)들을 목표 장수로 묶는다 — **글 양이 고르게** 되도록.
 *
 * 개수로만 나누면 표가 많은 절이 몰린 장만 유난히 길어진다. 그래서 글자 수를
 * 재서, 남은 장수로 남은 분량을 나눈 몫을 넘어서면 다음 장으로 넘긴다.
 * ★ 절을 쪼개지는 않는다. 한 절이 두 장에 걸치면 표가 중간에서 잘려 못 읽는다.
 */
function pack(sections, want) {
  if (sections.length <= want) return sections.map((s) => [s]);
  // 그림의 base64 길이를 그대로 세면 그림 하나가 절 전체보다 무거워진다 —
  // 글자는 글자 수로, 그림은 차지하는 높이(wt)로 센다
  const size = (s) =>
    s.head.length +
    s.html.filter((h) => !h.startsWith('<div class="shots">')).join('').length +
    (s.wt ?? 0);
  const out = [];
  let cur = [];
  let curSize = 0;
  let left = sections.reduce((a, s) => a + size(s), 0);

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const rest = sections.length - i; // 아직 안 넣은 절 (지금 것 포함)
    const openPages = want - out.length; // 아직 안 닫은 장 (지금 것 포함)

    // ★ 마지막 장이면 무조건 여기에 다 담는다. 이 가드를 빼면 끝에서 한 장이
    //   더 생겨 "2장 · 4장" 이 "3장 · 5장" 이 된다 (실제로 그랬다).
    const canBreak = openPages > 1 && cur.length > 0 && rest >= openPages;
    // ★ 반대쪽 사고도 있다. 남은 절이 남은 장과 **딱 같아지면 지금 끊어야 한다** —
    //   여기서 그냥 넘기면 다음부터는 rest < openPages 라 영영 못 끊고, 원하던
    //   2장이 1장으로 뭉친다 (혈맹원 설명서가 실제로 8900px 한 장이 됐다).
    const mustBreak = canBreak && rest === openPages;
    if (canBreak && (mustBreak || curSize >= left / openPages)) {
      out.push(cur);
      cur = [];
      curSize = 0;
    }
    cur.push(s);
    curSize += size(s);
    left -= size(s);
  }
  if (cur.length) out.push(cur);
  return out;
}

// ★ 폴더를 통째로 지우지 않는다. 같은 폴더에 용어집 리포트(glossary.*)가 함께
//   들어 있어서, 통째로 지우면 설명서를 다시 만들 때마다 그것이 사라진다.
//   내가 만드는 것만 지운다.
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
// 2배 해상도 — 폰에서 확대하지 않고 읽히게 한다.
// 높이를 작게 두는 이유: fullPage 는 뷰포트보다 작아지지 않아, 짧은 장에 빈 공간이 남는다
const ctx = await browser.newContext({ viewport: { width: 960, height: 200 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

let total = 0;
for (const doc of DOCS) {
  const md = readFileSync(resolve(ROOT, doc.file), 'utf8');
  const groups = pack(toPages(md, doc.title), doc.pages);
  for (let n = 0; n < groups.length; n++) {
    const g = groups[n];
    // 한 장에 여러 절이 들어가므로 절마다 제목을 다시 그린다 —
    // 스크롤하다 보면 지금 어디를 읽고 있는지가 사라진다
    const body = g
      .map((s, k) => `<h2 class="${k ? 'more' : ''}">${inline(s.head)}</h2>${s.html.join('\n')}`)
      .join('\n');
    const html =
      `<!doctype html><meta charset="utf-8"><style>${CSS}</style>` +
      `<body><div class="doc">${doc.title}</div>${body}` +
      `<div class="foot">${n + 1} / ${groups.length}</div></body>`;
    await page.setContent(html, { waitUntil: 'load' });
    const name = `${doc.slug}-${String(n + 1).padStart(2, '0')}.png`;
    await page.screenshot({ path: resolve(OUT, name), fullPage: true });
    process.stdout.write(`  ${name}  ${g.map((s) => s.head).join(' / ')}\n`);
    total++;
  }
}

await browser.close();
writeFileSync(
  resolve(OUT, 'README.txt'),
  '설명서 이미지 — docs/*.md 에서 자동 생성됩니다 (npm run manual).\n' +
    '문서를 고치면 이 폴더를 지우고 다시 만드세요. 손으로 고치지 마세요.\n',
  'utf8',
);
console.log(`\n총 ${total}장 → ${OUT}`);
