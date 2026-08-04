/**
 * 앱 통합 테스트 — `npm run e2e` (먼저 `npm run build` 필요)
 *
 * 모의 시트 + 실제 프로덕션 빌드를 띄우고, 진짜 브라우저로 훑는다.
 * 여기서 지키는 것은 두 가지다:
 *   ① 권한 경계 — PIN 없이는 아무것도 바꿀 수 없어야 한다
 *   ② 화면 흐름 — 등록·분배·지급이 실제로 숫자를 움직여야 한다
 *
 * 스크린샷을 남기려면: E2E_SHOTS=./shots npm run e2e
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

/**
 * 크로미움 위치 찾기.
 * CI 에서는 `npx playwright install chromium` 이 받아둔 것을 그대로 쓰고,
 * 브라우저가 미리 깔린 환경(개발 컨테이너 등)에서는 그쪽을 가리킨다.
 * playwright 버전과 미리 깔린 브라우저 버전이 어긋날 때 나는 오류를 피하기 위한 것.
 */
function chromiumPath() {
  const candidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium'].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

const MOCK_PORT = 8788;
const APP_PORT = 3101;
const APP = `http://127.0.0.1:${APP_PORT}`;
const MOCK = `http://127.0.0.1:${MOCK_PORT}/exec`;
const PIN = '123456';
const SHOTS = process.env.E2E_SHOTS;

if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const children = [];
function spawnBg(cmd, args, env) {
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: 'ignore' });
  // unref 하지 않으면 자식이 살아있는 동안 node 가 종료되지 않아,
  // 테스트가 전부 통과하고도 프로세스가 매달린다 (CI 에서 그대로 타임아웃)
  child.unref();
  children.push(child);
  return child;
}

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

/**
 * 조건이 참이 될 때까지 기다린다.
 *
 * 단순히 "포트가 열렸는지"만 보면 안 된다 — Next 는 떴지만 모의 시트가
 * 아직 안 떴을 때 첫 요청이 실패하고, 그 실패가 캐시를 타면 뒤따르는
 * 테스트가 통째로 무너진다(실제로 겪었다).
 */
