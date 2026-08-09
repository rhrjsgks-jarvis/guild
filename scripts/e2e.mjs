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
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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

/**
 * 모의 시트가 내려주는 버전 — 소스에서 읽는다.
 * 여기에 숫자를 적어두면 버전을 올릴 때마다 검사가 조용히 깨진다.
 */
const GS_VER = (readFileSync(new URL('./mock-sheet.mjs', import.meta.url), 'utf8')
  .match(/const GS_VERSION = '([\d.]+)'/) ?? [])[1];
if (!GS_VER) throw new Error('모의 시트의 GS_VERSION 을 읽지 못했습니다.');
const MOCK = `http://127.0.0.1:${MOCK_PORT}/exec`;
const PIN = '123456';
const MASTER_PIN = 'master-9876';
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

const send = (method) => (path, body, headers = {}) =>
  fetch(APP + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });

const post = send('POST');
const patch = send('PATCH');
const del = send('DELETE');

/** 모의 시트에만 있는 기능 (앱 API 에는 없다) */
const mock = (action, extra = {}) =>
  fetch(MOCK, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, token: 'TESTTOKEN', ...extra }),
  });

/** 모의 시트를 처음 상태로 되돌린다 */
const reset = () => mock('__reset');

/* ────────────────────────────────────────────── */

console.log('\n🧪 통합 테스트\n');

/**
 * 이전 실행이 남긴 서버가 포트를 잡고 있으면, 그쪽이 옛 빌드를 계속 내주는 바람에
 * "청크를 못 찾는다"는 엉뚱한 오류로 테스트가 무더기로 깨진다. 실제로 두 번 겪었다.
 * 원인을 헤매지 않도록 시작 전에 확인하고 분명하게 알린다.
 */
for (const [label, port] of [
  ['모의 시트', MOCK_PORT],
  ['앱', APP_PORT],
]) {
  try {
    await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1500) });
    console.error(
      `❌ 포트 ${port} 를 이미 누가 쓰고 있습니다 (${label}).\n` +
        `   이전 실행이 남아 있을 수 있습니다. 아래로 정리한 뒤 다시 실행하세요:\n` +
        `   pgrep -f "scripts/mock-sheet|next start" | xargs -r kill -9\n`,
    );
    process.exit(1);
  } catch {
    /* 아무도 안 쓰고 있다 — 정상 */
  }
}

