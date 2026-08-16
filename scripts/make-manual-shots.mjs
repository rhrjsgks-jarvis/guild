/**
 * 설명서에 넣을 **실제 작동 화면** 촬영 — `npm run manual:shots`
 *
 * ★ 진짜 시트가 아니라 **모의 데이터**로 찍는다. 설명서는 단톡방에 돌아다니고
 *   저장소는 공개다 — 혈맹원 실명과 실제 다이아 금액이 거기 박히면 안 된다.
 *   모의 데이터는 언제든 다시 찍을 수 있다는 이점도 있다.
 * ★ 폰 크기(390×844) 그대로 찍는다. 데스크톱 폭으로 찍어 설명서에 넣으면
 *   "내 폰 화면과 다르게 생긴 그림"이 되어 오히려 헷갈린다.
 * ★ 결과는 manual/shots/*.png. make-manual.mjs 가 이것을 문서에 끼워 넣는다.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'manual/shots');

const MOCK_PORT = 8791;
const APP_PORT = 3104;
const APP = `http://127.0.0.1:${APP_PORT}`;
const PIN = '123456';

// npx 로 부르면 윈도우에서 spawn ENOENT 로 죽는다 (npx 는 npx.cmd 다)
const NEXT_BIN = 'node_modules/next/dist/bin/next';

const children = [];
const spawnBg = (cmd, args, env) => {
  const c = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: 'ignore' });
  c.unref();
  children.push(c);
};
const finish = (code) => {
  children.forEach((c) => { try { c.kill('SIGKILL'); } catch { /* 이미 죽었으면 그만 */ } });
  process.exit(code);
};
process.on('SIGINT', () => finish(130));

const waitUntil = async (label, probe, ms = 40_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await probe()) return; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${label} 준비 실패`);
};

spawnBg('node', ['scripts/mock-sheet.mjs'], { MOCK_PORT: String(MOCK_PORT) });
spawnBg('node', [NEXT_BIN, 'start', '-p', String(APP_PORT)], {
  GAS_URL: `http://127.0.0.1:${MOCK_PORT}/exec`,
  GAS_TOKEN: 'TESTTOKEN',
  ADMIN_PIN: PIN,
  SESSION_SECRET: 'manual-shots-only',
});
await waitUntil('앱', async () => (await (await fetch(`${APP}/api/health`)).json()).ok === true);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const chromiumPath = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium']
  .filter(Boolean)
  .find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: chromiumPath });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'ko-KR',
});
const page = await ctx.newPage();

/** 홈 아이콘은 이름이 아니라 **자리**로 누른다 — 목록 안에도 '관리' 버튼이 있다 */
const TILE = { 잔액: 0, 아이템: 1, 연합: 2, 레이드: 3, '내 정보': 4, 게시판: 5, 언어: 6, 관리: 7 };
const home = async () => {
  const x = page.locator('.screen-x');
  if (await x.count()) { await x.click(); await page.waitForTimeout(350); }
};
const tab = async (name) => {
  await home();
  await page.locator('.tile').nth(TILE[name]).click();
  await page.waitForTimeout(450);
};
const shot = async (name) => {
  // 토스트는 5초간 화면을 가린다 — 찍기 전에 눌러 닫는다
  const toast = page.locator('.toast');
  if (await toast.count()) { await toast.click({ timeout: 1000 }).catch(() => {}); await page.waitForTimeout(150); }
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });
  console.log(`  📸 ${name}`);
};

console.log('\n📸 설명서용 화면\n');

/* ── 혈맹원이 보는 화면 ── */
await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForSelector('.tile');
await shot('home');

await tab('잔액');
await page.waitForSelector('.row-name');
await shot('balance');

await tab('아이템');
await shot('items');

await tab('연합');
await page.waitForTimeout(600);
await shot('alliance');

await tab('레이드');
await page.waitForTimeout(600);
await shot('raid');

await tab('내 정보');
await page.locator('#meName').selectOption('TC무식');
await page.getByRole('button', { name: '조회하기' }).click();
await page.waitForTimeout(800);
await shot('me');

/* 게시판 — 혈맹원이 직접 쓸 수 있는 유일한 화면이라 설명서에 꼭 들어가야 한다 */
await tab('게시판');
await page.waitForTimeout(600);
await shot('board');

