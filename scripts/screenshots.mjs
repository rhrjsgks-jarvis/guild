/**
 * 화면 모음 만들기 — `npm run shots`
 *
 * 모의 시트로 앱을 띄우고 주요 화면을 전부 찍은 뒤, 라벨을 붙인
 * 한 장짜리 시트로 합쳐서 `shots/` 에 넣는다.
 * 디자인을 바꾼 뒤 "전체가 어떻게 보이는지" 한눈에 확인할 때 쓴다.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const MOCK_PORT = 8789;
const APP_PORT = 3102;
const APP = `http://127.0.0.1:${APP_PORT}`;
const MOCK = `http://127.0.0.1:${MOCK_PORT}/exec`;
const PIN = '123456';
const OUT = 'shots';

mkdirSync(OUT, { recursive: true });

const children = [];
const spawnBg = (cmd, args, env) => {
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: 'ignore' });
  // unref 하지 않으면 자식이 살아있는 동안 node 가 종료되지 않는다 (스크립트가 끝나도 매달림)
  child.unref();
  children.push(child);
};

/** 띄워둔 서버를 정리하고 확실히 종료한다 */
function finish(code) {
  children.forEach((c) => {
    try {
      c.kill('SIGKILL');
    } catch {
      /* 이미 죽었으면 그만 */
    }
  });
  process.exit(code);
}
process.on('SIGINT', () => finish(130));