spawnBg('node', ['scripts/mock-sheet.mjs'], { MOCK_PORT: String(MOCK_PORT) });
spawnBg('npx', ['next', 'start', '-p', String(APP_PORT)], {
  GAS_URL: MOCK,
  GAS_TOKEN: 'TESTTOKEN',
  ADMIN_PIN: PIN,
  MASTER_PIN,
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

for (const path of [
  '/api/admin/member',
  '/api/admin/register',
  '/api/admin/distribute',
  '/api/admin/payout',
  '/api/admin/photo',
  '/api/admin/rename',
  '/api/admin/alliance',
  '/api/admin/alliance-photo',
  '/api/admin/member-settings',
  '/api/admin/raid',
  '/api/master',
]) {
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

// 정정·삭제·지급취소·되돌릴 수 없는 도구는 마스터 전용이라, 뒤쪽 검사들이
// 이 쿠키를 쓴다. 등급 자체를 확인하는 검사는 아래쪽에 따로 있다.
let masterCookie = '';
await t('마스터 PIN 으로도 쿠키를 받는다', async () => {
  const res = await post('/api/admin/login', { pin: MASTER_PIN });
  eq(res.status, 200, 'HTTP 상태');
  masterCookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  if (!masterCookie.startsWith('gm_admin=')) throw new Error('gm_admin 쿠키가 없습니다.');
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

await t('명단 조회는 관리자만', async () => {
  eq((await fetch(`${APP}/api/admin/roster`)).status, 401, '비로그인 HTTP 상태');
  const res = await fetch(`${APP}/api/admin/roster`, { headers: { Cookie: cookie } });
  eq(res.status, 200, '로그인 HTTP 상태');
  const list = (await res.json()).data;
  if (!Array.isArray(list) || list.length === 0) throw new Error('명단이 비어 있습니다.');
  if (!list.some((m) => m.isFund)) throw new Error('혈비 계정 표시가 없습니다.');
});

await t('아이디 변경: 잔액이 새 이름으로 따라온다', async () => {
  const before = (await (await post('/api/lookup', { name: 'PlusS' })).json()).data;
  const res = await post('/api/admin/rename', { oldName: 'PlusS', newName: 'PlusS바뀜' }, { Cookie: cookie });
  eq((await res.json()).ok, true, '변경 결과');

  const after = (await (await post('/api/lookup', { name: 'PlusS바뀜' })).json()).data;
  eq(after.pending, before.pending, '분배전');
  eq(after.paid, before.paid, '분배완료');
  eq((await (await post('/api/lookup', { name: 'PlusS' })).json()).ok, false, '옛 이름 조회');
});

await t('아이디 변경: 이미 있는 이름이면 합치기 전에 되묻는다', async () => {
  const res = await post('/api/admin/rename', { oldName: '가이', newName: 'TC무식' }, { Cookie: cookie });
  eq(res.status, 200, 'HTTP 상태');
  const body = await res.json();
  eq(body.ok, false, 'ok');
  eq(body.needsConfirm, true, 'needsConfirm');

  // 되묻기를 무시하고 병합이 일어나지 않았는지 확인
  eq((await (await post('/api/lookup', { name: '가이' })).json()).ok, true, '가이가 그대로 있어야 함');
});

await t('먼저 신규로 넣고 나중에 옛 아이디에서 불러오면 과거 기록이 합쳐진다', async () => {
  await reset();
  // 사진 등록 때 개명을 고르지 않고 일단 신규로 넣은 상황을 만든다.
  // (서버만 지정하고 잔액·참여횟수는 0인 새 행)
  eq((await (await post('/api/admin/member', { name: '가이2' }, { Cookie: cookie })).json()).ok, true, '신규 추가');
  eq((await (await post('/api/admin/member-settings', { name: '가이2', server: '07' }, { Cookie: cookie })).json()).ok,
    true, '새 행에 서버 지정');

  const before = (await (await fetch(`${APP}/api/admin/roster`, { headers: { Cookie: cookie } })).json()).data;
  const old = before.find((m) => m.name === '가이');
  eq(before.find((m) => m.name === '가이2')?.pending, 0, '새 행은 0부터');

  // ★ 되묻지 않고 합치면 안 된다 — 다른 사람이면 두 사람 잔액이 합쳐진다 (규칙 5-1)
  const ask = await (await post('/api/admin/rename', { oldName: '가이', newName: '가이2' }, { Cookie: cookie })).json();
  eq(ask.ok, false, '확인 없이는 거부');
  eq(ask.needsConfirm, true, '되묻기');
  if (!ask.msg.includes('12,400')) throw new Error(`되물을 때 구체적인 금액이 없습니다: ${ask.msg}`);

  // 확인하면 과거 기록이 새 아이디로 넘어온다
  const done = await (
    await post('/api/admin/rename', { oldName: '가이', newName: '가이2', confirmMerge: true }, { Cookie: cookie })
  ).json();
  eq(done.ok, true, '병합 결과');

  const after = (await (await fetch(`${APP}/api/admin/roster`, { headers: { Cookie: cookie } })).json()).data;
  const merged = after.filter((m) => m.name === '가이2');
  // ★ 같은 이름이 두 줄 남으면 명단·참여자 칩에 한 사람이 두 번 보인다 (규칙 4)
  eq(merged.length, 1, '병합 뒤 같은 이름의 줄 수');
  eq(after.some((m) => m.name === '가이'), false, '옛 아이디는 사라진다');
  eq(merged[0].pending, old.pending, '분배전 승계');
  // 나중에 지정한 서버(07)가 살아남는다 — 관리자가 방금 넣은 값이다
  eq(merged[0].server, '07', '살아남는 행의 서버');

  // 잔액·참여횟수도 함께 넘어온다
  const st = (await (await fetch(`${APP}/api/state?fresh=1`)).json()).data;
  const row = st.rows.find((r) => r.name === '가이2');
  eq(row.pending, 12400, '분배전');
  eq(row.paid, 88000, '분배완료');
  eq(row.cnt, 31, '참여횟수');
  eq(st.rows.filter((r) => r.name === '가이2').length, 1, '잔액현황의 줄 수');

  // 이 검사는 '가이' 를 없애버리므로, 뒤 검사들을 위해 원래 상태로 돌려놓는다
  await reset();
});

await t('아이디 변경: 혈비 계정은 거부된다', async () => {
  const res = await post(
    '/api/admin/rename',
    { oldName: '유일배분(혈비)', newName: '아무거나' },
    { Cookie: cookie },
  );
  eq((await res.json()).ok, false, 'ok');
});

await t('혈맹원 추가: 명단에 들어가고 중복은 거부된다', async () => {
  const res = await post('/api/admin/member', { name: '신입혈맹원' }, { Cookie: cookie });
  eq((await res.json()).ok, true, '추가 결과');

  const list = (await (await fetch(`${APP}/api/admin/roster`, { headers: { Cookie: cookie } })).json()).data;
  if (!list.some((m) => m.name === '신입혈맹원')) throw new Error('명단에 없습니다.');

  const dup = await post('/api/admin/member', { name: '신입혈맹원' }, { Cookie: cookie });
  eq((await dup.json()).ok, false, '중복 추가');
});

await t('탈퇴: 이력 없는 사람은 목록에서 사라진다', async () => {
  const res = await del('/api/admin/member', { name: '신입혈맹원' }, { Cookie: cookie });
  const body = await res.json();
  eq(body.ok, true, '탈퇴 결과');
  eq(body.kept, false, '이력이 없으므로 보존하지 않음');

  const list = (await (await fetch(`${APP}/api/admin/roster`, { headers: { Cookie: cookie } })).json()).data;
  if (list.some((m) => m.name === '신입혈맹원')) throw new Error('아직 명단에 남아 있습니다.');
});

await t('탈퇴: 잔액이 남으면 먼저 되묻는다', async () => {
  const res = await del('/api/admin/member', { name: '대서과Z' }, { Cookie: cookie });
  eq(res.status, 200, 'HTTP 상태');
  const body = await res.json();
  eq(body.ok, false, 'ok');
  eq(body.needsConfirm, true, 'needsConfirm');

  // 되묻기를 무시하고 빠지지 않았는지 확인
  const list = (await (await fetch(`${APP}/api/admin/roster`, { headers: { Cookie: cookie } })).json()).data;
  if (!list.some((m) => m.name === '대서과Z')) throw new Error('확인 없이 탈퇴되었습니다.');
});

await t('탈퇴: 확인하면 기록은 (미등록)으로 남는다', async () => {
  const before = (await (await post('/api/lookup', { name: '대서과Z' })).json()).data;
  const res = await del('/api/admin/member', { name: '대서과Z', confirmRemove: true }, { Cookie: cookie });
  const body = await res.json();
  eq(body.ok, true, '탈퇴 결과');
  eq(body.kept, true, '잔액이 있으므로 보존');

  // 명단에서는 빠지되, 잔액 기록 자체는 사라지지 않아야 한다
  const list = (await (await fetch(`${APP}/api/admin/roster`, { headers: { Cookie: cookie } })).json()).data;
  if (list.some((m) => m.name === '대서과Z')) throw new Error('명단에 남아 있습니다.');

  const still = (await (await post('/api/lookup', { name: '대서과Z' })).json()).data;
  eq(still.pending, before.pending, '보존된 분배전');
});

await t('탈퇴: 혈비 계정은 거부된다', async () => {
  const res = await del('/api/admin/member', { name: '유일배분(혈비)', confirmRemove: true }, { Cookie: cookie });
  eq((await res.json()).ok, false, 'ok');
});

/* ── ①-2 정산 정정 · 도구 (v9.0) ── */

for (const [label, path] of [
  ['아이템 정정·삭제', '/api/admin/items'],
  ['지급 취소', '/api/admin/payout-undo'],
  ['관리 도구', '/api/admin/tools'],
]) {
  await t(`인증 없이 ${label} → 401`, async () => {
    eq((await fetch(APP + path)).status, 401, 'GET');
    eq((await post(path, { row: 3 })).status, 401, 'POST');
  });
}

await t('아이템 목록에 미분배·분배완료가 모두 나온다', async () => {
  const list = (await (await fetch(`${APP}/api/admin/items`, { headers: { Cookie: cookie } })).json()).data;
  if (!list.some((i) => i.status.includes('미분배'))) throw new Error('미분배 항목이 없습니다.');
  if (!list.some((i) => i.status.includes('분배완료'))) throw new Error('분배완료 항목이 없습니다.');
});

await t('정정 미리보기가 되돌릴 금액을 알려준다', async () => {
  const res = await post('/api/admin/items', { op: 'preview', row: 3 }, { Cookie: cookie });
  const d = (await res.json()).data;
  eq(d.needsReverse, true, 'needsReverse');
  eq(d.blocked, false, 'blocked');
  // 3,000 → 운영비 300, 남은 2,700 을 3명(전원 100%)이 나누면 1인당 900.
  // v10 부터는 "누구에게서 얼마" 목록으로 내려온다 — 되돌리는 금액이 원금과 딱 맞아야 한다.
  eq(d.toMembers, 2700, '참여자에게서 회수할 합계');
  eq(d.fund, 300, '운영비에서 회수할 금액');
  eq(d.lines.length, 4, '회수 대상 줄 수 (참여자 3 + 운영비)');
  eq(d.lines.reduce((a, b) => a + b.amount, 0), d.amount, '회수 총액 = 분배 금액');
});

await t('이미 지급된 아이템은 정정이 막힌다', async () => {
  const pv = (await (await post('/api/admin/items', { op: 'preview', row: 4 }, { Cookie: cookie })).json()).data;
  eq(pv.blocked, true, '미리보기 blocked');

  // 미리보기를 무시하고 실행해도 서버가 막아야 한다
  const run = await post('/api/admin/items', { op: 'correct', row: 4, newAmount: 5000, confirm: true }, { Cookie: cookie });
  eq((await run.json()).ok, false, '실행 결과');
});

await t('정정: 확인 없이는 실행되지 않는다', async () => {
  const res = await post('/api/admin/items', { op: 'correct', row: 3, newAmount: 6000 }, { Cookie: masterCookie });
  const body = await res.json();
  eq(body.ok, false, 'ok');
  eq(body.needsConfirm, true, 'needsConfirm');
});

await t('정정하면 참여자 잔액이 새 금액으로 맞춰진다', async () => {
  const before = (await (await post('/api/lookup', { name: '가이' })).json()).data.pending;
  const res = await post(
    '/api/admin/items',
    { op: 'correct', row: 3, newAmount: 6000, confirm: true },
    { Cookie: masterCookie },
  );
  eq((await res.json()).ok, true, '정정 결과');

  // 3,000 → 6,000 이면 1인당 900 → 1,800 이므로 정확히 900 늘어야 한다
  const after = (await (await post('/api/lookup', { name: '가이' })).json()).data.pending;
  eq(after, before + 900, '가이 분배전');
});

await t('삭제: 확인 없이는 실행되지 않는다', async () => {
  const res = await post('/api/admin/items', { op: 'delete', row: 2 }, { Cookie: masterCookie });
  const body = await res.json();
  eq(body.ok, false, 'ok');
  eq(body.needsConfirm, true, 'needsConfirm');
});

await t('삭제하면 목록에서 사라진다', async () => {
  const res = await post('/api/admin/items', { op: 'delete', row: 2, confirm: true }, { Cookie: masterCookie });
  eq((await res.json()).ok, true, '삭제 결과');
  const list = (await (await fetch(`${APP}/api/admin/items`, { headers: { Cookie: cookie } })).json()).data;
  if (list.some((i) => i.row === 2)) throw new Error('아직 목록에 있습니다.');
});

await t('지급 취소: 분배완료가 분배전으로 돌아온다', async () => {
  const last = (await (await fetch(`${APP}/api/admin/payout-undo`, { headers: { Cookie: cookie } })).json()).data;
  if (!last) throw new Error('되돌릴 지급 기록이 없습니다.');
  const before = (await (await post('/api/lookup', { name: last.name })).json()).data;

  // 확인 없이는 거부
  const noConfirm = await post('/api/admin/payout-undo', {}, { Cookie: masterCookie });
  eq((await noConfirm.json()).needsConfirm, true, 'needsConfirm');

  const res = await post('/api/admin/payout-undo', { confirm: true }, { Cookie: masterCookie });
  eq((await res.json()).ok, true, '취소 결과');

  const after = (await (await post('/api/lookup', { name: last.name })).json()).data;
  eq(after.pending, before.pending + last.amount, '분배전');
  eq(after.paid, before.paid - last.amount, '분배완료');
});

await t('도구 목록: 위험한 것에는 확인 문구가 붙어 있다', async () => {
  const tools = (await (await fetch(`${APP}/api/admin/tools`, { headers: { Cookie: cookie } })).json()).data;
  if (!Array.isArray(tools) || tools.length === 0) throw new Error('도구가 없습니다.');
  const risky = tools.filter((x) => x.danger >= 3);
  if (risky.length === 0) throw new Error('위험도 3 도구가 없습니다.');
  if (risky.some((x) => !x.confirm)) throw new Error('확인 문구가 빠진 도구가 있습니다.');
});

await t('시즌 종료: 문구가 틀리면 실행되지 않는다', async () => {
  // 실행되면 안 되는 입력만 보낸다 — '시즌종료 ' 처럼 공백만 다른 값은
  // 서버가 trim 해서 통과시키므로 여기서 보내면 진짜로 시즌이 끝난다
  for (const text of ['', '아무거나', '시즌종', '시즌종료요', 'season']) {
    const res = await post('/api/admin/tools', { id: 'seasonEnd', confirmText: text }, { Cookie: masterCookie });
    const body = await res.json();
    if (body.ok !== false || body.needsConfirm !== true) {
      throw new Error(`"${text}" 로 시즌이 종료되었습니다.`);
    }
  }
  // 시즌이 그대로인지 확인 (하나라도 새어나갔으면 번호가 올라간다)
  const st = (await (await fetch(`${APP}/api/state`)).json()).data;
  eq(st.season, 3, '시즌 번호');
});

await t('안전한 도구는 문구 없이 바로 실행된다', async () => {
  const res = await post('/api/admin/tools', { id: 'recalcCounts' }, { Cookie: cookie });
  eq((await res.json()).ok, true, '참여횟수 재계산');
});

await t('알 수 없는 도구는 거부된다', async () => {
  const res = await post('/api/admin/tools', { id: 'dropAllTables', confirmText: '전부삭제' }, { Cookie: cookie });
  eq((await res.json()).ok, false, 'ok');
});

await t('지난 시즌: 목록과 상세를 누구나 볼 수 있다', async () => {
  // 조회 기능이라 로그인 없이 열려야 한다
  const list = await (await fetch(`${APP}/api/seasons`)).json();
  eq(list.ok, true, '목록 ok');
  if (!Array.isArray(list.data) || list.data.length === 0) throw new Error('시즌 목록이 비었습니다.');

  const newest = list.data[0];
  const detail = await (await fetch(`${APP}/api/seasons?num=${newest.num}`)).json();
  eq(detail.ok, true, '상세 ok');
  if (!detail.data.sections.some((x) => x.rows.length > 0)) throw new Error('내용이 있는 섹션이 없습니다.');

  // 없는 시즌·잘못된 번호는 거부
  eq((await fetch(`${APP}/api/seasons?num=999`)).status, 404, '없는 시즌');
  eq((await fetch(`${APP}/api/seasons?num=abc`)).status, 400, '잘못된 번호');
});

await t('쓰기 직후 조회(?fresh=1)는 캐시를 건너뛴다', async () => {
  // 캐시가 실제로 동작하는지, 그리고 fresh 가 그걸 건너뛰는지 둘 다 본다.
  // __setVersion 은 앱 라우트를 거치지 않고 모의 시트만 바꾸므로 서버 캐시가
  // 그대로 남는다 — 두 경로를 정확히 구분해볼 수 있는 유일한 방법이다.
  const state = async (q = '') => (await (await fetch(`${APP}/api/state${q}`)).json()).data.version;

  await reset();
  eq(await state(), GS_VER, '첫 조회 버전');

  await mock('__setVersion', { version: '9.9' });
  eq(await state(), GS_VER, '캐시된 조회 (시트가 바뀌어도 그대로여야 정상)');
  eq(await state('?fresh=1'), '9.9', 'fresh 조회 (캐시를 건너뛴 값)');
  // fresh 조회는 캐시도 새 값으로 갈아둔다 — 다음 사람이 낡은 값을 보지 않는다
  eq(await state(), '9.9', 'fresh 이후의 일반 조회');

  await mock('__setVersion', { version: GS_VER });
});

await t('쓰기 응답이 최신 상태를 같이 실어 온다 (조회 왕복 없음)', async () => {
  await reset();
  const res = await post('/api/admin/register', { itemName: '왕복 테스트', participants: ['가이'] }, { Cookie: cookie });
  const body = await res.json();
  eq(body.ok, true, '등록 결과');

  // 이 응답 하나로 화면을 다시 그릴 수 있어야 한다 — 두 번째 요청이 필요 없다
  if (!body.state) throw new Error('쓰기 응답에 상태가 없습니다 — 앱이 한 번 더 왕복하게 됩니다.');
  if (!body.state.items.some((i) => i.item === '왕복 테스트')) {
    throw new Error('실어 온 상태에 방금 등록한 아이템이 없습니다.');
  }
  eq(typeof body.state.season, 'number', '실어 온 상태의 시즌');
  eq(body.state.version, GS_VER, '실어 온 상태의 버전');

  // 그 값이 캐시에도 들어가 있어야 한다 — 다른 사람도 시트를 거치지 않고 받는다
  const shared = (await (await fetch(`${APP}/api/state`)).json()).data;
  if (!shared.items.some((i) => i.item === '왕복 테스트')) {
    throw new Error('실어 온 상태가 캐시에 반영되지 않았습니다.');
  }
});

await t('조회에는 상태를 중복해서 싣지 않는다', async () => {
  // 조회 응답에까지 붙으면 시트를 두 번 읽는 셈이 된다
  const body = await (await fetch(`${APP}/api/state`)).json();
  if (body.state) throw new Error('조회 응답에 상태가 중복으로 붙어 있습니다.');

  const preview = await (await post('/api/admin/items', { op: 'preview', row: 3 }, { Cookie: cookie })).json();
  if (preview.state) throw new Error('미리보기 응답에 상태가 붙어 있습니다.');
});

await t('등록하면 캐시가 만료되기를 기다리지 않아도 보인다', async () => {
  await reset();
  const items = async (q = '') => (await (await fetch(`${APP}/api/state${q}`)).json()).data.items;

  // __reset 은 모의 시트만 되돌린다 — 서버 캐시에는 앞 검사의 값이 남아 있으므로
  // 기준값은 반드시 캐시를 건너뛰고 읽는다
  const before = (await items('?fresh=1')).length;
  await items();                       // 캐시를 채운다

  const res = await post('/api/admin/register', { itemName: '캐시 테스트', participants: ['가이'] }, { Cookie: cookie });
  eq((await res.json()).ok, true, '등록 결과');

  // 쓰기 라우트가 캐시를 버렸으므로 TTL(4초)을 기다리지 않아도 바로 보여야 한다
  const now = await items();
  eq(now.length, before + 1, '등록 직후 아이템 수');
  if (!now.some((i) => i.item === '캐시 테스트')) throw new Error('등록한 아이템이 즉시 보이지 않습니다.');
});

/* ── ①-b v10.0 새 기능 ── */

await t('분배: 비중 50%인 사람은 절반만 받고 남는 몫은 운영비로 간다', async () => {
  // 사용자가 확인해준 기준: 1만 / 10명 중 1명이 50%
  //   → 운영비 1,000 · 기본 1인당 900 · 50% 대상자 450 · 잔여 450 도 운영비
  await reset();

  const before = (await (await fetch(`${APP}/api/state`)).json()).data;
  const fundBefore = before.rows.find((r) => r.name === before.fundName).pending;
  const halfBefore = before.rows.find((r) => r.name === '대서과Z').pending;
  const fullBefore = before.rows.find((r) => r.name === '가이').pending;

  // 기란 세금(row 2)의 참여자는 가이 · TC무식 · 대서과Z(50%)
  const res = await post('/api/admin/distribute', { row: 2, amount: 10000 }, { Cookie: cookie });
  eq((await res.json()).ok, true, '분배 ok');

  const after = (await (await fetch(`${APP}/api/state`)).json()).data;
  const find = (n) => after.rows.find((r) => r.name === n).pending;

  // 총액 10,000 · 운영비 1,000 · 분배가능 9,000 · 3명이므로 기본 1인당 3,000
  eq(find('가이') - fullBefore, 3000, '100% 대상자');
  eq(find('대서과Z') - halfBefore, 1500, '50% 대상자');
  // 운영비 = 1,000 + 잔여 1,500
  eq(find(after.fundName) - fundBefore, 2500, '운영비 적립');
});

await t('되돌리기는 분배 시점 금액을 그대로 쓴다 (비중을 바꿔도)', async () => {
  await reset();
  await post('/api/admin/distribute', { row: 2, amount: 10000 }, { Cookie: cookie });

  // 분배 뒤에 비중을 100%로 올려도, 되돌릴 때는 그때 준 1,500 을 빼야 한다
  const upd = await post(
    '/api/admin/member-settings',
    { name: '대서과Z', weight: 100 },
    { Cookie: cookie },
  );
  eq((await upd.json()).ok, true, '비중 변경 ok');

  const before = (await (await fetch(`${APP}/api/state`)).json()).data;
  const del2 = await post('/api/admin/items', { op: 'delete', row: 2, confirm: true }, { Cookie: masterCookie });
  eq((await del2.json()).ok, true, '삭제 ok');

  const after = (await (await fetch(`${APP}/api/state`)).json()).data;
  const diff = (n) =>
    before.rows.find((r) => r.name === n).pending - after.rows.find((r) => r.name === n).pending;
  eq(diff('대서과Z'), 1500, '50%였던 사람에게서 회수한 금액');
  eq(diff('가이'), 3000, '100%였던 사람에게서 회수한 금액');
  eq(diff(before.fundName), 2500, '운영비에서 회수한 금액');
});

await t('비중은 1~100 밖이면 거부된다', async () => {
  for (const w of [0, 101, 1.5, -5]) {
    const res = await post('/api/admin/member-settings', { name: '가이', weight: w }, { Cookie: cookie });
    eq(res.status, 400, `비중 ${w}`);
  }
});

await t('게시판: 글은 누구나 쓰고, 공지는 관리자만', async () => {
  await reset();

  // 비로그인 글쓰기 — 통과해야 하고, 공지로는 올라가면 안 된다
  const anon = await (await post('/api/board', { title: '일반글', body: '내용', author: '혈맹원', notice: true })).json();
  eq(anon.ok, true, '비로그인 글쓰기');

  const list = (await (await fetch(`${APP}/api/board`)).json()).data;
  const mine = list.find((p) => p.title === '일반글');
  eq(mine.kind, 'post', '요청 본문의 notice:true 가 무시되었는가');

  // 관리자 공지 — 목록 맨 위에 온다
  const asAdmin = await (await post('/api/board', { title: '진짜공지', notice: true }, { Cookie: cookie })).json();
  eq(asAdmin.ok, true, '관리자 공지');
  const list2 = (await (await fetch(`${APP}/api/board`)).json()).data;
  eq(list2[0].title, '진짜공지', '공지가 최상단');
  eq(list2[0].kind, 'notice', '공지 구분');

  // 헤더에 띄울 공지도 함께 내려온다
  const st = (await (await fetch(`${APP}/api/state`)).json()).data;
  eq(st.notice.title, '진짜공지', 'state.notice');
});

await t('게시판: 삭제는 관리자만', async () => {
  const list = (await (await fetch(`${APP}/api/board`)).json()).data;
  const target = list[0];
  eq((await del('/api/admin/board', { id: target.id })).status, 401, '비로그인 삭제');
  eq((await (await del('/api/admin/board', { id: target.id }, { Cookie: cookie })).json()).ok, true, '관리자 삭제');
});

await t('연합: 조회는 누구나, 등록은 관리자만', async () => {
  await reset();
  const pub = await (await fetch(`${APP}/api/alliance`)).json();
  eq(pub.ok, true, '공개 조회');
  eq(Array.isArray(pub.data.totals), true, '서버별 합계');
  eq(pub.data.totals.length, 12, '01~12 서버');

  eq((await post('/api/alliance', {})).status, 405, '연합 공개 라우트에는 쓰기가 없다');

  const add = await (
    await post(
      '/api/admin/alliance',
      { op: 'register', item: '연합 보스', entries: [{ server: '05', people: 15 }] },
      { Cookie: cookie },
    )
  ).json();
  eq(add.ok, true, '등록 ok');
});

await t('연합: 등록은 금액 없이 되고, 누적에는 들어가지 않는다', async () => {
  await reset();
  const before = (await (await fetch(`${APP}/api/alliance?fresh=1`)).json()).data;
  const s05before = before.totals.find((x) => x.server === '05');

  // ① 등록 — 금액을 몰라도 인증샷과 함께 먼저 남길 수 있어야 한다
  const reg = await (
    await post(
      '/api/admin/alliance',
      { op: 'register', item: '연합 보스', entries: [{ server: '05', people: 15 }] },
      { Cookie: cookie },
    )
  ).json();
  eq(reg.ok, true, '금액 없이 등록');

  const mid = (await (await fetch(`${APP}/api/alliance?fresh=1`)).json()).data;
  const waiting = mid.waiting.find((g) => g.group === reg.group);
  if (!waiting) throw new Error('등록한 건이 대기 목록에 없습니다.');
  eq(waiting.done, false, '대기 상태');

  // ★ 금액이 없는 건은 서버별 누적에 섞이면 안 된다 (0원이 건수만 부풀린다)
  const s05mid = mid.totals.find((x) => x.server === '05');
  eq(s05mid.credited, s05before.credited, '미정산 건은 누적 금액에 없다');
  eq(s05mid.count, s05before.count, '미정산 건은 건수에도 없다');

  // ② 정산 — 이제 금액을 넣으면 누적된다. 서버가 하나뿐이니 혈비를 뗀 전액이 간다
  const cr = await (
    await post('/api/admin/alliance', { op: 'credit', group: reg.group, amount: 30000 }, { Cookie: cookie })
  ).json();
  eq(cr.ok, true, '정산 ok');
  eq(cr.fund, 3000, '혈비 = 30000 × 10%');

  const after = (await (await fetch(`${APP}/api/alliance?fresh=1`)).json()).data;
  const s05 = after.totals.find((x) => x.server === '05');
  eq(s05.credited, s05before.credited + 27000, '05서버 누적');
  eq(s05.people, s05before.people + 15, '05서버 인원 합계');
  if (after.waiting.some((g) => g.group === reg.group)) throw new Error('정산 뒤에도 대기 목록에 남아 있습니다.');

  // ★ 같은 건을 두 번 정산하면 서버 총액이 틀어진다 — 반드시 막혀야 한다
  const twice = await post('/api/admin/alliance', { op: 'credit', group: reg.group, amount: 30000 }, { Cookie: cookie });
  eq(twice.status, 400, '이미 정산된 건 재정산');
  const final = (await (await fetch(`${APP}/api/alliance?fresh=1`)).json()).data;
  eq(final.totals.find((x) => x.server === '05').credited, s05.credited, '거부 후 누적이 그대로');
});

/* ── 레이드 (v10.8) ── */

await t('레이드: 조회는 누구나, 편집은 관리자 이상', async () => {
  await reset();
  const pub = await (await fetch(`${APP}/api/raid`)).json();
  eq(pub.ok, true, '공개 조회');
  eq(pub.data.days.length, 7, '요일 7개');
  if (!pub.data.rows.length) throw new Error('시간표가 비어 있습니다.');

  // 공개 라우트에 쓰기가 붙으면 링크만 아는 누구나 시간표를 바꿀 수 있다
  eq((await post('/api/raid', {})).status, 405, '레이드 공개 라우트에는 쓰기가 없다');
  eq((await patch('/api/admin/raid', { row: 2, day: 1, time: '20:20', boss: 'x' })).status, 401, '인증 없이 수정');
  eq((await del('/api/admin/raid', { row: 2 })).status, 401, '인증 없이 삭제');
});

await t('레이드: 추가·수정·삭제가 요일별로 반영된다', async () => {
  await reset();
  const add = await (
    await post('/api/admin/raid', { day: 3, time: '21:00', boss: '검사용보스', note: '젠 3시간' }, { Cookie: cookie })
  ).json();
  eq(add.ok, true, '추가 ok');

  const mid = (await (await fetch(`${APP}/api/raid?fresh=1`)).json()).data;
  const rec = mid.rows.find((r) => r.boss === '검사용보스');
  if (!rec) throw new Error('추가한 보스가 목록에 없습니다.');
  eq(rec.day, 3, '수요일에 들어감');
  eq(rec.time, '21:00', '시간');
  eq(rec.note, '젠 3시간', '비고');
  // ★ 다른 요일에까지 나타나면 "오늘 것만 보여준다"가 통째로 무너진다
  eq(mid.rows.filter((r) => r.boss === '검사용보스').length, 1, '한 요일에만 있다');

  const up = await (
    await patch('/api/admin/raid', { row: rec.row, day: 5, time: '22:30', boss: '검사용보스2', note: '' }, { Cookie: cookie })
  ).json();
  eq(up.ok, true, '수정 ok');

  const after = (await (await fetch(`${APP}/api/raid?fresh=1`)).json()).data;
  const moved = after.rows.find((r) => r.row === rec.row);
  eq(moved.day, 5, '금요일로 옮겨짐');
  eq(moved.time, '22:30', '시간도 바뀜');
  eq(moved.boss, '검사용보스2', '이름도 바뀜');

  eq((await (await del('/api/admin/raid', { row: rec.row }, { Cookie: cookie })).json()).ok, true, '삭제 ok');
  const gone = (await (await fetch(`${APP}/api/raid?fresh=1`)).json()).data;
  if (gone.rows.some((r) => r.row === rec.row)) throw new Error('삭제 뒤에도 남아 있습니다.');
});

await t('레이드: 잘못된 요일·시간·보스명은 거부된다', async () => {
  const bad = [
    { day: 0, time: '20:20', boss: 'x' },
    { day: 8, time: '20:20', boss: 'x' },
    { day: 1, time: '25:00', boss: 'x' },
    { day: 1, time: '저녁쯤', boss: 'x' },
    { day: 1, time: '20:20', boss: '' },
    { day: 1, time: '20:20', boss: 'ㄱ'.repeat(41) },
  ];
  for (const b of bad) {
    eq((await post('/api/admin/raid', b, { Cookie: cookie })).status, 400, JSON.stringify(b));
  }
  for (const b of [{ row: 1, day: 1, time: '20:20', boss: 'x' }, { row: 0, day: 1, time: '20:20', boss: 'x' }]) {
    eq((await patch('/api/admin/raid', b, { Cookie: cookie })).status, 400, '잘못된 행 ' + b.row);
  }
});

await t('연합: 잘못된 서버·아이템명·인원·금액은 거부된다', async () => {
  const badReg = [
    { op: 'register', item: 'x', entries: [{ server: '13', people: 1 }] },   // 없는 서버
    { op: 'register', item: '', entries: [{ server: '05', people: 1 }] },    // 아이템명 없음
    { op: 'register', item: 'x', entries: [] },                              // 서버 0곳
    { op: 'register', item: 'x', entries: [{ server: '05', people: -1 }] },  // 음수 인원
    // 같은 서버가 두 줄이면 인원이 갈려 분배 비율이 틀어진다
    { op: 'register', item: 'x', entries: [{ server: '05', people: 1 }, { server: '05', people: 2 }] },
  ];
  for (const b of badReg) {
    eq((await post('/api/admin/alliance', b, { Cookie: cookie })).status, 400, JSON.stringify(b));
  }
  const badCredit = [
    { op: 'credit', group: 'A1', amount: 0 },
    { op: 'credit', group: 'A1', amount: -100 },
    { op: 'credit', group: 'A1', amount: 1.5 },
    { op: 'credit', group: '', amount: 100 },
    { op: 'credit', group: '없는묶음', amount: 100 },
  ];
  for (const b of badCredit) {
    eq((await post('/api/admin/alliance', b, { Cookie: cookie })).status, 400, JSON.stringify(b));
  }
  eq((await post('/api/admin/alliance', { op: '이상한거' }, { Cookie: cookie })).status, 400, '알 수 없는 op');
});

await t('명단 일괄 추가: 판정이 상태를 정확히 가른다', async () => {
  await reset();
  // 가이·PlusS 는 이미 있고, 잠단(斬斷) 은 표기만 다른 개명 후보,
  // 숫자 줄과 한 글자는 이름으로 볼 수 없고, 신규 둘은 그대로 들어가야 한다
  const text = ['1. 새사람A', '2. 새사람B', '가이', 'PlusS', '잠단(斬断)', '새사람A', '42', 'ㅋ'].join('\n');
  const res = await (
    await post('/api/admin/members-bulk', { op: 'analyze', text }, { Cookie: cookie })
  ).json();
  eq(res.ok, true, '판정 ok');

  // '새사람A' 는 일부러 두 번 넣었다 — 첫 줄이 신규, 둘째 줄이 중복이어야 한다
  const by = {};
  res.rows.forEach((r) => { if (!(r.name in by)) by[r.name] = r.status; });
  eq(by['새사람A'], 'new', '신규');
  eq(by['새사람B'], 'new', '신규2');
  eq(by['가이'], 'exists', '이미 있음');
  eq(by['PlusS'], 'exists', '이미 있음(라틴)');
  eq(by['잠단(斬断)'], 'rename', '표기만 다른 개명 후보');
  eq(by['42'], 'invalid', '숫자 줄');
  eq(by['ㅋ'], 'invalid', '한 글자');
  eq(res.rows.filter((r) => r.status === 'dup').length, 1, '입력 안 중복');

  // 개명 후보에는 누구였는지 제안이 붙어야 사람이 고를 수 있다
  const cand = res.rows.find((r) => r.status === 'rename');
  if (!cand.suggest.length) throw new Error('개명 후보에 제안이 없습니다.');

  // ★ 판정만 했는데 명단이 바뀌면 안 된다
  const roster = (await (await fetch(`${APP}/api/admin/roster`, { headers: { Cookie: cookie } })).json()).data;
  if (roster.some((m) => m.name === '새사람A')) throw new Error('판정 단계가 명단을 바꿨습니다.');
});

await t('명단 일괄 추가: [혈맹·서버] 표시를 떼어내되 애매하면 지어내지 않는다', async () => {
  await reset();
  // 게임 명단 사진에서 실제로 나오는 모양 그대로
  const text = [
    '참상혼K[어레02] +',        // 잘 닫힌 대괄호 + 친구추가 버튼
    '가이[어레02] +',           // 떼어내면 기존 멤버와 같아진다
    '노왕계색마재 어레02]',      // 여는 대괄호가 떨어져 나간 꼬리
    '곡중인산K02] 관',          // 어디까지가 이름인지 알 수 없다
    '선륙소농포 (鮮肉小籠包) [어레02]', // 소괄호(한자)는 건드리면 안 된다
  ].join('\n');
  const res = await (
    await post('/api/admin/members-bulk', { op: 'analyze', text }, { Cookie: cookie })
  ).json();
  eq(res.ok, true, '판정 ok');

  const at = (i) => res.rows[i];
  eq(at(0).name, '참상혼K', '대괄호·+ 를 뗀 이름');
  eq(at(0).status, 'new', '뗀 뒤의 판정');
  // ★ 떼어내야만 기존 멤버와 이어진다. 안 떼면 신규가 되어 잔액이 0부터 시작한다.
  eq(at(1).name, '가이', '대괄호를 뗀 기존 멤버');
  eq(at(1).status, 'exists', '기존 멤버로 인식');
  eq(at(2).name, '노왕계색마재', '떨어져 나간 꼬리 제거');
  // ★ 첫 토막에 대괄호가 붙으면 이름 쪽을 지우게 되므로 손대지 않고 '확인 필요'로
  eq(at(3).status, 'invalid', '알아볼 수 없는 줄');
  // ★ 소괄호 안 한자는 그대로 — 지우면 중국 길드원이 자기 이름을 못 찾는다
  eq(at(4).name, '선륙소농포 (鮮肉小籠包)', '한자 표기 보존');

  // 원문을 함께 돌려줘야 무엇을 떼어냈는지 관리자가 볼 수 있다
  eq(at(0).raw.trim(), '참상혼K[어레02] +', '원문 보존');

  // 판정만 했으므로 명단은 그대로다
  const roster = (await (await fetch(`${APP}/api/admin/roster`, { headers: { Cookie: cookie } })).json()).data;
  if (roster.some((m) => m.name.includes('['))) throw new Error('태그가 붙은 이름이 명단에 들어갔습니다.');
});

await t('명단 일괄 추가: 확인 없이는 실행되지 않는다', async () => {
  const entries = [{ name: '새사람A', op: 'add', from: '' }];
  const first = await (
    await post('/api/admin/members-bulk', { op: 'apply', entries, server: '07' }, { Cookie: cookie })
  ).json();
  eq(first.ok, false, '첫 호출은 거부');
  eq(first.needsConfirm, true, '재확인 요구');

  const roster = (await (await fetch(`${APP}/api/admin/roster`, { headers: { Cookie: cookie } })).json()).data;
  if (roster.some((m) => m.name === '새사람A')) throw new Error('확인 전에 반영됐습니다.');
});

await t('명단 일괄 추가: 추가는 새로, 개명은 잔액을 승계한다', async () => {
  await reset();
  // '대서과Z' 는 분배전 4,500 · 참여 3회 — 개명해도 그대로여야 한다
  const before = (await (await post('/api/lookup', { name: '대서과Z' })).json()).data;
  eq(before.pending, 4500, '개명 전 분배전');

  const entries = [
    { name: '새사람A', op: 'add', from: '' },
    { name: '대서과ZZ', op: 'rename', from: '대서과Z' },
    { name: '무시할사람', op: 'skip', from: '' },
  ];
  const res = await (
    await post('/api/admin/members-bulk', { op: 'apply', entries, server: '07', confirm: true }, { Cookie: cookie })
  ).json();
  eq(res.ok, true, '반영 ok');
  eq(res.added.length, 1, '추가 1명');
  eq(res.renamed.length, 1, '개명 1명');
  eq(res.failed.length, 0, '실패 0');

  // ★ 개명은 잔액·참여횟수를 그대로 물려받아야 한다 (새로 추가하면 0부터 시작한다)
  const after = (await (await post('/api/lookup', { name: '대서과ZZ' })).json()).data;
  eq(after.pending, before.pending, '개명 후 분배전');
  eq(after.cnt, before.cnt, '개명 후 참여횟수');
  eq((await (await post('/api/lookup', { name: '대서과Z' })).json()).ok, false, '옛 이름은 사라짐');

  // 새로 추가한 사람은 0부터
  const fresh = (await (await post('/api/lookup', { name: '새사람A' })).json()).data;
  eq(fresh.pending, 0, '신규는 0');

  // 서버는 이번에 손댄 사람에게만 반영된다 — 기존 멤버는 그대로
  const roster = (await (await fetch(`${APP}/api/admin/roster`, { headers: { Cookie: cookie } })).json()).data;
  eq(roster.find((m) => m.name === '새사람A').server, '07', '신규의 서버');
  eq(roster.find((m) => m.name === '대서과ZZ').server, '07', '개명자의 서버');
  eq(roster.find((m) => m.name === '가이').server, '01', '건드리지 않은 멤버의 서버');
});

await t('명단 일괄 추가: 전혀 다른 이름도 개명으로 이어붙일 수 있다', async () => {
  await reset();
  // '테리' 는 기존 누구와도 안 닮았다 — 그래도 개명 대상은 고를 수 있어야 한다
  const res = await (
    await post('/api/admin/members-bulk', { op: 'analyze', text: '테리' }, { Cookie: cookie })
  ).json();
  eq(res.rows[0].status, 'new', '닮은 사람이 없으니 신규');
  eq(res.rows[0].suggest.length, 0, '제안 없음');
  // ★ 판정 결과에 전체 명단이 실려야 앱이 드롭다운을 만들 수 있다
  if (!Array.isArray(res.roster) || res.roster.length < 5) {
    throw new Error('전체 명단이 오지 않았습니다 — 개명 대상을 고를 수 없습니다.');
  }
  if (!res.roster.includes('향로셔틀')) throw new Error('명단에 기존 멤버가 빠져 있습니다.');

  // 닮지 않은 사람으로 개명해도 잔액이 승계되어야 한다
  const before = (await (await post('/api/lookup', { name: '가이' })).json()).data;
  const apply = await (
    await post('/api/admin/members-bulk',
      { op: 'apply', entries: [{ name: '테리', op: 'rename', from: '가이' }], confirm: true },
      { Cookie: cookie })
  ).json();
  eq(apply.ok, true, '개명 반영');
  const after = (await (await post('/api/lookup', { name: '테리' })).json()).data;
  eq(after.pending, before.pending, '분배전 승계');
  eq(after.cnt, before.cnt, '참여횟수 승계');
});

await t('명단 일괄 추가: 한 아이디를 두 사람이 물려받을 수 없다', async () => {
  await reset();
  const entries = [
    { name: '새이름A', op: 'rename', from: '가이' },
    { name: '새이름B', op: 'rename', from: '가이' },   // 같은 사람을 또 지정
  ];
  const res = await post('/api/admin/members-bulk', { op: 'apply', entries, confirm: true }, { Cookie: cookie });
  eq(res.status, 400, '중복 지정은 거부');

  // ★ 거부됐으면 아무것도 바뀌지 않아야 한다 (앞쪽만 처리되면 안 된다)
  eq((await (await post('/api/lookup', { name: '가이' })).json()).ok, true, '원래 이름 그대로');
  eq((await (await post('/api/lookup', { name: '새이름A' })).json()).ok, false, '앞쪽도 반영 안 됨');

  // 명단에 없는 아이디도 거부
  const ghost = await post('/api/admin/members-bulk',
    { op: 'apply', entries: [{ name: 'X', op: 'rename', from: '없는사람' }], confirm: true }, { Cookie: cookie });
  eq(ghost.status, 400, '없는 아이디 지정');
});

await t('명단 일괄 추가: 잘못된 요청은 시트까지 가지 않는다', async () => {
  const bad = [
    { op: 'apply', entries: [{ name: '누구', op: 'rename', from: '' }], confirm: true },
    { op: 'apply', entries: [{ name: '', op: 'add' }], confirm: true },
    { op: 'apply', entries: [], confirm: true },
    { op: 'analyze' },
    { op: '이상한거' },
  ];
  for (const b of bad) {
    eq((await post('/api/admin/members-bulk', b, { Cookie: cookie })).status, 400, JSON.stringify(b).slice(0, 60));
  }
  eq((await post('/api/admin/members-bulk', { op: 'analyze', text: 'x' })).status, 401, '비로그인');
});

await t('아이디 변경 이력이 변경 전/후로 남는다', async () => {
  await reset();
  await post('/api/admin/rename', { oldName: '팩맨', newName: '팩맨2' }, { Cookie: cookie });
  const hist = (await (await fetch(`${APP}/api/admin/rename-history`, { headers: { Cookie: cookie } })).json()).data;
  const hit = hist.find((h) => h.before === '팩맨');
  if (!hit) throw new Error('변경 이력이 남지 않았습니다.');
  eq(hit.after, '팩맨2', '변경 후 이름');
});

await t('마스터 PIN 은 관리자와 다른 등급을 준다', async () => {
  const res = await post('/api/admin/login', { pin: MASTER_PIN });
  eq(res.status, 200, 'HTTP 상태');
  eq((await res.json()).role, 'master', '등급');
  masterCookie = (res.headers.get('set-cookie') ?? '').split(';')[0];

  const st = await (await fetch(`${APP}/api/state`, { headers: { Cookie: masterCookie } })).json();
  eq(st.master, true, 'state.master');

  // 일반 관리자 쿠키로는 master 플래그가 서지 않는다
  const asAdmin = await (await fetch(`${APP}/api/state`, { headers: { Cookie: cookie } })).json();
  eq(asAdmin.admin, true, '관리자');
  eq(asAdmin.master, false, '관리자는 마스터가 아니다');
});

await t('마스터 PIN: 앞뒤 공백이 있어도 로그인된다', async () => {
  // Vercel 대시보드에 붙여넣을 때 줄바꿈·공백이 딸려 들어가는 일이 흔하고,
  // 폰 키보드도 앞뒤에 공백을 붙인다. 그러면 아무리 정확히 입력해도
  // "PIN이 올바르지 않습니다"만 뜨고 원인을 알 길이 없다.
  const res = await post('/api/admin/login', { pin: `  ${MASTER_PIN}  ` });
  eq(res.status, 200, '공백이 붙은 마스터 PIN');
  const body = await res.json();
  eq(body.role, 'master', '등급');
  eq(body.code, 'auth.master', '결과 코드 (화면 언어로 번역되려면 필요)');
});

await t('health 가 마스터 PIN 상태를 값 없이 알려준다', async () => {
  const h = await (await fetch(`${APP}/api/health`)).json();
  if (!h.master) throw new Error('health 에 마스터 진단이 없습니다.');
  eq(h.master.set, true, 'MASTER_PIN 설정됨');
  eq(h.master.sameAsAdmin, false, '관리자 PIN 과 다름');
  eq(h.master.usable, true, '쓸 수 있는 상태');

  // ★ 값 자체가 새 나가면 안 된다
  const dump = JSON.stringify(h);
  if (dump.includes(MASTER_PIN) || dump.includes(PIN)) {
    throw new Error('health 응답에 PIN 값이 들어 있습니다.');
  }
});

await t('앱 이름·관리자 PIN 변경은 마스터만 할 수 있다', async () => {
  eq((await post('/api/master', { action: 'appName', value: '새이름' }, { Cookie: cookie })).status, 401, '관리자 시도');

  const ok = await (await post('/api/master', { action: 'appName', value: '테스트길드' }, { Cookie: masterCookie })).json();
  eq(ok.ok, true, '마스터 시도');
  const st = (await (await fetch(`${APP}/api/state`)).json()).data;
  eq(st.appName, '테스트길드', '앱 이름 반영');

  // 짧은 PIN 은 거부
  eq((await post('/api/master', { action: 'adminPin', value: '123' }, { Cookie: masterCookie })).status, 400, '짧은 PIN');
});

await t('앱 이름을 두 줄로 넣을 수 있고, 헤더가 아래를 덮지 않는다', async () => {
  const two = '리니지W\n길드매니저';
  const res = await (
    await post('/api/master', { action: 'appName', value: two }, { Cookie: masterCookie })
  ).json();
  eq(res.ok, true, '두 줄 이름 저장');

  const st = (await (await fetch(`${APP}/api/state?fresh=1`)).json()).data;
  eq(st.appName, two, '줄바꿈이 그대로 보존됨');

  // 세 줄 이상은 헤더를 밀어내므로 라우트에서 바로 거부한다.
  // (앱은 애초에 두 줄로 제한하므로, 여기까지 오는 건 손으로 만든 요청뿐이다.
  //  시트도 눕히는 방어를 한 겹 더 갖고 있다 — verify:gs 가 그쪽을 본다.)
  const three = await post('/api/master', { action: 'appName', value: 'A\nB\nC' }, { Cookie: masterCookie });
  eq(three.status, 400, '세 줄은 거부');
  const st3 = (await (await fetch(`${APP}/api/state?fresh=1`)).json()).data;
  eq(st3.appName, two, '거부됐으니 앞서 저장한 값 그대로');

  // 줄바꿈을 뺀 글자 수가 상한을 넘으면 거부
  const long = await post('/api/master', { action: 'appName', value: '가'.repeat(25) }, { Cookie: masterCookie });
  eq(long.status, 400, '25자는 거부');

  await post('/api/master', { action: 'appName', value: '길드정산' }, { Cookie: masterCookie });
});

await t('되돌릴 수 없는 도구·정정·삭제·지급취소는 관리자에게 막힌다', async () => {
  await reset();
  // cookie = 관리자, masterCookie = 마스터

  // ① 위험도 3 도구 — 관리자는 확인 문구가 맞아도 못 돌린다
  const seasonEnd = { id: 'seasonEnd', confirmText: '시즌종료' };
  eq((await post('/api/admin/tools', seasonEnd, { Cookie: cookie })).status, 401, '관리자의 시즌 종료');
  // 막혔으면 시즌이 그대로여야 한다
  eq((await (await fetch(`${APP}/api/state?fresh=1`)).json()).data.season, 3, '거부 후 시즌');

  for (const id of ['factoryReset', 'install', 'importData']) {
    eq((await post('/api/admin/tools', { id, confirmText: 'x' }, { Cookie: cookie })).status, 401, `관리자의 ${id}`);
  }

  // ② 위험도 1~2 도구는 관리자도 쓸 수 있어야 한다 (권한을 과하게 조이면 업무가 막힌다)
  const safe = await post('/api/admin/tools', { id: 'recalcCounts' }, { Cookie: cookie });
  eq(safe.status, 200, '관리자의 참여횟수 재계산');

  // ③ 정정·삭제 — 관리자는 막히고, 미리보기(읽기)는 열려 있어야 한다
  eq((await post('/api/admin/items', { op: 'correct', row: 3, newAmount: 5000, confirm: true }, { Cookie: cookie })).status,
     401, '관리자의 정정');
  eq((await post('/api/admin/items', { op: 'delete', row: 3, confirm: true }, { Cookie: cookie })).status,
     401, '관리자의 삭제');
  eq((await post('/api/admin/items', { op: 'preview', row: 3 }, { Cookie: cookie })).status,
     200, '관리자의 미리보기 (무엇이 잘못됐는지는 볼 수 있어야 한다)');

  // ④ 지급 취소 — 쓰기는 막히고 조회는 열려 있어야 한다
  eq((await post('/api/admin/payout-undo', { confirm: true }, { Cookie: cookie })).status, 401, '관리자의 지급취소');
  eq((await fetch(`${APP}/api/admin/payout-undo`, { headers: { Cookie: cookie } })).status, 200, '관리자의 지급기록 조회');

  // ⑤ 마스터는 전부 된다 — 관리자가 할 수 있는 것도 포함해서
  eq((await post('/api/admin/tools', { id: 'recalcCounts' }, { Cookie: masterCookie })).status, 200, '마스터의 안전 도구');
  const mUndo = await post('/api/admin/payout-undo', { confirm: true }, { Cookie: masterCookie });
  eq(mUndo.status, 200, '마스터의 지급취소');
  eq((await mUndo.json()).ok, true, '마스터의 지급취소 결과');
});

await t('도구 목록이 무엇이 마스터 전용인지 알려준다', async () => {
  const list = (await (await fetch(`${APP}/api/admin/tools`, { headers: { Cookie: cookie } })).json()).data;
  const byId = {};
  list.forEach((t2) => { byId[t2.id] = t2; });
  // 되돌릴 수 없는 것은 전부 마스터 전용이어야 한다
  for (const id of ['seasonEnd', 'factoryReset', 'install', 'importData']) {
    eq(byId[id].master, true, `${id} 의 master 플래그`);
  }
  // 일상 도구는 관리자도 쓸 수 있어야 한다
  for (const id of ['recalcCounts', 'tidy']) {
    eq(byId[id].master, false, `${id} 의 master 플래그`);
  }
});

await t('마스터가 바꾼 PIN 이 환경변수 PIN 보다 우선한다', async () => {
  const set = await (await post('/api/master', { action: 'adminPin', value: 'newpin123' }, { Cookie: masterCookie })).json();
  eq(set.ok, true, 'PIN 교체');

  // 옛 PIN(환경변수)은 더 이상 통하지 않는다
  eq((await post('/api/admin/login', { pin: PIN })).status, 401, '옛 PIN');
  const res = await post('/api/admin/login', { pin: 'newpin123' });
  eq(res.status, 200, '새 PIN');
  eq((await res.json()).role, 'admin', '등급');

  // 되돌린다 — 뒤에 오는 테스트가 원래 PIN 을 쓴다
  await post('/api/master', { action: 'adminPin', value: '' }, { Cookie: masterCookie });
  eq((await post('/api/admin/login', { pin: PIN })).status, 200, '환경변수 PIN 복귀');
});

/* ── ② 화면 흐름 (브라우저) ── */

// 앞의 API 테스트가 데이터를 많이 바꿔놨다. 화면 테스트가 그 결과에 얽매이지
// 않도록 모의 시트를 처음 상태로 되돌린다 (모의 시트에만 있는 기능 — 앱 API 에는 없다).
await reset();

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

  await page.locator('.nav button', { hasText: /아이템/ }).click();
  await page.waitForTimeout(300);
  eq(await page.getByRole('button', { name: '분배' }).count(), 0, '분배 버튼 개수');
  await page.locator('.nav button', { hasText: /잔액/ }).click();
  await page.waitForTimeout(300);
  eq(await page.getByRole('button', { name: '지급' }).count(), 0, '지급 버튼 개수');
});

await t('공유 카드의 QR이 앱 주소로 디코딩된다', async () => {
  await page.locator('.nav button', { hasText: /관리/ }).click();
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
  await page.locator('.nav button', { hasText: /잔액/ }).click();
  await page.waitForTimeout(500);
  if ((await page.getByRole('button', { name: '지급' }).count()) === 0) {
    throw new Error('로그인 후에도 지급 버튼이 없습니다.');
  }
  await shot('03-admin-balance');
});

await t('PIN 칸에 문자가 섞인 PIN 도 입력할 수 있다', async () => {
  // inputMode="numeric" 이면 폰에서 숫자 키패드만 떠서, 문자가 섞인
  // 마스터 PIN 은 아무리 정확히 알아도 입력할 방법이 없다.
  await page.locator('.nav button').last().click();
  await page.waitForTimeout(400);

  const pin = page.locator('#pin');
  if (await pin.count()) {
    eq(await pin.getAttribute('inputmode'), null, 'PIN 칸의 inputmode (숫자 고정이면 안 됨)');
    eq(await pin.getAttribute('autocapitalize'), 'off', '자동 대문자 끄기');

    // 문자가 섞인 값이 그대로 들어가야 한다
    await pin.fill(MASTER_PIN);
    eq(await pin.inputValue(), MASTER_PIN, '입력된 값');

    // 눈 버튼으로 입력한 내용을 확인할 수 있어야 한다
    eq(await pin.getAttribute('type'), 'password', '기본은 가려짐');
    await page.locator('.pin-eye').click();
    await page.waitForTimeout(200);
    eq(await pin.getAttribute('type'), 'text', '눈 버튼을 누르면 보임');
    await page.locator('.pin-eye').click();
    await pin.fill('');
  }
});

await t('분배 미리보기가 혈비·1인당을 정확히 계산한다', async () => {
  await page.locator('.nav button', { hasText: /아이템/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '분배' }).first().click();
  await page.locator('#amt').fill('50000');
  await page.waitForTimeout(300);
  await shot('04-distribute');

  const text = await page.locator('.calc').innerText();
  // 첫 아이템 참여자는 가이·TC무식·대서과Z(50%).
  // 50,000 → 운영비 5,000 / 남은 45,000 ÷ 3명 = 기본 1인당 15,000
  //          50% 대상자는 7,500 만 받고, 남은 7,500 은 운영비로 → 운영비 12,500
  for (const want of ['5,000', '15,000', '7,500', '12,500']) {
    if (!text.includes(want)) throw new Error(`${want} 이(가) 보이지 않습니다:\n${text}`);
  }
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

await t('아이템 등록: 서버로 좁혀도 체크한 사람은 사라지지 않는다 (화면)', async () => {
  await reset();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.nav button').filter({ hasText: /아이템/ }).click();
  await page.waitForTimeout(900);

  const chips = page.locator('#itemServers .svchip');
  const grid = page.locator('.mgrid .mchip');

  // ① 인원이 있는 서버만 앞에 두고 사람 수를 같이 보여준다.
  //    몇 명짜리 서버인지 모르면 무엇을 고를지 판단할 수가 없다.
  //    ★ 02 가 2명인 것이 중요하다 — 詹阿呆 는 시트에 '2' 로(앞의 0 이 빠진 채) 저장돼
  //      있다. 표기를 안 맞추면 이 칩이 "02 1명" 이 되고 그 사람은 어디에서도 안 잡힌다.
  const faces = await chips.allInnerTexts();
  const front = faces.filter((x) => !x.startsWith('+') && !x.includes('미지정'));
  eq(front.join(' ').replace(/\s+/g, ''), '012022031041061', '서버 칩(번호+인원)');
  if (!faces.some((x) => x.includes('7'))) throw new Error(`안 쓰는 7개가 접히지 않았습니다: ${faces.join(' / ')}`);
  // 서버 칸이 비어 있는 사람도 고를 길이 있어야 한다 — 없으면 등록 자체가 막힌다
  if (!faces.some((x) => x.includes('미지정') && x.includes('2'))) {
    throw new Error(`미지정 칩이 없습니다: ${faces.join(' / ')}`);
  }

  // ② 아무것도 안 고르면 예전처럼 전원 (혈비 계정 제외 9명)
  eq(await grid.count(), 9, '서버를 안 골랐을 때 보이는 인원');

  // ★ 참여자 칩에도 [잔액]과 같은 서버 배지가 붙는다 (v10.8.8).
  //   이름만으로는 비슷한 이름이 서버마다 있어 누구인지 가릴 수 없다.
  const guy = grid.filter({ hasText: '가이' }).first();
  eq(await guy.locator('.svr').innerText(), '01', '참여자 칩의 서버 배지');
  //   시트에 '2' 로 저장된 사람도 '02' 로 (잔액 화면과 같게)
  const pad2 = grid.filter({ hasText: '詹阿呆' }).first();
  eq(await pad2.locator('.svr').innerText(), '02', "'2' 로 저장된 사람의 칩 배지");
  //   서버가 없는 사람에게는 빈 배지를 만들지 않는다 — 지정된 사람과 같아 보인다
  eq(await grid.filter({ hasText: '향로셔틀' }).first().locator('.svr').count(), 0, '미지정자의 배지');
  //   배지가 붙어도 이름이 칩 밖으로 나가지 않아야 한다
  for (const nm of ['가이', '선륙소농포']) {
    const box = await grid.filter({ hasText: nm }).first().boundingBox();
    const inner = await grid.filter({ hasText: nm }).first().locator('.nm b').boundingBox();
    if (inner.x + inner.width > box.x + box.width + 1) {
      throw new Error(`"${nm}" 의 이름줄이 칩 밖으로 나갑니다.`);
    }
  }

  // ③ 01 서버 → 가이·TC무식만
  await chips.filter({ hasText: /^01/ }).click();
  await page.waitForTimeout(300);
  eq(await grid.count(), 2, '01 서버 인원');
  // ④ 02 도 함께 (복수 선택 — "더 추가하실 서버는 없나요?")
  await chips.filter({ hasText: /^02/ }).click();
  await page.waitForTimeout(300);
  eq(await grid.count(), 4, '01+02 서버 인원');
  await shot('24-item-server-filter');

  await page.getByRole('button', { name: '전체 선택' }).click();
  await page.waitForTimeout(300);
  const picked = await page.locator('.mgrid .mchip.sel').count();
  eq(picked, 4, '전체 선택으로 체크된 인원');

  // ★ 핵심 — 체크한 4명을 두고 03 서버로 갈아탄다. 그 4명이 화면에서 사라지면
  //   관리자는 빠진 줄 알고 등록하지만 실제로는 들어간다. 반드시 계속 보여야 한다.
  await chips.filter({ hasText: /^01/ }).click();
  await chips.filter({ hasText: /^02/ }).click();
  await chips.filter({ hasText: /^03/ }).click();
  await page.waitForTimeout(300);
  eq(await grid.count(), 5, '03 서버 + 이미 체크한 4명');
  eq(await page.locator('.mgrid .mchip.sel').count(), 4, '갈아탄 뒤에도 남아 있는 체크');
  for (const nm of ['가이', 'TC무식', '詹阿呆']) {
    if ((await page.locator('.mgrid .mchip').filter({ hasText: nm }).count()) === 0) {
      throw new Error(`체크한 "${nm}" 이(가) 서버 필터에 걸려 사라졌습니다.`);
    }
  }

  // ⑤ 나머지는 감추는 것이 아니라 접어두는 것 — 펼치면 전원이 다시 나온다
  await page.getByRole('button', { name: /나머지 4명도 보기/ }).click();
  await page.waitForTimeout(300);
  eq(await grid.count(), 9, '접힌 나머지를 펼친 뒤');
  await page.getByRole('button', { name: /나머지 접기/ }).click();
  await page.waitForTimeout(300);
  eq(await grid.count(), 5, '다시 접은 뒤');

  // ⑥ 전체 해제도 보이는 사람에게만 — 03 의 PlusS 는 원래 체크가 없었다
  await page.getByRole('button', { name: '전체 해제' }).click();
  await page.waitForTimeout(300);
  eq(await page.locator('.mgrid .mchip.sel').count(), 0, '전체 해제 뒤');

  // ⑦ 좁힌 채로 등록하면 그 인원 그대로 시트까지 간다
  await chips.filter({ hasText: /^03/ }).click();
  await chips.filter({ hasText: /미지정/ }).click();
  await page.waitForTimeout(300);
  eq(await grid.count(), 2, '미지정 2명');
  await page.locator('#fItem').fill('서버필터 테스트');
  await page.getByRole('button', { name: '전체 선택' }).click();
  await page.getByRole('button', { name: /아이템 등록/ }).last().click();
  await page.waitForTimeout(400);
  const sheet = await page.locator('.sheet').innerText();
  if (!/2\s*명/.test(sheet)) throw new Error(`확인 화면의 인원이 다릅니다: ${sheet.replace(/\n/g, ' ')}`);
  // 잘못 체크된 사람을 잡아내는 자리다 — 서버가 없는 사람은 이름만 나온다
  if (!sheet.includes('향로셔틀') || !sheet.includes('팩맨')) {
    throw new Error(`확인 화면에 참여자 이름이 없습니다: ${sheet.replace(/\n/g, ' ')}`);
  }
  await page.getByRole('button', { name: '등록하기' }).click();
  await page.waitForTimeout(1800);

  const items = await (await fetch(`${APP}/api/state?fresh=1`)).json();
  const rec = items.data.items.find((i) => i.item === '서버필터 테스트');
  if (!rec) throw new Error('좁혀서 등록한 아이템이 시트에 없습니다.');
  eq(rec.cnt, 2, '등록된 참여 인원');

  // 등록이 끝나면 서버 선택도 초기화된다 — 다음 아이템이 옛 필터를 물려받으면 안 된다
  eq(await page.locator('.mgrid .mchip').count(), 9, '등록 뒤 다시 전원');
});

await t('상단 시즌 칩으로 지난 시즌을 연다', async () => {
  await page.locator('.nav button', { hasText: /잔액/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /지난 시즌/ }).first().click();
  await page.waitForTimeout(900);
  if (!(await page.getByText('지난 시즌').first().isVisible())) throw new Error('시즌 목록이 열리지 않았습니다.');

  await page.getByRole('button', { name: /시즌 2/ }).first().click();
  await page.waitForTimeout(900);

  // 기본 화면은 "캐릭터명 + 정산 다이아" 만 보여준다 (표가 아니라 목록)
  const body = await page.locator('.sheet').innerText();
  for (const want of ['가이', '62,400', 'TC무식']) {
    if (!body.includes(want)) throw new Error(`정산 목록에 ${want} 이(가) 없습니다:\n${body}`);
  }
  if (body.includes('최종 잔액현황')) throw new Error('기본 화면에 표 제목이 그대로 나옵니다.');
  // 큰 금액이 위로 — TC무식(62,400)이 가이(48,200)보다 먼저 나와야 한다
  if (body.indexOf('62,400') > body.indexOf('48,200')) throw new Error('정산액 내림차순 정렬이 아닙니다.');
  await shot('06-season');

  // [자세히 보기] 를 눌러야 원래 표들이 펼쳐진다
  await page.getByRole('button', { name: /자세히 보기/ }).click();
  await page.waitForTimeout(400);
  if (!(await page.getByText('최종 잔액현황').first().isVisible())) {
    throw new Error('자세히 보기에서 표가 열리지 않았습니다.');
  }
  await shot('07-season-detail');

  await page.getByRole('button', { name: '시즌 목록으로' }).click();
  await page.waitForTimeout(300);
});

await t('참여자 칩이 국문·한문 두 줄로 나오고 이름이 잘리지 않는다', async () => {
  await reset();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.nav button').filter({ hasText: /아이템/ }).click();
  await page.waitForTimeout(600);

  const chip = page.locator('.mchip').filter({ hasText: '잠단' }).first();
  if (!(await chip.isVisible())) throw new Error('참여자 칩을 찾지 못했습니다.');
  // 첫 줄은 [서버 배지][국문] 이다 (v10.8.8). 이름 자체가 잘리지 않았는지 보는 것이
  // 이 검사의 목적이므로 배지를 뺀 나머지를 본다.
  const koLine = await chip.locator('.nm b').evaluate((el) => {
    const c = el.cloneNode(true);
    c.querySelectorAll('.svr').forEach((x) => x.remove());
    return c.textContent.trim();
  });
  eq(koLine, '잠단', '첫 줄 (국문, 배지 제외)');
  eq(await chip.locator('.nm b .svr').innerText(), '02', '첫 줄의 서버 배지');
  eq(await chip.locator('.nm i').innerText(), '斬斷', '둘째 줄 (한문)');

  // ★ 잘린 이름은 다른 사람으로 오인돼 엉뚱한 사람이 참여자로 체크된다.
  //   실제로 그려진 폭이 칩 안에 들어가는지 본다.
  const fits = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.mchip .nm').forEach((nm) => {
      nm.querySelectorAll('b, i').forEach((el) => {
        if (el.scrollWidth > el.clientWidth + 1) bad.push(el.textContent);
      });
    });
    return bad;
  });
  if (fits.length) throw new Error(`칩 안에서 잘린 이름: ${fits.slice(0, 5).join(', ')}`);

  // 긴 이름은 짧은 이름보다 작은 글씨여야 한다 (자동 축소)
  const sizes = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('.mchip .nm b').forEach((el) => {
      // 서버 배지는 이름이 아니다 — 키에서 뺀다 (v10.8.8)
      const c = el.cloneNode(true);
      c.querySelectorAll('.svr').forEach((x) => x.remove());
      out[c.textContent.trim()] = parseFloat(getComputedStyle(el).fontSize);
    });
    return out;
  });
  if (!(sizes['선륙소농포'] < sizes['가이'])) {
    throw new Error(`긴 이름이 줄지 않았습니다: ${JSON.stringify(sizes)}`);
  }

  // ★ 한자는 국문보다 커야 한다 (v10.8) — 중국 길드원에게는 이쪽이 본명이다
  const pair = await chip.evaluate((el) => ({
    ko: parseFloat(getComputedStyle(el.querySelector('.nm b')).fontSize),
    hanja: parseFloat(getComputedStyle(el.querySelector('.nm i')).fontSize),
  }));
  if (!(pair.hanja > pair.ko)) {
    throw new Error(`한자가 국문보다 작습니다: ${JSON.stringify(pair)}`);
  }
  await shot('16-two-line-names');
});