/* 언어 — 中文 으로 바꾼 화면을 보여주면 "이름도 바뀐다"가 한눈에 이해된다 */
await tab('언어');
await page.waitForTimeout(300);
await shot('lang');
await page.getByRole('button', { name: '中文' }).click();
await page.waitForTimeout(500);
await tab('아이템');
await page.waitForTimeout(500);
await shot('items-zh');
await tab('언어');
await page.getByRole('button', { name: '한국어' }).click();
await page.waitForTimeout(500);

/* ── 관리자 화면 ── */
await tab('관리');
await page.waitForTimeout(400);
await shot('admin-locked');

await page.locator('#pin').fill(PIN);
await page.getByRole('button', { name: /잠금 해제/ }).click();
await page.waitForTimeout(1200);
await shot('admin-unlocked');

/**
 * 절 제목을 화면 맨 위로 올려놓고 찍는다 — 관리 화면은 길어서 스크롤해야 나온다.
 *
 * ★ `getByText` 로 아무 글자나 집으면 안 된다. '혈맹원 관리' 는 위쪽 안내문
 *   ("혈맹원 한자 표기는 [혈맹원 관리]에서…") 안에도 있어서, 화면 맨 위를
 *   집고는 아무 데도 안 움직인 채 같은 그림을 또 찍는다. **절 제목(.sect)만** 본다.
 * ★ `scrollIntoViewIfNeeded()` 는 이 화면에서 **아무 일도 하지 않는다** (scrollY 가
 *   0 그대로였다). 직접 `scrollIntoView` 를 부른다 — 안 그러면 조용히 같은
 *   그림이 여러 장 나오고, 다 만들고 나서야 알게 된다.
 */
const HEADER_PX = 110; // 고정 헤더 + 화면 제목줄이 덮는 높이
const scrollShot = async (text, name) => {
  const h = page.locator('.sect').filter({ hasText: text }).first();
  if ((await h.count()) === 0) throw new Error(`절 제목을 찾지 못했습니다: ${text}`);
  const top = await h.evaluate((el, pad) => {
    el.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -pad); // 제목이 헤더에 가리지 않게 조금 위로
    return Math.round(window.scrollY);
  }, HEADER_PX);
  if (top === 0) throw new Error(`"${text}" 로 스크롤되지 않았습니다 — 같은 그림이 또 찍힙니다.`);
  await page.waitForTimeout(400);
  await shot(name);
};

/**
 * 글쓰기 창 — **관리자에게만** 보이는 `📌 공지로 올리기` 체크칸을 보여준다.
 * 혈맹원 화면과 같은 창인데 칸 하나가 더 있다는 것이 설명보다 그림이 빠르다.
 */
await tab('게시판');
await page.getByRole('button', { name: /글쓰기/ }).first().click();
await page.waitForTimeout(600);
await shot('board-write');
await page.locator('.sheet-x').last().click();
await page.waitForTimeout(400);

await tab('관리');
await page.waitForTimeout(400);
await scrollShot('혈맹원 관리', 'admin-roster');
await scrollShot('용어', 'admin-terms');
await scrollShot('관리 도구', 'admin-tools');

/* 아이템 — 관리자만 보이는 것들 */
await tab('아이템');
await page.waitForTimeout(600);
await shot('items-admin');

// 🏷️ 레이드·루팅 정보 — 분배가 끝난 건에도 쓸 수 있다 (돈을 안 만지기 때문)
await page.locator('.btn').filter({ hasText: '🏷' }).first().click();
await page.waitForTimeout(700);
await shot('loot-edit');
// 팝업은 바깥(backdrop)을 눌러도 닫히지 않는 것이 이 앱의 규칙이다 —
// 뒤에 있는 `.screen-x` 를 집으면 backdrop 에 막혀 영영 못 닫는다. 맨 위 ✕ 를 누른다
await page.locator('.sheet-x').last().click();
await page.waitForTimeout(500);

// 분배 — 판매금액을 넣으면 미리보기가 나온다
await tab('아이템');
await page.getByRole('button', { name: '분배' }).first().click();
await page.waitForTimeout(700);
await page.locator('input[type="number"], input[inputmode="numeric"]').first().fill('30000').catch(() => {});
await page.waitForTimeout(700);
await shot('distribute');

await browser.close();
console.log(`\n→ ${OUT}`);
finish(0);