async function waitUntil(label, probe, timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '(응답 없음)';
  while (Date.now() < deadline) {
    try {
      if (await probe()) return;
    } catch (err) {
      lastError = err.message;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${label} 가 ${timeoutMs}ms 안에 준비되지 않았습니다. 마지막 오류: ${lastError}`);
}

/* ── 테스트 러너 ── */
const results = [];
let failed = 0;

async function t(name, fn) {
  try {
    await fn();
    results.push(`  ✅ ${name}`);
  } catch (err) {
    failed += 1;
    results.push(`  ❌ ${name}\n     ${err.message}`);
  }
}
function eq(actual, expected, what) {
  if (actual !== expected) throw new Error(`${what}: 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`);
}

const post = (path, body, headers = {}) =>
  fetch(APP + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });

/* ────────────────────────────────────────────── */

console.log('\n🧪 통합 테스트\n');

spawnBg('node', ['scripts/mock-sheet.mjs'], { MOCK_PORT: String(MOCK_PORT) });
spawnBg('npx', ['next', 'start', '-p', String(APP_PORT)], {
  GAS_URL: MOCK,
  GAS_TOKEN: 'TESTTOKEN',
  ADMIN_PIN: PIN,
  SESSION_SECRET: 'e2e-secret-not-used-in-production',
});

// 모의 시트가 먼저, 그다음 앱 — 그리고 앱이 "시트까지 잘 붙었다"고 말할 때까지 기다린다
await waitUntil('모의 시트', async () => {
  const res = await fetch(MOCK, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'ping', token: 'TESTTOKEN' }),
  });
  return (await res.json()).ok === true;
});

await waitUntil('앱 ↔ 시트 연결', async () => {
  const res = await fetch(`${APP}/api/health`);
  return res.ok && (await res.json()).ok === true;
});

/* ── ① 권한 경계 (서버) ── */

await t('설정 점검이 정상으로 나온다', async () => {
  const r = await (await fetch(`${APP}/api/health`)).json();
  eq(r.ok, true, 'health.ok');
  eq(r.sheet.connected, true, '시트 연결');
});

await t('조회는 인증 없이 열린다', async () => {
  const res = await fetch(`${APP}/api/state`);
  eq(res.status, 200, 'HTTP 상태');
  const r = await res.json();
  eq(Array.isArray(r.data.rows), true, 'rows 배열');
  eq(r.admin, false, '비로그인 상태의 admin 플래그');
});

for (const path of ['/api/admin/register', '/api/admin/distribute', '/api/admin/payout', '/api/admin/photo']) {
  await t(`인증 없이 ${path} → 401`, async () => {
    eq((await post(path, { name: '가이', amount: 100 })).status, 401, 'HTTP 상태');
  });
}

await t('틀린 PIN → 401', async () => {
  eq((await post('/api/admin/login', { pin: '000000' })).status, 401, 'HTTP 상태');
});

await t('위조 쿠키 → 401', async () => {
  const res = await post(
    '/api/admin/payout',
    { name: '가이', amount: 100 },
    { Cookie: `gm_admin=${Date.now() + 999999}.FORGEDSIGNATURE` },
  );
  eq(res.status, 401, 'HTTP 상태');
});

let cookie = '';
await t('맞는 PIN → 서명 쿠키 발급', async () => {
  const res = await post('/api/admin/login', { pin: PIN });
  eq(res.status, 200, 'HTTP 상태');
  cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  if (!cookie.startsWith('gm_admin=')) throw new Error('gm_admin 쿠키가 없습니다.');
});

await t('금액 검증: 음수·소수·초과 지급 거부', async () => {
  for (const amount of [-5, 0, 1.5, 99_999_999]) {
    const res = await post('/api/admin/payout', { name: '가이', amount }, { Cookie: cookie });
    if (res.status === 200) throw new Error(`${amount} 이 통과했습니다.`);
  }
});

await t('지급하면 분배전이 줄고 분배완료가 그만큼 는다', async () => {
  const before = (await (await fetch(`${APP}/api/state`)).json()).data.rows.find((r) => r.name === '가이');
  const res = await post('/api/admin/payout', { name: '가이', amount: 400 }, { Cookie: cookie });
  eq((await res.json()).ok, true, '지급 결과');

  // /api/state 에는 8초 캐시가 있으므로 캐시를 타지 않는 개인 조회로 확인한다
  const after = (await (await post('/api/lookup', { name: '가이' })).json()).data;
  eq(after.pending, before.pending - 400, '분배전');
  eq(after.paid, before.paid + 400, '분배완료');
});

/* ── ② 화면 흐름 (브라우저) ── */

const browser = await chromium.launch({ executablePath: chromiumPath() });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'ko-KR',
});
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));

const shot = (name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : Promise.resolve());

await t('길드원 화면: 잔액이 보이고 관리 버튼은 없다', async () => {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForSelector('.row-name');
  await shot('01-viewer-balance');

  await page.getByRole('button', { name: /아이템/ }).click();
  await page.waitForTimeout(300);
  eq(await page.getByRole('button', { name: '분배' }).count(), 0, '분배 버튼 개수');
  await page.getByRole('button', { name: /잔액/ }).click();
  await page.waitForTimeout(300);
  eq(await page.getByRole('button', { name: '지급' }).count(), 0, '지급 버튼 개수');
});

await t('공유 카드의 QR이 앱 주소로 디코딩된다', async () => {
  await page.getByRole('button', { name: /관리/ }).click();
  await page.waitForSelector('[aria-label="앱 주소 QR 코드"] svg', { timeout: 10_000 });
  await shot('02-share');

  const png = await page.evaluate(async () => {
    const svg = document.querySelector('[aria-label="앱 주소 QR 코드"] svg');
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(svg))));
    await img.decode();
    const N = 300;
    const c = document.createElement('canvas');
    c.width = N;
    c.height = N;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, N, N);
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, N, N);
    return Array.from(g.getImageData(0, 0, N, N).data);
  });

  const { default: jsQR } = await import('jsqr');
  const decoded = jsQR(new Uint8ClampedArray(png), 300, 300);
  if (!decoded) throw new Error('QR을 읽을 수 없습니다 (스캔되지 않는 QR).');
  eq(decoded.data, APP, 'QR 내용');
});

await t('PIN을 넣으면 관리 버튼이 나타난다', async () => {
  await page.locator('#pin').fill(PIN);
  await page.getByRole('button', { name: /잠금 해제/ }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /잔액/ }).click();
  await page.waitForTimeout(500);
  if ((await page.getByRole('button', { name: '지급' }).count()) === 0) {
    throw new Error('로그인 후에도 지급 버튼이 없습니다.');
  }
  await shot('03-admin-balance');
});

await t('분배 미리보기가 혈비·1인당을 정확히 계산한다', async () => {
  await page.getByRole('button', { name: /아이템/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '분배' }).first().click();
  await page.locator('#amt').fill('50000');
  await page.waitForTimeout(300);
  await shot('04-distribute');

  const text = await page.locator('.calc').innerText();
  // 50,000 → 혈비 5,000 / 남은 45,000 을 19명이 나누면 1인당 2,368, 나머지 8
  if (!text.includes('5,000')) throw new Error(`혈비 5,000 이 보이지 않습니다:\n${text}`);
  if (!text.includes('2,368')) throw new Error(`1인당 2,368 이 보이지 않습니다:\n${text}`);
  await page.getByRole('button', { name: '취소' }).click();
});

await t('아이템을 등록하면 목록에 나타난다', async () => {
  await page.locator('#fItem').fill('E2E 테스트 아이템');
  await page.getByRole('button', { name: '전체 선택' }).click();
  await page.getByRole('button', { name: /아이템 등록/ }).last().click();
  await page.getByRole('button', { name: '등록하기' }).click();
  await page.waitForTimeout(1500);
  if (!(await page.getByText('E2E 테스트 아이템').first().isVisible())) {
    throw new Error('등록한 아이템이 목록에 나타나지 않습니다.');
  }
  await shot('05-registered');
});

await t('브라우저 콘솔에 오류가 없다', () => {
  if (consoleErrors.length) throw new Error(consoleErrors.join('\n     '));
});

await browser.close();

/* ────────────────────────────────────────────── */

results.forEach((r) => console.log(r));
if (failed) {
  console.log(`\n❌ ${failed}건 실패 / ${results.length}건 중\n`);
  finish(1);
}
console.log(`\n✅ ${results.length}건 전부 통과\n`);
finish(0);
