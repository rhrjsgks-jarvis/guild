/**
 * Apps Script(.gs) 안전 검사 — `npm run verify:gs`
 *
 * 이 파일이 존재하는 이유: .gs 는 3,500줄이 넘고 구글시트에 붙여넣기 전까지
 * 아무도 실행해보지 않는다. 문법 오류 하나가 "저장은 됐는데 정산이 안 되는"
 * 상태로 바로 이어진다. 그래서 붙여넣기 전에 여기서 전부 걸러낸다.
 *
 * 검사 항목은 아래 CHECKS 배열이 전부다. 새 규칙이 생기면 여기에 추가하면 된다.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GS_PATH = resolve(ROOT, 'apps-script/GuildManager_v8_1.gs');
const CLIENT_PATH = resolve(ROOT, 'lib/client.ts');

const gs = readFileSync(GS_PATH, 'utf8');
const clientTs = readFileSync(CLIENT_PATH, 'utf8');

const failures = [];
const notes = [];

function check(name, fn) {
  try {
    const detail = fn();
    notes.push(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
  } catch (err) {
    failures.push(`  ❌ ${name}\n     ${err.message}`);
  }
}

/**
 * .gs 에서 함수 하나를 떼어내 실제로 실행 가능한 형태로 만든다.
 * 잘라낸 조각이 줄 주석(//)으로 끝나는 일이 흔해서, 뒤에 무엇을 붙이든
 * 주석에 먹히지 않도록 반드시 줄바꿈으로 끝맺는다.
 */
function extractFn(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`${name} 함수를 찾을 수 없습니다.`);
  const end = source.indexOf('\nfunction ', start + 10);
  return source.slice(start, end < 0 ? source.length : end) + '\n';
}

/* ────────────────────────────────────────────── */

check('.gs 전체 구문', () => {
  new Function(gs);
  return `${gs.split('\n').length.toLocaleString()}줄`;
});

check('함수 중복 정의 없음', () => {
  const names = [...gs.matchAll(/^function (\w+)/gm)].map((m) => m[1]);
  const dup = names.filter((x, i) => names.indexOf(x) !== i);
  if (dup.length) throw new Error(`중복: ${[...new Set(dup)].join(', ')}`);
  return `${names.length}개 함수`;
});

check('VERSION 상수와 파일명 일치', () => {
  const v = gs.match(/const VERSION = '([\d.]+)'/)?.[1];
  if (!v) throw new Error('VERSION 상수를 찾을 수 없습니다.');
  const fromName = GS_PATH.match(/_v(\d+)_(\d+)\.gs$/);
  const expected = fromName ? `${fromName[1]}.${fromName[2]}` : null;
  if (expected && v !== expected) {
    throw new Error(`파일명은 v${expected} 인데 VERSION 상수는 '${v}' 입니다.`);
  }
  return `v${v}`;
});

check('웹앱 클라이언트 JS 구문 (백업 경로)', () => {
  const stubs = {
    VERSION: '0',
    UNIT: '다이아',
    FUND_NAME: '유일배분(혈비)',
    FUND_RATE: 0.1,
    FUND_RATE_STR: '0.1',
    MAX_MEMBERS: 50,
    MEMBER_START_ROW: 5,
    PROTECT_MODE: 'warn',
  };
  let count = 0;
  for (const fn of ['_mobileHtml', '_lookupHtml']) {
    const ctx = vm.createContext({ ...stubs });
    vm.runInContext(`${extractFn(gs, fn)}; __html = ${fn}();`, ctx);
    const inner = String(ctx.__html).match(/<script>([\s\S]*?)<\/scr/)?.[1];
    if (!inner) throw new Error(`${fn} 에서 <script> 블록을 찾지 못했습니다.`);
    new vm.Script(inner);
    count += 1;
  }
  return `${count}개 페이지`;
});

check('API 라우터 — 필요한 액션 노출 / 위험한 액션 차단', () => {
  const router = gs.slice(gs.indexOf('function _apiRoute'));
  const routed = [...router.matchAll(/case '(\w+)':/g)].map((m) => m[1]);

  const required = ['ping', 'state', 'members', 'lookup', 'register', 'distribute', 'payout', 'photo', 'roster', 'rename'];
  const missing = required.filter((a) => !routed.includes(a));
  if (missing.length) throw new Error(`누락된 액션: ${missing.join(', ')}`);

  // 되돌리기·삭제·초기화는 절대 앱에서 부를 수 없어야 한다
  const forbidden = ['correct', 'correctDistribution', 'delete', 'deleteLedgerItem', 'seasonEnd', 'reset', 'firstTimeSetup'];
  const leaked = forbidden.filter((a) => routed.includes(a));
  if (leaked.length) throw new Error(`노출되면 안 되는 액션: ${leaked.join(', ')}`);

  return `${routed.length}개 액션`;
});