await t('멤버DB 한자표기가 잔액·아이템·내정보에 함께 나온다 (화면)', async () => {
  /*
   * 실제로 있었던 문제: 관리자가 [혈맹원 관리]의 "한자표기" 칸에 넣은 값이
   * 어느 화면에도 나오지 않았다. 화면이 이름 속 괄호만 봤기 때문이다.
   * 모의 명단의 'TC무식' 은 이름에 괄호가 없고 G열에만 车武植 이 있다 —
   * 사용자가 겪은 상황과 같은 표본이다.
   */
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.nav button').filter({ hasText: /잔액/ }).click();
  await page.waitForTimeout(700);

  const row = page.locator('.row').filter({ hasText: 'TC무식' }).first();
  const shown = await row.locator('.row-name').innerText();
  if (!shown.includes('车武植')) throw new Error(`잔액에 G열 한자가 없습니다: "${shown}"`);

  // 이름 괄호로 들어온 쪽도 그대로 나와야 한다 (기존 방식 호환)
  const legacy = await page.locator('.row').filter({ hasText: '잠단' }).first().locator('.row-name').innerText();
  if (!legacy.includes('斬斷')) throw new Error(`이름 괄호 한자가 사라졌습니다: "${legacy}"`);
  // ★ 한자가 두 번 붙으면 안 된다 (G열과 이름 괄호가 같은 값일 때)
  if ((legacy.match(/斬斷/g) ?? []).length > 1) throw new Error(`한자가 중복 표기됩니다: "${legacy}"`);

  // ★ 한자가 없는 사람에게 만들어 붙이지 않는다 (규칙 7)
  const plain = await page.locator('.row').filter({ hasText: 'PlusS' }).first().locator('.row-name').innerText();
  if (/[\u2e80-\u9fff]/.test(plain)) throw new Error(`한자가 없는데 만들어 붙였습니다: "${plain}"`);

  // 아이템 탭의 참여자 칩
  await page.locator('.nav button').filter({ hasText: /아이템/ }).click();
  await page.waitForTimeout(700);
  const chip = page.locator('.mchip').filter({ hasText: 'TC무식' }).first();
  eq(await chip.locator('.nm i').innerText(), '车武植', '칩 둘째 줄 (G열 한자)');

  // 내 정보 드롭다운
  await page.locator('.nav button').filter({ hasText: /내 정보/ }).click();
  await page.waitForTimeout(700);
  const opts = await page.locator('#meName option').allInnerTexts();
  if (!opts.some((o) => o.includes('TC무식') && o.includes('车武植'))) {
    throw new Error(`내 정보 목록에 한자가 없습니다: ${opts.slice(0, 5).join(' / ')}`);
  }
  await shot('21-hanja-everywhere');
});

