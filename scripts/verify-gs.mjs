/**
 * Apps Script(.gs) 안전 검사 — `npm run verify:gs`
 *
 * 이 파일이 존재하는 이유: .gs 는 3,500줄이 넘고 구글시트에 붙여넣기 전까지
 * 아무도 실행해보지 않는다. 문법 오류 하나가 "저장은 됐는데 정산이 안 되는"
 * 상태로 바로 이어진다. 그래서 붙여넣기 전에 여기서 전부 걸러낸다.
 *
 * 검사 항목은 아래 CHECKS 배열이 전부다. 새 규칙이 생기면 여기에 추가하면 된다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GS_PATH = resolve(ROOT, 'apps-script/GuildManager_v10_6.gs');
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

check('버전이 네 곳에서 같다 (.gs · 파일명 · package.json · 앱)', () => {
  // 화면 상단에 버전을 띄우고 시트 버전과 대조하므로, 앱이 아는 값이 틀리면
  // 멀쩡한 배포에도 "버전 불일치" 경고가 뜬다. 네 곳을 한 번에 묶어둔다.
  const gsVer = gs.match(/const VERSION = '([\d.]+)'/)?.[1];
  const fromName = GS_PATH.match(/_v(\d+)_(\d+)\.gs$/);
  const nameVer = fromName ? `${fromName[1]}.${fromName[2]}` : null;
  const appVer = readFileSync(resolve(ROOT, 'lib/version.ts'), 'utf8').match(/APP_VERSION = '([\d.]+)'/)?.[1];
  const pkgVer = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version;

  if (!gsVer) throw new Error('.gs 의 VERSION 상수를 찾을 수 없습니다.');
  if (!appVer) throw new Error('lib/version.ts 의 APP_VERSION 을 찾을 수 없습니다.');

  const seen = { '.gs': gsVer, '파일명': nameVer, 'lib/version.ts': appVer, 'package.json': pkgVer };
  // package.json 은 semver 라 뒤에 .0 이 붙는다
  const norm = (v) => String(v).split('.').slice(0, 2).join('.');
  const bad = Object.entries(seen).filter(([, v]) => v && norm(v) !== norm(gsVer));
  if (bad.length) {
    throw new Error(
      `버전이 어긋납니다 → ${Object.entries(seen).map(([k, v]) => `${k}=${v}`).join(' · ')}`,
    );
  }

  // 앱이 시트 버전을 받아 대조할 수 있어야 한다
  if (!/version:\s*VERSION/.test(extractFn(gs, 'api_getState'))) {
    throw new Error('api_getState 가 version 을 내려주지 않습니다 — 앱이 버전을 대조할 수 없습니다.');
  }
  return `v${gsVer} (4곳 일치)`;
});

check('doGet 이 내주는 화면은 아무것도 바꿀 수 없다', () => {
  // ★ v9.0 에서 실제로 뚫렸던 지점이다.
  //
  // 웹앱 배포 액세스는 "모든 사용자"여야 Vercel 서버가 호출할 수 있다.
  // 즉 /exec 주소를 아는 누구나 doGet 이 내주는 HTML 을 받는다.
  // 그 HTML 안의 google.script.run 호출은 doPost 의 토큰 검사를 거치지 않으므로,
  // 쓰기 함수를 하나라도 부를 수 있으면 PIN 없이 정산을 조작할 수 있게 된다.
  const stubs = {
    VERSION: '0',
    UNIT: '다이아',
    FUND_NAME: '유일배분(혈비)',
    FUND_RATE: 0.1,
    FUND_RATE_STR: '0.1',
    MAX_MEMBERS: 100,
    MEMBER_START_ROW: 5,
    PROTECT_MODE: 'warn',
  };

  // doGet 이 실제로 어떤 함수를 불러 HTML 을 만드는지 뽑아낸다
  const doGet = extractFn(gs, 'doGet');
  const producers = [...doGet.matchAll(/HtmlService\.createHtmlOutput\((\w+)\(\)\)/g)].map((m) => m[1]);
  if (producers.length === 0) throw new Error('doGet 이 HTML 을 만드는 지점을 찾지 못했습니다.');

  // 이 함수들은 어떤 경로로도 서버에 쓰기를 요청할 수 없어야 한다
  const writeFns = [
    'api_register', 'api_distribute', 'api_payout', 'api_analyzePhoto',
    'api_renameMember', 'api_addMember', 'api_removeMember',
    'api_correctItem', 'api_deleteItem', 'api_undoPayout', 'api_runTool',
  ];

  for (const fn of producers) {
    const ctx = vm.createContext({ ...stubs });
    vm.runInContext(`${extractFn(gs, fn)}; __html = ${fn}();`, ctx);
    const html = String(ctx.__html);

    const leaked = writeFns.filter((w) => html.includes(w));
    if (leaked.length) {
      throw new Error(
        `${fn} 이 인증 없이 쓰기 함수를 부를 수 있습니다: ${leaked.join(', ')}\n` +
          '     이 화면은 주소만 알면 누구나 열 수 있습니다 — 쓰기 기능을 두면 안 됩니다.',
      );
    }

    // 스크립트가 있다면 문법도 확인한다 (붙여넣기 전 마지막 방어선)
    const inner = html.match(/<script>([\s\S]*?)<\/scr/)?.[1];
    if (inner) new vm.Script(inner);
  }

  // _mobileHtml(쓰기가 가능했던 구 화면)이 되살아나지 않았는지도 본다
  if (/function _mobileHtml\b/.test(gs)) {
    throw new Error('_mobileHtml 이 다시 들어왔습니다. 이 화면은 인증 없이 등록·분배·지급이 가능합니다.');
  }

  return `${producers.length}개 화면 (쓰기 함수 0건)`;
});

check('API 라우터 — 필요한 액션 노출 / 위험한 액션 차단', () => {
  const router = gs.slice(gs.indexOf('function _apiRoute'));
  const routed = [...router.matchAll(/case '(\w+)':/g)].map((m) => m[1]);

  const required = [
    'ping', 'state', 'members', 'lookup',
    'register', 'distribute', 'payout', 'photo',
    'roster', 'rename', 'addMember', 'removeMember',
    'itemsAll', 'previewReverse', 'correctItem', 'deleteItem',
    'lastPayout', 'undoPayout', 'tools', 'runTool',
    'seasons', 'season',
    'renameHistory', 'posts', 'addPost', 'deletePost',
    'alliance', 'addAlliance', 'deleteAlliance', 'countPhoto',
    'updateMember', 'checkPin', 'setAppName', 'setAdminPin', 'setSeasonServer',
  ];
  const missing = required.filter((a) => !routed.includes(a));
  if (missing.length) throw new Error(`누락된 액션: ${missing.join(', ')}`);

  // v9.0 부터 모든 기능이 앱에 열려 있다. 대신 UI 없는 코어를 그대로 부르는
  // 경로가 생기지 않도록, 라우터는 확인 게이트가 있는 api_* 만 부를 수 있다
  const bare = ['_correctCore', '_deleteItemCore', '_undoPayoutCore'];
  const leaked = bare.filter((f) => new RegExp(`case '\\w+':[^;]{0,120}${f}\\(`).test(router));
  if (leaked.length) throw new Error(`확인 게이트를 건너뛰고 코어를 직접 부릅니다: ${leaked.join(', ')}`);

  return `${routed.length}개 액션`;
});

check('쓰기 액션은 전부 LockService 대상', () => {
  const list = gs.match(/API_WRITE_ACTIONS = \[([^\]]*)\]/)?.[1];
  if (!list) throw new Error('API_WRITE_ACTIONS 상수를 찾을 수 없습니다.');
  const actions = list.replace(/['\s]/g, '').split(',').filter(Boolean);
  const mustLock = ['register', 'distribute', 'payout', 'rename', 'addMember', 'removeMember',
                    'correctItem', 'deleteItem', 'undoPayout', 'runTool',
                    'addAlliance', 'updateMember', 'setAppName', 'setAdminPin'];
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
  const gsCtx = vm.createContext({ FUND_RATE: 0.1, DEFAULT_WEIGHT: 100 });
  vm.runInContext(
    `${extractFn(gs, '_normWeights')}\n${extractFn(gs, '_calcSplit')}; __split = _calcSplit;`,
    gsCtx,
  );
  const gsSplit = gsCtx.__split;

  // 앱 쪽 (TS 타입만 벗겨서 같은 함수를 꺼낸다)
  const cut = (name) => {
    const from = clientTs.slice(clientTs.indexOf(`function ${name}(`));
    return from.slice(0, from.indexOf('\n}') + 2);
  };
  const jsFn = (cut('calcSplit') + '\n' + cut('normWeights'))
    .replace(/export /g, '')
    // 타입 주석만 벗긴다 — 인자 타입(유니언 포함) → 반환 타입 → 남은 단순 타입 순서로
    .replace(/(\w+): number \| number\[\]/g, '$1')
    .replace(/\): number\[\]/g, ')')
    .replace(/: number\[\]/g, '')
    .replace(/: number/g, '');
  const appCtx = vm.createContext({});
  vm.runInContext(`${jsFn}; __split = calcSplit;`, appCtx);
  const appSplit = appCtx.__split;

  const cases = [];
  // ① 사용자가 직접 확인해준 기준 예시 — 이 한 건이 틀리면 나머지는 볼 것도 없다
  cases.push([10_000, [100, 100, 100, 100, 100, 100, 100, 100, 100, 50]]);
  // ② 경계값: 전원 100%
  for (const total of [1, 2, 9, 10, 11, 99, 100, 5000, 50000, 999999]) {
    for (const n of [1, 2, 3, 7, 19, 50]) cases.push([total, n]);
  }
  // ③ 경계값: 전원 1% / 전원 100% 를 배열로
  for (const total of [1, 10, 9999, 1_000_000]) {
    cases.push([total, Array.from({ length: 10 }, () => 1)]);
    cases.push([total, Array.from({ length: 10 }, () => 100)]);
  }
  // ④ 무작위 비중
  for (let i = 0; i < 5000; i++) {
    const n = 1 + Math.floor(Math.random() * 50);
    cases.push([
      1 + Math.floor(Math.random() * 10_000_000),
      Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 100)),
    ]);
  }

  for (const [total, w] of cases) {
    const a = gsSplit(total, w);
    const b = appSplit(total, w, 0.1);
    const n = typeof w === 'number' ? w : w.length;
    const paid = a.shares.reduce((x, y) => x + y, 0);

    // ① 다이아 보존 불변식 — 이게 깨지면 다이아가 사라지거나 생겨난다
    //    v10: 잔여분(1/N 버림 + 비중 미달분)은 전액 혈맹운영비로 귀속된다
    if (a.fundTotal + paid !== total) {
      throw new Error(`보존 위반: total=${total}, n=${n} → fundTotal=${a.fundTotal} + shares=${paid}`);
    }
    if (a.fund + a.remainder !== a.fundTotal) {
      throw new Error(`운영비 합산 위반: total=${total}, n=${n} → ${JSON.stringify(a)}`);
    }
    // ② 잔여분은 음수가 될 수 없고, 아무도 기본 1인당보다 많이 받을 수 없다
    if (a.remainder < 0) throw new Error(`잔여분 음수: total=${total}, n=${n}`);
    if (a.shares.some((x) => x < 0 || x > a.perPerson)) {
      throw new Error(`개인 분배액 범위 위반: total=${total}, n=${n} → ${JSON.stringify(a.shares)}`);
    }
    // ③ 전원 100% 이면 잔여분은 인원수보다 작아야 한다 (더 나눠줄 수 있었다는 뜻이 되므로)
    const allFull = typeof w === 'number' || w.every((x) => x === 100);
    if (allFull && a.remainder >= n) {
      throw new Error(`나머지 범위 위반: total=${total}, n=${n} → remainder=${a.remainder}`);
    }
    // ④ 앱의 미리보기와 시트의 실제 계산이 한 다이아도 달라선 안 된다
    if (
      a.fund !== b.fund ||
      a.perPerson !== b.perPerson ||
      a.remainder !== b.remainder ||
      a.fundTotal !== b.fundTotal ||
      a.shares.join() !== b.shares.join()
    ) {
      throw new Error(
        `앱/시트 불일치: total=${total}, n=${n}\n     시트=${JSON.stringify(a)}\n     앱  =${JSON.stringify(b)}`,
      );
    }
  }

  // 사용자 기준 예시를 숫자로 못박아 둔다
  const ex = gsSplit(10_000, [100, 100, 100, 100, 100, 100, 100, 100, 100, 50]);
  if (ex.fund !== 1000 || ex.perPerson !== 900 || ex.shares[9] !== 450 || ex.fundTotal !== 1450) {
    throw new Error(`기준 예시 불일치: ${JSON.stringify(ex)}`);
  }

  return `${cases.length.toLocaleString()}건 (보존·범위·이중구현 일치 · 1만/10명/50% 예시 검증)`;
});

check('나머지는 특정 캐릭터가 아니라 혈맹운영비로 간다', () => {
  // v9 까지는 1/N 버림분이 REMAINDER_NAME(군주 캐릭터)에게 적립됐다.
  // v10 부터 전액 운영비 귀속이므로, 분배 코어에 옛 귀속 로직이 남아 있으면 안 된다.
  const core = extractFn(gs, '_distributeCore');
  if (/REMAINDER_NAME/.test(core.replace(/LEGACY_REMAINDER_NAME/g, ''))) {
    throw new Error('_distributeCore 에 옛 나머지 귀속 로직이 남아 있습니다.');
  }
  if (!/fundTotal/.test(core)) {
    throw new Error('_distributeCore 가 잔여분을 포함한 fundTotal 을 적립하지 않습니다.');
  }
  // 옛 이름은 "v9 행을 되돌릴 때"에만 쓰여야 한다
  const plan = extractFn(gs, '_reversalPlan');
  if (!/LEGACY_REMAINDER_NAME/.test(plan)) {
    throw new Error('_reversalPlan 이 v9 이전 행의 나머지 귀속처를 복원하지 않습니다.');
  }
  return '분배=운영비 귀속 · 되돌리기=옛 귀속처 복원';
});

check('되돌리기는 분배 시점 금액을 그대로 쓴다', () => {
  // 비중은 언제든 바뀔 수 있다. 되돌릴 때 "지금 비중"으로 다시 계산하면
  // 실제로 준 금액과 어긋나 잔액이 틀어진다. 그래서 분배내역(O열)을 남긴다.
  const ctx = vm.createContext({
    FUND_NAME: '혈맹운영비',
    FUND_RATE: 0.1,
    DEFAULT_WEIGHT: 100,
    LEGACY_REMAINDER_NAME: 'TC무식',
  });
  vm.runInContext(
    [
      extractFn(gs, '_normWeights'),
      extractFn(gs, '_calcSplit'),
      extractFn(gs, '_decodeSplits'),
      extractFn(gs, '_encodeSplits'),
      extractFn(gs, '_coreName'),
      extractFn(gs, '_reversalPlan'),
      '__plan = _reversalPlan; __enc = _encodeSplits; __dec = _decodeSplits;',
    ].join('\n'),
    ctx,
  );

  // 왕복: 인코딩한 분배내역이 그대로 복원되는가
  const names = ['가이', '대서과Z', '詹阿呆'];
  const shares = [900, 450, 900];
  const decoded = ctx.__dec(ctx.__enc(names, shares));
  if (decoded.map((d) => `${d.name}:${d.amount}`).join('|') !== '가이:900|대서과Z:450|詹阿呆:900') {
    throw new Error(`분배내역 왕복 실패: ${JSON.stringify(decoded)}`);
  }

  // 스냅샷이 있으면 지금 비중과 무관하게 그 금액으로 되돌린다
  const ss = { getSheetByName: () => null };
  const info = { amount: 10_000, n: 3, participants: names, splits: decoded };
  const plan = ctx.__plan(ss, info);
  const back = plan.plan.reduce((a, e) => a + e.amount, 0);
  if (back !== 10_000) throw new Error(`되돌릴 총액이 원금과 다릅니다: ${back}`);
  const fundLine = plan.plan.find((e) => e.isFund);
  if (!fundLine || fundLine.amount !== 10_000 - 2250) {
    throw new Error(`운영비 회수액이 틀립니다: ${JSON.stringify(fundLine)}`);
  }
  return '분배내역 왕복 + 회수 총액 = 원금';
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

check('탈퇴 처리: 기록을 지우지 않는다', () => {
  const fn = extractFn(gs, 'api_removeMember');

  // 잔액이 남아 있으면 한 번 더 물어봐야 한다
  // (v10 부터 나머지는 특정 캐릭터가 아니라 운영비로 가므로 그 경고는 없어졌다)
  if (!fn.includes('confirmRemove !== true')) throw new Error('재확인 절차가 없습니다.');
  if (!fn.includes('needsConfirm')) throw new Error('앱에 재확인을 요청하는 응답이 없습니다.');
  if (!/pending > 0/.test(fn)) throw new Error('잔액 잔존 경고가 없습니다.');
  if (!fn.includes('FUND_NAME')) throw new Error('운영비 계정 보호가 없습니다.');

  // 이력이 남아 있으면 '(미등록)'으로 보존하고, 전부 0일 때만 행을 지운다
  if (!/pending === 0 && paid === 0 && cnt === 0/.test(fn)) {
    throw new Error('이력이 있는데도 행을 지울 수 있는 구조입니다.');
  }
  if (!/_writeBalanceRow\([^)]*true\)/.test(fn)) throw new Error("'(미등록)' 보존 경로가 없습니다.");
  if (!fn.includes('_logAction')) throw new Error('작업기록 로깅이 없습니다.');

  // 분배대기중·작업기록 같은 기록 시트에는 절대 손대면 안 된다
  if (/(LEDGER_SHEET|AUDIT_SHEET|PAYOUT_SHEET)[^\n]*delete/.test(fn)) {
    throw new Error('기록 시트를 지우려 합니다.');
  }
  return '재확인·이력보존·로깅';
});

check('혈맹원 추가: 중복과 상한을 막는다', () => {
  const fn = extractFn(gs, 'api_addMember');
  if (!fn.includes('_normName')) throw new Error('중복 검사가 _normName 을 거치지 않습니다.');
  if (!fn.includes('MAX_MEMBERS')) throw new Error('최대 인원 검사가 없습니다.');
  if (!fn.includes('FUND_NAME')) throw new Error('혈비 계정 보호가 없습니다.');
  if (!fn.includes('_syncMembers')) throw new Error('추가 후 시트 동기화가 없습니다.');
  return '중복·상한·혈비보호';
});

check('도구 실행: 위험도 3은 확인 문구 없이는 절대 실행되지 않는다', () => {
  // 레지스트리와 실행 게이트를 실제로 돌려본다 — 폰에서 잘못 눌러 시즌이
  // 종료되는 일을 막는 마지막 방어선이라 정적 검사로는 부족하다
  const ctx = vm.createContext({
    PropertiesService: { getDocumentProperties: () => ({ setProperty() {}, getProperty: () => null }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => {
        throw new Error('확인 문구를 통과하기 전에 시트에 접근했습니다.');
      },
    },
    Utilities: { formatDate: () => '2026-01-01 00:00' },
    Session: { getScriptTimeZone: () => 'Asia/Seoul' },
    FUND_NAME: '혈맹운영비',
    FUND_NAME_LEGACY: ['유일배분(혈비)', '유일배분'],
    console,
  });
  for (const fn of ['_uiAdapter', '_adapterResult', '_toolRegistry', 'api_getTools', 'api_runTool']) {
    vm.runInContext(extractFn(gs, fn), ctx);
  }
  vm.runInContext('__tools = api_getTools(); __run = api_runTool;', ctx);

  const tools = ctx.__tools;
  const risky = tools.filter((t) => t.danger >= 3);
  if (risky.length === 0) throw new Error('위험도 3 도구가 하나도 없습니다 (분류가 빠졌을 가능성).');

  for (const t of risky) {
    if (!t.confirm) throw new Error(`${t.id} 에 확인 문구가 없습니다.`);

    // 빈 값 · 틀린 값 · 공백만 다른 값 전부 거부되어야 한다
    for (const attempt of ['', '아무거나', t.confirm + 'x', t.confirm.slice(0, -1)]) {
      const res = ctx.__run(t.id, {}, '', attempt);
      if (res.ok !== false || res.needsConfirm !== true) {
        throw new Error(`${t.id}: 확인 문구 "${attempt}" 로 통과했습니다.`);
      }
    }
    // 맞는 문구는 게이트를 넘어가야 한다.
    // 게이트를 지나면 시트에 접근하는데, 여기 스텁은 그 순간 오류를 낸다 —
    // 즉 "오류가 났다 = 게이트를 통과했다" 가 성공 신호다.
    const passed = ctx.__run(t.id, {}, '', t.confirm);
    if (passed.needsConfirm === true) throw new Error(`${t.id}: 올바른 문구인데도 거부되었습니다.`);
    if (passed.ok !== false || !/시트에 접근/.test(String(passed.msg))) {
      throw new Error(`${t.id}: 게이트 통과 후 시트에 접근하지 않았습니다 (${JSON.stringify(passed)}).`);
    }
  }

  // 위험도 1·2 도구에는 확인 문구가 붙어 있으면 안 된다 (쓸데없이 번거로워짐)
  const overGuarded = tools.filter((t) => t.danger < 3 && t.confirm);
  if (overGuarded.length) throw new Error(`확인 문구가 불필요한 도구: ${overGuarded.map((t) => t.id).join(', ')}`);

  return `도구 ${tools.length}개 (위험도3 ${risky.length}개 × 5가지 입력 검사)`;
});

check('UI 어댑터: 성공·실패를 메시지로 정확히 구분한다', () => {
  const ctx = vm.createContext({ SpreadsheetApp: {} });
  vm.runInContext(extractFn(gs, '_uiAdapter') + extractFn(gs, '_adapterResult'), ctx);
  vm.runInContext('__mk = _uiAdapter; __res = _adapterResult;', ctx);

  // 확인 대화상자는 앱에서 이미 받았으므로 항상 YES 로 진행되어야 한다
  const ui = ctx.__mk(true);
  if (ui.alert('제목', '내용', 'YES_NO') !== ui.Button.YES) throw new Error('silent 모드에서 YES 가 아닙니다.');

  const ok = ctx.__mk(true);
  ok.alert('✅ 시즌 1 종료 완료!');
  if (ctx.__res(ok).ok !== true) throw new Error('성공 메시지를 실패로 읽었습니다.');

  const bad = ctx.__mk(true);
  bad.alert('❌ 시트를 찾을 수 없습니다.');
  if (ctx.__res(bad).ok !== false) throw new Error('실패 메시지를 성공으로 읽었습니다.');

  // 중간에 경고가 있었으면 마지막이 ✅ 라도 실패로 본다 (조용한 부분 실패 차단)
  const mixed = ctx.__mk(true);
  mixed.alert('⚠️ 미분배 아이템이 남아 있습니다.');
  mixed.alert('✅ 완료');
  if (ctx.__res(mixed).ok !== false) throw new Error('경고가 섞였는데 성공으로 읽었습니다.');

  // 값을 물어봐야 하는 자리는 조용히 넘어가면 안 된다
  let threw = false;
  try {
    ui.prompt('무언가');
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('prompt 가 silent 모드에서 조용히 통과했습니다.');

  return 'YES 진행 · ✅/❌/⚠️ 판정 · prompt 차단';
});

check('정정·삭제·지급취소는 확인 없이 실행되지 않는다', () => {
  for (const fn of ['api_correctItem', 'api_deleteItem', 'api_undoPayout']) {
    const body = extractFn(gs, fn);
    if (!/confirm !== true/.test(body)) throw new Error(`${fn} 에 확인 게이트가 없습니다.`);
    if (!/needsConfirm/.test(body)) throw new Error(`${fn} 이 재확인을 요청하지 않습니다.`);
  }
  // 라우터가 confirm 을 엄격하게 전달해야 한다 (기본값 true 로 새면 무력화)
  const router = gs.slice(gs.indexOf('function _apiRoute'));
  for (const a of ['correctItem', 'deleteItem', 'undoPayout']) {
    if (!new RegExp(`case '${a}':[\\s\\S]{0,200}req\\.confirm === true`).test(router)) {
      throw new Error(`라우터의 ${a} 가 confirm 을 엄격하게 다루지 않습니다.`);
    }
  }
  return '3종 게이트 + 라우터 전달';
});

check('되돌리기: 부분 실패면 상태를 바꾸지 않는다', () => {
  // 실제 사고 이력(19명 중 16명에서 중단) 때문에 반드시 지켜야 하는 순서:
  // 되돌리기를 전부 성공한 뒤에만 아이템 상태를 미분배로 바꾼다
  const core = extractFn(gs, '_correctCore');
  const failIdx = core.indexOf("reason: 'partial'");
  const statusIdx = core.indexOf('LG.STATUS).setValue(ST_WAIT)');
  if (failIdx < 0) throw new Error('부분 실패 처리가 없습니다.');
  if (statusIdx < 0) throw new Error('상태 복귀 코드가 없습니다.');
  if (failIdx > statusIdx) throw new Error('부분 실패 검사보다 상태 변경이 먼저 일어납니다.');

  // 삭제도 마찬가지 — 되돌리기가 실패하면 행을 지우면 안 된다
  const del = extractFn(gs, '_deleteItemCore');
  if (del.indexOf("reason: 'partial'") > del.indexOf('deleteRow')) {
    throw new Error('삭제가 부분 실패 검사보다 먼저 일어납니다.');
  }
  // 행이 사라지기 전에 로그를 남겨야 한다
  if (del.indexOf('_logAction') > del.indexOf('deleteRow')) {
    throw new Error('행을 지운 뒤에 로그를 남기려 합니다 (기록이 유실됩니다).');
  }
  return '정정·삭제 순서 보장';
});

check('시즌 번호는 시즌 시트를 보고 자가보정한다', () => {
  // 문서 속성만 믿으면 파일을 옮겼을 때 시즌3이 "시즌 1"로 보인다 (실제 사고)
  const fn = extractFn(gs, '_currentSeason');
  if (!/getSheetByName\('시즌'/.test(fn)) throw new Error('시즌 시트를 확인하지 않습니다.');

  const made = new Set(['시즌1', '시즌2']);
  const ctx = vm.createContext({
    PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null }) },
  });
  vm.runInContext(`${fn}; __cur = _currentSeason;`, ctx);
  const ss = { getSheetByName: (n) => (made.has(n) ? {} : null) };
  const got = ctx.__cur(ss);
  if (got !== 3) throw new Error(`시즌1·시즌2 가 있으면 3 이어야 하는데 ${got} 입니다.`);

  // 속성이 뒤처져 있어도 시트 쪽으로 맞춰야 한다
  const ctx2 = vm.createContext({
    PropertiesService: { getDocumentProperties: () => ({ getProperty: () => '1' }) },
  });
  vm.runInContext(`${fn}; __cur = _currentSeason;`, ctx2);
  if (ctx2.__cur(ss) !== 3) throw new Error('속성이 뒤처졌을 때 보정하지 못합니다.');

  // 시즌 번호를 읽는 곳이 헬퍼를 쓰는지 (속성 직접 조회가 남아 있으면 또 어긋난다)
  const direct = [...gs.matchAll(/getProperty\('SEASON_NUM'\)/g)];
  if (direct.length > 1) throw new Error(`SEASON_NUM 을 직접 읽는 곳이 ${direct.length}군데 있습니다 (_currentSeason 만 읽어야 합니다).`);
  return '시트 기준 보정 · 단일 진입점';
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

/* ─────────── Vercel 서버 라우트 (권한 경계) ─────────── */

