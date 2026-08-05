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
const del = send('DELETE');

/** 모의 시트를 처음 상태로 되돌린다 (모의 시트에만 있는 기능) */
const reset = () =>
  fetch(MOCK, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: '__reset', token: 'TESTTOKEN' }),
  });

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
  const res = await post('/api/admin/items', { op: 'correct', row: 3, newAmount: 6000 }, { Cookie: cookie });
  const body = await res.json();
  eq(body.ok, false, 'ok');
  eq(body.needsConfirm, true, 'needsConfirm');
});

await t('정정하면 참여자 잔액이 새 금액으로 맞춰진다', async () => {
  const before = (await (await post('/api/lookup', { name: '가이' })).json()).data.pending;
  const res = await post(
    '/api/admin/items',
    { op: 'correct', row: 3, newAmount: 6000, confirm: true },
    { Cookie: cookie },
  );
  eq((await res.json()).ok, true, '정정 결과');

  // 3,000 → 6,000 이면 1인당 900 → 1,800 이므로 정확히 900 늘어야 한다
  const after = (await (await post('/api/lookup', { name: '가이' })).json()).data.pending;
  eq(after, before + 900, '가이 분배전');
});

await t('삭제: 확인 없이는 실행되지 않는다', async () => {
  const res = await post('/api/admin/items', { op: 'delete', row: 2 }, { Cookie: cookie });
  const body = await res.json();
  eq(body.ok, false, 'ok');
  eq(body.needsConfirm, true, 'needsConfirm');
});

await t('삭제하면 목록에서 사라진다', async () => {
  const res = await post('/api/admin/items', { op: 'delete', row: 2, confirm: true }, { Cookie: cookie });
  eq((await res.json()).ok, true, '삭제 결과');
  const list = (await (await fetch(`${APP}/api/admin/items`, { headers: { Cookie: cookie } })).json()).data;
  if (list.some((i) => i.row === 2)) throw new Error('아직 목록에 있습니다.');
});

await t('지급 취소: 분배완료가 분배전으로 돌아온다', async () => {
  const last = (await (await fetch(`${APP}/api/admin/payout-undo`, { headers: { Cookie: cookie } })).json()).data;
  if (!last) throw new Error('되돌릴 지급 기록이 없습니다.');
  const before = (await (await post('/api/lookup', { name: last.name })).json()).data;

  // 확인 없이는 거부
  const noConfirm = await post('/api/admin/payout-undo', {}, { Cookie: cookie });
  eq((await noConfirm.json()).needsConfirm, true, 'needsConfirm');

  const res = await post('/api/admin/payout-undo', { confirm: true }, { Cookie: cookie });
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
    const res = await post('/api/admin/tools', { id: 'seasonEnd', confirmText: text }, { Cookie: cookie });
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
  const del2 = await post('/api/admin/items', { op: 'delete', row: 2, confirm: true }, { Cookie: cookie });
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
    await post('/api/admin/alliance', { server: '05', item: '연합 보스', amount: 30000, pct: 40, people: 15 }, { Cookie: cookie })
  ).json();
  eq(add.ok, true, '등록 ok');
  eq(add.credited, 12000, '적립액 = 30000 × 40%');

  const after = (await (await fetch(`${APP}/api/alliance`)).json()).data;
  const s05 = after.totals.find((x) => x.server === '05');
  eq(s05.credited, 12000, '05서버 누적');
  eq(s05.people, 15, '05서버 인원 합계');
});

await t('연합: 잘못된 서버·비중·금액은 거부된다', async () => {
  const bad = [
    { server: '13', item: 'x', amount: 100, pct: 50 },
    { server: '05', item: '', amount: 100, pct: 50 },
    { server: '05', item: 'x', amount: 0, pct: 50 },
    { server: '05', item: 'x', amount: 100, pct: 0 },
    { server: '05', item: 'x', amount: 100, pct: 101 },
  ];
  for (const b of bad) {
    eq((await post('/api/admin/alliance', b, { Cookie: cookie })).status, 400, JSON.stringify(b));
  }
});

await t('아이디 변경 이력이 변경 전/후로 남는다', async () => {
  await reset();
  await post('/api/admin/rename', { oldName: '팩맨', newName: '팩맨2' }, { Cookie: cookie });
  const hist = (await (await fetch(`${APP}/api/admin/rename-history`, { headers: { Cookie: cookie } })).json()).data;
  const hit = hist.find((h) => h.before === '팩맨');
  if (!hit) throw new Error('변경 이력이 남지 않았습니다.');
  eq(hit.after, '팩맨2', '변경 후 이름');
});

let masterCookie = '';
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

await t('앱 이름·관리자 PIN 변경은 마스터만 할 수 있다', async () => {
  eq((await post('/api/master', { action: 'appName', value: '새이름' }, { Cookie: cookie })).status, 401, '관리자 시도');

  const ok = await (await post('/api/master', { action: 'appName', value: '테스트길드' }, { Cookie: masterCookie })).json();
  eq(ok.ok, true, '마스터 시도');
  const st = (await (await fetch(`${APP}/api/state`)).json()).data;
  eq(st.appName, '테스트길드', '앱 이름 반영');

  // 짧은 PIN 은 거부
  eq((await post('/api/master', { action: 'adminPin', value: '123' }, { Cookie: masterCookie })).status, 400, '짧은 PIN');
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

await t('상단 시즌 칩으로 지난 시즌을 연다', async () => {
  await page.locator('.nav button', { hasText: /잔액/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /지난 시즌 기록 보기/ }).click();
  await page.waitForTimeout(900);
  if (!(await page.getByText('지난 시즌').first().isVisible())) throw new Error('시즌 목록이 열리지 않았습니다.');

  await page.getByRole('button', { name: /시즌 2/ }).first().click();
  await page.waitForTimeout(900);
  if (!(await page.getByText('최종 잔액현황').first().isVisible())) {
    throw new Error('시즌 상세가 열리지 않았습니다.');
  }
  await shot('06-season');
  await page.getByRole('button', { name: '시즌 목록으로' }).click();
  await page.waitForTimeout(300);
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