await t('혈맹원 관리: 아이디 바로 아래에 한자표기 칸이 있다 (화면)', async () => {
  await reset();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.nav button').last().click();
  await page.waitForTimeout(900);

  // ★ 명단 자체에도 이름 옆에 한자가 붙어야 한다. 아래 줄에 작게 두면
  //   아이디에 괄호로 넣은 사람과 모양이 달라져 "얘만 한자가 없네"로 보인다.
  const listed = await page.locator('.row').filter({ hasText: 'TC무식' }).first().locator('.row-name').innerText();
  if (!listed.includes('车武植')) throw new Error(`혈맹원 목록 이름줄에 한자가 없습니다: "${listed}"`);

  // 서버는 [잔액]·[아이템]과 같은 배지로 (v10.8.9). 아랫줄에 글로 또 적지 않는다 —
  // 같은 정보가 화면마다 다르게 보이면 누구인지 가리는 데 쓸 수가 없다.
  const row = page.locator('.row').filter({ hasText: 'TC무식' }).first();
  eq(await row.locator('.row-name .svr').innerText(), '01', '혈맹원 명단의 서버 배지');
  const sub = await row.locator('.row-sub').innerText();
  if (/서버/.test(sub)) throw new Error(`아랫줄에 서버가 글로 또 적혀 있습니다: "${sub}"`);
  // 서버가 없는 사람에게는 빈 배지를 만들지 않는다
  const noSv = page.locator('.row').filter({ hasText: '향로셔틀' }).first();
  eq(await noSv.locator('.row-name .svr').count(), 0, '미지정자의 배지');

  await page.locator('.row').filter({ hasText: 'TC무식' }).first().getByRole('button', { name: '관리' }).click();
  await page.waitForTimeout(600);

  // 두 칸이 붙어 있어야 한다 — 사이에 분배비중·서버가 끼면 한자 칸을 못 보고 지나간다
  const order = await page.locator('.sheet input#newName, .sheet input#mh, .sheet select#mw').evaluateAll((els) =>
    els.map((el) => el.id),
  );
  if (order.join(',') !== 'newName,mh,mw') {
    throw new Error(`입력칸 순서가 다릅니다: ${order.join(' → ')} (기대 newName → mh → mw)`);
  }
  eq(await page.locator('.sheet input#mh').inputValue(), '车武植', '한자표기 칸의 현재 값');
  // 실제로 표시될 모양을 입력칸 아래에 미리 보여준다
  const preview = await page.locator('.sheet').innerText();
  if (!preview.includes('TC무식 (车武植)')) throw new Error('표시될 모양 미리보기가 없습니다.');

  // ★ 저장 버튼은 하나뿐이다 — 예전엔 [이름 저장]과 [설정 저장]이 따로 있어
  //   한쪽만 누르고 창을 닫기 쉬웠다
  const saveBtns = await page.locator('.sheet .sheet-actions .btn:not(.ghost)').count();
  eq(saveBtns, 1, '시트의 저장 버튼 개수');
  for (const gone of ['이름 저장', '설정 저장']) {
    if ((await page.locator('.sheet').getByRole('button', { name: gone, exact: true }).count()) > 0) {
      throw new Error(`"${gone}" 버튼이 남아 있습니다 — 저장은 하나여야 합니다.`);
    }
  }

  // 아이디·한자표기·분배비중을 한 번에 바꿔서 **한 번** 누른다
  await page.locator('.sheet input#newName').fill('TC무식2');
  await page.locator('.sheet input#mh').fill('車武植K');
  await page.locator('.sheet select#mw').selectOption('70');
  await page.waitForTimeout(200);
  await shot('22-member-one-save');
  await page.locator('.sheet').getByRole('button', { name: '저장', exact: true }).click();
  await page.waitForTimeout(2000);

  // 셋 다 반영돼야 한다. 하나라도 빠지면 관리자는 무엇이 저장됐는지 알 수 없다.
  await page.locator('.nav button').filter({ hasText: /잔액/ }).click();
  await page.waitForTimeout(900);
  const after = await page.locator('.row').filter({ hasText: 'TC무식2' }).first().locator('.row-name').innerText();
  if (!after.includes('車武植K')) throw new Error(`바꾼 한자표기가 잔액에 반영되지 않았습니다: "${after}"`);

  const roster = await (await fetch(`${APP}/api/admin/roster`, { headers: { Cookie: cookie } })).json();
  const rec = roster.data.find((m) => m.name === 'TC무식2');
  if (!rec) throw new Error('개명이 반영되지 않았습니다.');
  eq(rec.hanja, '車武植K', '한자표기');
  eq(rec.weight, 70, '분배비중');
  // ★ 개명이 먼저 처리돼야 설정이 새 이름에 붙는다 — 옛 이름 행은 남으면 안 된다
  if (roster.data.some((m) => m.name === 'TC무식')) throw new Error('옛 이름 행이 남아 있습니다.');
});