/** app/api 아래 route.ts 를 전부 읽어 { 경로: 내용 } 으로 돌려준다 */
function readRoutes(dir = resolve(ROOT, 'app/api'), out = {}) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, e.name);
    if (e.isDirectory()) readRoutes(full, out);
    else if (e.name === 'route.ts') out[full.replace(ROOT + '/', '')] = readFileSync(full, 'utf8');
  }
  return out;
}

const routes = readRoutes();

check('관리자 라우트는 전부 인증으로 시작한다', () => {
  const adminRoutes = Object.entries(routes).filter(([p]) => p.includes('app/api/admin/'));
  if (adminRoutes.length === 0) throw new Error('관리자 라우트를 하나도 찾지 못했습니다.');

  const bad = [];
  for (const [path, src] of adminRoutes) {
    // login/logout 은 인증을 만드는 쪽이라 예외
    if (/\/(login|logout)\//.test(path)) continue;
    for (const m of src.matchAll(/export async function (GET|POST|DELETE|PUT|PATCH)\s*\([^)]*\)\s*\{/g)) {
      const body = src.slice(m.index, src.indexOf('\n}', m.index));
      if (!/requireAdmin\(\)|requireMaster\(\)/.test(body)) bad.push(`${path} ${m[1]}`);
    }
  }
  if (bad.length) throw new Error(`인증 없이 열려 있는 관리자 핸들러: ${bad.join(', ')}`);
  return `${adminRoutes.length}개 라우트`;
});

check('마스터 전용 라우트는 requireMaster 로 막힌다', () => {
  const src = routes['app/api/master/route.ts'];
  if (!src) throw new Error('app/api/master/route.ts 가 없습니다.');
  if (!/requireMaster\(\)/.test(src)) throw new Error('requireMaster 검사가 없습니다.');
  // 앱 이름·PIN 교체는 마스터만 — requireAdmin 으로 낮춰 놓으면 안 된다
  if (/requireAdmin\(\)/.test(src)) throw new Error('마스터 라우트가 requireAdmin 으로 낮춰져 있습니다.');
  // PIN 값을 응답이나 로그로 흘리지 않는다
  if (/console\.(log|error|warn)/.test(src)) throw new Error('PIN 을 다루는 라우트에 콘솔 출력이 있습니다.');
  return 'requireMaster · 콘솔 출력 없음';
});

check('공지 권한은 요청 본문이 아니라 쿠키로 정해진다', () => {
  // 게시판 글쓰기는 앱에서 유일하게 인증 없이 열려 있는 쓰기 경로다.
  // 여기서 body.notice 를 그대로 믿으면 누구나 공지를 띄울 수 있게 된다.
  const src = routes['app/api/board/route.ts'];
  if (!src) throw new Error('app/api/board/route.ts 가 없습니다.');
  if (!/isNotice\s*=\s*body\.notice === true && \(await isAdmin\(\)\)/.test(src)) {
    throw new Error('공지 여부를 관리자 세션과 함께 판정하지 않습니다.');
  }
  if (!/rateLimit\(/.test(src)) throw new Error('공개 쓰기 경로에 속도 제한이 없습니다.');
  return '쿠키 판정 + 속도 제한';
});

check('서버 라우트는 확인값을 임의로 채우지 않는다', () => {
  // confirm / confirmText / confirmMerge / confirmRemove 를 라우트가 스스로
  // true 로 만들면 2·3단계 확인 장치가 통째로 무력화된다.
  const bad = [];
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [path, raw] of Object.entries(routes)) {
    const src = stripComments(raw);
    for (const m of src.matchAll(/(confirm|confirmText|confirmMerge|confirmRemove)\s*:\s*([^,\n]+)/g)) {
      const value = m[2].trim().replace(/[}\s]+$/, '');
      const okShapes =
        /^body\.\w+ === true$/.test(value) ||           // 엄격 전달
        /^String\(body\.\w+ \?\? ''\)$/.test(value) || // 문구 그대로 전달
        value === 'confirm' ||
        value === 'confirmText';
      if (!okShapes) bad.push(`${path}: ${m[1]}: ${value}`);
    }
  }
  if (bad.length) throw new Error(`확인값을 그대로 전달하지 않습니다 →\n     ${bad.join('\n     ')}`);
  return '전부 사용자 입력 그대로 전달';
});

