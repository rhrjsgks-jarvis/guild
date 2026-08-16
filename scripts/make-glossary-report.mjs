/**
 * 용어집 현황 → 링크로 볼 수 있는 표 + 요약 이미지
 *
 *   node scripts/make-glossary-report.mjs [앱주소]
 *
 * ★ **운영 시트에서 지금 이 순간의 값을 읽어** 만든다. 등록할 때 쓴 원본 파일로
 *   만들면 "보낸 것"만 보이고 "실제로 들어간 것"은 못 본다 — 확인의 뜻이 없어진다.
 * ★ 두 가지를 낸다:
 *     glossary.tsv  — GitHub 이 표로 그려주고 **검색까지 된다** (504줄을 눈으로 훑을 수는 없다)
 *     glossary.png  — 폰에서 한눈에 보는 요약 (총계·분류·티어·빈칸)
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'manual');
const APP = process.argv[2] || 'https://lineagewguildmanager.vercel.app';

const res = await fetch(`${APP}/api/terms?fresh=1`);
if (!res.ok) throw new Error(`용어를 읽지 못했습니다 (HTTP ${res.status})`);
const terms = (await res.json())?.data?.terms ?? [];
if (terms.length === 0) throw new Error('용어가 0건입니다 — 시트를 확인하세요.');

mkdirSync(OUT, { recursive: true });

/* ── ① 표 (검색 가능) ─────────────────────────────────────── */
const clean = (s) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim();
const order = { 보스: 0, 전설: 1, 신화: 2 };
const rows = [...terms].sort(
  (a, b) => (order[a.cat] ?? 9) - (order[b.cat] ?? 9) || a.ko.localeCompare(b.ko, 'ko'),
);
writeFileSync(
  resolve(OUT, 'glossary.tsv'),
  ['분류\t한국어\t中文\tEnglish\t티어', ...rows.map((t) => [t.cat, t.ko, t.zh, t.en, t.tier].map(clean).join('\t'))].join('\n') + '\n',
  'utf8',
);

/* ── ② 요약 이미지 ────────────────────────────────────────── */
const count = (fn) => terms.filter(fn).length;
const byCat = {};
const byTier = {};
for (const t of terms) {
  byCat[t.cat] = (byCat[t.cat] ?? 0) + 1;
  const k = clean(t.tier) || '(없음)';
  byTier[k] = (byTier[k] ?? 0) + 1;
}
const noZh = count((t) => !clean(t.zh));
const noEn = count((t) => !clean(t.en));
const dup = terms.length - new Set(terms.map((t) => t.ko)).size;

const row = (k, v, warn = false) =>
  `<tr><td>${k}</td><td class="${warn ? 'warn' : 'ok'}">${v}</td></tr>`;
const tierRows = ['0티어', '1티어', '2티어', '3티어', '(없음)']
  .filter((k) => byTier[k])
  .map((k) => row(k, `${byTier[k]}건`))
  .join('');

const html = `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:900px;background:#eeeae1;color:#1a1815;
    font:17px/1.7 -apple-system,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;padding:34px 38px 40px}
  .doc{font-size:15px;color:#6a6559;margin-bottom:6px}
  h2{font-size:30px;color:#12313f;font-weight:800;
    border-bottom:3px solid rgba(217,167,64,.55);padding-bottom:12px;margin-bottom:6px}
  .at{font-size:14px;color:#9a9488;margin-bottom:18px}
  h3{font-size:19px;margin:20px 0 8px;color:#1f6d8a}
  table{border-collapse:collapse;width:100%;margin:8px 0;font-size:16px}
  th,td{border:1px solid #ddd5c6;padding:8px 12px;text-align:left}
  th{background:#12313f;color:#fff}
  td:last-child{text-align:right;font-weight:700}
  .ok{color:#1a1815}.warn{color:#a33}
  .big{font-size:38px;font-weight:800;color:#12313f}
  .note{background:#f5f1e8;border-left:4px solid #1f6d8a;padding:12px 16px;margin-top:18px;font-size:15px}
</style><body>
<div class="doc">길드정산 — 용어 사전</div>
<h2>등록 현황</h2>
<div class="at">시트에서 방금 읽은 값입니다</div>

<p class="big">${terms.length}건</p>

<h3>분류</h3>
<table><tr><th>분류</th><th>건수</th></tr>
${['보스', '전설', '신화'].filter((k) => byCat[k]).map((k) => row(k, `${byCat[k]}건`)).join('')}
</table>

<h3>티어</h3>
<table><tr><th>티어</th><th>건수</th></tr>${tierRows}</table>

<h3>점검</h3>
<table><tr><th>항목</th><th>결과</th></tr>
${row('中文 빈칸', noZh === 0 ? '없음 ✅' : `${noZh}건`, noZh > 0)}
${row('English 빈칸', noEn === 0 ? '없음 ✅' : `${noEn}건`, noEn > 0)}
${row('한국어 중복', dup === 0 ? '없음 ✅' : `${dup}건`, dup > 0)}
</table>

<div class="note">
  <b>(없음) 티어는 정상입니다.</b> 보스와 마법서·정수·비법서는 티어라는 개념이 없습니다.<br>
  장비인데 표기가 없는 것만 <b>0티어</b>로 넣었습니다.
</div>
</body>`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 200 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: resolve(OUT, 'glossary.png'), fullPage: true });
await browser.close();

console.log(`용어 ${terms.length}건 → manual/glossary.tsv · manual/glossary.png`);
console.log(`  분류 ${JSON.stringify(byCat)}`);
console.log(`  티어 ${JSON.stringify(byTier)}`);