await t('혈맹원 추가 버튼 하나로 한 명도 여럿도 넣는다 (화면)', async () => {
  await reset();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.nav button').last().click();
  await page.waitForTimeout(900);

  // 같은 일을 하는 버튼이 둘이면 무엇이 다른지 묻게 된다 — 입구는 하나다
  if ((await page.getByRole('button', { name: /명단 일괄 추가/ }).count()) > 0) {
    throw new Error('[명단 일괄 추가] 버튼이 남아 있습니다.');
  }
  await page.getByRole('button', { name: /혈맹원 추가/ }).first().click();
  await page.waitForTimeout(600);

  // 한 명만 넣을 때도 같은 화면 — 이름 하나만 적으면 된다
  await page.locator('#bulkText').fill('혼자온사람');
  await page.locator('.sheet-actions .btn:not(.ghost)').last().click();
  await page.waitForTimeout(1500);
  const row = page.locator('.bulk-row').filter({ hasText: '혼자온사람' }).first();
  if (!(await row.isVisible())) throw new Error('한 명 입력이 판정 화면으로 넘어가지 않았습니다.');
  // 시트는 confirm === true 없이는 쓰지 않는다 (규칙 5-4) — 앱이 한 번 더 물어본다.
  // 브라우저 기본 동작은 "취소"라서, 받아들이는 쪽을 명시해야 실제 흐름이 돌아간다.
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: /추가 1/ }).click();
  await page.waitForTimeout(2200);

  const roster = (await (await fetch(`${APP}/api/admin/roster`, { headers: { Cookie: cookie } })).json()).data;
  if (!roster.some((m) => m.name === '혼자온사람')) throw new Error('한 명 추가가 반영되지 않았습니다.');
  await reset();
});