check('쓰기 액션은 전부 LockService 대상', () => {
  const list = gs.match(/API_WRITE_ACTIONS = \[([^\]]*)\]/)?.[1];
  if (!list) throw new Error('API_WRITE_ACTIONS 상수를 찾을 수 없습니다.');
  const actions = list.replace(/['\s]/g, '').split(',').filter(Boolean);
  const mustLock = ['register', 'distribute', 'payout', 'rename'];
  const unlocked = mustLock.filter((a) => !actions.includes(a));
  if (unlocked.length) throw new Error(`락이 걸리지 않는 쓰기 액션: ${unlocked.join(', ')}`);
  if (!/lock\.waitLock\(/.test(gs)) throw new Error('waitLock 호출이 없습니다.');
  return actions.join(', ');
});

check('토큰 비교는 상수시간', () => {
  const ctx = vm.createContext({});
  vm.runInContext(`${extractFn(gs, '_tokenEq')}; __eq = _tokenEq;`, ctx);
  const eq = ctx.__eq;
  const cases = [
    ['abc', 'abc', true],
    ['abc', 'abd', false],
    ['abc', 'abcd', false],
    ['', '', true],
    [null, 'a', false],
    ['a', undefined, false],
  ];
  for (const [a, b, expected] of cases) {
    if (eq(a, b) !== expected) throw new Error(`_tokenEq(${JSON.stringify(a)}, ${JSON.stringify(b)}) 가 틀렸습니다.`);
  }
  // 조기 종료(early return)로 길이가 새어나가면 안 된다 — 루프가 전부 도는지 확인
  if (/for \(let i[^}]*\{\s*if \(/.test(extractFn(gs, '_tokenEq'))) {
    throw new Error('비교 루프 안에 조기 종료가 있습니다.');
  }
  return `${cases.length}/${cases.length} 통과`;
});

check('분배 산식: 다이아 보존 + 앱/시트 이중구현 일치', () => {
  // .gs 쪽
  const gsCtx = vm.createContext({ FUND_RATE: 0.1 });
  vm.runInContext(`${extractFn(gs, '_calcSplit')}; __split = _calcSplit;`, gsCtx);
  const gsSplit = gsCtx.__split;

  // 앱 쪽 (TS 타입만 벗겨서 같은 함수를 꺼낸다)
  const tsFn = clientTs.slice(clientTs.indexOf('export function calcSplit'));
  const jsFn = tsFn
    .slice(0, tsFn.indexOf('\n}') + 2)
    .replace(/export /, '')
    .replace(/: number/g, '');
  const appCtx = vm.createContext({});
  vm.runInContext(`${jsFn}; __split = calcSplit;`, appCtx);
  const appSplit = appCtx.__split;

  const cases = [];
  // 경계값 + 무작위
  for (const total of [1, 2, 9, 10, 11, 99, 100, 5000, 50000, 999999]) {
    for (const n of [1, 2, 3, 7, 19, 50]) cases.push([total, n]);
  }
  for (let i = 0; i < 5000; i++) {
    cases.push([1 + Math.floor(Math.random() * 10_000_000), 1 + Math.floor(Math.random() * 50)]);
  }

  for (const [total, n] of cases) {
    const a = gsSplit(total, n);
    const b = appSplit(total, n, 0.1);

    // ① 다이아 보존 불변식 — 이게 깨지면 다이아가 사라지거나 생겨난다
    if (a.fund + a.perPerson * n + a.remainder !== total) {
      throw new Error(`보존 위반: total=${total}, n=${n} → ${JSON.stringify(a)}`);
    }
    // ② 나머지는 항상 인원수보다 작아야 한다 (아니면 더 나눠줄 수 있었다는 뜻)
    if (a.remainder < 0 || a.remainder >= n) {
      throw new Error(`나머지 범위 위반: total=${total}, n=${n} → remainder=${a.remainder}`);
    }
    // ③ 앱의 미리보기와 시트의 실제 계산이 한 다이아도 달라선 안 된다
    if (a.fund !== b.fund || a.perPerson !== b.perPerson || a.remainder !== b.remainder) {
      throw new Error(
        `앱/시트 불일치: total=${total}, n=${n}\n     시트=${JSON.stringify(a)}\n     앱  =${JSON.stringify(b)}`,
      );
    }
  }
  return `${cases.length.toLocaleString()}건 (보존·범위·이중구현 일치)`;
});

check('아이디 변경: 병합은 반드시 재확인을 거친다', () => {
  const fn = extractFn(gs, 'api_renameMember');
  // 이미 있는 이름으로 바꾸면 두 사람 잔액이 합쳐진다 — 한 번 더 물어보지 않으면
  // 남의 잔액을 실수로 흡수하는 사고가 난다
  if (!fn.includes('confirmMerge !== true')) throw new Error('confirmMerge 확인 절차가 없습니다.');
  if (!fn.includes('needsConfirm')) throw new Error('앱에 재확인을 요청하는 응답이 없습니다.');
  if (!fn.includes('FUND_NAME')) throw new Error('혈비 계정 보호가 없습니다.');
  // 라우터가 confirmMerge 를 그대로 흘려보내야 한다 (기본값 true 로 새면 안전장치가 무력화)
  const router = gs.slice(gs.indexOf('function _apiRoute'));
  if (!/req\.confirmMerge === true/.test(router)) {
    throw new Error('라우터가 confirmMerge 를 엄격하게 다루지 않습니다.');
  }
  return '재확인·혈비보호·라우터 전달';
});

check('가져오기: 옛 파일은 읽기만 한다', () => {
  const fn = extractFn(gs, '_importCore');
  // 옛 파일(src*)에 쓰기를 하면 운영 중인 파일이 망가진다 — 읽기 메서드만 허용
  const writes = [...fn.matchAll(/\bsrc\w*\.(set\w+|delete\w+|insert\w+|clear\w+)\(/g)];
  if (writes.length) throw new Error(`옛 파일에 쓰기를 시도합니다: ${writes.map((m) => m[0]).join(', ')}`);
  if (!fn.includes('_applyProtections(ss)')) throw new Error('가져온 뒤 시트 보호를 다시 걸지 않습니다.');
  return '쓰기 0건 · 보호 재적용';
});

check('사용안내에 최신 설정 절차 포함', () => {
  const guide = gs.slice(gs.indexOf('function _rebuildGuide'), gs.indexOf('function refreshGuide'));
  const keywords = ['Vercel', 'GAS_URL', 'GAS_TOKEN', 'ADMIN_PIN', 'SESSION_SECRET', '모든 사용자', '홈 화면에 추가', 'PIN', '토큰'];
  const missing = keywords.filter((k) => !guide.includes(k));
  if (missing.length) throw new Error(`사용안내에서 빠진 내용: ${missing.join(', ')}`);
  return `${keywords.length}개 항목`;
});

check('시트 재생성 5지점에서 보호 재적용', () => {
  const sites = ['firstTimeInstall', 'firstTimeSetup', 'upgradeKeepData', 'cleanupSheets', 'seasonEnd'];
  const missing = sites.filter((fn) => !extractFn(gs, fn).includes('_applyProtections(ss)'));
  if (missing.length) throw new Error(`_applyProtections 누락: ${missing.join(', ')}`);
  return `${sites.length}지점`;
});

check('이름 매칭은 _normName 경유', () => {
  // 잔액현황/멤버 이름을 === 로 직접 비교하면 공백 표기 차이로 중복 행이 생긴다
  const bad = [...gs.matchAll(/String\(r\[0\]\)\s*===\s*(?!.*_normName)/g)];
  if (bad.length) throw new Error(`_normName 없이 이름을 직접 비교하는 곳이 ${bad.length}군데 있습니다.`);
  return '직접 비교 없음';
});

/* ────────────────────────────────────────────── */

console.log(`\n🔍 ${GS_PATH.replace(ROOT + '/', '')} 검사\n`);
notes.forEach((n) => console.log(n));

if (failures.length) {
  console.log('\n실패한 검사:\n');
  failures.forEach((f) => console.log(f));
  console.log(`\n❌ ${failures.length}건 실패 — 구글시트에 붙여넣지 마세요.\n`);
  process.exit(1);
}

console.log(`\n✅ ${notes.length}건 전부 통과 — 붙여넣어도 됩니다.\n`);