/* ─────────── 화면 문구 (한국어 / 中文) ─────────── */

check('.gs 결과 코드가 앱 사전에 전부 있다', () => {
  // v10.0 부터 시트는 문장을 세 벌로 만들지 않는다. "무슨 일이 있었는지"를
  // code + vars 로만 내려주고(`_rc`), 문장은 앱이 lib/i18n 사전으로 조립한다.
  // 그래서 시트가 쓰는 code 는 반드시 사전에 's.<code>' 로 있어야 한다 —
  // 없으면 화면 언어와 상관없이 한국어 폴백만 나온다.
  const codes = new Set();
  const CODE = "'([a-z]+\\.[A-Za-z]+)'";  // 반드시 'group.name' 꼴 — 액션 이름과 섞이지 않게
  for (const m of gs.matchAll(new RegExp("_rc\\(\\{[\\s\\S]*?\\},\\s*\\n?\\s*" + CODE, 'g'))) codes.add(m[1]);
  for (const m of gs.matchAll(new RegExp("\\bcode:\\s*" + CODE, 'g'))) codes.add(m[1]);
  for (const m of gs.matchAll(/\?\s*'([\w]+\.[\w]+)'\s*:\s*'([\w]+\.[\w]+)'/g)) { codes.add(m[1]); codes.add(m[2]); }
  if (codes.size < 40) throw new Error(`시트에서 찾은 결과 코드가 너무 적습니다 (${codes.size}개).`);

  const dictSrc = readFileSync(resolve(ROOT, 'lib/i18n.tsx'), 'utf8');
  const missing = [...codes].filter((c) => !dictSrc.includes(`'s.${c}':`));
  if (missing.length) {
    throw new Error(`사전에 없는 결과 코드 (${missing.length}개): ${missing.slice(0, 12).join(', ')}`);
  }

  // 반대 방향 — 아무도 안 쓰는 s.* 항목이 남아 있으면 시트와 앱이 어긋난 것이다
  const declared = [...dictSrc.matchAll(/'s\.([\w.]+)':\s*\[/g)].map((m) => m[1]);
  const orphan = declared.filter((c) => !codes.has(c));
  if (orphan.length) throw new Error(`시트가 보내지 않는 사전 항목: ${orphan.slice(0, 12).join(', ')}`);

  return `결과 코드 ${codes.size}개 · 사전 ${declared.length}개 일치`;
});

check('결과 문장의 자리표시자를 시트가 전부 채운다', () => {
  // 's.dist.ok' 문장이 {fundTotal} 을 쓰는데 시트가 그 값을 안 보내면
  // 화면에 "{fundTotal}" 이 그대로 찍힌다. 세 언어 모두 검사한다.
  const dictSrc = readFileSync(resolve(ROOT, 'lib/i18n.tsx'), 'utf8');

  // 시트의 code → vars 키 목록을 뽑는다
  const supplied = new Map();
  const addVars = (code, block) => {
    const keys = new Set(supplied.get(code) ?? []);
    for (const m of (block ?? '').matchAll(/(\w+):/g)) keys.add(m[1]);
    supplied.set(code, keys);
  };
  for (const m of gs.matchAll(/_rc\(\{[\s\S]*?\},\s*\n?\s*'([a-z]+\.[A-Za-z]+)'\s*(?:,\s*(\{[\s\S]*?\}))?\s*\)/g)) {
    addVars(m[1], m[2]);
  }
  for (const m of gs.matchAll(/code:\s*(?:[\s\S]{0,80}?)'([\w.]+)'[\s\S]{0,80}?vars:\s*(\{[^}]*\})/g)) {
    addVars(m[1], m[2]);
  }

  const bad = [];
  for (const m of dictSrc.matchAll(/'s\.([\w.]+)':\s*\[([\s\S]*?)\],\n/g)) {
    const code = m[1];
    const keys = supplied.get(code);
    if (!keys) continue; // 코드 존재 여부는 위 검사가 본다
    for (const ph of new Set([...m[2].matchAll(/\{(\w+)\}/g)].map((x) => x[1]))) {
      if (!keys.has(ph)) bad.push(`s.${code} → {${ph}}`);
    }
  }
  if (bad.length) {
    throw new Error(`시트가 보내지 않는 값을 문장이 씁니다 (${bad.length}건): ${bad.slice(0, 10).join(', ')}`);
  }
  return `${supplied.size}개 코드의 자리표시자 대조 완료`;
});