await t('이전 아이디에서 기록 가져오기 (화면) — 중복 아이디는 막힌다', async () => {
  await reset();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.nav button').last().click();
  await page.waitForTimeout(900);

  // '팩맨'(기록 0)을 열어 '가이'(분배전 12,400)의 기록을 가져온다
  await page.locator('.row').filter({ hasText: '팩맨' }).first().getByRole('button', { name: '관리' }).click();
  await page.waitForTimeout(600);

  // ① 아이디 칸에 이미 있는 이름을 치면 막힌다 — 오타 하나로 두 사람이 합쳐지던 자리다
  await page.locator('.sheet input#newName').fill('가이');
  await page.waitForTimeout(300);
  const warn = await page.locator('.sheet .note').filter({ hasText: '이미 명단에 있는' }).first().innerText();
  if (!warn.includes('가이')) throw new Error(`중복 안내가 없습니다: "${warn}"`);
  const saveBtn = page.locator('.sheet .sheet-actions .btn:not(.ghost)').first();
  if (await saveBtn.isEnabled()) throw new Error('중복 아이디인데 저장이 눌립니다.');
  await page.locator('.sheet input#newName').fill('팩맨');
  await page.waitForTimeout(300);

  // ② 가져오기 화면 — 본인과 혈비는 후보에 없어야 한다
  await page.getByRole('button', { name: /이전 아이디에서 불러오기/ }).click();
  await page.waitForTimeout(500);
  const names = await page.locator('.sheet .svrow .nm').allInnerTexts();
  if (names.some((n) => n.includes('팩맨'))) throw new Error('자기 자신이 후보에 있습니다.');
  if (names.some((n) => n.includes('혈맹운영비'))) throw new Error('혈비 계정이 후보에 있습니다.');
  // 따라올 금액이 후보마다 보여야 같은 사람인지 판단할 수 있다
  const guyRow = page.locator('.sheet .svrow').filter({ hasText: '가이' }).first();
  if (!(await guyRow.innerText()).includes('12,400')) throw new Error('따라올 금액이 안 보입니다.');
  await shot('27-pull-from');

  // ③ 고르면 서버가 구체적인 숫자로 되묻는다 (규칙 5-1)
  await guyRow.click();
  await page.waitForTimeout(1500);
  const ask = await page.locator('.sheet .note').first().innerText();
  if (!ask.includes('12,400')) throw new Error(`되물을 때 금액이 없습니다: ${ask.replace(/\n/g, ' ')}`);

  await page.getByRole('button', { name: /합치기|가져오기/ }).last().click();
  await page.waitForTimeout(2000);

  // ④ 기록이 넘어오고, 옛 아이디는 사라지고, 같은 이름이 두 줄 남지 않는다
  const after = (await (await fetch(`${APP}/api/admin/roster`, { headers: { Cookie: cookie } })).json()).data;
  eq(after.filter((m) => m.name === '팩맨').length, 1, '병합 뒤 줄 수');
  eq(after.some((m) => m.name === '가이'), false, '옛 아이디는 사라진다');
  eq(after.find((m) => m.name === '팩맨')?.pending, 12400, '분배전 승계');

  const st = (await (await fetch(`${APP}/api/state?fresh=1`)).json()).data;
  const merged = st.rows.find((r) => r.name === '팩맨');
  eq(merged.paid, 88000, '분배완료 승계');
  eq(merged.cnt, 31, '참여횟수 승계');
  await reset();
});

await t('잔액 목록에 서버 번호가 붙는다', async () => {
  await page.locator('.nav button').filter({ hasText: /잔액/ }).click();
  await page.waitForTimeout(600);

  // 모의 데이터에서 '가이' 는 01 서버, '대서과Z' 는 04 서버
  const row = page.locator('.row').filter({ hasText: '가이' }).first();
  eq(await row.locator('.row-name .svr').innerText(), '01', '가이의 서버');
  const row2 = page.locator('.row').filter({ hasText: '대서과Z' }).first();
  eq(await row2.locator('.row-name .svr').innerText(), '04', '대서과Z의 서버');

  // 서버가 지정되지 않은 멤버에는 배지가 붙지 않아야 한다 (빈 배지는 오해를 만든다)
  const noSvr = page.locator('.row').filter({ hasText: '향로셔틀' }).first();
  eq(await noSvr.locator('.row-name .svr').count(), 0, '서버 미지정 멤버');

  // ★ 시트에 '2' 로 (앞의 0 이 빠진 채) 저장된 사람도 '02' 로 보인다.
  //   화면마다 다르게 읽으면 아이템 탭에서 "02 서버 0명" 이 나온다 (v10.8.7)
  const pad = page.locator('.row').filter({ hasText: '詹阿呆' }).first();
  eq(await pad.locator('.row-name .svr').innerText(), '02', "'2' 로 저장된 사람의 서버");
  await shot('17-balance-server');
});

await t('혈맹운영비가 잔액·혈맹원 관리 맨 위에 온다 (화면)', async () => {
  await page.locator('.nav button').filter({ hasText: /잔액/ }).click();
  await page.waitForTimeout(600);

  // 혈비는 사람이 아니라 길드의 금고다 — 사람들 사이에 섞이면 인원이 늘수록 밀린다
  const first = page.locator('.card .row').first();
  if (!(await first.innerText()).includes('혈맹운영비')) {
    throw new Error(`잔액 맨 윗줄이 혈비가 아닙니다: ${(await first.innerText()).split('\n')[0]}`);
  }
  // 아무 표시가 없으면 "잔액이 제일 많은 사람" 으로 읽힌다
  eq(await first.locator('.badge').innerText(), '운영비', '맨 윗줄의 배지');
  // 혈비 아래는 이름순(ㄱ~ㅎ)이어야 한다 (v10.9.2).
  // 금액순으로 두면 분배할 때마다 자리가 바뀌어 눈으로 찾을 수가 없다.
  const listed = (await page.locator('.card .row .row-name').allInnerTexts())
    .slice(1)
    .map((s) => s.replace(/^\d{2}\s*/, '').split('(')[0].trim());
  const wanted = [...listed].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
  if (listed.join(',') !== wanted.join(',')) {
    throw new Error(`잔액이 이름순이 아닙니다:\n  실제 ${listed.join(' · ')}\n  기대 ${wanted.join(' · ')}`);
  }

  // ★ 검색·필터에 걸려 빠진 것을 억지로 되살리면 안 된다 — 필터가 거짓말을 하게 된다
  await page.locator('input[type="text"][inputmode="search"]').first().fill('가이');
  await page.waitForTimeout(400);
  const shown = await page.locator('.card .row').allInnerTexts();
  if (shown.some((x) => x.includes('혈맹운영비'))) {
    throw new Error('검색어에 안 맞는데도 혈비가 나옵니다.');
  }
  await page.locator('input[type="text"][inputmode="search"]').first().fill('');
  await page.waitForTimeout(400);

  // [혈맹원 관리] 도 같다 — 시트가 내려준 isFund 로 판정한다
  await page.locator('.nav button').last().click();
  await page.waitForTimeout(900);
  const rosterFirst = page.locator('.sect', { hasText: '혈맹원 관리' }).locator('..').locator('.row').first();
  if (!(await rosterFirst.innerText()).includes('혈맹운영비')) {
    throw new Error(`혈맹원 관리 맨 윗줄이 혈비가 아닙니다: ${(await rosterFirst.innerText()).split('\n')[0]}`);
  }
  await shot('25-fund-first');
});

await t('사람 목록이 잔액·아이템·관리 모두 이름순(ㄱ~ㅎ)이다 (화면)', async () => {
  await reset();
  await page.reload({ waitUntil: 'networkidle' });

  // 표기 차이·괄호를 걷어낸 뒤 한국어 순서와 대조한다
  const clean = (s) => s.replace(/^\d{2}\s*/, '').split('(')[0].trim();
  const inOrder = (names, where) => {
    const want = [...names].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
    if (names.join(',') !== want.join(','))
      throw new Error(`${where} 가 이름순이 아닙니다:\n  실제 ${names.join(' · ')}\n  기대 ${want.join(' · ')}`);
  };

  // ① 잔액 — 맨 위 혈비만 빼고
  await page.locator('.nav button').filter({ hasText: /잔액/ }).click();
  await page.waitForTimeout(700);
  inOrder((await page.locator('.card .row .row-name').allInnerTexts()).slice(1).map(clean), '잔액');

  // ② 아이템 참여자 칩
  await page.locator('.nav button').filter({ hasText: /아이템/ }).click();
  await page.waitForTimeout(800);
  inOrder(
    await page.locator('.mgrid .mchip .nm b').evaluateAll((els) =>
      els.map((el) => {
        const c = el.cloneNode(true);
        c.querySelectorAll('.svr').forEach((x) => x.remove());
        return c.textContent.trim();
      }),
    ),
    '아이템 참여자',
  );

  // ③ 관리 혈맹원 명단 — 혈비는 맨 위에 고정, 그 아래가 이름순
  await page.locator('.nav button').last().click();
  await page.waitForTimeout(900);
  // 바로 다음 카드만 본다 — 부모째로 잡으면 아래의 도구 목록까지 딸려 온다
  const rows = await page
    .locator('.sect', { hasText: '혈맹원 관리' })
    .locator('xpath=following-sibling::div[1]')
    .locator('.row .row-name')
    .allInnerTexts();
  if (!rows[0].includes('혈맹운영비')) throw new Error(`관리 맨 윗줄이 혈비가 아닙니다: ${rows[0]}`);
  inOrder(rows.slice(1).map(clean), '관리 명단');

  // ④ [이전 아이디에서 불러오기] 후보도 같은 순서다
  await page.locator('.row').filter({ hasText: '팩맨' }).first().getByRole('button', { name: '관리' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /이전 아이디에서 불러오기/ }).click();
  await page.waitForTimeout(500);
  inOrder((await page.locator('.sheet .svrow .nm').allInnerTexts()).map(clean), '가져오기 후보');

  // 열어둔 시트를 닫는다 — 그대로 두면 다음 검사가 탭을 누르지 못한다
  await page.getByRole('button', { name: '뒤로' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '취소' }).click();
  await page.waitForTimeout(400);
});

await t('지급 창에 서버·한자까지 나온다 (누구에게 주는지가 이 창의 전부다)', async () => {
  await page.locator('.nav button').filter({ hasText: /잔액/ }).click();
  await page.waitForTimeout(700);
  await page.locator('.card .row').filter({ hasText: 'TC무식' }).first()
    .getByRole('button', { name: '지급' }).click();
  await page.waitForTimeout(600);

  // 서버가 갈리면서 비슷한 이름이 서버마다 생겼고, 지급은 되돌리기가 번거롭다.
  // (앞선 검사가 이 사람의 아이디·한자를 바꿔 놓으므로 모양으로 확인한다)
  const who = (await page.locator('.sheet h2').innerText()).trim();
  if (!/^💰\s*01\s+TC무식\S*\s+\([^)]+\)/.test(who)) {
    throw new Error(`지급 창의 대상 표기가 다릅니다: "${who}" (기대 "01 이름 (한자)")`);
  }
  await shot('26-payout-who');
  await page.getByRole('button', { name: '취소' }).click();
  await page.waitForTimeout(400);
});