function chromiumPath() {
  return [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium'].filter(Boolean).find((p) => existsSync(p));
}

async function waitUntil(label, probe, timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await probe()) return;
    } catch {
      /* 아직 */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${label} 준비 실패`);
}

spawnBg('node', ['scripts/mock-sheet.mjs'], { MOCK_PORT: String(MOCK_PORT) });
spawnBg('npx', ['next', 'start', '-p', String(APP_PORT)], {
  GAS_URL: MOCK,
  GAS_TOKEN: 'TESTTOKEN',
  ADMIN_PIN: PIN,
  SESSION_SECRET: 'screenshot-run-only',
});

await waitUntil('앱', async () => (await (await fetch(`${APP}/api/health`)).json()).ok === true);

const browser = await chromium.launch({ executablePath: chromiumPath() });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'ko-KR',
});
const page = await ctx.newPage();

/** 찍은 그림을 라벨과 함께 모아둔다 */
const shots = [];
async function snap(group, label) {
  // 토스트는 5초간 떠 있어서 여러 장에 걸쳐 화면을 가린다 — 찍기 전에 눌러서 닫는다
  const toast = page.locator('.toast');
  if (await toast.count()) {
    await toast.click({ timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(350);
  const buf = await page.screenshot();
  shots.push({ group, label, data: buf.toString('base64') });
  console.log(`  📸 ${label}`);
}

// 탭 전환은 반드시 하단 탭바로 한정한다 — 목록 안에도 '관리' 버튼이 있어서
// 범위를 안 좁히면 엉뚱한 버튼이 눌린다
const tab = async (name) => {
  await page.locator('.nav button', { hasText: new RegExp(name) }).click();
  await page.waitForTimeout(400);
};

console.log('\n📸 화면 촬영\n');

/* ── 길드원이 보는 화면 ── */
await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForSelector('.row-name');
await snap('viewer', '잔액 — 누가 얼마나 받을지');

await tab('아이템');
await snap('viewer', '아이템 — 분배 버튼이 없다');

await tab('내 정보');
await page.locator('#meName').selectOption('TC무식');
await page.getByRole('button', { name: '조회하기' }).click();
await page.waitForTimeout(800);
await snap('viewer', '내 정보 — 본인 것만');

await tab('관리');
await page.waitForSelector('[aria-label="앱 주소 QR 코드"] svg', { timeout: 10_000 });
await snap('viewer', '관리 — 잠김 + 공유 QR');

/* ── 관리자 화면 ── */
await page.locator('#pin').fill(PIN);
await page.getByRole('button', { name: /잠금 해제/ }).click();
await page.waitForTimeout(1500);

await tab('잔액');
await snap('admin', '잔액 — 지급 버튼이 생김');

await page.getByRole('button', { name: '지급' }).first().click();
await snap('admin', '지급 — 전액/절반/직접 입력');
await page.getByRole('button', { name: '취소' }).click();
await page.waitForTimeout(300);

await tab('아이템');
await snap('admin', '아이템 — 분배 + 등록');

await page.getByRole('button', { name: '분배' }).first().click();
await page.locator('#amt').fill('50000');
await snap('admin', '분배 — 혈비·1인당 미리보기');
await page.getByRole('button', { name: '취소' }).click();
await page.waitForTimeout(300);

await page.locator('#fItem').fill('그림자 반지');
await page.getByRole('button', { name: '전체 선택' }).click();
await page.locator('#fItem').scrollIntoViewIfNeeded();
await snap('admin', '등록 — 참여자 선택');

await page.getByRole('button', { name: /아이템 등록/ }).last().click();
await snap('admin', '등록 확인 — 마지막 점검');
await page.getByRole('button', { name: '취소' }).click();
await page.waitForTimeout(300);

/* ── 혈맹원 아이디 관리 ── */
await tab('관리');
await page.waitForSelector('.row-name', { timeout: 10_000 });
await page.getByText(/혈맹원 관리/).first().scrollIntoViewIfNeeded();
await snap('admin', '혈맹원 관리 — 추가·변경·탈퇴');

await page.getByRole('button', { name: '➕ 혈맹원 추가' }).click();
await page.locator('#addName').fill('신입혈맹원');
await snap('admin', '혈맹원 추가');
await page.getByRole('button', { name: '취소' }).click();
await page.waitForTimeout(300);

// 목록 행의 [관리] 버튼 (하단 탭바가 아니라)
await page.locator('.row button', { hasText: '관리' }).first().click();
await page.waitForTimeout(400);
await snap('admin', '아이디 변경 · 탈퇴');
await page.getByRole('button', { name: /탈퇴 처리/ }).click();
await page.waitForTimeout(700);
await snap('admin', '탈퇴 — 잔액이 남으면 되물음');
await page.getByRole('button', { name: '뒤로' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: '취소' }).click();
await page.waitForTimeout(300);

/* ── 다크 모드 ── */
await page.emulateMedia({ colorScheme: 'dark' });
await tab('잔액');
await snap('dark', '잔액 (다크)');

await tab('아이템');
await page.getByRole('button', { name: '분배' }).first().click();
await page.locator('#amt').fill('50000');
await snap('dark', '분배 (다크)');
await page.getByRole('button', { name: '취소' }).click();

await tab('관리');
await page.waitForTimeout(600);
await snap('dark', '관리 (다크)');

/* ── 라벨 붙여 한 장으로 합치기 ── */
const GROUPS = [
  ['viewer', '길드원이 보는 화면 — 링크만 있으면 됩니다 (PIN 불필요)', '#3b3fd8'],
  ['admin', '관리자 화면 — PIN을 넣으면 나타납니다', '#e06a00'],
  ['dark', '다크 모드 — 폰 설정을 따라갑니다', '#7d84ff'],
];

const sheet = await ctx.newPage();
for (const [group, title, accent] of GROUPS) {
  const items = shots.filter((s) => s.group === group);
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0e1014;font-family:-apple-system,'Noto Sans KR',sans-serif">
<div style="padding:44px 40px 32px">
  <div style="color:${accent};font-size:15px;font-weight:800;letter-spacing:.4px;margin-bottom:6px">길드정산 · v8.0</div>
  <div style="color:#fff;font-size:31px;font-weight:800;letter-spacing:-.8px">${title}</div>
</div>
<div style="display:flex;gap:26px;padding:0 40px 44px;align-items:flex-start">
  ${items
    .map(
      (s) => `<figure style="margin:0;flex:1">
    <img src="data:image/png;base64,${s.data}" style="width:100%;display:block;border-radius:20px;border:1px solid #2a2f3a;box-shadow:0 18px 44px rgba(0,0,0,.55)">
    <figcaption style="color:#c9cfda;font-size:16px;font-weight:600;text-align:center;margin-top:16px;line-height:1.4">${s.label}</figcaption>
  </figure>`,
    )
    .join('')}
</div></body>`;

  // 높이는 작게 잡고 fullPage 에 맡긴다 — 뷰포트를 크게 잡으면 아래에 빈 공간이 남는다
  await sheet.setViewportSize({ width: Math.min(items.length * 420 + 80, 2600), height: 400 });
  await sheet.setContent(html, { waitUntil: 'load' });
  await sheet.waitForTimeout(400);
  const path = `${OUT}/${group}.png`;
  await sheet.screenshot({ path, fullPage: true });
  console.log(`  🖼️  ${path}`);
}

// 낱장도 남겨둔다 (특정 화면만 필요할 때)
shots.forEach((s, i) => {
  writeFileSync(`${OUT}/${String(i + 1).padStart(2, '0')}-${s.group}.png`, Buffer.from(s.data, 'base64'));
});

await browser.close();
console.log(`\n✅ ${shots.length}장 촬영 · 합본 ${GROUPS.length}장 → ${OUT}/\n`);
finish(0);