check('쓰기 라우트는 쓴 뒤에 캐시를 버린다', () => {
  // 캐시를 안 버리면 사용자가 방금 넣은 값이 TTL 동안 화면에 안 나온다.
  // 실제로 "반영이 늦다" 는 민원의 원인이었다.
  const dirs = ['app/api/admin', 'app/api/master'];
  const files = [];
  const walk = (rel) => {
    for (const e of readdirSync(resolve(ROOT, rel), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${rel}/${e.name}`);
      else if (e.name === 'route.ts') files.push([`${rel}/${e.name}`, readFileSync(resolve(ROOT, rel, e.name), 'utf8')]);
    }
  };
  dirs.forEach(walk);

  // POST 지만 화면에 보이는 데이터를 바꾸지 않는 액션들 — 캐시를 버릴 것이 없다.
  // 경로가 아니라 **액션 이름**으로 판정한다. 경로로 면제하면 나중에 같은 폴더에
  // 진짜 쓰기가 들어와도 그냥 통과해버린다.
  const READ_ONLY = ['photo', 'countPhoto', 'checkPin', 'previewReverse', 'lastPayout', 'tools', 'roster',
                     'itemsAll', 'renameHistory', 'members', 'lookup', 'ping'];

  const bad = [];
  for (const [path, src] of files) {
    // 쓰기 핸들러가 있는데 invalidate 가 한 번도 안 나오면 잡는다
    const writes = /export async function (POST|DELETE|PUT|PATCH)/.test(src);
    if (!writes) continue;
    // 로그인·로그아웃은 시트 데이터를 바꾸지 않는다
    if (/\/(login|logout)\/route\.ts$/.test(path)) continue;
    // syncStateCache 는 실어 온 최신 상태를 넣거나, 없으면 버린다 — 둘 다 정리다
    if (/invalidate\(|syncStateCache\(/.test(src)) continue;

    const actions = [...src.matchAll(/callGas\(\s*'(\w+)'/g)].map((m) => m[1]);
    if (actions.length && actions.every((a) => READ_ONLY.includes(a))) continue;
    bad.push(`${path} (${actions.join(', ') || '액션 없음'})`);
  }
  if (bad.length) throw new Error(`쓰고 나서 캐시를 안 버리는 라우트: ${bad.join(', ')}`);
  return `${files.length}개 라우트 검사`;
});

check('쓰기 직후 조회는 캐시를 건너뛴다', () => {
  // 캐시는 서버 인스턴스 메모리에 있다. 쓰기를 처리한 인스턴스에서 캐시를 버려도
  // 다음 조회가 낡은 값을 든 다른 인스턴스로 갈 수 있다. 그래서 쓰기 직후의
  // 조회만 ?fresh=1 로 부른다.
  const freshSrc = readFileSync(resolve(ROOT, 'lib/fresh.ts'), 'utf8');
  const routes = {
    'app/api/state/route.ts': 'state',
    'app/api/board/route.ts': 'posts',
    'app/api/alliance/route.ts': 'alliance',
  };
  for (const [path, key] of Object.entries(routes)) {
    const src = readFileSync(resolve(ROOT, path), 'utf8');
    if (!src.includes('dropIfFresh')) throw new Error(`${path} 가 fresh 재조회를 지원하지 않습니다.`);
    if (!new RegExp(`dropIfFresh\\(req, '${key}'`).test(src)) {
      throw new Error(`${path} 가 '${key}' 캐시를 버리지 않습니다.`);
    }
    // TTL 이 너무 길면 fresh 를 쓰지 않는 다른 사람 화면이 오래 낡은 채로 남는다
    const raw = (src.match(/cached\('[^']+',\s*([\w]+)/) ?? [])[1] ?? '';
    const ttl = /^\d[\d_]*$/.test(raw)
      ? Number(raw.replace(/_/g, ''))
      : Number((freshSrc.match(new RegExp(`${raw}\\s*=\\s*([\\d_]+)`)) ?? [])[1]?.replace(/_/g, '') ?? 0);
    if (!ttl || ttl > 10_000) throw new Error(`${path} 의 캐시 TTL 이 ${ttl}ms 입니다 (10초 이하여야 합니다).`);
  }

  // 앱: 쓰기 완료 콜백은 전부 fresh 로 불러야 한다
  const app = readFileSync(resolve(ROOT, 'components/App.tsx'), 'utf8');
  const stale = [...app.matchAll(/(onDone|onChanged|onAuthChange)=\{\(\) => void refresh\(\)\}/g)];
  if (stale.length) {
    throw new Error(`쓰기 완료 후 캐시된 값을 다시 읽는 곳이 ${stale.length}곳 있습니다 (refreshNow 를 쓰세요).`);
  }
  if (!/refresh\(true\)/.test(app)) throw new Error('App.tsx 에 fresh 재조회 경로가 없습니다.');

  // 평소 조회(첫 로드·주기 갱신)까지 fresh 로 부르면 캐시가 무의미해진다
  if (/setInterval\([\s\S]{0,160}?refresh\(true\)/.test(app)) {
    throw new Error('주기 갱신이 캐시를 건너뜁니다 — Apps Script 할당량을 그대로 태웁니다.');
  }
  return `조회 3종 + 앱 쓰기 콜백 ${['onDone', 'onChanged', 'onAuthChange'].length}종`;
});

check('쓰기 응답이 최신 상태를 같이 실어 보낸다 (왕복 1회 절약)', () => {
  // 앱은 쓰기 뒤에 화면 숫자를 맞추려고 상태를 다시 읽어야 한다.
  // 그걸 두 번째 요청으로 하면 폰↔서버 왕복과 Apps Script 실행 준비 비용이
  // 한 번 더 든다. 시트가 같은 실행 안에서 읽어 보내면 그 왕복이 사라진다.
  const ctx = vm.createContext({});
  const writeList = (gs.match(/const API_WRITE_ACTIONS = \[[\s\S]*?\];/) ?? [])[0];
  if (!writeList) throw new Error('API_WRITE_ACTIONS 를 찾지 못했습니다.');
  const fn = (gs.match(/function _withState\(result, action, req\) \{[\s\S]*?\n\}/) ?? [])[0];
  if (!fn) throw new Error('_withState 를 찾지 못했습니다.');

  let stateCalls = 0;
  vm.runInContext(
    `${writeList}\n${fn}\nfunction api_getState() { __n++; return { marker: 1 }; }\nvar __n = 0;`,
    ctx,
  );
  const run = (result, action, req) => {
    ctx.__result = result; ctx.__action = action; ctx.__req = req;
    return vm.runInContext('_withState(__result, __action, __req)', ctx);
  };
  const reads = () => vm.runInContext('__n', ctx);

  // ① 쓰기 + withState → 상태가 붙는다
  let r = run({ ok: true }, 'distribute', { withState: true });
  if (!r.state) throw new Error('쓰기 응답에 상태가 붙지 않습니다.');

  // ② withState 를 안 보내면 붙지 않는다 (필요 없는 호출까지 전체 시트를 읽지 않도록)
  stateCalls = reads();
  r = run({ ok: true }, 'distribute', {});
  if (r.state) throw new Error('withState 없이도 상태를 붙입니다.');
  if (reads() !== stateCalls) throw new Error('withState 없이 시트를 읽었습니다.');

  // ③ 실패한 쓰기에는 붙지 않는다 — 바뀐 것이 없다
  r = run({ ok: false, msg: '실패' }, 'distribute', { withState: true });
  if (r.state) throw new Error('실패한 쓰기에 상태를 붙입니다.');

  // ④ 조회 액션에는 붙지 않는다 (중복해서 두 번 읽게 된다)
  r = run({ ok: true }, 'state', { withState: true });
  if (r.state) throw new Error('조회 액션에까지 상태를 붙입니다.');

  // ⑤ ★ 상태 읽기가 실패해도 쓰기 결과는 성공 그대로여야 한다.
  //    여기서 실패로 뒤집으면 사용자가 같은 분배를 다시 실행한다.
  vm.runInContext('api_getState = function () { throw new Error("boom"); };', ctx);
  r = run({ ok: true, msg: '✅ 분배 완료' }, 'distribute', { withState: true });
  if (r.ok !== true) throw new Error('상태 읽기 실패가 쓰기 결과를 실패로 만듭니다 — 이중 실행 위험.');
  if (r.state) throw new Error('실패했는데 상태가 붙었습니다.');

  return '붙임 · withState 없으면 안 붙임 · 실패/조회 제외 · 읽기 실패해도 성공 유지';
});

check('앱이 실어 온 상태를 실제로 쓴다', () => {
  // 시트가 보내줘도 앱이 안 쓰면 왕복이 그대로 남는다. 양쪽을 다 확인한다.
  const gasSrc = readFileSync(resolve(ROOT, 'lib/gas.ts'), 'utf8');
  if (!/withState\?: boolean/.test(gasSrc)) throw new Error('callGas 에 withState 옵션이 없습니다.');
  if (!/opts\.withState \? \{ withState: true \}/.test(gasSrc)) {
    throw new Error('callGas 가 withState 를 시트로 보내지 않습니다.');
  }

  const freshSrc = readFileSync(resolve(ROOT, 'lib/fresh.ts'), 'utf8');
  if (!/put\('state'/.test(freshSrc)) throw new Error('실어 온 상태를 캐시에 넣지 않습니다.');
  if (!/else invalidate\('state'\)/.test(freshSrc)) {
    throw new Error('상태가 안 온 경우 캐시를 버리지 않습니다 — 낡은 값이 남습니다.');
  }

  // 상태를 화면에 반영하는 쓰기 라우트는 전부 withState 로 불러야 한다
  const bad = [];
  const walk = (rel) => {
    for (const e of readdirSync(resolve(ROOT, rel), { withFileTypes: true })) {
      if (e.isDirectory()) { walk(`${rel}/${e.name}`); continue; }
      if (e.name !== 'route.ts') continue;
      const path = `${rel}/${e.name}`;
      const src = readFileSync(resolve(ROOT, path), 'utf8');
      if (!/syncStateCache\(/.test(src)) continue;
      if (!/withState: true/.test(src)) bad.push(path);
    }
  };
  ['app/api/admin', 'app/api/master'].forEach(walk);
  if (bad.length) throw new Error(`상태를 반영하면서 withState 를 안 보내는 라우트: ${bad.join(', ')}`);

  const app = readFileSync(resolve(ROOT, 'components/App.tsx'), 'utf8');
  if (!/res\?\.state as GuildState/.test(app)) throw new Error('App.tsx 가 실어 온 상태를 쓰지 않습니다.');
  // 상태가 안 왔을 때의 물러설 길이 반드시 있어야 한다 (옛 버전 시트 대응)
  if (!/void refresh\(true\)/.test(app)) throw new Error('상태가 없을 때의 대비 경로가 없습니다.');
  return '시트 → 라우트 → 캐시 → 화면 전 구간 연결';
});

check('개명 대상은 전체 명단에서 고르고, 한 명을 두 번 물려받을 수 없다', () => {
  // 실제로는 전혀 다른 이름으로 갈아타는 경우가 대부분이다. 후보가 0명이라고
  // 개명을 막으면 잔액·참여횟수·시즌기록이 승계되지 않고 0부터 다시 시작한다.
  const analyze = (gs.match(/function api_analyzeMembers[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!/roster: roster/.test(analyze)) throw new Error('판정 결과에 전체 명단을 싣지 않습니다.');

  const bulk = (gs.match(/function api_bulkAddMembers[\s\S]*?\n\}\n/) ?? [''])[0];
  // ★ 한 아이디를 두 사람이 물려받으면 먼저 처리된 쪽만 잔액을 가져가고
  //   뒤쪽은 조용히 실패한다 — 반드시 서버가 막아야 한다
  if (!/bulk\.dupFrom/.test(bulk)) throw new Error('같은 아이디 중복 지정을 막지 않습니다.');
  if (!/bulk\.noFrom/.test(bulk)) throw new Error('명단에 없는 아이디 지정을 막지 않습니다.');
  // 두 검사 모두 실제 개명이 일어나기 전에 끝나야 한다
  if (bulk.indexOf('bulk.dupFrom') > bulk.indexOf('_renameCore')) {
    throw new Error('중복 검사가 개명 실행보다 뒤에 있습니다.');
  }

  const ui = readFileSync(resolve(ROOT, 'components/BulkMemberSheet.tsx'), 'utf8');
  if (/op === 'rename' && r\.suggest\.length === 0/.test(ui)) {
    throw new Error('후보가 없다고 개명 버튼을 막습니다.');
  }
  if (!/roster\.filter/.test(ui)) throw new Error('드롭다운이 전체 명단을 쓰지 않습니다.');
  if (!/takenBy/.test(ui)) throw new Error('이미 선택된 아이디를 가려내지 않습니다.');
  return '전체 명단 제공 · 중복/미존재 거부 · 실행 전 검사 · 앱 드롭다운';
});

check('사진 인식: 여러 언어로 읽고, 실패 이유를 감추지 않는다', () => {
  // 명단에는 한글·한자·영문이 섞여 있다. 언어 힌트를 하나만 주면 다른 문자를
  // 통째로 놓치고, 관리자는 그 사람이 왜 빠졌는지 알 수 없다.
  if (!/function _ocrImageMulti/.test(gs)) throw new Error('_ocrImageMulti 가 없습니다.');
  const multi = (gs.match(/function _ocrImageMulti[\s\S]*?\n\}/) ?? [''])[0];
  for (const lang of ['ko', 'zh-CN', 'en']) {
    if (!multi.includes(`'${lang}'`)) throw new Error(`${lang} 로 읽어보지 않습니다.`);
  }
  // 하나라도 읽혔으면 그걸 써야 한다 — 첫 언어 실패로 전부 포기하면 안 된다
  if (!/if \(!String\(best\)\.trim\(\) && firstError\) throw firstError;/.test(multi)) {
    throw new Error('일부 언어만 실패해도 전체를 실패로 만듭니다.');
  }
  if (!/_ocrImageMulti\(blob\)/.test(gs)) throw new Error('사진 분석이 다국어 OCR 을 쓰지 않습니다.');

  // ★ "글자를 못 읽었다"만 보여주면 관리자는 사진 탓인 줄 알고 계속 다시 찍는다.
  //   대부분의 원인은 Drive API 서비스 미설치이고, 그건 한 번이면 해결된다.
  const analyze = (gs.match(/function api_analyzeMembers[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!/Drive API/.test(analyze)) throw new Error('Drive API 설치 안내를 하지 않습니다.');
  if (!/bulk\.ocrSetup/.test(analyze)) throw new Error('설정 문제를 별도 코드로 구분하지 않습니다.');
  const photo = (gs.match(/function api_analyzePhoto[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!/ocrFailed: true/.test(photo)) throw new Error('OCR 실패 여부를 결과에 남기지 않습니다.');

  // 앱: 사진 보정을 거쳐야 한다. 원본(수 MB)을 그대로 보내면 OCR 이 더 못 읽는다
  const bulkUi = readFileSync(resolve(ROOT, 'components/BulkMemberSheet.tsx'), 'utf8');
  if (!/prepPhoto\(file\)/.test(bulkUi)) throw new Error('명단 일괄 추가가 사진을 보정하지 않습니다.');
  for (const f of ['components/ItemsTab.tsx', 'components/AllianceTab.tsx']) {
    const src = readFileSync(resolve(ROOT, f), 'utf8');
    if (!/prepPhoto\(/.test(src)) throw new Error(`${f} 가 사진 보정을 쓰지 않습니다.`);
    if (/readAsDataURL/.test(src)) throw new Error(`${f} 에 보정 없는 옛 경로가 남아 있습니다.`);
  }

  // 보정 함수가 실제로 크기를 줄이는지 (숫자를 눈으로만 믿지 않는다)
  const client = readFileSync(resolve(ROOT, 'lib/client.ts'), 'utf8');
  if (!/maxDim = 1600/.test(client)) throw new Error('사진 축소 상한이 없습니다.');
  if (!/contrast\(160%\)/.test(client)) throw new Error('명암비 보정이 없습니다.');
  return '3개 언어 · 부분성공 허용 · 설정안내 · 보정 3화면 공유';
});

check('정원을 올려도 옛 시트에서 터지지 않는다', () => {
  // 상수만 올리면 50명 기준으로 만들어진 시트에 100행을 읽다가
  // "범위가 시트를 벗어난다"며 터진다. 실제 시트를 쓰는 사용자가
  // 붙여넣는 순간 조회조차 안 되므로 반드시 함께 처리해야 한다.
  const cap = Number((gs.match(/const MAX_MEMBERS = (\d+)/) ?? [])[1] ?? 0);
  if (cap < 1) throw new Error('MAX_MEMBERS 를 찾지 못했습니다.');

  // ① 멤버 블록을 고정 크기로 읽는 곳이 남아 있으면 안 된다
  const raw = [...gs.matchAll(/getRange\([^)]*MAX_MEMBERS[^)]*\)\.getValues\(\)/g)].map((m) => m[0]);
  if (raw.length) {
    throw new Error(`시트 크기를 확인하지 않고 읽는 곳이 ${raw.length}곳 있습니다: ${raw[0]}`);
  }

  // ② 행을 늘리는 경로가 있고, 진입점에서 불려야 한다
  if (!/function _ensureRows/.test(gs)) throw new Error('_ensureRows 가 없습니다.');
  if (!/function _ensureCapacity/.test(gs)) throw new Error('_ensureCapacity 가 없습니다.');
  const doPost = (gs.match(/function doPost[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!/_ensureCapacity\(\)/.test(doPost)) throw new Error('doPost 가 행을 확보하지 않습니다.');
  const onOpen = (gs.match(/function onOpen[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!/_ensureCapacity\(\)/.test(onOpen)) throw new Error('onOpen 이 행을 확보하지 않습니다.');

  // ③ 클램프 읽기가 실제로 시트 크기를 넘지 않는지 — 함수를 직접 돌려본다
  const ctx = vm.createContext({ MAX_MEMBERS: cap });
  vm.runInContext((gs.match(/function _memberBlock[\s\S]*?\n\}/) ?? [''])[0], ctx);
  const fake = (maxRows) => ({
    getMaxRows: () => maxRows,
    getRange: (start, col, n) => {
      if (start + n - 1 > maxRows) throw new Error(`범위 초과: ${start}+${n} > ${maxRows}`);
      return { getValues: () => Array.from({ length: n }, () => ['']) };
    },
  });
  for (const rows of [1, 2, 51, 101, 1000]) {
    ctx.__s = fake(rows);
    const got = vm.runInContext('_memberBlock(__s, 2, 2, 1).length', ctx);
    const want = Math.min(cap, Math.max(rows - 1, 0));
    if (got !== want) throw new Error(`행 ${rows}개 시트에서 ${got}줄을 읽었습니다 (기대 ${want}).`);
  }

  // ④ 모의 시트도 같은 정원을 써야 E2E 가 의미가 있다
  const mock = readFileSync(resolve(ROOT, 'scripts/mock-sheet.mjs'), 'utf8');
  const mockCap = Number((mock.match(/const MAX_MEMBERS = (\d+)/) ?? [])[1] ?? 0);
  if (mockCap !== cap) throw new Error(`모의 시트 정원이 다릅니다 (.gs ${cap} / mock ${mockCap}).`);
  return `정원 ${cap}명 · 고정크기 읽기 0곳 · 진입점 2곳 · 클램프 5케이스`;
});

check('명단 일괄 추가: 판정은 쓰지 않고, 실행은 재확인을 거친다', () => {
  // 40명을 잘못 넣으면 되돌리기가 아주 번거롭다. 이 기능의 핵심은
  // "빨리 넣는 것"이 아니라 "넣기 전에 걸러내는 것"이다.
  const analyze = (gs.match(/function api_analyzeMembers[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!analyze) throw new Error('api_analyzeMembers 가 없습니다.');
  // ★ 판정 단계는 아무것도 쓰지 않아야 한다
  const writes = analyze.match(/\.setValue\(|\.setValues\(|deleteRow\(|clearContent\(|insertSheet\(/g);
  if (writes) throw new Error(`판정 단계가 시트를 씁니다 (${writes.join(', ')}) — 읽기만 해야 합니다.`);

  const bulk = (gs.match(/function api_bulkAddMembers[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!bulk) throw new Error('api_bulkAddMembers 가 없습니다.');
  if (!/confirm !== true/.test(bulk)) throw new Error('재확인 없이 실행됩니다 (위험도 2 위반).');
  if (!/needsConfirm: true/.test(bulk)) throw new Error('needsConfirm 을 돌려주지 않습니다.');
  // Apps Script 에는 트랜잭션이 없다 — 대상별 개별 try/catch 가 있어야 한다 (규칙 6)
  const tries = (bulk.match(/try \{/g) ?? []).length;
  if (tries < 3) throw new Error(`대상별 개별 try/catch 가 부족합니다 (${tries}개).`);
  if (!/failed\.push\(/.test(bulk)) throw new Error('실패 내역을 모으지 않습니다.');
  if (!/MAX_MEMBERS/.test(bulk)) throw new Error('정원 초과를 막지 않습니다.');
  // ★ 개명은 반드시 _renameCore 를 타야 잔액·참여횟수·시즌기록이 승계된다
  if (!/_renameCore\(/.test(bulk)) throw new Error('개명이 _renameCore 를 거치지 않습니다 — 이력이 승계되지 않습니다.');
  // 개명을 추가보다 먼저 해야 옛 이름과 새 이름이 빈 칸을 두고 다투지 않는다
  if (bulk.indexOf('renames.forEach') > bulk.indexOf('adds.forEach')) {
    throw new Error('추가가 개명보다 먼저 실행됩니다.');
  }

  // 라우트: confirm 을 임의로 채우지 않는지 + 인증이 첫 줄인지
  const route = readFileSync(resolve(ROOT, 'app/api/admin/members-bulk/route.ts'), 'utf8');
  if (!/confirm: body\.confirm === true/.test(route)) {
    throw new Error('라우트가 confirm 을 그대로 전달하지 않습니다.');
  }
  if (!/const denied = await requireAdmin\(\)/.test(route)) throw new Error('라우트에 인증이 없습니다.');

  // 앱: 개명 후보를 자동으로 확정하면 두 사람 잔액이 합쳐진다
  const ui = readFileSync(resolve(ROOT, 'components/BulkMemberSheet.tsx'), 'utf8');
  if (!/if \(r\.status === 'rename'\) return \{ op: 'skip'/.test(ui)) {
    throw new Error('개명 후보가 기본으로 실행되게 되어 있습니다 — 사람이 골라야 합니다.');
  }
  if (!/confirm,/.test(ui) || /confirm: true/.test(ui.replace(/apply\(true\)/g, ''))) {
    throw new Error('앱이 confirm 을 임의로 채웁니다.');
  }
  return '판정 무쓰기 · 재확인 · 개별 try/catch · 개명은 _renameCore · 후보 자동확정 없음';
});

check('연합은 등록과 정산이 분리되어 있다', () => {
  // 레이드 직후엔 아직 안 팔려서 금액을 모르는 것이 정상이다.
  // 등록 단계에서 금액을 요구하면 등록 자체가 미뤄져 인증샷을 잃어버린다.
  if (!/function api_addAlliance\(server, item, people, photoLink, email\)/.test(gs)) {
    throw new Error('api_addAlliance 가 아직 금액을 받습니다 — 등록/정산이 분리되지 않았습니다.');
  }
  if (!/function api_creditAlliance\(row, amount, pct, email\)/.test(gs)) {
    throw new Error('api_creditAlliance 가 없습니다.');
  }

  const add = (gs.match(/function api_addAlliance[\s\S]*?\n\}/) ?? [''])[0];
  if (/_calcAlliance/.test(add)) throw new Error('등록 단계에서 적립액을 계산합니다 — 금액은 정산 단계의 몫입니다.');
  if (!new RegExp("ST_WAIT").test(add)) throw new Error('등록 건이 ' + '대기 상태로 저장되지 않습니다.');

  const credit = (gs.match(/function api_creditAlliance[\s\S]*?\n\}\n/) ?? [''])[0];
  // 두 번 누적되면 서버 총액이 틀어진다
  if (!/e\.allyDone/.test(credit)) throw new Error('이미 정산된 건을 다시 정산하는 것을 막지 않습니다.');
  if (!/lock\.waitLock/.test(credit)) throw new Error('정산이 락 없이 실행됩니다.');

  // 미정산 건이 서버별 누적에 섞이면 0원짜리가 건수만 부풀린다
  const get = (gs.match(/function api_getAlliance[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!/if \(!rec\.done\) return;/.test(get)) {
    throw new Error('미정산 건이 서버별 누적에서 제외되지 않습니다.');
  }

  // 라우터·쓰기목록에 새 액션이 등록됐는지
  if (!/case 'creditAlliance':/.test(gs)) throw new Error('라우터에 creditAlliance 가 없습니다.');
  if (!/'addAlliance', 'creditAlliance'/.test(gs)) throw new Error('creditAlliance 가 쓰기 액션 목록에 없습니다.');

  // v10.2 이하 시트에는 '상태' 열이 없다 — 자동 보정 경로가 있어야 한다
  if (!/function _ensureAllianceHeaders/.test(gs)) throw new Error('옛 연합 시트의 헤더 보정이 없습니다.');
  return '등록(금액 없음) · 정산(락·중복거부) · 미정산 제외 · 옛 시트 보정';
});

check('이름은 두 줄로 나뉘고 글자 수에 맞춰 줄어든다', () => {
  // 좁은 칩에서 이름이 잘리면 다른 사람으로 오인돼 엉뚱한 사람이 참여자로 체크된다.
  const src = readFileSync(resolve(ROOT, 'lib/client.ts'), 'utf8');
  const ctx = vm.createContext({});

  /**
   * 실제 소스를 그대로 실행하기 위해 시그니처의 타입만 벗긴다.
   * 본문은 손대지 않는다 — 손대는 순간 "검사한 코드"가 진짜 코드가 아니게 된다.
   */
  const pick = (name) => {
    const m = src.match(new RegExp(`export function ${name}[\\s\\S]*?\\n\\}`));
    if (!m) throw new Error(`${name} 이(가) 없습니다.`);
    const block = m[0];
    const nl = block.indexOf('\n');
    const sig = block.slice(0, nl);
    const open = sig.indexOf('(');
    let depth = 0;
    let close = -1;
    for (let i = open; i < sig.length; i++) {
      if (sig[i] === '(') depth += 1;
      else if (sig[i] === ')') { depth -= 1; if (depth === 0) { close = i; break; } }
    }
    const params = sig
      .slice(open + 1, close)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      // `len: number` → `len`,  `fitLen = 5` → `fitLen = 5` (기본값은 살린다)
      .map((x) => (x.includes('=') ? x.replace(/:\s*[^=]+(?==)/, '') : x.replace(/:.*$/, '')).trim());
    return `function ${name}(${params.join(', ')}) {` + block.slice(nl);
  };
  vm.runInContext(pick('splitName') + '\n' + pick('fitFont'), ctx);
  const split = (n) => { ctx.__n = n; return vm.runInContext('splitName(__n)', ctx); };
  const fit = (text, base, min) => {
    ctx.__a = text; ctx.__b = base; ctx.__c = min;
    return vm.runInContext('fitFont(__a, __b, __c)', ctx);
  };

  let r = split('잡이K (卡尔K)');
  if (r.main !== '잡이K' || r.sub !== '卡尔K') throw new Error(`괄호 분리 실패: ${JSON.stringify(r)}`);
  r = split('ChecK');
  if (r.main !== 'ChecK' || r.sub !== '') throw new Error('괄호가 없으면 두 번째 줄은 비어야 합니다.');
  // ★ '(미등록)' 은 한자 표기가 아니라 상태다 — 한자 줄로 올리면 안 된다
  r = split('가이 (미등록)');
  if (r.sub !== '') throw new Error("'(미등록)' 을 한자 표기로 오인합니다.");
  // 없는 한자를 지어내면 엉뚱한 사람에게 다이아가 간다 (규칙 7)
  r = split('선륙소농포 (鮮肉小籠包)');
  if (r.sub !== '鮮肉小籠包') throw new Error('긴 한자 표기 분리 실패');

  if (fit('가이', 14, 10) !== 14) throw new Error('짧은 이름인데 크기를 줄입니다.');
  if (!(fit('선륙소농포', 14, 10) < 14)) throw new Error('긴 한글 이름의 크기가 그대로입니다.');
  // ★ 글자 수가 아니라 폭으로 재야 한다 — 같은 5자라도 한글이 라틴보다 훨씬 넓다
  if (fit('PlusS', 14, 10) !== 14) throw new Error('라틴 5자를 한글 5자와 같게 봅니다 (폭이 아니라 개수로 셈).');
  if (!(fit('선륙소농포', 14, 10) < fit('PlusS', 14, 10))) throw new Error('한글이 라틴보다 넓게 계산되지 않습니다.');
  if (fit('가'.repeat(40), 14, 10) < 10) throw new Error('최소 크기 아래로 줄어듭니다 — 읽을 수 없어집니다.');

  const items = readFileSync(resolve(ROOT, 'components/ItemsTab.tsx'), 'utf8');
  if (!/splitName\(m\)/.test(items) || !/fitFont\(/.test(items)) {
    throw new Error('참여자 선택 칩이 두 줄 표기를 쓰지 않습니다.');
  }
  const css = readFileSync(resolve(ROOT, 'app/globals.css'), 'utf8');
  if (!/\.mchip \.nm/.test(css)) throw new Error('두 줄 이름 스타일이 없습니다.');
  return '괄호 분리 · (미등록) 예외 · 크기 축소 하한 · 칩 적용';
});

check('잔액 목록에 서버 번호가 보인다', () => {
  const bal = readFileSync(resolve(ROOT, 'components/BalanceTab.tsx'), 'utf8');
  if (!/memberInfo/.test(bal)) throw new Error('멤버DB의 서버 정보를 읽지 않습니다.');
  if (!/className="svr"/.test(bal)) throw new Error('서버 배지를 그리지 않습니다.');
  // 이름 비교는 반드시 정규화를 거쳐야 한다 (규칙 4)
  if (!/normName\(/.test(bal)) throw new Error('이름을 _normName 없이 비교합니다.');
  const css = readFileSync(resolve(ROOT, 'app/globals.css'), 'utf8');
  if (!/\.row-name \.svr/.test(css)) throw new Error('서버 배지 스타일이 없습니다.');
  return '멤버DB 서버 · 정규화 비교 · 배지 스타일';
});

check('새로고침 버튼이 화면에 있다', () => {
  const app = readFileSync(resolve(ROOT, 'components/App.tsx'), 'utf8');
  if (!/className=\{'sync'/.test(app)) throw new Error('헤더에 새로고침 버튼이 없습니다.');
  if (!/aria-label=\{t\('c\.refresh'\)\}/.test(app)) throw new Error('새로고침 버튼에 라벨이 없습니다.');
  const css = readFileSync(resolve(ROOT, 'app/globals.css'), 'utf8');
  if (!/button\.sync/.test(css)) throw new Error('새로고침 버튼 스타일이 없습니다.');
  if (!/prefers-reduced-motion[\s\S]{0,200}?button\.sync/.test(css)) {
    throw new Error('회전 애니메이션에 prefers-reduced-motion 예외가 없습니다.');
  }
  return '버튼 · 라벨 · 스타일 · 모션 예외';
});

check('확인 문구는 어느 언어에서도 번역되지 않는다', () => {
  // danger:3 도구는 사용자가 정해진 문구를 **정확히** 입력해야 실행된다.
  // 그 문구가 번역되면 서버 비교가 영원히 실패한다 (CLAUDE.md 규칙 5).
  const phrases = [...gs.matchAll(/confirm:\s*'([^']+)'/g)].map((m) => m[1]);
  if (phrases.length < 3) throw new Error(`danger:3 확인 문구를 찾지 못했습니다 (${phrases.length}개).`);

  const dictSrc = readFileSync(resolve(ROOT, 'lib/i18n.tsx'), 'utf8');
  const inDict = phrases.filter((p) => dictSrc.includes(`'${p}'`) || dictSrc.includes(`, '${p}',`));
  if (inDict.length) throw new Error(`사전에 들어간 확인 문구: ${inDict.join(', ')}`);

  // 앱은 서버가 준 confirm 문구를 그대로 보여주고 그대로 되돌려보내야 한다
  const tools = readFileSync(resolve(ROOT, 'components/ToolsCard.tsx'), 'utf8');
  if (!/confirmText:\s*confirmText(?:\.trim\(\))?,/.test(tools)) {
    throw new Error('ToolsCard 가 사용자가 입력한 문구를 그대로 보내지 않습니다.');
  }
  return `확인 문구 ${phrases.length}개 · 번역 대상 아님`;
});

check('사전에 세 언어가 모두 채워져 있다', () => {
  const src = readFileSync(resolve(ROOT, 'lib/i18n.tsx'), 'utf8');
  const dict = src.slice(src.indexOf('const DICT'), src.indexOf('/* ────────────────────────── 컨텍스트'));

  // "'키': ['한국어', '중문', '영문']" — 세 칸이 다 찼는지 본다
  const entries = [...dict.matchAll(/'([\w.]+)':\s*\[/g)].map((m) => m[1]);
  if (entries.length < 150) throw new Error(`사전 항목이 너무 적습니다 (${entries.length}개) — 누락 가능성`);

  const bad = [];
  const re = /'([\w.]+)':\s*\[\s*([\s\S]*?)\s*\],?\n/g;
  let m;
  while ((m = re.exec(dict)) !== null) {
    const parts = m[2].split(/',\s*\n?\s*'/);
    if (parts.length !== 3) { bad.push(`${m[1]} (${parts.length}개 언어)`); continue; }
    const [, zh, en] = parts.map((x) => x.replace(/^'|'$/g, '').trim());
    if (!zh) bad.push(m[1] + ' (중문 비어있음)');
    if (!en) bad.push(m[1] + ' (영문 비어있음)');
    if (/[가-힣]/.test(en)) bad.push(m[1] + ' (영문에 한글)');
  }
  if (bad.length) throw new Error(`언어가 빠진 항목: ${bad.slice(0, 10).join(', ')}`);
  return `${entries.length}개 항목 × 3개 언어`;
});

check('화면에 한국어가 직접 박혀 있지 않다', () => {
  // 언어를 바꿔도 안 바뀌는 문구가 생기지 않도록, JSX 텍스트/라벨에 한글이
  // 그대로 들어간 곳을 잡는다. 주석과 CSS 클래스는 대상이 아니다.
  const files = readdirSync(resolve(ROOT, 'components'))
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => ['components/' + f, readFileSync(resolve(ROOT, 'components', f), 'utf8')]);

  const stripComments = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  const bad = [];
  for (const [path, raw] of files) {
    const src = stripComments(raw);
    src.split('\n').forEach((line, i) => {
      // 한글이 없으면 통과
      if (!/[가-힣]/.test(line)) return;
      // 사전 키로 감싼 호출·데이터 비교용 상수는 허용한다
      const allowed =
        /_normName|'다이아'|'합계'|'분배완료'|startsWith\('💰'\)|'한국어'|DEFAULT_APP_NAME/.test(line);
      if (allowed) return;
      bad.push(`${path}:${i + 1}  ${line.trim().slice(0, 60)}`);
    });
  }
  if (bad.length) {
    throw new Error(`화면에 직접 쓰인 한국어 ${bad.length}곳 →\n     ` + bad.slice(0, 12).join('\n     '));
  }
  return `${files.length}개 컴포넌트 · 하드코딩 0`;
});

/* ────────────────────────────────────────────── */

console.log(`\n🔍 ${GS_PATH.replace(ROOT + '/', '')} + app/api + 화면 문구 검사\n`);
notes.forEach((n) => console.log(n));

if (failures.length) {
  console.log('\n실패한 검사:\n');
  failures.forEach((f) => console.log(f));
  console.log(`\n❌ ${failures.length}건 실패 — 구글시트에 붙여넣지 마세요.\n`);
  process.exit(1);
}

console.log(`\n✅ ${notes.length}건 전부 통과 — 붙여넣어도 됩니다.\n`);