await t('서버 일괄 지정: 칩으로 고르고 여러 명을 한 번에 넣는다 (화면)', async () => {
  await reset();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.nav button').last().click();
  await page.waitForTimeout(900);

  // 서버가 비어 있는 사람이 있으면 관리자에게 미리 알려준다 —
  // 비워 두면 나중에 아이템 등록을 서버로 좁힐 수 없다 (혈비 계정은 세지 않는다)
  const note = await page.locator('.note').filter({ hasText: '서버가 비어 있는' }).first().innerText();
  if (!note.includes('2명')) throw new Error(`미지정 안내 인원이 다릅니다: "${note}"`);

  await page.getByRole('button', { name: /서버 일괄 지정/ }).click();
  await page.waitForTimeout(600);

  // ① 실제로 쓰는 서버(01·02·03·04·06)만 앞에 두고 나머지 7개는 접는다.
  //    12개를 매번 다 늘어놓으면 안 쓰는 여덟 개가 계속 눈에 걸린다.
  const chips = await page.locator('.sheet .svpick .svchip:not(.more)').allInnerTexts();
  eq(chips.join(','), '01,02,03,04,06', '펼쳐 보이는 서버 칩');
  const more = await page.locator('.sheet .svpick .svchip.more').innerText();
  if (!more.includes('7')) throw new Error(`접힌 서버 개수가 다릅니다: "${more}"`);

  // 접힌 것을 펼치면 12개가 다 나온다 — 예외 상황에서 05 서버를 골라야 할 수도 있다
  await page.locator('.sheet .svpick .svchip.more').click();
  await page.waitForTimeout(200);
  eq(await page.locator('.sheet .svpick .svchip:not(.more)').count(), 12, '펼친 뒤 서버 칩');

  // ② 기본은 '서버가 비어 있는 사람만' — 40명 중 이미 넣은 사람까지 훑을 이유가 없다
  const rows = page.locator('.sheet .svrow');
  eq(await rows.count(), 2, '미지정 인원');
  const names = await rows.locator('.nm').allInnerTexts();
  if (!names.some((n) => n.includes('향로셔틀')) || !names.some((n) => n.includes('팩맨'))) {
    throw new Error(`미지정 목록이 다릅니다: ${names.join(', ')}`);
  }

  // 체크를 풀면 전원이 보이되 혈비 계정은 빠진다 — 계정에는 서버가 없다
  await page.locator('.sheet .chkline input').uncheck();
  await page.waitForTimeout(200);
  const all = await rows.locator('.nm').allInnerTexts();
  eq(all.length, 9, '혈비 제외 전체 인원');
  if (all.some((n) => n.includes('혈맹운영비'))) throw new Error('혈비 계정이 목록에 있습니다.');
  // '2' 로 저장된 사람도 '02' 로 보이고, 경고(⚠️)가 붙지 않아야 한다 — 앱이 알아서 맞춘다
  const padRow = rows.filter({ hasText: '詹阿呆' }).first();
  eq((await padRow.locator('.svr').innerText()).trim(), '02', "'2' 로 저장된 사람의 표기");
  eq(await padRow.locator('.svr.bad').count(), 0, "'2' 를 형식 오류로 표시하는지");
  // 미지정에는 배지를 만들지 않는다 — 빈 배지는 지정된 것처럼 보인다
  const emptyRow = rows.filter({ hasText: '향로셔틀' }).first();
  eq(await emptyRow.locator('.svr').count(), 0, '미지정자의 배지');
  eq((await emptyRow.locator('.cur').innerText()).trim(), '미지정', '미지정 표기');
  await page.locator('.sheet .chkline input').check();
  await page.waitForTimeout(200);

  // ③ 서버 05 를 골라 두 명을 한 번에 지정한다
  await page.locator('.sheet .svpick .svchip', { hasText: /^05$/ }).click();
  await page.locator('.sheet').getByRole('button', { name: '전체 선택' }).click();
  await page.waitForTimeout(200);
  await shot('23-server-bulk');
  await page.locator('.sheet').getByRole('button', { name: /2명을 05 서버로 지정/ }).click();
  await page.waitForTimeout(2500);

  // 성공 알림에 인원과 서버가 같이 나와야 한다
  const toast = await page.locator('.toast').first().innerText();
  if (!/2명.*05/.test(toast)) throw new Error(`알림이 인원·서버를 알려주지 않습니다: "${toast}"`);

  // ④ 실제로 시트까지 갔는지 — 화면만 바뀌고 저장이 안 되면 다음 로드에서 되돌아간다
  const roster = await (await fetch(`${APP}/api/admin/roster`, { headers: { Cookie: cookie } })).json();
  for (const nm of ['향로셔틀', '팩맨']) {
    eq(roster.data.find((m) => m.name === nm)?.server, '05', `${nm} 의 서버`);
  }
  // 이미 서버가 있던 사람은 건드리지 않는다
  eq(roster.data.find((m) => m.name === '가이')?.server, '01', '가이의 서버(그대로)');
});

await t('연합: 등록 → 나중에 금액 넣기 (화면 흐름)', async () => {
  await reset();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.nav button').filter({ hasText: /연합/ }).click();
  await page.waitForTimeout(800);

  // 모의 데이터에 금액 대기 건이 하나 있다
  const waiting = page.locator('.card').filter({ hasText: '연합 레이드' }).first();
  if (!(await waiting.isVisible())) throw new Error('금액 대기 목록이 보이지 않습니다.');

  await page.getByRole('button', { name: '금액 넣기' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('#cam').fill('50000');
  await page.waitForTimeout(300);

  // 미리보기: 50,000 → 혈비 5,000 · 05서버(18명)가 45,000 을 전부 가져간다
  const calc = await page.locator('.sheet .calc').innerText();
  if (!calc.includes('50,000')) throw new Error(`판매금액 미리보기가 틀립니다:\n${calc}`);
  if (!calc.includes('5,000')) throw new Error(`혈비 미리보기가 없습니다:\n${calc}`);
  if (!calc.includes('45,000')) throw new Error(`서버 몫 미리보기가 틀립니다:\n${calc}`);
  await shot('18-alliance-credit');

  await page.locator('.sheet-actions .btn.warn').click();
  await page.waitForTimeout(1500);

  // 정산이 끝나면 대기 목록에서 빠지고 서버 누적에 잡힌다
  const body = await page.locator('main').innerText();
  if (!body.includes('50,000')) throw new Error('정산 결과가 화면에 반영되지 않았습니다.');
});

await t('연합: 아이템 하나에 여러 서버 · 혈비가 혈맹운영비 잔액으로 간다 (v11.0)', async () => {
  await reset();

  // 지금 혈맹운영비 잔액을 기억해 둔다 — 정산 뒤 정확히 혈비만큼 늘어야 한다
  const fundOf = async () => {
    const st = (await (await fetch(`${APP}/api/state?fresh=1`)).json()).data;
    return st.rows.find((r) => r.name === '혈맹운영비').pending;
  };
  const before = await fundOf();

  // ① 등록 — 01서버 10명 · 02서버 5명. 인증샷은 넣지 않는다 (선택이어야 한다)
  const reg = await post(
    '/api/admin/alliance',
    {
      op: 'register',
      item: '연합 다중서버',
      entries: [{ server: '01', people: 10 }, { server: '02', people: 5 }],
      photoLinks: [],
    },
    { Cookie: cookie },
  );
  const regBody = await reg.json();
  eq(regBody.ok, true, '인증샷 없이 등록');
  const group = regBody.group;
  if (!group) throw new Error('묶음(group) 값을 돌려주지 않습니다.');

  // ② 같은 서버를 두 번 넣으면 거부해야 한다 — 인원이 갈리면 분배 비율이 틀어진다
  const dup = await post(
    '/api/admin/alliance',
    { op: 'register', item: '중복 서버', entries: [{ server: '01', people: 3 }, { server: '01', people: 4 }] },
    { Cookie: cookie },
  );
  eq(dup.status, 400, '중복 서버 거부');

  // ③ 정산 — 10만: 혈비 1만 · 01서버(10명) 6만 · 02서버(5명) 3만
  const credit = await post('/api/admin/alliance', { op: 'credit', group, amount: 100000 }, { Cookie: cookie });
  const creditBody = await credit.json();
  eq(creditBody.ok, true, '정산');
  eq(creditBody.fund, 10000, '혈맹운영비로 간 혈비');

  const ali = (await (await fetch(`${APP}/api/alliance?fresh=1`)).json()).data;
  const g = ali.records.find((x) => x.group === group);
  if (!g) throw new Error('정산된 건이 기록 목록에 없습니다.');
  eq(g.servers.length, 2, '묶음 안의 서버 수');
  eq(g.servers.find((x) => x.server === '01').credited, 60000, '01서버 몫');
  eq(g.servers.find((x) => x.server === '02').credited, 30000, '02서버 몫');
  // ★ 보존 불변식 — 혈비 + 서버 몫 = 판매금액
  eq(g.fund + g.credited, 100000, '혈비 + 서버 몫');

  // ④ 혈맹운영비 잔액이 실제로 늘었어야 한다
  eq(await fundOf(), before + 10000, '정산 뒤 혈맹운영비 잔액');

  // ⑤ 이미 정산된 건을 또 정산하면 서버 총액이 두 배가 된다 — 막혀야 한다
  const again = await post('/api/admin/alliance', { op: 'credit', group, amount: 100000 }, { Cookie: cookie });
  eq(again.status, 400, '중복 정산 거부');

  // ⑥ 삭제하면 적립했던 혈비를 되돌려야 장부가 맞는다
  const del = await fetch(`${APP}/api/admin/alliance`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ group }),
  });
  eq((await del.json()).ok, true, '묶음 삭제');
  eq(await fundOf(), before, '삭제 뒤 혈맹운영비 잔액 (회수됨)');
});

await t('연합: 아이템명을 누르면 서버별 참여 인원이 펼쳐진다 (화면)', async () => {
  await reset();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.nav button').filter({ hasText: /연합/ }).click();
  await page.waitForTimeout(900);

  // 모의 데이터의 '연합 보스' 는 03서버 12명 · 05서버 6명이 나눠 가진 한 건이다
  await page.locator('.row-name.linkish').filter({ hasText: '연합 보스' }).first().click();
  await page.waitForTimeout(500);
  const sheet = await page.locator('.sheet').innerText();
  if (!sheet.includes('12')) throw new Error(`03서버 인원이 보이지 않습니다:\n${sheet}`);
  if (!sheet.includes('6')) throw new Error(`05서버 인원이 보이지 않습니다:\n${sheet}`);
  if (!sheet.includes('24,000')) throw new Error(`03서버 몫이 보이지 않습니다:\n${sheet}`);
  await shot('18b-alliance-detail');
  await page.locator('.sheet-actions .btn.ghost').click();
  await page.waitForTimeout(300);
});

await t('미분배 아이템 수정은 마스터만, 분배된 것은 거부한다 (v11.0)', async () => {
  await reset();

  // 등록해두고 그 행을 고친다
  const reg = await post(
    '/api/admin/register',
    { itemName: '수정 대상', participants: ['가이', '팩맨'] },
    { Cookie: cookie },
  );
  eq((await reg.json()).ok, true, '등록');
  const st = (await (await fetch(`${APP}/api/state?fresh=1`)).json()).data;
  const row = st.items.find((i) => i.item === '수정 대상').row;

  // ① 관리자 PIN 으로는 막혀야 한다
  const asAdmin = await post(
    '/api/master/item',
    { row, itemName: '바뀐 이름', participants: ['가이'] },
    { Cookie: cookie },
  );
  eq(asAdmin.status, 401, '관리자에게는 막힌다');

  // ② 마스터는 고칠 수 있다. 참여자를 한 명으로 줄인다
  const asMaster = await post(
    '/api/master/item',
    { row, itemName: '바뀐 이름', participants: ['가이'] },
    { Cookie: masterCookie },
  );
  const body = await asMaster.json();
  eq(body.ok, true, '마스터 수정');

  const after = (await (await fetch(`${APP}/api/state?fresh=1`)).json()).data;
  const it = after.items.find((i) => i.row === row);
  eq(it.item, '바뀐 이름', '바뀐 아이템명');
  eq(it.cnt, 1, '바뀐 참여자 수');
  if (it.names.includes('팩맨')) throw new Error('명단에서 뺀 사람이 그대로 남아 있습니다.');

  // ★ 참여횟수는 명단을 따라 다시 세어진다 (증감이 아니라 전면 재계산).
  //   기준값을 등록 직후 상태에서 잡지 않는 이유: 재계산은 등록 이력 전체를
  //   다시 세므로, 손으로 올려둔 옛 값이 있으면 그 자리에서 한 번 보정된다.
  const cntOf = (d) => d.rows.find((r) => r.name === '팩맨').cnt;
  const back = await post(
    '/api/master/item',
    { row, itemName: '바뀐 이름', participants: ['가이', '팩맨'] },
    { Cookie: masterCookie },
  );
  eq((await back.json()).ok, true, '참여자 되돌리기');
  const readded = (await (await fetch(`${APP}/api/state?fresh=1`)).json()).data;
  eq(cntOf(readded), cntOf(after) + 1, '다시 넣은 사람의 참여횟수');

  // ③ 참여자를 전부 빼는 것은 거부해야 한다
  const empty = await post(
    '/api/master/item',
    { row, itemName: '바뀐 이름', participants: [] },
    { Cookie: masterCookie },
  );
  eq(empty.status, 400, '참여자 0명 거부');

  // ④ 이미 분배된 아이템은 시트가 거부한다 — 그쪽은 [정정]이 담당한다
  eq((await post('/api/admin/distribute', { row, amount: 10000 }, { Cookie: cookie })).status, 200, '분배');
  const done = await post(
    '/api/master/item',
    { row, itemName: '분배 후 수정', participants: ['가이'] },
    { Cookie: masterCookie },
  );
  eq(done.status, 400, '분배된 아이템 수정 거부');
});

await t('레이드: 오늘 요일이 먼저 뜨고, 다른 요일로 바꿔 볼 수 있다 (화면)', async () => {
  await reset();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.nav button').filter({ hasText: /레이드/ }).click();
  await page.waitForTimeout(900);

  // 요일 칩 7개 — 오늘이 켜져 있어야 한다
  eq(await page.locator('.daybar .daychip').count(), 7, '요일 칩 개수');
  const js = new Date().getDay();
  const today = js === 0 ? 7 : js;
  const onIdx = await page.locator('.daybar .daychip.on').first().evaluate((el) =>
    [...el.parentElement.children].indexOf(el),
  );
  eq(onIdx + 1, today, '기본으로 켜진 요일');
  await shot('20-raid-today');

  // 모의 데이터에서 '커츠'·'오만1층2층' 은 모든 요일에 있으므로 어느 요일에나 보인다
  let body = await page.locator('main').innerText();
  if (!body.includes('커츠')) throw new Error('오늘 목록에 매일 나오는 보스가 없습니다.');

  // ★ 요일을 바꾸면 그 요일 것만 나와야 한다 — 월요일에만 있는 보스로 확인한다
  await page.locator('.daybar .daychip').nth(0).click();   // 월
  await page.waitForTimeout(400);
  body = await page.locator('main').innerText();
  if (!body.includes('다이아몬드골렘')) throw new Error('월요일 전용 보스가 보이지 않습니다.');
  if (body.includes('칠흑데스')) throw new Error('일요일 전용 보스가 월요일에 보입니다.');

  await page.locator('.daybar .daychip').nth(6).click();   // 일
  await page.waitForTimeout(400);
  body = await page.locator('main').innerText();
  if (!body.includes('칠흑데스')) throw new Error('일요일 전용 보스가 보이지 않습니다.');
  if (body.includes('다이아몬드골렘')) throw new Error('월요일 전용 보스가 일요일에 보입니다.');

  // 공유 버튼은 있어야 한다 (게시판·관리에는 없어야 한다 — 아래 별도 검사)
  eq(await page.locator('.share-btn').count() > 0, true, '공유 버튼');
});

await t('공유 버튼: 잔액·아이템·연합·레이드·내정보에만 있다 (화면)', async () => {
  await page.reload({ waitUntil: 'networkidle' });
  for (const tab of [/잔액/, /아이템/, /연합/, /레이드/]) {
    await page.locator('.nav button').filter({ hasText: tab }).click();
    await page.waitForTimeout(700);
    if ((await page.locator('.share-btn').count()) === 0) {
      throw new Error(`${tab} 탭에 공유 버튼이 없습니다.`);
    }
  }
  // ★ 게시판·관리에는 없어야 한다
  for (const tab of [/게시판/, /관리$/]) {
    await page.locator('.nav button').filter({ hasText: tab }).click();
    await page.waitForTimeout(700);
    if ((await page.locator('.share-btn').count()) > 0) {
      throw new Error(`${tab} 탭에 공유 버튼이 있습니다.`);
    }
  }
});

await t('탭 순서가 잔액·아이템·연합·레이드·내정보·게시판·관리다 (화면)', async () => {
  await page.reload({ waitUntil: 'networkidle' });
  const labels = await page.locator('.nav button').allInnerTexts();
  const got = labels.map((s) => s.split('\n').pop().trim());
  const want = ['잔액', '아이템', '연합', '레이드', '내 정보', '게시판', '관리'];
  if (got.join(' ') !== want.join(' ')) throw new Error(`탭 순서: ${got.join(' ')} (기대 ${want.join(' ')})`);
});

await t('관리자 화면에는 마스터 전용 기능이 아예 보이지 않는다', async () => {
  await reset();

  /*
   * 등급을 바꿀 때마다 화면에서 로그인하면 로그인 횟수 제한(10분 10회)에 걸린다.
   * 앞에서 이미 받아둔 쿠키를 브라우저에 그대로 심어 등급만 갈아끼운다 —
   * 확인하려는 것은 "그 등급에서 무엇이 보이는가" 뿐이다.
   */
  const asRole = async (raw) => {
    const [name, value] = raw.split('=');
    await ctx.addCookies([{ name, value, url: APP }]);
    await page.goto(APP, { waitUntil: 'networkidle' });
  };

  await asRole(cookie);   // ── 관리자 ──

  // ① 아이템 탭 — 정정·삭제 카드가 통째로 없어야 한다
  await page.locator('.nav button').filter({ hasText: /아이템/ }).click();
  await page.waitForTimeout(700);
  let body = await page.locator('main').innerText();
  if (/정정/.test(body)) throw new Error('관리자에게 정정·삭제 카드가 보입니다.');

  // ② 관리 탭 — 되돌릴 수 없는 도구와 지급취소가 없어야 한다
  await page.locator('.nav button').last().click();
  await page.waitForTimeout(900);
  body = await page.locator('main').innerText();
  for (const gone of ['시즌 종료', '공장 초기화', '최초 설치', '기존 파일에서 가져오기', '지급 취소']) {
    if (body.includes(gone)) throw new Error(`관리자에게 "${gone}" 이(가) 보입니다.`);
  }
  // 일상 도구는 그대로 보여야 한다 — 권한을 과하게 조이면 업무가 막힌다
  for (const stay of ['참여횟수 재계산', '시트 정돈']) {
    if (!body.includes(stay)) throw new Error(`관리자에게 "${stay}" 이(가) 없습니다.`);
  }
  // 잠긴 버튼을 남겨두면 "왜 안 되냐"를 묻게 된다
  // ('🔒 관리자 모드 잠그기' 는 정상 버튼이라 제외한다)
  const lockedBtns = await page.evaluate(() =>
    [...document.querySelectorAll('main button')]
      .filter((b) => b.textContent?.trim() === '🔒' || (b.disabled && b.textContent?.includes('🔒')))
      .map((b) => b.textContent?.trim()),
  );
  if (lockedBtns.length) throw new Error(`잠긴 버튼이 남아 있습니다: ${lockedBtns.join(', ')}`);
  await shot('19-admin-view');

  await asRole(masterCookie);   // ── 마스터 ──

  await page.locator('.nav button').last().click();
  await page.waitForTimeout(900);
  body = await page.locator('main').innerText();
  for (const shown of ['시즌 종료', '공장 초기화', '지급 취소']) {
    if (!body.includes(shown)) throw new Error(`마스터에게 "${shown}" 이(가) 안 보입니다.`);
  }
  await shot('20-master-view');

  await page.locator('.nav button').filter({ hasText: /아이템/ }).click();
  await page.waitForTimeout(700);
  if (!/정정/.test(await page.locator('main').innerText())) {
    throw new Error('마스터에게 정정·삭제 카드가 안 보입니다.');
  }

  await asRole(cookie);   // 뒤 검사들은 관리자 화면을 기대한다
});

await t('헤더의 새로고침 버튼이 보이고, 눌러서 최신 값을 받아온다', async () => {
  await reset();
  await page.reload({ waitUntil: 'networkidle' });

  const btn = page.locator('.header .meta button.sync');
  if (!(await btn.isVisible())) throw new Error('새로고침 버튼이 보이지 않습니다.');
  // 마지막으로 받아온 시점을 같이 보여줘야 "지금 눌러야 하나"를 판단할 수 있다
  const label = await btn.innerText();
  if (!/방금|분 전|시간 전/.test(label)) throw new Error(`갱신 시각 표시가 없습니다: "${label}"`);

  // 앱을 거치지 않고 시트만 바꾼 뒤, 버튼을 눌러야 반영되는지 본다
  await mock('__setVersion', { version: '9.9' });
  await btn.click();
  await page.waitForTimeout(1500);
  const h1 = await page.locator('.header h1').innerText();
  if (!h1.includes('9.9')) throw new Error(`새로고침을 눌렀는데 최신 값이 아닙니다: ${h1}`);
  await shot('15-refresh');

  await mock('__setVersion', { version: GS_VER });
  await btn.click();
  await page.waitForTimeout(1200);
});

await t('제목 옆에 버전이 보이고, 시트가 옛 버전이면 경고가 붙는다', async () => {
  await reset();
  await page.reload({ waitUntil: 'networkidle' });
  const h1 = page.locator('.header h1');
  const same = await h1.innerText();
  // 버전을 여기에 적어두면 올릴 때마다 검사가 깨진다 — 소스에서 읽는다
  const appVer = (readFileSync(new URL('../lib/version.ts', import.meta.url), 'utf8')
    .match(/APP_VERSION = '([\d.]+)'/) ?? [])[1];
  if (!appVer) throw new Error('APP_VERSION 을 읽지 못했습니다.');
  if (!same.includes('v' + appVer)) throw new Error(`제목 옆 버전이 없습니다: ${same} (기대 v${appVer})`);
  // ★ 시트가 11.0 이고 앱이 11.0.0 이어도 경고가 붙으면 안 된다 (세 번째 자리는 앱 전용)
  if (same.includes('⚠️')) throw new Error(`앱 패치 버전인데 시트 경고가 떴습니다: ${same}`);
  await shot('09-version');

  // 시트만 옛 버전으로 바꾸면 경고가 떠야 한다.
  // 상태 캐시가 8초라, 딱 8.5초만 기다리면 경계에서 간헐적으로 어긋난다 —
  // 캐시가 확실히 만료될 때까지 몇 번 더 새로고침해 본다.
  await mock('__setVersion', { version: '9.1' });
  let warned = '';
  for (let i = 0; i < 6 && !warned.includes('9.1'); i++) {
    await page.waitForTimeout(3000);
    await page.reload({ waitUntil: 'networkidle' });
    warned = await h1.innerText();
  }
  if (!warned.includes('9.1')) throw new Error(`시트 버전 경고가 없습니다: ${warned}`);
  if (!warned.includes('⚠️')) throw new Error(`경고 표시가 없습니다: ${warned}`);
  await shot('10-version-mismatch');

  await mock('__setVersion', { version: GS_VER });
});

await t('中文 으로 바꾸면 화면 문구가 전부 중문이 된다', async () => {
  await reset();
  await page.goto(APP, { waitUntil: 'networkidle' });

  // [관리] 탭 → 언어 → 中文
  await page.locator('.nav button').last().click();     // 관리 탭 (언어 무관)
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '中文' }).click();
  await page.waitForTimeout(400);

  // 헤더 제목도 중문이어야 한다 (시트가 기본 이름을 내려준 경우)
  const head = await page.locator('.header h1').innerText();
  if (/[가-힣]/.test(head)) throw new Error(`헤더에 한글이 남아 있습니다: ${head}`);

  // 하단 탭 이름이 전부 중문이어야 한다
  const nav = await page.locator('.nav').innerText();
  for (const want of ['余额', '物品', '公告板', '联盟', '我的', '管理']) {
    if (!nav.includes(want)) throw new Error(`탭에 ${want} 이(가) 없습니다: ${nav}`);
  }
  if (/[가-힣]/.test(nav)) throw new Error(`탭에 한글이 남아 있습니다: ${nav}`);
  await shot('11-zh-nav');

  // 각 탭을 돌며 한글이 남아 있는지 본다 (사람 이름·아이템명은 데이터라 제외)
  const dataWords = ['가이', '잠단', '斬斷', 'TC무식', '향로셔틀', '대서과Z', '팩맨', '詹阿呆',
                     '유일배분', '혈맹운영비', 'PlusS', '기란 세금', '용의 심장', '고대의 검',
                     '지급된 아이템', '이번 주 공성 일정', '레이드 파티 구합니다', '군주', '연합 보스',
                     '연합 레이드', '선륙소농포', '鮮肉小籠包',
                     // 멤버DB G열 한자표기 — v10.8 부터 잔액·아이템에도 나온다.
                     // 사람 이름이므로 어느 언어에서도 번역되지 않는 것이 정상이다 (규칙 7)
                     '车武植', '大西瓜Z',
                     '토요일', '오늘 밤', '미분배', '분배완료'];
  for (const [tab, zh] of [['余额', '余额'], ['物品', '物品'], ['公告板', '公告板'], ['联盟', '联盟'], ['我的', '我的']]) {
    await page.locator('.nav button').filter({ hasText: tab }).click();
    await page.waitForTimeout(600);
    let body = await page.locator('main').innerText();
    if (!body.includes(zh) && !body.trim()) throw new Error(`${tab} 탭이 비었습니다.`);
    dataWords.forEach((w) => { body = body.split(w).join(''); });
    const leftover = body.match(/[가-힣]+/g);
    if (leftover && leftover.length) {
      throw new Error(`${tab} 탭에 번역되지 않은 한글: ${[...new Set(leftover)].slice(0, 8).join(', ')}`);
    }
  }
  await shot('12-zh-admin');

  // 한국어로 되돌린다 (뒤에 오는 검사가 한글 화면을 기대한다)
  await page.locator('.nav button').last().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '한국어' }).click();
  await page.waitForTimeout(400);
});

await t('English 로 바꾸면 화면 문구가 전부 영문이 된다', async () => {
  await reset();
  await page.goto(APP, { waitUntil: 'networkidle' });

  await page.locator('.nav button').last().click();     // 관리 탭 (언어 무관)
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'English' }).click();
  await page.waitForTimeout(400);

  const head = await page.locator('.header h1').innerText();
  if (/[가-힣]/.test(head)) throw new Error(`헤더에 한글이 남아 있습니다: ${head}`);

  const nav = await page.locator('.nav').innerText();
  for (const want of ['Balance', 'Items', 'Board', 'Alliance', 'Me', 'Admin']) {
    if (!nav.includes(want)) throw new Error(`탭에 ${want} 이(가) 없습니다: ${nav}`);
  }
  if (/[가-힣]/.test(nav)) throw new Error(`탭에 한글이 남아 있습니다: ${nav}`);
  await shot('13-en-nav');

  const dataWords = ['가이', '잠단', '斬斷', 'TC무식', '향로셔틀', '대서과Z', '팩맨', '詹阿呆',
                     '유일배분', '혈맹운영비', 'PlusS', '기란 세금', '용의 심장', '고대의 검',
                     '지급된 아이템', '이번 주 공성 일정', '레이드 파티 구합니다', '군주', '연합 보스',
                     '연합 레이드', '선륙소농포', '鮮肉小籠包',
                     // 멤버DB G열 한자표기 — v10.8 부터 잔액·아이템에도 나온다.
                     // 사람 이름이므로 어느 언어에서도 번역되지 않는 것이 정상이다 (규칙 7)
                     '车武植', '大西瓜Z',
                     '토요일', '오늘 밤', '미분배', '분배완료'];
  for (const tab of ['Balance', 'Items', 'Board', 'Alliance', 'Me']) {
    await page.locator('.nav button').filter({ hasText: tab }).click();
    await page.waitForTimeout(600);
    let body = await page.locator('main').innerText();
    if (!body.trim()) throw new Error(`${tab} 탭이 비었습니다.`);
    dataWords.forEach((w) => { body = body.split(w).join(''); });
    const leftover = body.match(/[가-힣]+/g);
    if (leftover && leftover.length) {
      throw new Error(`${tab} 탭에 번역되지 않은 한글: ${[...new Set(leftover)].slice(0, 8).join(', ')}`);
    }
    // 영문 화면에는 중문도 남으면 안 된다 (사람 이름의 한자는 위에서 지웠다)
    const cjk = body.match(/[\u4e00-\u9fff]+/g);
    if (cjk && cjk.length) {
      throw new Error(`${tab} 탭에 중문이 남아 있습니다: ${[...new Set(cjk)].slice(0, 8).join(', ')}`);
    }
  }
  await shot('14-en-admin');

  await page.locator('.nav button').last().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '한국어' }).click();
  await page.waitForTimeout(400);
});

await t('서버 결과 메시지가 화면 언어로 나온다 (code + vars)', async () => {
  // 시트는 한국어 msg + code/vars 만 보낸다. 화면 언어 문장은 앱이 조립한다.
  // 여기서 실패하면 사용자는 중문·영문 화면에서 한국어 토스트를 보게 된다.
  const setLang = async (label) => {
    await page.locator('.nav button').last().click();   // 관리 탭 (언어 무관)
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForTimeout(600);
  };

  for (const [label, itemsTab, openBtn, doBtn, want] of [
    ['中文', '物品', '分配', '确认分配', /钻石/],
    ['English', 'Items', 'Distribute', 'Distribute', /dia/],
  ]) {
    await reset();
    await page.reload({ waitUntil: 'networkidle' });
    await setLang(label);

    await page.locator('.nav button').filter({ hasText: itemsTab }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: openBtn, exact: true }).first().click();
    await page.waitForTimeout(300);
    await page.locator('#amt').fill('50000');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: doBtn, exact: true }).last().click();
    await page.waitForTimeout(1500);

    // 아이템명·계정명은 시트에 실제로 그렇게 적힌 데이터다 — 번역 대상이 아니다.
    // 따옴표(「」/"") 안의 아이템명과 운영비 계정명을 지우고 남은 문장만 본다.
    let toast = await page.locator('.toast').innerText();
    toast = toast.replace(/「[^」]*」/g, '').replace(/"[^"]*"/g, '').split('혈맹운영비').join('');
    if (/[가-힣]/.test(toast)) throw new Error(`${label} 토스트에 한글이 남아 있습니다: ${toast}`);
    if (!want.test(toast)) throw new Error(`${label} 토스트가 번역되지 않았습니다: ${toast}`);
  }

  await setLang('한국어');
  await reset();
  await page.reload({ waitUntil: 'networkidle' });
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
