/**
 * Apps Script(.gs) 안전 검사 — `npm run verify:gs`
 *
 * 이 파일이 존재하는 이유: .gs 는 3,500줄이 넘고 구글시트에 붙여넣기 전까지
 * 아무도 실행해보지 않는다. 문법 오류 하나가 "저장은 됐는데 정산이 안 되는"
 * 상태로 바로 이어진다. 그래서 붙여넣기 전에 여기서 전부 걸러낸다.
 *
 * 검사 항목은 아래 CHECKS 배열이 전부다. 새 규칙이 생기면 여기에 추가하면 된다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GS_PATH = resolve(ROOT, 'apps-script/GuildManager_v11_3.gs');
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

check('버전이 다섯 곳에서 같다 (.gs · 파일명 · package.json · 앱 · 모의 시트)', () => {
  // 화면 상단에 버전을 띄우고 시트 버전과 대조하므로, 앱이 아는 값이 틀리면
  // 멀쩡한 배포에도 "버전 불일치" 경고가 뜬다. 네 곳을 한 번에 묶어둔다.
  const gsVer = gs.match(/const VERSION = '([\d.]+)'/)?.[1];
  const fromName = GS_PATH.match(/_v(\d+)_(\d+)\.gs$/);
  const nameVer = fromName ? `${fromName[1]}.${fromName[2]}` : null;
  const appVer = readFileSync(resolve(ROOT, 'lib/version.ts'), 'utf8').match(/APP_VERSION = '([\d.]+)'/)?.[1];
  const pkgVer = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version;

  if (!gsVer) throw new Error('.gs 의 VERSION 상수를 찾을 수 없습니다.');
  if (!appVer) throw new Error('lib/version.ts 의 APP_VERSION 을 찾을 수 없습니다.');

  // 모의 시트가 옛 버전을 내주면 E2E 가 "실어 온 상태의 버전이 다르다"로
  // 엉뚱하게 실패한다. 실제로 겪었으므로 같이 묶어둔다.
  const mockVer = readFileSync(resolve(ROOT, 'scripts/mock-sheet.mjs'), 'utf8')
    .match(/const GS_VERSION = '([\d.]+)'/)?.[1];
  if (!mockVer) throw new Error('모의 시트의 GS_VERSION 을 찾을 수 없습니다.');

  const seen = { '.gs': gsVer, '파일명': nameVer, 'lib/version.ts': appVer, 'package.json': pkgVer, '모의 시트': mockVer };
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

  /*
   * ★ 시트를 건드리지 않는 화면 수정은 세 번째 자리만 올린다 (10.8 → 10.8.1).
   *   그때 헤더가 "시트가 옛 버전"이라고 경고하면 안 된다 — 멀쩡한 시트를
   *   다시 붙여넣게 만드는 거짓 경고다. 앞 두 자리로만 비교하는지 확인한다.
   */
  const appSrc = readFileSync(resolve(ROOT, 'components/App.tsx'), 'utf8');
  const cmp = (appSrc.match(/const versionMismatch = [^;]+;/) ?? [''])[0];
  if (!cmp) throw new Error('App.tsx 에서 버전 대조를 찾지 못했습니다.');
  if (/sheetVersion !== APP_VERSION/.test(cmp)) {
    throw new Error('버전을 전체 자리로 비교합니다 — 앱만 패치해도 시트 경고가 뜹니다.');
  }
  if (!/short\(/.test(cmp)) throw new Error('버전 비교가 앞 두 자리로 줄여지지 않습니다.');

  return `v${gsVer} (5곳 일치, 앱 v${appVer}) · 패치 자리는 경고 없음`;
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
    'alliance', 'addAlliance', 'creditAlliance', 'deleteAlliance', 'countPhoto',
    'editItem',
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
  for (const fn of ['_uiAdapter', '_adapterResult', '_toolRegistry', '_toolNeedsMaster', 'api_getTools', 'api_runTool']) {
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

check('되돌릴 수 없는 작업은 마스터관리자에게만 열린다', () => {
  // 마스터는 관리자의 상위 등급이다. 되돌릴 수 없는 것(시즌종료·이관·설치·초기화)과
  // 관리자가 잘못 만진 것을 바로잡는 것(정정·삭제·지급취소)은 마스터 몫이다.

  // ① 시트: 어떤 도구가 마스터 전용인지 알려줘야 앱·라우트가 판정할 수 있다
  if (!/function _toolNeedsMaster/.test(gs)) throw new Error('_toolNeedsMaster 가 없습니다.');
  const need = (gs.match(/function _toolNeedsMaster[\s\S]*?\n\}/) ?? [''])[0];
  if (!/tool\.danger >= 3/.test(need)) throw new Error('위험도 3 을 마스터 전용으로 보지 않습니다.');
  const getTools = (gs.match(/function api_getTools[\s\S]*?\n\}/) ?? [''])[0];
  if (!/master: _toolNeedsMaster\(t\)/.test(getTools)) throw new Error('도구 목록에 master 플래그가 없습니다.');

  // 위험도 3 도구가 실제로 있어야 이 검사가 의미가 있다
  const reg = (gs.match(/function _toolRegistry[\s\S]*?\n\}\n/) ?? [''])[0];
  const d3 = (reg.match(/danger: 3/g) ?? []).length;
  if (d3 < 3) throw new Error(`위험도 3 도구가 너무 적습니다 (${d3}개) — 분류가 어긋났을 수 있습니다.`);

  // ② 라우트: 마스터 판정을 **서버가** 한다
  const tools = readFileSync(resolve(ROOT, 'app/api/admin/tools/route.ts'), 'utf8');
  if (!/requireMaster\(\)/.test(tools)) throw new Error('도구 실행이 마스터를 요구하지 않습니다.');
  // ★ 앱이 보낸 값으로 판정하면 앱을 고쳐서 우회할 수 있다
  if (!/callGas\('tools'\)/.test(tools)) throw new Error('도구 등급을 시트에 물어보지 않습니다.');
  if (/body\.(danger|master)/.test(tools)) throw new Error('앱이 보낸 등급으로 판정합니다 — 우회 가능합니다.');
  // 목록을 못 받아오면 막는 쪽으로 판단해야 한다
  if (!/if \(!res\.ok \|\| !Array\.isArray\(res\.data\)\) return true;/.test(tools)) {
    throw new Error('도구 목록 조회 실패 시 통과시킵니다 — 막는 쪽이어야 합니다.');
  }
  if (!/if \(!tool\) return true;/.test(tools)) throw new Error('모르는 도구를 통과시킵니다.');

  const items = readFileSync(resolve(ROOT, 'app/api/admin/items/route.ts'), 'utf8');
  if (!/op === 'correct' \|\| op === 'delete'[\s\S]{0,120}?requireMaster\(\)/.test(items)) {
    throw new Error('정정·삭제가 마스터를 요구하지 않습니다.');
  }
  const undo = readFileSync(resolve(ROOT, 'app/api/admin/payout-undo/route.ts'), 'utf8');
  const undoPost = (undo.match(/export async function POST[\s\S]*?\n\}/) ?? [''])[0];
  if (!/requireMaster\(\)/.test(undoPost)) throw new Error('지급 취소가 마스터를 요구하지 않습니다.');

  // ③ 앱: 관리자에게는 **아예 보이지 않아야** 한다.
  //    잠긴 버튼을 남겨두면 "왜 안 되냐"를 묻게 되고, 되돌릴 수 없는 작업이
  //    목록에 계속 보이는 것 자체가 실수를 부른다.
  const tc = readFileSync(resolve(ROOT, 'components/ToolsCard.tsx'), 'utf8');
  if (!/master: boolean/.test(tc)) throw new Error('ToolsCard 가 마스터 여부를 받지 않습니다.');
  if (!/const visible = \(tools \?\? \[\]\)\.filter/.test(tc)) {
    throw new Error('마스터 전용 도구를 목록에서 걸러내지 않습니다.');
  }
  if (!/master \|\| !\(tl\.master === true \|\| tl\.danger >= 3\)/.test(tc)) {
    throw new Error('걸러내는 기준이 마스터 전용 판정과 다릅니다.');
  }
  // 걸러낸 목록으로 그려야 의미가 있다 — 원본을 그대로 돌리면 다시 보인다
  if (/tools\.map\(/.test(tc)) throw new Error('ToolsCard 가 걸러내지 않은 원본 목록을 그립니다.');
  if (!/\{master \? \(/.test(tc)) throw new Error('지급 취소 구역이 관리자에게 그대로 보입니다.');

  const itemsTab = readFileSync(resolve(ROOT, 'components/ItemsTab.tsx'), 'utf8');
  if (!/\{master \? \(\s*<LedgerCard/.test(itemsTab)) {
    throw new Error('정정·삭제 카드가 관리자에게 보입니다 — 카드째로 감춰야 합니다.');
  }
  const lc = readFileSync(resolve(ROOT, 'components/LedgerCard.tsx'), 'utf8');
  if (/disabled=\{!master\}/.test(lc)) {
    throw new Error('정정·삭제가 아직 "잠금" 방식입니다 — 감추는 방식이어야 합니다.');
  }

  return `위험도3 도구 ${d3}개 · 정정·삭제·지급취소 · 시트 판정 · 실패 시 차단 · 관리자에게 비표시`;
});

check('마스터 PIN: 공백이 붙어도 통하고, 관리자 PIN 과 같으면 거부한다', () => {
  // "MASTER_PIN 을 넣었는데 로그인이 안 된다" 는 실제로 겪은 문제다.
  // 원인은 둘 중 하나였다 — 붙여넣을 때 딸려온 공백, 또는 ADMIN_PIN 과 같은 값.
  // 화면에는 "PIN이 올바르지 않습니다"만 뜨므로 스스로 알아낼 방법이 없었다.
  const src = readFileSync(resolve(ROOT, 'lib/auth.ts'), 'utf8');
  if (!/function envPin/.test(src)) throw new Error('환경변수 PIN 을 다듬는 경로가 없습니다.');
  if (!/String\(process\.env\[name\] \?\? ''\)\.trim\(\)/.test(src)) {
    throw new Error('환경변수 PIN 의 앞뒤 공백을 털어내지 않습니다.');
  }
  for (const fn of ['verifyMasterPin', 'verifyPin']) {
    const body = (src.match(new RegExp(`export async function ${fn}[\\s\\S]*?\\n\\}`)) ?? [''])[0];
    if (/process\.env\.(MASTER_PIN|ADMIN_PIN)/.test(body)) {
      throw new Error(`${fn} 이 환경변수를 다듬지 않고 직접 씁니다.`);
    }
    if (!/String\(pin \?\? ''\)\.trim\(\)/.test(body)) {
      throw new Error(`${fn} 이 입력값의 공백을 털어내지 않습니다.`);
    }
  }
  // 같은 값이면 마스터로 인정하지 않는다 — 등급을 나눈 의미가 없어지므로
  const vm2 = (src.match(/export async function verifyMasterPin[\s\S]*?\n\}/) ?? [''])[0];
  if (!/if \(expected === envPin\('ADMIN_PIN'\)\) return false;/.test(vm2)) {
    throw new Error('마스터 PIN 이 관리자 PIN 과 같아도 통과시킵니다.');
  }

  // 로그인 라우트도 입력을 다듬어야 한다 (폰 키보드가 공백을 붙인다)
  const login = readFileSync(resolve(ROOT, 'app/api/admin/login/route.ts'), 'utf8');
  if (!/String\(body\.pin \?\? ''\)\.trim\(\)/.test(login)) {
    throw new Error('로그인 라우트가 입력 PIN 을 다듬지 않습니다.');
  }
  // 마스터 판정이 반드시 먼저여야 한다 — 뒤에 있으면 관리자로 먼저 통과해버린다
  if (login.indexOf('verifyMasterPin') > login.indexOf('verifyPin(pin)')) {
    throw new Error('마스터 판정이 관리자 판정보다 뒤에 있습니다.');
  }

  // ★ 스스로 진단할 수 있어야 한다 — 값은 내보내지 않고 원인만
  if (!/export function masterDiagnosis/.test(src)) throw new Error('마스터 PIN 진단 경로가 없습니다.');
  const health = readFileSync(resolve(ROOT, 'app/api/health/route.ts'), 'utf8');
  if (!/masterDiagnosis\(\)/.test(health)) throw new Error('health 가 진단 결과를 보여주지 않습니다.');
  if (!/sameAsAdmin/.test(health)) throw new Error('health 가 "관리자 PIN 과 같음"을 알려주지 않습니다.');
  // 값 자체가 새 나가면 안 된다
  if (/process\.env\.(MASTER_PIN|ADMIN_PIN)(?!\s*\?\?|\s*\))/.test(health.replace(/Boolean\([^)]*\)/g, ''))) {
    throw new Error('health 가 PIN 값을 그대로 노출할 수 있습니다.');
  }
  // ★ 폰에서 실제로 입력할 수 있어야 한다.
  //   inputMode="numeric" 이면 숫자 키패드만 떠서, 문자가 섞인 PIN 은
  //   아무리 정확히 알아도 입력할 방법이 없다 (마스터 PIN 이 그런 경우였다).
  const adm = readFileSync(resolve(ROOT, 'components/AdminTab.tsx'), 'utf8');
  const pinInput = (adm.match(/<input\s+id="pin"[\s\S]*?\/>/) ?? [''])[0];
  if (!pinInput) throw new Error('PIN 입력칸을 찾지 못했습니다.');
  if (/inputMode="numeric"/.test(pinInput)) {
    throw new Error('PIN 칸이 숫자 키패드로 고정돼 있습니다 — 문자가 섞인 PIN 을 폰에서 입력할 수 없습니다.');
  }
  // iOS 는 첫 글자를 대문자로 바꾼다. PIN 은 대소문자를 가리므로 그것만으로 실패한다
  if (!/autoCapitalize="off"/.test(pinInput)) throw new Error('PIN 칸이 자동 대문자를 끄지 않습니다.');
  if (!/autoCorrect="off"/.test(pinInput)) throw new Error('PIN 칸이 자동 수정을 끄지 않습니다.');
  // 무엇을 입력했는지 볼 수 없으면 오타인지 PIN 이 틀린 건지 구분할 수 없다
  if (!/className="pin-eye"/.test(adm)) throw new Error('PIN 보기 전환 버튼이 없습니다.');

  // ★ 비밀번호 관리자가 저장된 관리자 PIN 을 덮어쓰면 마스터 PIN 이 영원히 통하지 않는다.
  //   (눈 버튼으로 text 로 바꿨을 때만 되던 것이 정확히 이 증상이었다)
  if (/autoComplete="current-password"/.test(pinInput)) {
    throw new Error('PIN 칸이 저장된 비밀번호 자동채움을 허용합니다 — 마스터 PIN 이 덮어써집니다.');
  }
  if (!/autoComplete="new-password"/.test(pinInput)) {
    throw new Error('PIN 칸이 자동채움을 막지 않습니다.');
  }
  // 눈에 보이는 값이 곧 보내는 값이어야 한다
  if (!/pinRef\.current\?\.value \?\? pin/.test(adm)) {
    throw new Error('로그인이 화면에 실제로 들어 있는 값을 보내지 않습니다.');
  }

  return '공백 제거(양쪽) · 동일값 거부 · 마스터 우선 · 값 없는 진단 · 폰 입력 · 자동채움 차단';
});

check('앱 이름은 두 줄까지 되고, 헤더가 밀리지 않는다', () => {
  // 이름이 길면 헤더에서 저절로 줄이 바뀌는데 어디서 끊길지는 화면 폭이 정한다.
  // 마스터가 직접 끊을 자리를 정할 수 있어야 한다.
  const gsFn = (gs.match(/function api_setAppName[\s\S]*?\n\}/) ?? [''])[0];
  if (!/split\('\\n'\)/.test(gsFn)) throw new Error('시트가 줄바꿈을 처리하지 않습니다.');
  if (!/APP_NAME_MAX/.test(gsFn)) throw new Error('길이 상한이 상수로 잡혀 있지 않습니다.');
  // 세 줄 이상은 헤더를 밀어내므로 눕혀야 한다
  if (!/lines\.slice\(1\)\.join\(' '\)/.test(gsFn)) {
    throw new Error('세 줄 이상 입력을 두 줄로 눕히지 않습니다.');
  }

  const route = readFileSync(resolve(ROOT, 'app/api/master/route.ts'), 'utf8');
  if (!/split\('\\n'\)\.length > 2/.test(route)) throw new Error('라우트가 줄 수를 제한하지 않습니다.');

  const card = readFileSync(resolve(ROOT, 'components/MasterCard.tsx'), 'utf8');
  if (!/<textarea/.test(card)) throw new Error('앱 이름 칸이 줄바꿈을 받지 못합니다.');
  if (!/function limitLines/.test(card)) throw new Error('앱에서 줄 수를 제한하지 않습니다.');

  // 헤더: 높이를 고정하면 둘째 줄이 아래 내용을 덮는다
  const css = readFileSync(resolve(ROOT, 'app/globals.css'), 'utf8');
  const header = (css.match(/\.header \{[\s\S]*?\}/) ?? [''])[0];
  if (/\n\s{2}height:/.test(header)) throw new Error('헤더 높이가 고정돼 있습니다 — 두 번째 줄이 가려집니다.');
  if (!/min-height:/.test(header)) throw new Error('헤더에 최소 높이가 없습니다.');
  if (!/white-space: pre-line/.test(css)) throw new Error('줄바꿈이 화면에 반영되지 않습니다.');
  // 제목이 길어도 오른쪽 칩(새로고침·시즌)은 눌러야 하므로 줄어들면 안 된다
  const meta = (css.match(/\.header \.meta \{[\s\S]*?\}/) ?? [''])[0];
  if (!/flex: none/.test(meta)) throw new Error('제목이 길면 헤더 칩이 찌그러집니다.');
  return '시트·라우트·앱 3중 제한 · 헤더 가변 높이 · 칩 보호';
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
  // 결과 코드는 시트만 만드는 게 아니다 — 서버 라우트(로그인 등)도 만든다.
  // 양쪽을 다 모아야 "사전에만 있는 항목"을 잘못 잡아내지 않는다.
  for (const [, src] of Object.entries(routes)) {
    for (const m of src.matchAll(new RegExp("\\bcode:\\s*" + CODE, 'g'))) codes.add(m[1]);
  }
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

  // ★ 한자는 획이 빽빽해서 조금만 줄여도 뭉개지고, 대비를 세게 올리면
  //   획 사이가 메워져 통글자가 된다. '읽기'용과 '세기'용을 구분해야 한다.
  const client = readFileSync(resolve(ROOT, 'lib/client.ts'), 'utf8');
  const prep = (client.match(/export async function prepPhoto[\s\S]*?\n\}/) ?? [''])[0];
  if (!prep) throw new Error('prepPhoto 를 찾지 못했습니다.');
  if (!/mode: PhotoMode/.test(prep)) throw new Error('읽기용·세기용을 구분하지 않습니다.');

  const readMax = Number((prep.match(/mode === 'text' \? (\d+) : \d+/) ?? [])[1] ?? 0);
  if (readMax < 2000) throw new Error(`이름을 읽는 사진을 ${readMax}px 로 줄입니다 — 한자가 뭉개집니다.`);
  // 대비를 세게 주면 획이 붙는다. 읽기용은 부드러워야 한다.
  const readFilter = (prep.match(/mode === 'text' \? '([^']+)'/g) ?? []).join(' ');
  const readContrast = Number((readFilter.match(/contrast\((\d+)%\)/) ?? [])[1] ?? 999);
  if (readContrast > 130) throw new Error(`읽기용 대비가 ${readContrast}% 입니다 — 한자 획이 서로 붙습니다.`);
  // 작게 찍힌 화면은 오히려 키워야 읽힌다
  if (!/minDim/.test(prep)) throw new Error('작은 사진을 키우는 경로가 없습니다.');
  // 해상도를 올린 만큼 용량 상한을 스스로 맞춰야 한다 (안 그러면 원인 모를 실패)
  if (!/LIMIT/.test(prep)) throw new Error('용량 상한을 맞추는 경로가 없습니다.');
  // 세기용은 예전 값을 유지 (줄 수만 세면 되므로 강한 보정이 유리하다)
  if (!/contrast\(160%\)/.test(prep)) throw new Error('세기용 강한 보정이 사라졌습니다.');

  const ali = readFileSync(resolve(ROOT, 'components/AllianceTab.tsx'), 'utf8');
  if (!/prepPhoto\(file, 'count'\)/.test(ali)) throw new Error('연합 인원수 세기가 읽기용 보정을 씁니다.');

  return `읽기 ${readMax}px/대비 ${readContrast}% · 세기 별도 · 확대·용량 자동 조절`;
});

check('OCR 은 한자를 놓친 결과를 더 좋게 보지 않는다', () => {
  // 글자 수로만 비교하면 한글 패스가 한자 줄을 통째로 놓치고도 이겨버린다.
  // 실제로 그래서 "한자 인식률이 낮다" 는 문제가 있었다.
  const ctx = vm.createContext({});
  vm.runInContext((gs.match(/function _ocrScore[\s\S]*?\n\}/) ?? [''])[0], ctx);
  const score = (txt) => { ctx.__t = txt; return vm.runInContext('_ocrScore(__t)', ctx); };

  // 한글만 길게 읽은 결과 vs 한자를 제대로 읽은 짧은 결과
  const koOnly = '가이\n팩맨\n향로셔틀\n마녀\n야수\n비타민';       // 한자 0개
  const withHan = '가이\n鮮肉小籠包\n金豆握着奶\n曲终人散';          // 한자 13개
  if (!(score(withHan) > score(koOnly))) {
    throw new Error(`한자를 읽은 결과가 더 낮게 평가됩니다 (${score(withHan)} vs ${score(koOnly)}).`);
  }

  const multi = (gs.match(/function _ocrImageMulti[\s\S]*?\n\}\n/) ?? [''])[0];
  // ★ 예전의 "40자 넘으면 그만" 은 한글만으로도 쉽게 넘어서 한자 패스를 건너뛰었다
  if (/>= 40/.test(multi)) throw new Error('글자 수만 보고 다음 언어를 건너뜁니다.');
  if (!/\['ko', 'zh-CN'\]\.forEach/.test(multi)) throw new Error('한글·한자 패스를 항상 돌리지 않습니다.');
  if (!/_ocrScore\(/.test(multi)) throw new Error('점수로 고르지 않습니다.');
  return `한자 가중치 확인 (${score(withHan)} > ${score(koOnly)}) · 두 패스 항상 실행`;
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

check('명단의 [혈맹·서버] 표시는 이름에서 떼어내되, 애매하면 지어내지 않는다', () => {
  // 게임 명단을 찍으면 `참관K[어레02] +` 처럼 나온다. 그대로 넣으면 멤버DB에
  // 태그째로 들어가고, 이후 인증샷 OCR 은 `참관K` 로 읽으므로 영원히 매칭되지 않는다.
  const m = gs.match(/function _stripNameTag[\s\S]*?\n\}/);
  if (!m) throw new Error('_stripNameTag 가 없습니다.');
  const ctx = vm.createContext({});
  vm.runInContext(m[0], ctx);
  const strip = (v) => { ctx.__v = v; return vm.runInContext('_stripNameTag(__v)', ctx); };

  const cases = [
    // 잘 닫힌 대괄호 + 친구추가 '+'
    ['참상혼K[어레이2] +', '참상혼K'],
    ['참관K[어레02] +', '참관K'],
    ['참살K[어레이2]', '참살K'],
    ['[어레02] 참관K', '참관K'],
    // ★ 소괄호는 절대 건드리지 않는다 — 한자 표기가 사라진다
    ['잠단 (斬斷)', '잠단 (斬斷)'],
    ['선륙소농포 (鮮肉小籠包) [어레02]', '선륙소농포 (鮮肉小籠包)'],
    // 여는 대괄호가 OCR 에서 떨어져 나간 꼬리 — 뒤 토막만 버린다
    ['노왕계색마재 어레02]', '노왕계색마재'],
    // ★ 그 토막이 첫 토막이면 손대지 않는다. 지우면 이름 쪽을 지우게 된다.
    ['곡중인산K02] 관', '곡중인산K02] 관'],
    // 이름 안의 '+' 는 남긴다 (홀로 선 것만 화면 기호로 본다)
    ['A+B', 'A+B'],
    ['가이', '가이'],
    ['', ''],
  ];
  for (const [input, want] of cases) {
    const got = strip(input);
    if (got !== want) throw new Error(`_stripNameTag(${JSON.stringify(input)}) = ${JSON.stringify(got)} (기대 ${JSON.stringify(want)})`);
  }

  // 판정이 실제로 이걸 쓰고, 떼어내지 못한 대괄호는 '확인 필요'로 넘긴다 (규칙 7)
  const analyze = (gs.match(/function api_analyzeMembers[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!/_stripNameTag\(raw\)/.test(analyze)) throw new Error('판정이 태그를 떼어내지 않습니다.');
  if (!/\/\[\\\[\\\]\]\/\.test\(name\)[\s\S]{0,120}?status: 'invalid'/.test(analyze)) {
    throw new Error("대괄호가 남은 줄을 '확인 필요'로 넘기지 않습니다 — 태그째로 등록됩니다.");
  }
  // ★ 원문(raw)은 그대로 함께 돌려줘야 한다. 무엇을 떼어냈는지 관리자가 봐야 한다.
  if (!/raw: raw, name: name/.test(analyze)) throw new Error('원문을 함께 돌려주지 않습니다.');
  const bulk = readFileSync(resolve(ROOT, 'components/BulkMemberSheet.tsx'), 'utf8');
  if (!/r\.raw\.trim\(\) !== r\.name/.test(bulk) || !/bulk\.cleaned/.test(bulk)) {
    throw new Error('떼어낸 줄의 원문을 화면에 보여주지 않습니다 — 조용히 바뀌면 알 수 없습니다.');
  }

  // 모의 시트도 같은 규칙이어야 E2E 가 진짜 동작을 검사한다
  const mock = readFileSync(resolve(ROOT, 'scripts/mock-sheet.mjs'), 'utf8');
  const mm = mock.match(/function stripTag[\s\S]*?\n\}/);
  if (!mm) throw new Error('모의 시트에 같은 규칙이 없습니다.');
  const ctx2 = vm.createContext({});
  vm.runInContext(mm[0], ctx2);
  for (const [input, want] of cases) {
    ctx2.__v = input;
    const got = vm.runInContext('stripTag(__v)', ctx2);
    if (got !== want) throw new Error(`모의 시트가 다르게 떼어냅니다: ${JSON.stringify(input)} → ${JSON.stringify(got)}`);
  }

  // 서버는 이름이 아니라 상단에서 고른다 — 드롭다운은 칩으로 바뀌었다
  if (/<select[^>]*id="bulkSv"/.test(bulk)) throw new Error('서버 지정이 아직 드롭다운입니다.');
  if (!/<ServerPicker[\s\S]{0,160}?id="bulkSv"/.test(bulk)) throw new Error('서버를 고를 칩이 없습니다.');

  return `떼어내기 ${cases.length}케이스 (시트·모의 동일) · 확인필요 처리 · 원문 표시 · 서버 칩`;
});

check('기록 가져오기는 고르는 자리에서만 하고, 아이디 칸으로는 못 합친다', () => {
  const ros = readFileSync(resolve(ROOT, 'components/RosterCard.tsx'), 'utf8');

  // ① 아이디 칸에 이미 있는 이름을 치면 막는다 (v10.9.1).
  //    예전에는 곧바로 "합칠까요?" 가 떠서, 오타 하나로 두 사람 잔액이 합쳐질 수 있었다.
  if (!/const taken = changed/.test(ros)) throw new Error('아이디 중복 검사가 없습니다.');
  if (!/normName\(m\.name\) === normName\(trimmed\)/.test(ros)) {
    throw new Error('아이디 중복을 _normName 없이 비교합니다 (규칙 4).');
  }
  if (!/const dirty = \(changed && !taken\)/.test(ros)) {
    throw new Error('중복 아이디인데도 저장 버튼이 살아 있습니다.');
  }
  if (!/ros\.idTaken/.test(ros)) throw new Error('왜 막혔는지 알려주지 않습니다.');

  // ② 가져올 후보에서 자기 자신과 혈비를 뺀다.
  //    자신을 고르는 것은 뜻이 없고, 혈비는 사람이 아니라 길드의 금고다.
  const cand = (ros.match(/const candidates = useMemo\([\s\S]*?\n  \);/) ?? [''])[0];
  if (!cand) throw new Error('가져올 후보 목록이 없습니다.');
  if (!/!m\.isFund/.test(cand)) throw new Error('혈비 계정을 후보에서 빼지 않습니다.');
  if (!/normName\(m\.name\) !== normName\(member\.name\)/.test(cand)) {
    throw new Error('자기 자신을 후보에서 빼지 않습니다.');
  }

  // ③ 서버가 되묻기 전에는 절대 실행하지 않는다 (규칙 5-1).
  //    앱이 confirmMerge 를 임의로 채우면 안전장치가 통째로 무력화된다.
  const pull = (ros.match(/async function pull\([\s\S]*?\n  \}/) ?? [''])[0];
  if (!pull) throw new Error('가져오기 실행 함수가 없습니다.');
  if (!/confirmMerge,/.test(pull) || /confirmMerge: true/.test(pull)) {
    throw new Error('가져오기가 확인값을 임의로 채웁니다.');
  }
  if (!/res\.needsConfirm/.test(pull)) throw new Error('서버의 되묻기를 무시합니다.');
  if (!/void pull\(m, false\)/.test(ros)) throw new Error('처음부터 확인 없이 실행합니다.');
  // 확인 화면의 실행 버튼이 실제로 가져오기를 부르는지
  if (!/from \? pull\(from, true\) : save\(true\)/.test(ros)) {
    throw new Error('확인 뒤에 가져오기가 실행되지 않습니다.');
  }
  // 따라올 금액을 후보마다 보여준다 — 이걸 보고 같은 사람인지 판단한다
  if (!/fmt\(m\.pending\)/.test(ros)) throw new Error('후보의 따라올 금액을 보여주지 않습니다.');

  // ④ 추가 입구는 하나다 (v10.9.1). 같은 일을 하는 버튼이 둘이면 무엇이 다른지 묻게 된다.
  if (/AddSheet/.test(ros)) throw new Error('한 명 추가 전용 화면이 남아 있습니다.');
  const addBtns = (ros.match(/onClick=\{\(\) => setBulk\(true\)\}/g) ?? []).length;
  if (addBtns !== 1) throw new Error(`추가 버튼이 ${addBtns}개입니다 — 하나여야 합니다.`);

  const dict = readFileSync(resolve(ROOT, 'lib/i18n.tsx'), 'utf8');
  const used = new Set([...ros.matchAll(/t\('(ros\.pull[\w.]*|ros\.idTaken)'/g)].map((m) => m[1]));
  const missing = [...used].filter((k) => !dict.includes(`'${k}':`));
  if (missing.length) throw new Error(`사전에 없는 문구: ${missing.join(', ')}`);

  return `중복 아이디 차단 · 후보에서 본인/혈비 제외 · 되묻기 유지 · 추가 입구 1개 · 문구 ${used.size}개`;
});

check('개명 병합이 멤버DB에 같은 이름을 두 줄 남기지 않는다', () => {
  // "먼저 신규로 넣어두고 나중에 옛 아이디에서 불러오는" 흐름에서 늘 생긴다.
  // 잔액은 예전에도 합쳐졌지만 멤버DB에 옛 행이 이름만 바뀐 채 남아,
  // 명단·참여자 칩에 한 사람이 두 번 보였다 (CLAUDE.md 규칙 4 의 그 증상).
  const core = (gs.match(/function _renameCore[\s\S]*?\n\}/) ?? [''])[0];
  if (!core) throw new Error('_renameCore 가 없습니다.');
  if (!/db\.deleteRow\(oldRow\)/.test(core)) {
    throw new Error('병합할 때 옛 멤버DB 행을 지우지 않습니다 — 같은 이름이 두 줄 남습니다.');
  }
  // ★ 채워져 있는 값을 덮어쓰면 관리자가 명시적으로 넣은 것을 지우게 된다
  if (!/if \(keep\) return;/.test(core)) {
    throw new Error('살아남는 행의 채워진 값을 덮어씁니다.');
  }
  // 비중은 항상 값이 있으므로 옮길 대상이 아니다. 표시명·서버·한자만 옮긴다.
  const moved = (core.match(/MEM_COL\.(DISPLAY|SERVER|HANJA|WEIGHT)/g) ?? []).join(',');
  if (/WEIGHT/.test(moved)) throw new Error('분배비중까지 옮깁니다 — 비중은 살아남는 행의 값을 씁니다.');
  for (const need of ['DISPLAY', 'SERVER', 'HANJA']) {
    if (!moved.includes(need)) throw new Error(`${need} 를 옮기지 않습니다 — 옛 행에만 있던 값이 사라집니다.`);
  }
  // 중복이 아닐 때는 예전처럼 이름만 바꾼다
  if (!/db\.getRange\(oldRow, MEM_COL\.NAME\)\.setValue\(newName\)/.test(core)) {
    throw new Error('중복이 아닌 단순 개명에서 이름을 바꾸지 않습니다.');
  }
  // 이름 비교는 반드시 정규화를 거친다 (규칙 4)
  if (!/_normName\(r\[0\]\)/.test(core)) throw new Error('이름을 _normName 없이 비교합니다.');

  // 잔액 쪽 병합은 예전 그대로여야 한다 — 분배전·분배완료·참여횟수 셋 다 합산
  const rn = (gs.match(/function _renameMember[\s\S]*?\n\}/) ?? [''])[0];
  // (분배전만 옮긴 금액을 따로 담아 메시지에 쓰므로 더하는 항의 모양이 다르다)
  for (const [col, addend] of [['PENDING', 'movedPending'], ['PAID', 'num\\(oldRow'], ['CNT', 'num\\(oldRow']]) {
    if (!new RegExp(`BAL_COL\\.${col}\\)\\.setValue\\(num\\(newRow, BAL_COL\\.${col}\\) \\+ ${addend}`).test(rn)) {
      throw new Error(`병합에서 ${col} 를 합산하지 않습니다.`);
    }
  }
  if (!/bal\.deleteRow\(oldRow\)/.test(rn)) throw new Error('잔액현황의 옛 행을 지우지 않습니다.');

  // 되묻기가 살아 있어야 한다 — 잘못 이으면 두 사람 잔액이 합쳐진다 (규칙 5-1)
  const api = (gs.match(/function api_renameMember[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!/dup && confirmMerge !== true/.test(api)) throw new Error('병합 전에 되묻지 않습니다.');
  if (!/needsConfirm: true/.test(api)) throw new Error('되물을 때 needsConfirm 을 주지 않습니다.');

  return '멤버DB 옛 행 삭제 · 빈 칸만 승계 · 비중 제외 · 잔액 3항목 합산 · 되묻기 유지';
});

check('연합은 등록과 정산이 분리되어 있다', () => {
  // 레이드 직후엔 아직 안 팔려서 금액을 모르는 것이 정상이다.
  // 등록 단계에서 금액을 요구하면 등록 자체가 미뤄져 인증샷을 잃어버린다.
  if (!/function api_addAlliance\(item, entries, photoLinks, email\)/.test(gs)) {
    throw new Error('api_addAlliance 가 아직 금액을 받습니다 — 등록/정산이 분리되지 않았습니다.');
  }
  if (!/function api_creditAlliance\(group, amount, email\)/.test(gs)) {
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

  // 라우터·쓰기목록에 새 액션이 등록됐는지. 인자 이름까지 봐야 한다 —
  // 시그니처만 바꾸고 라우터를 안 고치면 항상 undefined 가 넘어간다.
  if (!/case 'creditAlliance':/.test(gs)) throw new Error('라우터에 creditAlliance 가 없습니다.');
  if (!/api_addAlliance\(req\.item, req\.entries, req\.photoLinks, req\.email\)/.test(gs)) {
    throw new Error('라우터가 api_addAlliance 에 옛 인자를 넘깁니다.');
  }
  if (!/api_creditAlliance\(req\.group, req\.amount, req\.email\)/.test(gs)) {
    throw new Error('라우터가 api_creditAlliance 에 옛 인자를 넘깁니다.');
  }
  if (!/api_deleteAlliance\(req\.group, req\.email\)/.test(gs)) {
    throw new Error('라우터가 api_deleteAlliance 에 옛 인자를 넘깁니다.');
  }
  if (!/'addAlliance', 'creditAlliance'/.test(gs)) throw new Error('creditAlliance 가 쓰기 액션 목록에 없습니다.');

  // v10.2 이하 시트에는 '상태' 열이 없다 — 자동 보정 경로가 있어야 한다
  if (!/function _ensureAllianceHeaders/.test(gs)) throw new Error('옛 연합 시트의 헤더 보정이 없습니다.');
  return '등록(금액 없음) · 정산(락·중복거부) · 미정산 제외 · 라우터 인자 3종 · 옛 시트 보정';
});

check('연합 산식: 다이아 보존 + 앱/시트 이중구현 일치 (v11.0)', () => {
  // 아이템 분배와 같은 이유다 — 확인 화면에서 본 숫자와 실제 결과가 달라지면
  // 사용자는 "어느 쪽이 맞는지" 알 방법이 없다 (CLAUDE.md 규칙 1).
  const gsCtx = vm.createContext({ FUND_RATE: 0.1 });
  vm.runInContext(`${extractFn(gs, '_calcAlliance')}; __a = _calcAlliance;`, gsCtx);
  const gsCalc = gsCtx.__a;

  const from = clientTs.slice(clientTs.indexOf('export function calcAlliance('));
  const jsFn = from
    .slice(0, from.indexOf('\n}') + 2)
    .replace(/export /g, '')
    .replace(/: number\[\]/g, '')
    .replace(/: number/g, '');
  const appCtx = vm.createContext({});
  vm.runInContext(`${jsFn}; __a = calcAlliance;`, appCtx);
  const appCalc = appCtx.__a;

  const cases = [];
  // ① 서버가 하나뿐인 경우 — 옛 기록과 같은 모양이다
  for (const amt of [1, 9, 10, 11, 100, 9_999, 1_000_000]) cases.push([amt, [7]]);
  // ② 인원이 0명 (사진을 못 찍어 아직 못 센 경우) — 지어내지 않고 전액 혈비로 간다
  cases.push([10_000, [0, 0]]);
  cases.push([10_000, []]);
  // ③ 무작위 — 서버 1~12곳, 인원 0~60명
  for (let i = 0; i < 5000; i++) {
    const sv = 1 + Math.floor(Math.random() * 12);
    cases.push([
      1 + Math.floor(Math.random() * 10_000_000),
      Array.from({ length: sv }, () => Math.floor(Math.random() * 61)),
    ]);
  }

  for (const [amt, counts] of cases) {
    const a = gsCalc(amt, counts);
    const b = appCalc(amt, counts, 0.1);
    const given = a.shares.reduce((x, y) => x + y, 0);

    // ① 보존 불변식 — 다이아는 사라지지도 생겨나지도 않는다
    if (a.fundTotal + given !== a.amount) {
      throw new Error(`보존 위반: amount=${amt}, counts=${counts.join('/')} → fund=${a.fundTotal} + shares=${given}`);
    }
    // ② 잔여는 음수가 될 수 없고, 서버 몫도 음수가 될 수 없다
    if (a.remainder < 0) throw new Error(`잔여 음수: amount=${amt}, counts=${counts.join('/')}`);
    if (a.shares.some((x) => x < 0)) throw new Error(`서버 몫 음수: amount=${amt}`);
    // ③ 잔여를 특정 서버에 얹으면 안 된다 — 잔여는 서버 수보다 작아야 한다 (규칙 2)
    if (counts.some((n) => n > 0) && a.remainder >= Math.max(counts.length, 1)) {
      throw new Error(`잔여가 서버 수 이상입니다: amount=${amt}, counts=${counts.join('/')} → ${a.remainder}`);
    }
    // ④ 앱 미리보기와 시트 계산이 한 다이아도 달라선 안 된다
    if (
      a.fund !== b.fund ||
      a.fundTotal !== b.fundTotal ||
      a.remainder !== b.remainder ||
      a.people !== b.people ||
      a.shares.join() !== b.shares.join()
    ) {
      throw new Error(
        `앱/시트 불일치: amount=${amt}, counts=${counts.join('/')}\n     시트=${JSON.stringify(a)}\n     앱  =${JSON.stringify(b)}`,
      );
    }
  }

  // 기준 예시를 숫자로 못박아 둔다: 10만을 01서버 10명 · 02서버 5명이 나눈다
  const ex = gsCalc(100_000, [10, 5]);
  if (ex.fund !== 10_000 || ex.shares.join() !== '60000,30000' || ex.fundTotal !== 10_000) {
    throw new Error(`기준 예시 불일치: ${JSON.stringify(ex)}`);
  }
  return `${cases.length.toLocaleString()}건 (보존·잔여 범위·이중구현 일치 · 10만/10명+5명 예시)`;
});

check('연합 한 건에 여러 서버가 들어가고, 혈비는 실제로 적립·회수된다 (v11.0)', () => {
  // 같은 서버를 두 줄로 넣으면 인원이 갈려 분배 비율이 틀어진다
  const add = (gs.match(/function api_addAlliance[\s\S]*?\n\}\n/) ?? [''])[0];
  // 중복 서버 판정은 세 함수(등록·정정·서버추가)가 **한 벌**을 쓴다 (v11.3)
  const check3 = extractFn(gs, '_allyCheckServers');
  if (!/e\.dupServer/.test(check3)) throw new Error('같은 서버가 두 번 들어가는 것을 막지 않습니다.');
  for (const fn of ['api_addAlliance', 'api_editAlliance', 'api_addAllianceServers']) {
    if (!new RegExp('_allyCheckServers').test((gs.match(new RegExp('function ' + fn + '[\\s\\S]*?\\n\\}\\n')) ?? [''])[0])) {
      throw new Error(`${fn} 이(가) 공통 서버 검사를 쓰지 않습니다 — 한쪽만 고쳐지면 어긋납니다.`);
    }
  }
  if (!/group/.test(add)) throw new Error('여러 줄을 묶는 값이 없습니다.');

  // 인증샷은 선택이다 — 증거를 못 찍었다고 기록을 통째로 막을 이유가 없다
  if (/(photoLinks|photos)[^\n]*\.length\s*(===?\s*0|<\s*1)/.test(add)) {
    throw new Error('인증샷이 없다고 등록을 거부합니다.');
  }
  // v11.3 — 사진은 **줄마다 그 서버의 것**. 묶음 공용(옛 앱)은 첫 줄에 함께 담는다
  if (!/_photoCell\(e\.photos\)/.test(add)) throw new Error('등록이 서버별 사진을 저장하지 않습니다.');
  if (!/_photoCell\(photoLinks\)/.test(add)) throw new Error('묶음 공용 사진(옛 앱)을 버립니다.');

  // 정산은 혈맹운영비 잔액을 실제로 늘린다. 삭제하면 되돌려야 장부가 맞는다.
  const credit = (gs.match(/function api_creditAlliance[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!/_creditFundBalance\(ss, s\.fundTotal\)/.test(credit)) {
    throw new Error('정산이 혈맹운영비 잔액에 적립하지 않습니다.');
  }
  const del = (gs.match(/function api_deleteAlliance[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!/_creditFundBalance\(ss, -fund\)/.test(del)) {
    throw new Error('삭제가 적립했던 혈비를 되돌리지 않습니다.');
  }
  // 참여횟수는 다른 사건이다 — 연합은 우리 혈맹원 명단과 무관하므로 절대 건드리면 안 된다
  const fundFn = extractFn(gs, '_creditFundBalance');
  if (/BAL_COL\.CNT/.test(fundFn)) throw new Error('연합 적립이 참여횟수를 건드립니다 (규칙 3).');

  // 화면은 언제나 묶음 단위 — 라우트·앱이 row 가 아니라 group 을 보내야 한다
  const route = readFileSync(resolve(ROOT, 'app/api/admin/alliance/route.ts'), 'utf8');
  if (!/callGas\('creditAlliance', \{ group, amount, email \}/.test(route)) {
    throw new Error('정산 라우트가 묶음(group)이 아니라 옛 row 를 보냅니다.');
  }
  if (!/callGas\('deleteAlliance', \{ group,/.test(route)) {
    throw new Error('삭제 라우트가 묶음(group)을 보내지 않습니다.');
  }
  if (!/syncStateCache\(res\)/.test(route)) {
    throw new Error('혈맹운영비 잔액이 바뀌는데 상태 캐시를 맞추지 않습니다 (규칙 6-3).');
  }
  const ali = readFileSync(resolve(ROOT, 'components/AllianceTab.tsx'), 'utf8');
  if (!/op: 'credit',\s*\n\s*group: entry\.group/.test(ali)) {
    throw new Error('앱이 정산에 묶음(group)을 보내지 않습니다.');
  }

  // 모의 시트도 같은 모양이어야 E2E 가 의미가 있다
  const mock = readFileSync(resolve(ROOT, 'scripts/mock-sheet.mjs'), 'utf8');
  if (!/addAlliance: \(\{ item, entries, photoLinks \}\)/.test(mock)) {
    throw new Error('모의 시트의 연합 등록이 옛 모양입니다.');
  }
  if (!/creditAlliance: \(\{ group, amount \}\)/.test(mock)) {
    throw new Error('모의 시트의 연합 정산이 옛 모양입니다.');
  }
  return '중복 서버 거부 · 인증샷 선택 · 혈비 적립/회수 · 참여횟수 무관 · 라우트/앱/모의 묶음 단위';
});

check('연합 인증샷은 서버 줄마다 따로 붙는다 (v11.3)', () => {
  /*
   * 예전에는 사진을 묶음의 **첫 줄에** 모아 두었다. 3서버 건에 3장을 올려도
   * 어느 서버 것인지 알 수 없었고, 읽어낸 인원수를 어느 줄에 넣을지도 몰라
   * 첫 줄에 넣다가 13·8·8 을 8·8·8 로 덮어쓴 사고까지 났다 (v11.0).
   */
  // 세 경로(등록·서버추가·정정) 모두 줄마다 사진을 쓴다
  const add = extractFn(gs, 'api_addAlliance');
  const addSv = extractFn(gs, 'api_addAllianceServers');
  const edit = extractFn(gs, 'api_editAlliance');
  if (!/_photoCell\(e\.photos\)/.test(add)) throw new Error('등록이 서버별 사진을 저장하지 않습니다.');
  if (!/_photoCell\(e\.photos\)/.test(addSv)) throw new Error('서버 추가가 그 줄에 사진을 저장하지 않습니다.');
  if (!/_writeAllyPhotos\(sheet, hit\[i\]\.row, list\[i\]\.photos\)/.test(edit)) {
    throw new Error('정정이 그 줄에 사진을 잇지 않습니다.');
  }
  // 정정은 **잇기만** 한다 — 지우면 되돌릴 방법이 없다
  const writer = extractFn(gs, '_writeAllyPhotos');
  if (!/merged/.test(writer) || !/have\.slice\(\)/.test(writer)) {
    throw new Error('사진을 이어 붙이지 않고 덮어씁니다 — 먼저 붙인 사진이 사라집니다.');
  }
  /*
   * ★ 연합 칸은 **언제나 원문 URL**이어야 한다. HYPERLINK 수식으로 쓰면
   *   getValues() 가 "📷 보기"만 돌려주어 앱에서 사진이 통째로 사라진다.
   *   v11.1 의 [＋] 경로가 사진 한 장일 때 수식으로 써서 실제로 그랬다.
   */
  if (/HYPERLINK/.test(writer)) throw new Error('연합 인증샷을 수식으로 씁니다 — 앱에서 안 보입니다.');
  for (const [name, body] of [['등록', add], ['서버추가', addSv]]) {
    if (/ALLY_COL\.PHOTO[^\n]*setFormula/.test(body)) {
      throw new Error(`${name} 이(가) 연합 인증샷을 수식으로 씁니다.`);
    }
  }
  // 읽기: 묶음 servers[] 가 그 줄의 사진을 함께 내려준다
  const get = extractFn(gs, 'api_getAlliance');
  if (!/photos: r\.photos/.test(get)) throw new Error('서버별 사진을 앱에 내려주지 않습니다.');

  // 앱: 사진 버튼이 줄 안에 있고, 읽은 인원은 그 줄에만 채운다
  const ali = readFileSync(resolve(ROOT, 'components/AllianceTab.tsx'), 'utf8');
  if (!/<RowPhoto row=\{r\}/.test(ali)) throw new Error('서버 줄 안에 사진 편집기가 없습니다.');
  if (!/photos: r\.photos/.test(ali)) throw new Error('앱이 서버별 사진을 보내지 않습니다.');
  // 화면에서도 서버별로 보여준다 (한데 모으면 어느 서버 증거인지 알 수 없다)
  if (!/s\.photos \?\? \[\]/.test(ali)) throw new Error('서버별 사진을 화면에 보여주지 않습니다.');

  // 모의 시트도 같은 모양이어야 E2E 가 의미가 있다
  const mock = readFileSync(resolve(ROOT, 'scripts/mock-sheet.mjs'), 'utf8');
  if (!/function allyEntries/.test(mock)) throw new Error('모의 시트가 서버별 사진을 받지 않습니다.');
  if (!/photos: \[\.\.\.e\.photos\]/.test(mock)) throw new Error('모의 시트가 줄마다 사진을 넣지 않습니다.');

  return '등록/추가/정정 3경로 · 잇기만 · 수식 금지 · 조회·앱·모의 서버별';
});

check('연합 수정: 관리자는 미정산까지, 정산된 건은 마스터만 (v11.3)', () => {
  /*
   * 아직 금액이 안 들어간 건은 다이아가 하나도 안 움직인 상태다 — 틀리면 고치면 그만이고,
   * 그때마다 마스터를 불러야 하면 등록 자체가 미뤄진다.
   * 반대로 정산된 건은 고칠 때마다 혈맹운영비 잔액이 실제로 움직인다 (되돌리는 일).
   */
  const edit = extractFn(gs, 'api_editAlliance');
  if (!/function api_editAlliance\(group, item, entries, amount, email, confirm, asMaster\)/.test(gs)) {
    throw new Error('정정 함수가 등급을 받지 않습니다.');
  }
  if (!/if \(done && asMaster !== true\)/.test(edit)) {
    throw new Error('시트가 정산된 건을 마스터 전용으로 막지 않습니다.');
  }
  // 막는 자리가 **되묻기보다 앞**이어야 한다 — 뒤면 관리자에게 바뀔 금액이 새어 나간다
  if (edit.indexOf('asMaster !== true') > edit.indexOf('needsConfirm')) {
    throw new Error('등급 판정이 되묻기보다 뒤에 있습니다.');
  }
  if (!/e\.allyMasterOnly/.test(edit)) throw new Error('막을 때 이유를 알려주지 않습니다.');

  // 라우트: 등급은 **라우트가 고정**한다 (앱이 보낸 값을 쓰면 아무나 마스터가 된다)
  const adminRoute = readFileSync(resolve(ROOT, 'app/api/admin/alliance/route.ts'), 'utf8');
  const master = readFileSync(resolve(ROOT, 'app/api/master/alliance/route.ts'), 'utf8');
  if (!/asMaster: false/.test(adminRoute)) throw new Error('관리자 라우트가 asMaster 를 고정하지 않습니다.');
  if (!/asMaster: true/.test(master)) throw new Error('마스터 라우트가 asMaster 를 보내지 않습니다.');
  if (/asMaster:\s*body\./.test(adminRoute + master)) {
    throw new Error('앱이 보낸 값으로 등급을 정합니다.');
  }
  if (!/requireAdmin\(\)/.test(adminRoute) || !/requireMaster\(\)/.test(master)) {
    throw new Error('라우트가 인증을 요구하지 않습니다.');
  }
  // 관리자 경로는 금액을 아예 안 보낸다 (금액은 정산된 건에서만 쓰는 값이다)
  if (!/amount: null/.test(adminRoute)) throw new Error('관리자 경로가 금액을 보냅니다.');

  // 모의 시트도 같은 판정을 해야 E2E 가 의미가 있다
  const mock = readFileSync(resolve(ROOT, 'scripts/mock-sheet.mjs'), 'utf8');
  if (!/done && asMaster !== true/.test(mock)) throw new Error('모의 시트가 등급을 판정하지 않습니다.');

  return '시트 판정(되묻기보다 앞) · 라우트가 등급 고정 · 관리자는 금액 미전송 · 모의 동일';
});

check('잔액도 서버로 좁혀 볼 수 있다 (v11.3)', () => {
  // 아이템 등록 화면과 **같은 칩**을 쓴다 — 두 벌로 만들면 한쪽만 낡는다
  const bal = readFileSync(resolve(ROOT, 'components/BalanceTab.tsx'), 'utf8');
  if (!/<ServerFilter/.test(bal)) throw new Error('잔액에 서버 칩이 없습니다.');
  if (!/from '\.\/ServerFilter'/.test(bal)) throw new Error('서버 칩을 따로 만들었습니다.');
  // 아무것도 안 고르면 전원이 보여야 한다 (기본이 "다 보기")
  if (!/if \(svPick\.length === 0\) return true;/.test(bal)) {
    throw new Error('아무것도 안 골랐을 때 목록이 비어버립니다.');
  }
  // 혈맹운영비는 사람이 아니라 금고다 — 서버로 걸러 사라지면 합계를 볼 수 없다
  if (!/if \(normName\(r\.name\) === fundName\) return true;/.test(bal)) {
    throw new Error('서버로 좁히면 혈맹운영비가 사라집니다.');
  }
  // 인원 수는 사람만 센다
  if (!/if \(normName\(r\.name\) === fundKey\) continue;/.test(bal)) {
    throw new Error('서버별 인원에 혈맹운영비가 섞입니다.');
  }
  // 서버 미지정인 사람도 고를 길이 있어야 한다 (없으면 영영 못 본다)
  if (!/svPick\.includes\(NO_SERVER\)/.test(bal)) throw new Error('서버 미지정인 사람을 고를 수 없습니다.');
  return '공통 칩 1벌 · 기본 전원 · 혈비 유지 · 미지정 포함';
});

check("연합 서버 표기: '1' 과 '01' 이 같은 서버다 (v11.1)", () => {
  // 시트에 '01' 을 넣어도 셀 서식이 자동이면 구글시트가 숫자 1 로 바꿔 저장한다.
  // 그러면 읽을 때 '1' 이 되고, 서버별 누적은 '01'~'12' 로만 집계하므로
  // 그 건의 금액이 누적에서 통째로 빠진다 — 행에는 남아 있어 알아채기도 어렵다.
  const ctx = vm.createContext({});
  vm.runInContext(`${extractFn(gs, '_normServer')}; __n = _normServer;`, ctx);
  const n = ctx.__n;
  const cases = [
    ['1', '01'], [1, '01'], ['01', '01'], ['12', '12'], [12, '12'],
    [' 3 ', '03'], ['', ''], [null, ''], [undefined, ''],
    ['A1', 'A1'],       // 알아볼 수 없는 값은 지어내지 않고 그대로 둔다 (규칙 7)
    ['123', '123'],
  ];
  for (const [input, want] of cases) {
    if (n(input) !== want) {
      throw new Error(`_normServer(${JSON.stringify(input)}) = ${JSON.stringify(n(input))}, 기대 ${JSON.stringify(want)}`);
    }
  }

  // 앱의 normServer 와 같은 규칙이어야 한다 — 한쪽만 고치면 화면과 집계가 어긋난다
  const from = clientTs.slice(clientTs.indexOf('export function normServer('));
  const appCtx = vm.createContext({});
  vm.runInContext(
    from.slice(0, from.indexOf('\n}') + 2).replace(/export /g, '').replace(/: string \| undefined \| null/g, '').replace(/\): string/g, ')') + '; __n = normServer;',
    appCtx,
  );
  for (const [input, want] of cases) {
    if (typeof input !== 'object' && appCtx.__n(input) !== want) {
      throw new Error(`앱/시트 불일치: normServer(${JSON.stringify(input)}) 앱=${JSON.stringify(appCtx.__n(input))} 시트=${JSON.stringify(want)}`);
    }
  }

  // 읽는 자리가 전부 이 함수를 거쳐야 한다. 한 곳만 빠져도 그 화면에서만 어긋난다
  const get = (gs.match(/function api_getAlliance[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!/_normServer\(r\[ALLY_COL\.SERVER - 1\]\)/.test(get)) {
    throw new Error('api_getAlliance 가 서버 표기를 맞추지 않습니다.');
  }
  const credit = (gs.match(/function api_creditAlliance[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!/_normServer\(r\[ALLY_COL\.SERVER - 1\]\)/.test(credit)) {
    throw new Error('api_creditAlliance 가 서버 표기를 맞추지 않습니다.');
  }
  if (/String\(r\[ALLY_COL\.SERVER - 1\]\)\.trim\(\)/.test(gs)) {
    throw new Error('서버 칸을 정규화 없이 읽는 자리가 남아 있습니다.');
  }

  // ★ 쓰기 전에 글자 서식으로 바꿔야 한다 — 쓴 뒤에 바꿔봐야 1 은 돌아오지 않는다
  const add = (gs.match(/function api_addAlliance[\s\S]*?\n\}\n/) ?? [''])[0];
  const fmtAt = add.indexOf("ALLY_COL.SERVER, values.length, 1).setNumberFormat('@')");
  const setAt = add.indexOf('ALLIANCE_HEADERS.length).setValues(values)');
  if (fmtAt < 0) throw new Error('등록이 서버 칸을 글자 서식으로 고정하지 않습니다.');
  if (fmtAt > setAt) throw new Error('서식을 값보다 나중에 바꿉니다 — 이미 숫자가 된 값은 안 돌아옵니다.');

  return `표기 맞춤 ${cases.length}케이스 (앱·시트 동일) · 읽기 2곳 · 쓰기 전 서식 고정`;
});

check('인증샷은 여러 장 붙고, 이관해도 살아남는다 (v11.0)', () => {
  // HYPERLINK 은 링크를 한 개만 담는다. 두 장 이상이면 값으로 나열해야 한다.
  const write = extractFn(gs, '_writeLedgerPhotos');
  if (!/list\.length === 1/.test(write) || !/setValue\(list\.join/.test(write)) {
    throw new Error('사진이 두 장 이상일 때의 저장 경로가 없습니다.');
  }
  // 읽기는 옛 수식과 새 나열을 하나로 봐야 한다 (옛 기록이 안 보이면 안 된다)
  const ctx = vm.createContext({});
  vm.runInContext(`${extractFn(gs, '_photoList')}\n${extractFn(gs, '_readLedgerPhotos')}; __r = _readLedgerPhotos;`, ctx);
  const read = ctx.__r;
  const A = 'https://drive.google.com/file/d/A/view';
  const B = 'https://drive.google.com/file/d/B/view';
  const cases = [
    [`=HYPERLINK("${A}","📷 보기")`, '📷 보기', [A]],   // 옛 한 장
    ['', `${A}\n${B}`, [A, B]],                          // 새 여러 장
    ['', '', []],                                        // 없음
    ['', '📷 보기', []],                                 // 링크가 아닌 글자만
  ];
  for (const [formula, display, want] of cases) {
    const got = read(formula, display);
    if (got.join('|') !== want.join('|')) {
      throw new Error(`인증샷 읽기 불일치: ${JSON.stringify([formula, display])} → ${JSON.stringify(got)}`);
    }
  }

  // 시즌종료·이관은 수식만 복사한다. 값으로 저장한 여러 장은 setValues 로 함께 옮겨가야 한다 —
  // 옮기는 코드가 사진 칸을 빈 값으로 덮어쓰고 있지 않은지 확인한다.
  for (const fn of ['_transferData', 'closeSeason']) {
    const body = gs.indexOf(`function ${fn}`) >= 0 ? extractFn(gs, fn) : '';
    if (body && /setValue\(''\)[\s\S]{0,40}LG\.PHOTO/.test(body)) {
      throw new Error(`${fn} 이 인증샷 칸을 지웁니다.`);
    }
  }

  // 앱: 여러 장을 고를 수 있고, 장마다 찾은 사람을 더해야 한다 (덮어쓰면 앞 장이 사라진다)
  const items = readFileSync(resolve(ROOT, 'components/ItemsTab.tsx'), 'utf8');
  if (!/multiple/.test(items)) throw new Error('아이템 등록이 사진 한 장만 받습니다.');
  if (!/photoLinks: links/.test(items)) throw new Error('아이템 등록이 사진 목록을 보내지 않습니다.');
  const ali = readFileSync(resolve(ROOT, 'components/AllianceTab.tsx'), 'utf8');
  if (!/multiple/.test(ali)) throw new Error('연합 등록이 사진 한 장만 받습니다.');
  // v11.3 — 연합 사진은 **줄마다** 보낸다 (묶음 공용이 아니다)
  if (!/photos: r\.photos/.test(ali)) throw new Error('연합 등록이 서버별 사진을 보내지 않습니다.');
  return `읽기 ${cases.length}케이스 (옛 수식·새 나열 동시 지원) · 이관 보존 · 앱 2곳 여러 장`;
});

check('사진이 읽은 인원수가 사람이 넣은 값을 덮어쓰지 않는다 (v11.1)', () => {
  // 실제 사고: 사진 3장을 붙이고 13·8·8 로 고쳐 넣었는데, 마지막 사진이 읽은 8 이
  // 첫 줄을 덮어써 8·8·8 이 됐다. 사람이 넣은 숫자가 기계의 추측보다 우선한다.
  const ali = readFileSync(resolve(ROOT, 'components/AllianceTab.tsx'), 'utf8');

  // 사람이 인원을 고치면 표시가 남아야 한다
  if (!/people: e\.target\.value\.replace\(\/\[\^0-9\]\/g, ''\), touched: true/.test(ali)) {
    throw new Error('사람이 고친 인원 칸에 표시를 남기지 않습니다.');
  }
  // 옛 경로(무조건 첫 줄 덮어쓰기)가 남아 있으면 안 된다
  if (/k === 0 \? \{ \.\.\.r, people: String\(n\) \}/.test(ali)) {
    throw new Error('사진 결과가 첫 줄을 무조건 덮어씁니다.');
  }
  /*
   * v11.3 — 사진이 **그 서버 줄에** 붙으므로 읽은 값도 그 줄에만 채운다.
   * 그래도 사람이 고친 값(touched)이나 이미 채워진 값은 절대 덮어쓰지 않는다.
   */
  const auto = (ali.match(/people: n > 0[^\n]*/) ?? [''])[0];
  if (!/!row\.touched/.test(auto)) throw new Error('사람이 고친 인원을 사진이 덮어씁니다.');
  if (!/row\.people === '' \|\| row\.people === '0'/.test(auto)) {
    throw new Error('이미 넣어둔 인원을 사진이 덮어씁니다.');
  }
  // 사진 고르기는 줄마다 하나 — 묶음 전체에 붙이던 옛 경로가 남아 있으면 안 된다
  if (/usePhotoPick/.test(ali)) throw new Error('묶음 전체에 사진을 붙이던 옛 경로가 남아 있습니다.');

  // 대신 읽은 값은 보여줘야 한다 — 안 보여주면 사진을 붙인 뜻이 없다
  if (!/ali\.photoRead/.test(ali)) throw new Error('사진이 읽은 인원수를 보여주지 않습니다.');
  // v11.3 — 사진이 줄마다 붙으므로 "어느 서버인지 직접 정하라"는 안내는 필요 없어졌다.
  // 대신 사진 버튼이 **줄 안에** 있어야 한다
  if (!/ali\.photoAddServer/.test(ali)) throw new Error('사진 버튼이 서버 줄 안에 없습니다.');
  return '손댄 값 보호 · 자동 입력은 한 줄·미입력일 때만 · 읽은 값은 표시';
});

check('연합 정정은 마스터만, 서버 추가는 관리자도 (v11.1)', () => {
  const edit = (gs.match(/function api_editAlliance[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!edit) throw new Error('api_editAlliance 가 없습니다.');

  // ★ 정산된 건을 고치는 것은 돈이 움직이는 작업이다 — 숫자를 보여준 뒤에만 실행한다
  if (!/confirm !== true/.test(edit)) throw new Error('정산된 건을 확인 없이 고칩니다 (규칙 5-1).');
  if (!/needsConfirm: true/.test(edit)) throw new Error('되물을 때 needsConfirm 을 주지 않습니다.');
  // 되물을 때 바뀔 숫자가 함께 가야 사용자가 판단할 수 있다
  if (!/fundDelta/.test(edit)) throw new Error('혈비가 얼마나 바뀌는지 알려주지 않습니다.');
  // ★ 전액을 다시 더하면 고칠 때마다 운영비가 불어난다
  if (!/_creditFundBalance\(ss, s\.fundTotal - oldFund\)/.test(edit)) {
    throw new Error('혈비를 차액이 아니라 전액으로 조정합니다 — 고칠 때마다 운영비가 불어납니다.');
  }
  if (!/lock\.waitLock/.test(edit)) throw new Error('정정이 락 없이 실행됩니다.');
  // 산식은 한 곳에서만 — 여기서 다시 구현하면 정산과 어긋난다
  if (!/_calcAlliance\(/.test(edit)) throw new Error('정정이 공통 산식을 쓰지 않습니다.');

  // 라우터가 confirm 을 그대로 넘기는지 (임의로 true 를 만들면 안전장치가 무력화된다)
  if (!/api_editAlliance\(req\.group, req\.item, req\.entries, req\.amount, req\.email,\s*\n?\s*req\.confirm === true, req\.asMaster === true\)/.test(gs)) {
    throw new Error('라우터가 정정 인자를 그대로 넘기지 않습니다.');
  }

  // 정정은 마스터 라우트에만 있어야 한다
  const master = readFileSync(resolve(ROOT, 'app/api/master/alliance/route.ts'), 'utf8');
  if (!/requireMaster\(\)/.test(master)) throw new Error('연합 정정이 마스터를 요구하지 않습니다.');
  if (!/confirm: body\.confirm === true/.test(master)) {
    throw new Error('라우트가 confirm 을 그대로 전달하지 않습니다.');
  }
  /*
   * v11.3 — 관리자도 **미정산 건**은 고친다. 대신 두 가지가 지켜져야 한다:
   *   ① 관리자 라우트는 asMaster 를 **false 로 고정**한다 (앱이 보낸 값을 쓰지 않는다)
   *   ② 정산된 건인지는 **시트가** 판정한다 — 라우트를 직접 불러도 뚫리지 않는다
   */
  const adminRoute = readFileSync(resolve(ROOT, 'app/api/admin/alliance/route.ts'), 'utf8');
  if (!/asMaster: false/.test(adminRoute)) {
    throw new Error('관리자 라우트가 asMaster 를 false 로 고정하지 않습니다.');
  }
  if (/asMaster: body\./.test(adminRoute) || /asMaster: body\./.test(master)) {
    throw new Error('앱이 보낸 값으로 등급을 정합니다 — 라우트가 고정해야 합니다.');
  }
  if (!/asMaster: true/.test(master)) throw new Error('마스터 라우트가 asMaster 를 보내지 않습니다.');
  if (!/if \(done && asMaster !== true\)/.test(edit)) {
    throw new Error('시트가 정산된 건을 마스터 전용으로 막지 않습니다.');
  }
  if (!/e\.allyMasterOnly/.test(edit)) throw new Error('막을 때 이유를 알려주지 않습니다.');

  // ➕ 서버 추가는 관리자도 한다 — 대신 **더하기만** 되어야 안전하다
  const add = (gs.match(/function api_addAllianceServers[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!add) throw new Error('api_addAllianceServers 가 없습니다.');
  if (/ALLY_COL\.PEOPLE\)\.setValue|ALLY_COL\.ITEM\)\.setValue/.test(add)) {
    throw new Error('서버 추가가 기존 줄의 값을 고칩니다 — 관리자에게 열 수 없습니다.');
  }
  if (/deleteRow/.test(add)) throw new Error('서버 추가가 줄을 지웁니다.');
  // 이미 정산된 건에 인원을 더하면 이미 나눠준 몫과 어긋난다
  if (!/e\.allyDone/.test(add)) throw new Error('정산된 건에도 서버를 더할 수 있습니다.');
  // 같은 서버가 두 줄이 되면 인원이 갈려 분배 비율이 틀어진다
  if (!/have\[list\[i\]\.server\]/.test(add)) throw new Error('이미 있는 서버를 또 더할 수 있습니다.');
  if (!/'addAllianceServers'/.test(adminRoute)) throw new Error('관리자 라우트에 서버 추가가 없습니다.');

  /*
   * 화면 (v11.3): 미정산 건의 [수정]은 관리자에게도, **정산된 건의 [수정]은 마스터에게만**.
   * ＋ 는 관리자에게.
   */
  const ali = readFileSync(resolve(ROOT, 'components/AllianceTab.tsx'), 'utf8');
  if (!/master \? \(\s*\n\s*<button className="btn ghost" onClick=\{\(\) => setEditing\(g\)\}/.test(ali)) {
    throw new Error('정산된 건의 정정 버튼이 마스터에게만 보이지 않습니다.');
  }
  // 미정산 건은 관리자도 — 앱이 관리자 경로(op:'edit')로 보낸다
  if (!/op: 'edit',/.test(ali)) throw new Error('미정산 건 수정이 관리자 경로로 가지 않습니다.');
  if (!/entry\.done\s*\n?\s*\? await api\('\/api\/master\/alliance'/.test(ali)) {
    throw new Error('정산된 건이 마스터 경로로 가지 않습니다.');
  }
  if (!/setAddingSv\(g\)/.test(ali)) throw new Error('＋ 버튼이 없습니다.');
  if (!/\/api\/master\/alliance/.test(ali)) throw new Error('앱이 마스터 라우트를 부르지 않습니다.');
  // 등록·정정이 같은 편집기를 써야 한쪽만 낡지 않는다
  if ((ali.match(/<ServerRows[\s\n]/g) ?? []).length < 3) {
    throw new Error('서버·인원 편집기를 화면마다 따로 만들었습니다.');
  }
  return '정정=마스터(확인·차액조정·공통산식) · 추가=관리자(더하기만) · 편집기 1벌';
});

check('팝업은 바깥을 눌러도 닫히지 않는다 (v11.1)', () => {
  // 폰에서는 시트가 화면을 거의 다 채운다. 스크롤하려다 가장자리를 스치면
  // 예전에는 그대로 닫혔고, 입력하던 내용이 통째로 사라졌다.
  // 참여자를 스무 명 체크한 뒤라면 손해가 크다.
  const src = readFileSync(resolve(ROOT, 'components/Sheet.tsx'), 'utf8');
  if (/onClick=\{\(e\)[^}]*currentTarget[^}]*onClose\(\)/s.test(src)) {
    throw new Error('배경을 누르면 닫히는 경로가 남아 있습니다.');
  }
  if (/className="backdrop"[\s\S]{0,120}onClick=/.test(src)) {
    throw new Error('배경에 닫기 동작이 붙어 있습니다.');
  }
  // 대신 오른쪽 위에 닫기 버튼이 반드시 있어야 한다 — 없으면 나갈 길이 사라진다
  if (!/className="sheet-x"/.test(src)) throw new Error('오른쪽 위 닫기 버튼이 없습니다.');
  if (!/onClick=\{onClose\}/.test(src)) throw new Error('닫기 버튼이 닫지 않습니다.');
  if (!/aria-label=\{t\('c\.close'\)\}/.test(src)) throw new Error('닫기 버튼에 이름이 없습니다.');
  // 키보드만 쓰는 사람을 막지 않는다
  if (!/e\.key === 'Escape'/.test(src)) throw new Error('Esc 로도 닫히지 않습니다.');

  // 버튼이 스크롤을 따라와야 긴 시트에서도 찾을 수 있다
  const css = readFileSync(resolve(ROOT, 'app/globals.css'), 'utf8');
  const rule = (css.match(/\.sheet-x \{[^}]*\}/) ?? [''])[0];
  if (!/position: sticky/.test(rule)) throw new Error('닫기 버튼이 스크롤하면 사라집니다.');
  if (!/\.sheet h2 \{[^}]*padding-right/.test(css)) {
    throw new Error('제목이 닫기 버튼 아래로 파고듭니다.');
  }
  return '배경 닫기 없음 · 오른쪽 위 [✕] · Esc 유지 · 제목 자리 확보';
});

check('폰 뒤로가기는 앱을 벗어나지 않고 덮인 것만 닫는다 (v11.2.1)', () => {
  /*
   * v11.1 에서 배경 닫기를 막은 뒤로, 팝업을 닫으려고 뒤로가기를 누르는 일이
   * 오히려 늘었다. 그때 앱을 통째로 벗어나면 참여자를 스무 명 체크한 것이
   * 그대로 사라진다 — 막으려던 사고가 다른 문으로 열려 있었던 셈이다.
   */
  const back = readFileSync(resolve(ROOT, 'lib/back.ts'), 'utf8');
  for (const fn of ['pushBack', 'releaseBack', 'useBackClose']) {
    if (!new RegExp(`export function ${fn}\\b`).test(back)) throw new Error(`lib/back.ts 에 ${fn} 이(가) 없습니다.`);
  }

  // ★ [✕] 로 닫을 때 history 를 건드리면 안 된다. history.back() 은 비동기라,
  //   탭 이동과 겹치면 한 번에 두 겹이 닫히거나 뒤로가기가 먹통이 된다.
  const release = (back.match(/export function releaseBack[\s\S]*?\n\}/) ?? [''])[0];
  if (/history\./.test(release)) {
    throw new Error('releaseBack 이 history 를 건드립니다 — 탭 이동과 겹치면 두 겹이 함께 닫힙니다.');
  }
  // 표식은 언제나 최대 한 개 (arm 은 armed 일 때 아무것도 하지 않는다)
  const arm = (back.match(/function arm\(\)[\s\S]*?\n\}/) ?? [''])[0];
  if (!/if \(armed/.test(arm)) throw new Error('history 표식이 여러 개 쌓일 수 있습니다.');
  if (!/armed = false;[\s\S]{0,120}stack\.pop\(\)/.test(back)) {
    throw new Error('뒤로가기를 받았을 때 맨 위 한 겹만 닫는 경로가 없습니다.');
  }

  // 실제로 돌려본다 — 세 겹을 덮고 뒤로가기를 세 번 누르면 위에서부터 하나씩 닫히고,
  // 네 번째는 앱 밖으로 나가야 한다 (표식이 다시 올라가면 영영 못 나간다)
  const listeners = [];
  const entries = [];
  const ctx = vm.createContext({
    window: {
      history: { pushState: () => entries.push(1) },
      addEventListener: (type, fn) => type === 'popstate' && listeners.push(fn),
    },
  });
  const plain = back
    // React 를 쓰는 훅만 걷어내고 나머지는 그대로 돌린다
    .replace(/export function useBackClose[\s\S]*?\n\}\n/, '')
    .replace(/^'use client';/m, '')
    .replace(/^import[^\n]*\n/gm, '')
    .replace(/export function/g, 'function')
    .replace(/type Entry = [^\n]*\n/, '')
    .replace(/: number|: \(\) => void|: Entry\[\]|: boolean/g, '');
  vm.runInContext(`${plain}; __push = pushBack; __release = releaseBack; __depth = backDepth;`, ctx);

  const closed = [];
  ctx.__push(() => closed.push('탭'));
  ctx.__push(() => closed.push('팝업'));
  ctx.__push(() => closed.push('사진'));
  if (entries.length !== 1) throw new Error(`세 겹인데 history 항목이 ${entries.length}개입니다 (기대 1개).`);

  const pressBack = () => listeners.forEach((fn) => fn());
  pressBack();
  if (closed.join(',') !== '사진') throw new Error(`뒤로가기 1번: ${closed.join(',')} (기대 사진)`);
  pressBack();
  pressBack();
  if (closed.join(',') !== '사진,팝업,탭') throw new Error(`뒤로가기 3번: ${closed.join(',')}`);
  if (ctx.__depth() !== 0) throw new Error('세 번 눌렀는데 덮인 것이 남아 있습니다.');
  // 남은 것이 있을 때만 표식을 다시 올린다 — 마지막 한 겹까지 올리면 앱을 나갈 수 없다
  if (entries.length !== 3) {
    throw new Error(`표식이 ${entries.length}번 올라갔습니다 (기대 3) — 마지막 겹을 닫고도 올리면 앱을 못 나갑니다.`);
  }
  pressBack();
  if (entries.length !== 3) throw new Error('닫을 것이 없는데 표식을 다시 올립니다 — 앱을 나갈 수 없습니다.');

  // 팝업·크게보기·홈이 아닌 탭 — 세 곳 모두 연결돼 있어야 한다
  const sheet = readFileSync(resolve(ROOT, 'components/Sheet.tsx'), 'utf8');
  if (!/useBackClose\(onClose\)/.test(sheet)) throw new Error('Sheet 가 뒤로가기로 닫히지 않습니다.');
  const strip = readFileSync(resolve(ROOT, 'components/PhotoStrip.tsx'), 'utf8');
  if (!/useBackClose\(onClose\)/.test(strip)) throw new Error('인증샷 크게보기가 뒤로가기로 닫히지 않습니다.');
  const screen = readFileSync(resolve(ROOT, 'components/Screen.tsx'), 'utf8');
  if (!/useBackClose\(onClose\)/.test(screen)) throw new Error('홈에서 연 화면이 뒤로가기로 닫히지 않습니다.');
  const app = readFileSync(resolve(ROOT, 'components/App.tsx'), 'utf8');
  // 홈에서 연 화면은 Screen 이 감싸므로 그것 하나로 전부 덮인다
  if (!/<Screen title=\{t\(SCREEN_TITLE\[screen\]\)\} onClose=\{\(\) => setScreen\(null\)\}>/.test(app)) {
    throw new Error('화면이 Screen 으로 감싸여 있지 않습니다 — 뒤로가기로 닫히지 않습니다.');
  }

  return '표식 1개 · 세 겹 순서대로 · 닫을 것 없으면 앱 밖으로 · 팝업/크게보기/화면 3곳';
});

check('하단 탭이 없고 모든 화면은 홈 아이콘에서 연다 (v11.2.1)', () => {
  /*
   * 탭 7개는 글자를 8.8px 까지 줄여야 들어갔다 (영문 "Balance"·"Alliance" 기준).
   * 눈이 나쁜 사람은 읽지 못한다. 하단바를 없애고 홈의 아이콘 하나로 통일했다 —
   * 화면이 하나 더 늘어도 칸만 하나 더 놓으면 되고, 글자를 줄일 이유가 없다.
   */
  const css = readFileSync(resolve(ROOT, 'app/globals.css'), 'utf8');
  if (/^\.nav \{/m.test(css) || /^\.nav button/m.test(css)) {
    throw new Error('하단 탭바 스타일이 남아 있습니다 — 새 화면은 홈 격자에 넣으세요.');
  }
  const app = readFileSync(resolve(ROOT, 'components/App.tsx'), 'utf8');
  if (/<nav/.test(app)) throw new Error('App.tsx 에 하단 탭바가 남아 있습니다.');

  // 아이콘 글자 — 격자는 줄일 이유가 없다
  const tile = (css.match(/\.tile b \{[^}]*\}/) ?? [''])[0];
  const px = Number((tile.match(/font-size: ([\d.]+)px/) ?? [0, 0])[1]);
  if (!(px >= 12)) throw new Error(`아이콘 글자가 ${px}px 입니다 — 12px 아래로 내려가면 읽히지 않습니다.`);

  /*
   * 아이콘 순서 — 사용자가 정한 그대로. **관리는 언제나 맨 마지막**이다:
   * 엄지가 닿기 쉬운 자리에 두면 PIN·도구 화면이 잘못 눌린다.
   */
  const home = readFileSync(resolve(ROOT, 'components/HomeTab.tsx'), 'utf8');
  const tilesAt = home.indexOf('const tiles');
  // ★ 'return (' 은 앞쪽 useEffect 의 정리 함수에도 있다 — 반드시 tiles 뒤에서 찾는다
  const tilesSrc = home.slice(tilesAt, home.indexOf('];', tilesAt));
  const order = [...tilesSrc.matchAll(/key: '(\w+)'/g)].map((m) => m[1]);
  const expected = ['balance', 'items', 'alliance', 'raid', 'me', 'board', 'lang', 'admin'];
  if (order.join(',') !== expected.join(',')) {
    throw new Error(`아이콘 순서가 다릅니다: ${order.join(' ')} (기대 ${expected.join(' ')})`);
  }
  if (order[order.length - 1] !== 'admin') throw new Error('관리가 맨 마지막이 아닙니다.');

  // 모든 화면이 홈에서 열려야 한다 — 하나라도 빠지면 영영 못 연다
  for (const to of ['balance', 'items', 'alliance', 'raid', 'me', 'board', 'admin']) {
    if (!new RegExp(`onGo\\('${to}'\\)`).test(home)) throw new Error(`홈에서 ${to} 화면으로 갈 수 없습니다.`);
    if (!new RegExp(`${to}: 'tab\\.${to}'`).test(app)) {
      throw new Error(`${to} 화면에 제목이 없습니다 — 어디에 있는지 알 수 없습니다.`);
    }
  }
  /*
   * 나가는 길은 셋이다 — 위 [✕] · 아래 [🏠 홈] · 폰 뒤로가기(별도 검사).
   * ★ 아래 홈 버튼이 있어야 목록을 한참 내린 뒤에도 손이 닿는다 (v11.3).
   */
  const screen = readFileSync(resolve(ROOT, 'components/Screen.tsx'), 'utf8');
  if (!/className="screen-x"/.test(screen)) throw new Error('화면에 닫기 버튼이 없습니다.');
  if (!/aria-label=\{t\('c\.close'\)\}/.test(screen)) throw new Error('닫기 버튼에 이름이 없습니다.');
  if (!/className="home-btn"/.test(screen)) throw new Error('아래쪽 [홈] 버튼이 없습니다.');
  const homeBtn = (screen.match(/<button type="button" className="home-btn"[\s\S]*?<\/button>/) ?? [''])[0];
  if (!/onClick=\{onClose\}/.test(homeBtn)) throw new Error('[홈] 버튼이 홈으로 보내지 않습니다.');
  // 버튼이 내용을 가리면 마지막 줄을 영영 못 읽는다
  const pad = (css.match(/\.screen \{[^}]*\}/) ?? [''])[0];
  if (!/padding-bottom/.test(pad)) throw new Error('[홈] 버튼이 화면 마지막 줄을 가립니다.');

  /*
   * ★ 홈의 연합·레이드 숫자는 따로 읽어야 한다. 홈은 이제 **모든 이동의 길목**이라
   *   캐시가 없으면 Apps Script 실행 할당량을 그대로 태운다 (규칙 6-2 와 같은 이유).
   *   못 읽었을 때 0 으로 보여주면 "처리할 일이 없다"는 거짓말이 된다.
   */
  const ttl = Number((home.match(/MEMO_MS = ([\d_]+)/) ?? [0, '0'])[1].replace(/_/g, ''));
  if (!(ttl >= 30_000)) throw new Error(`홈 숫자 캐시가 ${ttl}ms 입니다 — 너무 짧으면 시트를 계속 읽습니다.`);
  if (/fresh=1/.test(home)) throw new Error('홈이 평소 조회를 fresh 로 부릅니다 — 캐시가 무의미해집니다.');
  if (!/ally: -1|ally = a\.ok/.test(home) || !/>= 0 \? /.test(home)) {
    throw new Error('못 읽은 숫자를 0 과 구별하지 않습니다.');
  }
  if (!/dropHomeMemo\(\)/.test(app)) throw new Error('쓰기 직후에 홈 숫자를 새로 읽지 않습니다.');

  return `하단바 없음 · 아이콘 ${order.length}개(관리 맨 끝) · 글자 ${px}px · 닫기 버튼 · 숫자 캐시 ${ttl / 1000}초`;
});

check('인증샷은 앱 안에서 바로 보인다 (v11.1)', () => {
  // 시트에 저장되는 값은 드라이브 **뷰어 페이지** 주소다. <img> 에 그대로 넣으면
  // 아무것도 안 나온다 — 썸네일 주소로 바꿔야 보인다.
  const from = clientTs.slice(clientTs.indexOf('export function photoView('));
  const jsFn = from
    .slice(0, from.indexOf('\n}') + 2)
    .replace(/export /g, '')
    .replace(/url: string, width = 1200/, 'url, width = 1200')
    .replace(/\): string/g, ')');
  const ctx = vm.createContext({});
  vm.runInContext(`${jsFn}; __v = photoView;`, ctx);
  const v = ctx.__v;

  const ID = '1AbC_dEfGhIjKlMnOpQ';
  const cases = [
    [`https://drive.google.com/file/d/${ID}/view?usp=drivesdk`, `https://drive.google.com/thumbnail?id=${ID}&sz=w400`],
    [`https://drive.google.com/open?id=${ID}`, `https://drive.google.com/thumbnail?id=${ID}&sz=w400`],
    // ★ 드라이브가 아니면 손대지 않는다 — 멀쩡한 링크가 깨진다 (규칙 7)
    ['https://example.com/shot.png', 'https://example.com/shot.png'],
    ['', ''],
  ];
  for (const [input, want] of cases) {
    if (v(input, 400) !== want) {
      throw new Error(`photoView(${JSON.stringify(input)}) = ${JSON.stringify(v(input, 400))}, 기대 ${JSON.stringify(want)}`);
    }
  }

  const strip = readFileSync(resolve(ROOT, 'components/PhotoStrip.tsx'), 'utf8');
  if (!/photoView\(/.test(strip)) throw new Error('사진 보기가 썸네일 주소를 쓰지 않습니다.');
  // ★ 못 불러온 사진을 조용히 숨기면 관리자는 사진을 안 붙인 줄로 안다
  if (!/onError=/.test(strip)) throw new Error('사진을 못 불러온 경우를 다루지 않습니다.');
  if (!/shot\.failed/.test(strip)) throw new Error('못 불러온 사진을 알려주지 않습니다.');
  // 원본으로 나가는 길은 남겨둔다 (썸네일이 흐릴 때 필요하다)
  if (!/shot\.origin/.test(strip)) throw new Error('원본 링크가 없습니다.');

  // 아이템·연합 두 곳 모두에서 열려야 한다
  for (const f of ['components/ItemsTab.tsx', 'components/AllianceTab.tsx']) {
    const src = readFileSync(resolve(ROOT, f), 'utf8');
    if (!/<PhotoStrip urls=/.test(src)) throw new Error(`${f} 에서 인증샷을 볼 수 없습니다.`);
    if (!/shot\.none/.test(src)) throw new Error(`${f} 가 인증샷이 없을 때를 알려주지 않습니다.`);
  }
  // 아이템은 이름을 눌러 여는 것이 입구다
  const items = readFileSync(resolve(ROOT, 'components/ItemsTab.tsx'), 'utf8');
  if (!/onClick=\{\(\) => setViewing\(it\)\}/.test(items)) {
    throw new Error('아이템명을 눌러도 상세가 열리지 않습니다.');
  }
  // 시트가 사진을 실어 보내야 앱이 보여줄 수 있다
  if (!/photos: _readLedgerPhotos\(pf\[i\]\[0\], pd\[i\]\[0\]\)/.test(gs)) {
    throw new Error('api_getState 가 아이템 인증샷을 실어 보내지 않습니다.');
  }
  return `주소 변환 ${cases.length}케이스 · 실패 표시 · 원본 링크 · 아이템/연합 2곳`;
});

check('아이템 수정은 마스터만 — 분배 전은 이름·참여자, 분배 후는 금액까지 (v11.1)', () => {
  const fn = (gs.match(/function api_editItem[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!fn) throw new Error('api_editItem 이 없습니다.');
  if (!/status !== ST_WAIT/.test(fn)) throw new Error('알 수 없는 상태를 거부하지 않습니다.');
  // 참여횟수는 증감이 아니라 전면 재계산이다 (규칙 3)
  if (!/_recalcAllParticipationCounts\(ss\)/.test(fn)) {
    throw new Error('참여자를 고친 뒤 참여횟수를 다시 세지 않습니다.');
  }
  if (/BAL_COL\.CNT\)\.setValue/.test(fn)) throw new Error('참여횟수를 직접 씁니다 — 재계산에 맡겨야 합니다.');
  // 같은 사람이 두 번 들어가면 그 사람만 참여횟수가 두 번 올라간다
  if (!/_normName/.test(fn)) throw new Error('중복 참여자를 이름 정규화로 걸러내지 않습니다.');
  // 미분배라 다이아는 아직 아무에게도 안 갔다 — 잔액을 건드리면 안 된다
  if (/잔액현황/.test(fn)) throw new Error('미분배 아이템 수정이 잔액을 건드립니다.');

  // ── 분배완료 아이템도 고친다 (v11.1) — 참여자 · 분배금액 ──
  // 이미 나눠준 다이아를 **분배 시점 금액 그대로** 회수해야 한다.
  // 새 명단으로 회수하면 실제로 준 사람에게서 못 빼고 안 받은 사람에게서 빼게 된다.
  if (!/function _correctCore\(ss, row, newAmount, email, newParts\)/.test(gs)) {
    throw new Error('정정 코어가 새 참여자 명단을 받지 않습니다.');
  }
  const core = extractFn(gs, '_correctCore');
  const revAt = core.indexOf('_reverseAmounts(balance, chk)');
  const swapAt = core.indexOf('ledger.getRange(row, LG.NAMES).setValue(newParts.join');
  if (swapAt < 0) throw new Error('참여자 명단을 갈아끼우지 않습니다.');
  // ★ 회수가 끝난 뒤에 명단을 바꿔야 한다 (규칙 2-1)
  if (swapAt < revAt) throw new Error('명단을 회수보다 먼저 바꿉니다 — 실제로 준 사람에게서 못 빼게 됩니다.');
  if (!/_recalcAllParticipationCounts\(ss\)/.test(core)) {
    throw new Error('명단을 바꾼 뒤 참여횟수를 다시 세지 않습니다.');
  }
  // 분배완료 건도 확인 절차를 거쳐야 한다 (돈이 움직인다)
  if (!/status === ST_DONE/.test(fn)) throw new Error('분배완료 아이템을 다루지 않습니다.');
  if (!/confirm !== true/.test(fn)) throw new Error('분배완료 건을 확인 없이 고칩니다 (규칙 5-1).');
  if (!/item\.editAsk/.test(fn)) throw new Error('바뀔 숫자를 담아 되묻지 않습니다.');
  if (!/_correctCore\(ss, row, amt, email, parts\)/.test(fn)) {
    throw new Error('분배완료 정정이 공통 되돌리기 코어를 쓰지 않습니다.');
  }
  const mroute = readFileSync(resolve(ROOT, 'app/api/master/item/route.ts'), 'utf8');
  if (!/confirm: body\.confirm === true/.test(mroute)) {
    throw new Error('라우트가 confirm 을 그대로 전달하지 않습니다.');
  }
  const led = readFileSync(resolve(ROOT, 'components/LedgerCard.tsx'), 'utf8');
  if (!/\/api\/master\/item/.test(led)) throw new Error('분배완료 화면에서 수정할 수 없습니다.');
  if (!/led\.editMembers/.test(led)) throw new Error('참여 인원 수정 입구가 없습니다.');

  if (!/case 'editItem':/.test(gs)) throw new Error('라우터에 editItem 이 없습니다.');
  if (!/'deleteItem', 'editItem'/.test(gs)) throw new Error('editItem 이 쓰기 액션 목록에 없습니다.');

  // 라우트는 마스터 전용 경로에 있어야 한다 (경로만 봐도 의도가 드러난다)
  const route = readFileSync(resolve(ROOT, 'app/api/master/item/route.ts'), 'utf8');
  if (!/requireMaster\(\)/.test(route)) throw new Error('아이템 수정 라우트가 마스터를 요구하지 않습니다.');
  const items = readFileSync(resolve(ROOT, 'components/ItemsTab.tsx'), 'utf8');
  if (!/\/api\/master\/item/.test(items)) throw new Error('앱이 마스터 라우트를 부르지 않습니다.');
  if (!/master \? \(\s*\n\s*<button className="btn ghost" onClick=\{\(\) => setEditing\(it\)\}/.test(items)) {
    throw new Error('수정 버튼이 마스터에게만 보이지 않습니다.');
  }
  return '미분배(이름·참여자) · 분배완료(참여자·금액, 스냅샷 회수 후 명단 교체·확인 필수) · 참여횟수 재계산 · 마스터 전용';
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

  /*
   * v10.8 — 한자 줄은 국문보다 **크다**. 중국 길드원에게는 한자가 본명이라
   * 작게 두면 자기 칸을 못 찾는다. 다만 키운 만큼 삐져나가면 안 되므로,
   * 두 줄이 같은 폭 예산(CHIP_NAME_PX)을 쓰는지 실제로 계산해 확인한다.
   */
  vm.runInContext(pick('fitIn'), ctx);
  const CHIP = Number((src.match(/export const CHIP_NAME_PX = (\d+)/) ?? [])[1]);
  if (!CHIP) throw new Error('CHIP_NAME_PX 상수가 없습니다.');
  const fitPx = (text, base, min) => {
    ctx.__a = text; ctx.__b = base; ctx.__c = min; ctx.__d = CHIP;
    return vm.runInContext('fitIn(__a, __d, __b, __c)', ctx);
  };
  const widthOf = (text) =>
    [...text].reduce((n, ch) => n + (/[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uff60]/.test(ch) ? 1 : 0.55), 0);

  // 짧은 한자는 국문(14)보다 크게 나와야 한다
  if (!(fitPx('斬斷', 19, 12) > fitPx('잠단', 14, 10))) {
    throw new Error('한자 줄이 국문보다 크지 않습니다.');
  }
  // 그리고 어떤 길이에서도 폭 예산을 넘지 않아야 한다 (최소 크기 하한은 예외 — 줄바꿈으로 처리)
  for (const name of ['斬斷', '卡尔K', '鮮肉小籠包', '車武植']) {
    const px = fitPx(name, 19, 12);
    if (px > 19) throw new Error(`${name}: 기본 크기보다 커졌습니다 (${px}).`);
    if (px > 12 && widthOf(name) * px > CHIP + 0.5) {
      throw new Error(`${name}: ${px}px 로 ${Math.round(widthOf(name) * px)}px 를 차지해 칩(${CHIP}px)을 넘습니다.`);
    }
  }

  const items = readFileSync(resolve(ROOT, 'components/ItemsTab.tsx'), 'utf8');
  if (!/nameParts\(state, m\)/.test(items) || !/fitIn\(/.test(items)) {
    throw new Error('참여자 선택 칩이 두 줄 표기를 쓰지 않습니다.');
  }
  // 잘리느니 줄바꿈이 낫다 — ellipsis 로 뭉개면 다른 사람으로 오인된다
  const css = readFileSync(resolve(ROOT, 'app/globals.css'), 'utf8');
  if (!/\.mchip \.nm/.test(css)) throw new Error('두 줄 이름 스타일이 없습니다.');
  const chipCss = (css.match(/\.mchip \.nm i \{[^}]*\}/) ?? [''])[0];
  if (/text-overflow/.test(chipCss)) throw new Error('한자 줄을 ellipsis 로 잘라냅니다.');

  return '괄호 분리 · (미등록) 예외 · 크기 축소 하한 · 한자 > 국문 · 폭 예산 4케이스';
});

check('멤버DB 한자표기가 잔액·아이템 화면까지 이어진다', () => {
  /*
   * 한자가 들어올 수 있는 자리가 둘이라 실제로 사고가 났다.
   *   ① 멤버DB G열 "한자표기" — 관리자가 [혈맹원 관리]에서 넣는 값
   *   ② 아이디 자체의 괄호 — `SogeKing (狙击王)`
   * 화면이 ②만 보고 있어서, ①에 넣은 값이 잔액·아이템에 전혀 나오지 않았다.
   * 그래서 nameParts 한 곳에서만 정하고, 모든 화면이 그걸 쓰는지 확인한다.
   */
  const src = readFileSync(CLIENT_PATH, 'utf8');
  const ctx = vm.createContext({});
  const strip = (name) => {
    const block = src.match(new RegExp(`export function ${name}[\\s\\S]*?\\n\\}`));
    if (!block) throw new Error(`${name} 이(가) 없습니다.`);
    const nl = block[0].indexOf('\n');
    const sig = block[0].slice(0, nl);
    const open = sig.indexOf('(');
    let depth = 0;
    let close = -1;
    for (let i = open; i < sig.length; i++) {
      if (sig[i] === '(') depth += 1;
      else if (sig[i] === ')') { depth -= 1; if (depth === 0) { close = i; break; } }
    }
    const params = sig.slice(open + 1, close).split(',').map((x) => x.trim()).filter(Boolean)
      .map((x) => (x.includes('=') ? x.replace(/:\s*[^=]+(?==)/, '') : x.replace(/:.*$/, '')).trim())
      // `hanja?: string` → `hanja` (선택 인자 표시는 자바스크립트 문법이 아니다)
      .map((x) => x.replace(/\?$/, ''));
    return `function ${name}(${params.join(', ')}) {` + block[0].slice(nl) + '\n';
  };
  vm.runInContext(strip('normName') + strip('splitName') + strip('mergeName') + strip('nameParts'), ctx);
  const parts = (state, name) => { ctx.__s = state; ctx.__n = name; return vm.runInContext('nameParts(__s, __n)', ctx); };

  const st = {
    memberInfo: [
      { name: '잡이K', hanja: '卡尔K' },          // ① G열만
      { name: 'SogeKing (狙击王)', hanja: '' },   // ② 아이디 괄호만
      { name: '잠단(斬斷)', hanja: '斬斷' },       // 둘 다 (같은 값)
      { name: 'ChecK', hanja: '' },               // 둘 다 없음
    ],
  };
  const cases = [
    ['잡이K', '잡이K', '卡尔K'],
    ['SogeKing (狙击王)', 'SogeKing', '狙击王'],
    ['잠단(斬斷)', '잠단', '斬斷'],
    ['ChecK', 'ChecK', ''],
    // 명단에 없는 사람도 터지지 않아야 한다 (탈퇴자·(미등록) 행)
    ['가이 (미등록)', '가이 (미등록)', ''],
  ];
  for (const [input, main, sub] of cases) {
    const r = parts(st, input);
    if (r.main !== main || r.sub !== sub) {
      throw new Error(`nameParts("${input}") = ${JSON.stringify(r)}, 기대 {main:"${main}", sub:"${sub}"}`);
    }
  }
  // ★ 없는 한자를 지어내지 않는다 (규칙 7)
  if (parts({ memberInfo: [] }, '잡이K').sub !== '') throw new Error('명단에 없는데 한자를 만들어냅니다.');

  // 화면들이 실제로 이 함수를 쓰는지 — 하나라도 빠지면 그 화면만 한자가 사라진다.
  // `personLabel`(서버까지 붙이는 한 줄 표기)도 안에서 nameParts 를 부르므로 같이 인정한다.
  if (!/nameParts\(/.test(readFileSync(resolve(ROOT, 'lib/client.ts'), 'utf8').match(/export function personLabel[\s\S]*?\n\}/)[0])) {
    throw new Error('personLabel 이 한자표기를 거치지 않습니다.');
  }
  for (const file of ['BalanceTab', 'ItemsTab', 'MeTab', 'PayoutSheet']) {
    const body = readFileSync(resolve(ROOT, `components/${file}.tsx`), 'utf8');
    if (!/nameParts\(|personLabel\(/.test(body)) throw new Error(`${file} 이(가) 한자표기를 반영하지 않습니다.`);
  }
  // 이름을 화면에 그리면서 splitName 을 직접 쓰면 G열을 놓치게 된다
  for (const file of ['BalanceTab', 'ItemsTab', 'MeTab']) {
    const body = readFileSync(resolve(ROOT, `components/${file}.tsx`), 'utf8');
    if (/splitName\(/.test(body)) throw new Error(`${file} 이(가) splitName 을 직접 씁니다 — nameParts 를 쓰세요.`);
  }

  // 입력칸 두 개가 붙어 있어야 한다 — 사이에 다른 칸이 끼면 한자 칸을 못 보고 지나간다
  const roster = readFileSync(resolve(ROOT, 'components/RosterCard.tsx'), 'utf8');
  const idAt = roster.indexOf("htmlFor=\"newName\"");
  const hanjaAt = roster.indexOf("htmlFor=\"mh\"");
  const weightAt = roster.indexOf("htmlFor=\"mw\"");
  if (idAt < 0 || hanjaAt < 0 || weightAt < 0) throw new Error('혈맹원 관리 입력칸을 찾지 못했습니다.');
  if (!(idAt < hanjaAt && hanjaAt < weightAt)) {
    throw new Error('한자표기 칸이 아이디 바로 아래가 아닙니다 (분배비중·서버가 사이에 끼어 있습니다).');
  }
  /*
   * 저장 버튼은 **하나**다 (v10.8.2). 아이디는 개명 API, 나머지는 설정 API 로 가지만
   * 관리자에게는 한 가지 일이다. 버튼이 둘이면 어느 쪽이 저장됐는지 알 수 없고,
   * 한쪽만 누르고 창을 닫기도 쉽다.
   */
  const saveFn = (roster.match(/async function save\(confirmMerge[\s\S]*?\n  \}/) ?? [''])[0];
  if (!saveFn) throw new Error('혈맹원 저장 함수(save)를 찾지 못했습니다.');

  // ★ 개명이 먼저다. 설정을 먼저 저장하면 옛 이름 행에 쓴 뒤 그 행이 사라진다.
  const at = (needle) => {
    const i = saveFn.indexOf(needle);
    if (i < 0) throw new Error(`저장 함수에서 "${needle}" 을(를) 찾지 못했습니다.`);
    return i;
  };
  if (at('/api/admin/rename') > at('/api/admin/member-settings')) {
    throw new Error('설정을 개명보다 먼저 저장합니다 — 옛 이름 행에 저장돼 사라집니다.');
  }
  // 개명 뒤의 설정 저장은 반드시 **바뀐 이름**으로 간다
  if (!/name:\s*current/.test(saveFn)) {
    throw new Error('개명 뒤 설정을 바뀐 이름(current)으로 저장하지 않습니다.');
  }
  // 저장 버튼이 하나뿐인지 — 예전엔 [이름 저장]과 [설정 저장]이 따로 있었다
  const saveButtons = (roster.match(/onClick=\{(?:\(\) => )?save\w*\(/g) ?? []).length;
  if (saveButtons !== 1) throw new Error(`저장 버튼이 ${saveButtons}개입니다 — 하나여야 합니다.`);

  return `해석 ${cases.length}케이스 · 화면 5곳 연결 · splitName 직접사용 0곳 · 입력칸 인접 · 개명 우선 · 저장 버튼 1개`;
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

check('서버 지정: 칩으로 고르고, 여러 명을 한 번에 넣는다', () => {
  const picker = readFileSync(resolve(ROOT, 'components/ServerPicker.tsx'), 'utf8');
  const bulk = readFileSync(resolve(ROOT, 'components/ServerBulkSheet.tsx'), 'utf8');
  const roster = readFileSync(resolve(ROOT, 'components/RosterCard.tsx'), 'utf8');

  // ① 드롭다운은 사라졌어야 한다. 12개를 고르는데 열고·굴리고·누르는 세 동작은
  //    40명이면 120번이다. 남아 있으면 칩을 만든 의미가 없다.
  if (/<select[^>]*id="ms"/.test(roster)) {
    throw new Error('혈맹원 관리에 서버 드롭다운이 남아 있습니다 — ServerPicker 로 바꿔야 합니다.');
  }
  if (!/<ServerPicker[\s\S]{0,200}?id="ms"/.test(roster)) {
    throw new Error('혈맹원 관리가 ServerPicker 를 쓰지 않습니다.');
  }

  // ② 접는 규칙은 공용(foldServers)을 쓰고, 지금 고른 값을 pinned 로 넘겨
  //    접힌 쪽에 있어도 항상 보이게 한다. 규칙 자체의 동작은 아래 검사에서 실행해 본다.
  if (!/foldServers\(servers,\s*inUse\s*\?\?\s*\[\],\s*\[value\]\)/.test(picker)) {
    throw new Error('현재 선택값을 접기 예외(pinned)로 넘기지 않습니다 — 고른 칩이 숨을 수 있습니다.');
  }

  // ④ 혈맹운영비는 사람이 아니라 계정이다. 서버를 붙일 대상이 아니다.
  if (!/filter\(\(m\) => !m\.isFund\)/.test(bulk)) {
    throw new Error('일괄 지정 목록에서 혈비 계정을 빼지 않습니다.');
  }

  // ⑤ 한 명이 실패해도 나머지는 계속 간다 + 실패자를 이름까지 알린다 (CLAUDE.md 규칙 6).
  //    Apps Script 에는 트랜잭션이 없어서 중간에 끊기면 절반만 반영된 채로 끝난다.
  const loop = bulk.slice(bulk.indexOf('for (const name of names)'), bulk.indexOf('setBusy(false)'));
  if (!loop || !/try\s*\{/.test(loop) || !/\}\s*catch/.test(loop)) {
    throw new Error('일괄 지정 반복문에 대상별 try/catch 가 없습니다 (규칙 6).');
  }
  if (!/failList:\s*failed\.join/.test(bulk)) {
    throw new Error('실패한 사람의 이름을 알려주지 않습니다 — 누구를 다시 해야 하는지 모릅니다.');
  }
  // 실패가 있으면 오류 색으로 띄운다 (toast 두 번째 인자 true)
  if (!/toast\(t\('sv\.partial'[\s\S]{0,160}?\),\s*true\)/.test(bulk)) {
    throw new Error('일부 실패를 성공처럼 알립니다.');
  }

  // ⑥ 쓰기는 관리자 경계를 지나야 한다 (마스터 전용이 아니다 — 잘못 넣어도 다시 넣으면 끝)
  if (!/'\/api\/admin\/member-settings'/.test(bulk)) {
    throw new Error('일괄 지정이 관리자 라우트를 쓰지 않습니다.');
  }

  // ⑦ 형식이 어긋난 값('1' 처럼)은 눈에 띄어야 한다. 그대로 두면 서버로 걸러도 안 잡힌다.
  if (!/!servers\.includes\(cur\)/.test(bulk)) {
    throw new Error('서버 목록에 없는 값을 표시하지 않습니다.');
  }

  // ⑧ 사전에 세 언어가 다 있는지 (없으면 언어를 바꿔도 한국어가 남는다)
  const dict = readFileSync(resolve(ROOT, 'lib/i18n.tsx'), 'utf8');
  const used = new Set([...(picker + bulk + roster).matchAll(/t\('(sv\.[\w.]+)'/g)].map((m) => m[1]));
  if (used.size < 8) throw new Error(`서버 관련 문구가 ${used.size}개뿐입니다 — 하드코딩이 의심됩니다.`);
  const missing = [...used].filter((k) => !dict.includes(`'${k}':`));
  if (missing.length) throw new Error(`사전에 없는 문구: ${missing.join(', ')}`);

  const css = readFileSync(resolve(ROOT, 'app/globals.css'), 'utf8');
  for (const cls of ['.svpick', '.svchip', '.svlist', '.svrow', '.chkline']) {
    if (!css.includes(cls + ' ') && !css.includes(cls + '\n') && !css.includes(cls + ',') && !css.includes(cls + '.')) {
      throw new Error(`${cls} 스타일이 없습니다.`);
    }
  }
  return `드롭다운 제거 · 접기 안전 · 혈비 제외 · 개별 try/catch · 실패 이름 보고 · 문구 ${used.size}개`;
});

check('아이템 등록: 서버로 좁혀도 체크한 사람은 절대 숨지 않는다', () => {
  const items = readFileSync(resolve(ROOT, 'components/ItemsTab.tsx'), 'utf8');
  const filter = readFileSync(resolve(ROOT, 'components/ServerFilter.tsx'), 'utf8');
  const clientSrc = readFileSync(resolve(ROOT, 'lib/client.ts'), 'utf8');

  // ① 가장 위험한 것부터 — 사진에서 자동으로 찾아낸 참여자가 다른 서버라는 이유로
  //    화면에서 사라지면, 관리자는 빠진 줄 알고 등록한다. 실제로는 들어가 있으므로
  //    확인 화면과 결과가 어긋난다. 체크된 사람은 서버와 무관하게 언제나 보인다.
  const vis = (items.match(/const visible = useMemo\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/) ?? [''])[0];
  if (!vis) throw new Error('참여자 목록을 좁히는 코드를 찾지 못했습니다.');
  if (!/\|\|\s*picked\.has\(m\)/.test(vis)) {
    throw new Error('체크한 사람이 서버 필터에 걸려 사라질 수 있습니다 — 등록 결과가 화면과 달라집니다.');
  }
  // ② 아무 서버도 안 골랐으면 예전처럼 전원이 나와야 한다. 서버 칸이 비어 있는
  //    상태에서 목록이 텅 비면 등록 자체가 막힌다.
  if (!/svPick\.length === 0\) return selectable/.test(vis)) {
    throw new Error('서버를 고르지 않았을 때 전원을 보여주지 않습니다.');
  }
  // ③ 나머지는 **감추는 것이 아니라 접어두는 것**이다 (사용자가 명시적으로 요청)
  if (!/items\.svUnfold/.test(items) || !/folded\.length > 0/.test(items)) {
    throw new Error('좁혀둔 나머지를 다시 펼칠 방법이 없습니다 — 예외 상황에서 고를 수가 없습니다.');
  }
  // ④ 전체 선택·해제는 보이는 사람에게만. 안 보이는 사람까지 딸려 들어가면 좁힌 의미가 없다
  const all = (items.match(/function selectAll\(on[\s\S]*?\n  \}/) ?? [''])[0];
  if (!/shown\.forEach/.test(all)) throw new Error('전체 선택이 보이지 않는 사람까지 건드립니다.');
  // ⑤ 서버 칸이 비어 있는 사람을 고를 길 (미지정 칩)
  if (!/noneCount > 0/.test(filter) || !/sv\.noneChip/.test(filter)) {
    throw new Error('서버 미지정 인원을 고를 칩이 없습니다.');
  }
  // ⑥ 혈비 계정은 참여자가 될 수 없다 — 세는 대상에서도 빠져야 한다
  if (!/svOf = useMemo[\s\S]{0,200}?selectable\.forEach/.test(items)) {
    throw new Error('서버별 인원을 셀 때 혈비 계정을 제외하지 않습니다.');
  }

  // ⑦ 접는 규칙은 한 벌이다. 두 벌이 되면 화면마다 다르게 접힌다.
  for (const [f, src] of [
    ['ServerPicker', readFileSync(resolve(ROOT, 'components/ServerPicker.tsx'), 'utf8')],
    ['ServerFilter', filter],
  ]) {
    if (!/foldServers\(/.test(src)) throw new Error(`${f} 가 공용 접기 규칙(foldServers)을 쓰지 않습니다.`);
  }

  // ⑧ 그 규칙을 실제로 실행해 본다 — 소스를 그대로 돌리되 시그니처의 타입만 벗긴다
  const m = clientSrc.match(/export function foldServers[\s\S]*?\n\}/);
  if (!m) throw new Error('foldServers 가 없습니다.');
  // 시그니처는 여러 줄이고 반환형에도 중괄호가 있다 — 괄호를 세어 정확히 끊는다
  const block = m[0];
  const open = block.indexOf('(');
  let depth = 0;
  let close = -1;
  for (let i = open; i < block.length; i++) {
    if (block[i] === '(') depth += 1;
    else if (block[i] === ')') { depth -= 1; if (depth === 0) { close = i; break; } }
  }
  if (close < 0) throw new Error('foldServers 시그니처를 읽지 못했습니다.');
  const params = block
    .slice(open + 1, close)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    // `all: string[]` → `all`,  `pinned: string[] = []` → `pinned = []` (기본값은 살린다)
    .map((x) => (x.includes('=') ? x.replace(/:\s*[^=]+(?==)/, '') : x.replace(/:.*$/, '')).trim());
  // 반환형에도 중괄호가 있다(`): { primary: ... } {`). 본문 여는 괄호는 그 줄의 마지막 것이다.
  const nl = block.indexOf('\n', close);
  const bodyStart = block.lastIndexOf('{', nl);
  if (bodyStart < close) throw new Error('foldServers 본문을 찾지 못했습니다.');
  // 본문은 손대지 않는다 — 손대는 순간 "검사한 코드"가 진짜 코드가 아니게 된다
  const body = `function foldServers(${params.join(', ')}) {` + block.slice(bodyStart + 1);
  const ctx = vm.createContext({});
  vm.runInContext(body, ctx);
  const fold = (all2, inUse, pinned) => {
    ctx.__a = all2; ctx.__b = inUse; ctx.__c = pinned;
    return vm.runInContext('foldServers(__a, __b, __c)', ctx);
  };
  const ALL = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

  // 아무도 배정되지 않았으면 접지 않는다 — 접으면 고를 것이 없어진다
  let r = fold(ALL, [], []);
  if (r.primary.length !== 12 || r.rest.length !== 0) throw new Error('배정 전에 이미 접습니다.');
  // ★ 하나만 쓰는데 다른 하나를 고른 순간 나머지 열이 접혀버리면, 다음 사람을
  //   또 다른 서버로 지정할 수가 없다. pinned 는 접을지 말지의 판단에 못 낀다.
  r = fold(ALL, ['01'], ['05']);
  if (r.rest.length !== 0) throw new Error('쓰는 서버가 하나뿐인데 접습니다 (고른 값이 판정에 끼어듦).');
  // 둘 이상 쓰면 접되, 고른 값은 접힌 쪽에 있어도 항상 보인다
  r = fold(ALL, ['01', '02'], ['09']);
  if (r.rest.includes('09') || !r.primary.includes('09')) throw new Error('고른 값이 접힌 쪽에 숨습니다.');
  if (r.primary.join(',') !== '01,02,09') throw new Error(`접힌 결과가 다릅니다: ${r.primary.join(',')}`);
  if (r.primary.length + r.rest.length !== ALL.length) throw new Error('접는 과정에서 서버가 사라집니다.');
  // 목록에 없는 값은 조용히 무시한다 ('1' 처럼 형식이 어긋난 값이 칩을 만들면 안 된다)
  r = fold(ALL, ['1', '01', '02'], []);
  if (r.primary.includes('1')) throw new Error("목록에 없는 값('1')으로 칩을 만듭니다.");

  const dict = readFileSync(resolve(ROOT, 'lib/i18n.tsx'), 'utf8');
  const used = new Set([...(items + filter).matchAll(/t\('(items\.sv[\w.]+|sv\.[\w.]+)'/g)].map((x) => x[1]));
  const missing = [...used].filter((k) => !dict.includes(`'${k}':`));
  if (missing.length) throw new Error(`사전에 없는 문구: ${missing.join(', ')}`);

  return `체크 유지 · 미선택시 전원 · 접어두기 · 전체선택 범위 · 미지정 칩 · 접기규칙 5케이스 · 문구 ${used.size}개`;
});

check('서버 표기는 한 곳에서 맞춘다 (01 과 1 이 같은 서버다)', () => {
  // 시트는 사람이 손으로 넣는 칸이라 `1` 과 `01` 이 섞인다. 예전에는 [잔액]만
  // padStart 를 해서, `1` 인 사람이 잔액에서는 01 로 보이는데 아이템의 01 칩에는
  // 안 잡혀 "01 서버 0명" 이 나왔다. 실제로 사용자가 발견한 버그다.
  const src = readFileSync(resolve(ROOT, 'lib/client.ts'), 'utf8');
  const m = src.match(/export function normServer[\s\S]*?\n\}/);
  if (!m) throw new Error('normServer 가 없습니다.');
  const ctx = vm.createContext({});
  const nl = m[0].indexOf('\n');
  vm.runInContext('function normServer(v) {' + m[0].slice(nl), ctx);
  const norm = (v) => { ctx.__v = v; return vm.runInContext('normServer(__v)', ctx); };

  for (const [input, want] of [
    ['1', '01'], ['01', '01'], ['9', '09'], ['12', '12'],
    ['', ''], [' 3 ', '03'], [undefined, ''], [null, ''],
    // ★ 알아볼 수 없는 값은 손대지 않는다. 그럴듯하게 바꾸면 엉뚱한 서버로 분류된다 (규칙 7)
    ['1서버', '1서버'], ['123', '123'], ['A1', 'A1'],
  ]) {
    const got = norm(input);
    if (got !== want) throw new Error(`normServer(${JSON.stringify(input)}) = ${JSON.stringify(got)} (기대 ${JSON.stringify(want)})`);
  }

  // 서버 값을 읽는 화면은 전부 이 함수를 지나야 한다. 한 곳이라도 빠지면 또 어긋난다.
  const files = ['components/BalanceTab.tsx', 'components/RosterCard.tsx', 'components/ServerBulkSheet.tsx'];
  for (const f of files) {
    const s = readFileSync(resolve(ROOT, f), 'utf8');
    if (!/normServer\(/.test(s)) throw new Error(`${f} 가 normServer 를 쓰지 않습니다.`);
    // 각자 padStart 를 부르면 규칙이 두 벌이 된다
    if (/padStart\(2/.test(s)) throw new Error(`${f} 가 직접 padStart 를 합니다 — normServer 로 모으세요.`);
  }
  // [아이템]은 serverOf 를 거쳐 읽는다 — serverOf 자체가 맞춰줘야 한다
  if (!/return normServer\(hit\?\.server\)/.test(src)) {
    throw new Error('serverOf 가 서버 표기를 맞추지 않습니다 — 아이템 칩의 인원이 0으로 나옵니다.');
  }

  return `표기 맞춤 11케이스 · 화면 ${files.length}곳 + serverOf · 개별 padStart 0곳`;
});

check('누구인지 확인하는 자리에는 어디서나 서버가 붙는다', () => {
  const src = readFileSync(resolve(ROOT, 'lib/client.ts'), 'utf8');

  // 규칙은 한 벌이다 — 화면마다 따로 조립하면 같은 사람이 화면마다 다르게 보인다
  const m = src.match(/export function personLabel[\s\S]*?\n\}/);
  if (!m) throw new Error('personLabel 이 없습니다.');
  if (!/serverOf\(state, name\)/.test(m[0])) throw new Error('personLabel 이 서버를 읽지 않습니다.');
  // ★ 서버가 없으면 아무것도 붙이지 않는다. 빈 자리나 '--' 를 넣으면
  //   지정된 사람과 아닌 사람이 같아 보인다.
  if (!/return sv \? .+ : who;/.test(m[0])) throw new Error('서버가 없을 때도 자리를 만듭니다.');

  // 사람을 가려내야 하는 화면은 전부 이 함수를 지난다
  const need = {
    'components/PayoutSheet.tsx': '지급 창',
    'components/ItemsTab.tsx': '등록 확인',
    'components/DistributeSheet.tsx': '분배 확인',
    'components/MeTab.tsx': '내 정보 목록',
  };
  for (const [f, what] of Object.entries(need)) {
    const s = readFileSync(resolve(ROOT, f), 'utf8');
    if (!/personLabel\(/.test(s)) throw new Error(`${what}(${f})에 서버가 안 붙습니다.`);
    // 각자 `main (sub)` 를 조립하면 규칙이 두 벌이 된다
    if (/\$\{main\} \(\$\{sub\}\)/.test(s)) throw new Error(`${what}가 표기를 직접 조립합니다 — personLabel 을 쓰세요.`);
  }

  // 참여자 칩은 배지로 붙인다 ([잔액] 목록과 같은 .svr)
  const items = readFileSync(resolve(ROOT, 'components/ItemsTab.tsx'), 'utf8');
  if (!/className="svr">\{sv\}/.test(items)) throw new Error('참여자 칩에 서버 배지가 없습니다.');
  // ★ 배지를 공짜로 얹으면 그만큼 이름이 삐져나간다. 예산에서 빼야 한다.
  if (!/CHIP_NAME_PX - \(sv \? CHIP_SVR_PX : 0\)/.test(items)) {
    throw new Error('서버 배지가 먹는 폭을 이름 예산에서 빼지 않습니다 — 이름이 삐져나갑니다.');
  }
  const css = readFileSync(resolve(ROOT, 'app/globals.css'), 'utf8');
  if (!/\.mchip \.nm b \.svr/.test(css)) throw new Error('참여자 칩의 서버 배지 스타일이 없습니다.');
  // 체크된 칩은 초록 바탕이라 청록 배지가 묻힌다
  if (!/\.mchip\.sel \.nm b \.svr/.test(css)) throw new Error('체크된 칩에서 배지가 묻힙니다.');

  // [관리]의 명단·일괄 지정도 같은 배지다 (v10.8.9). 여기만 글로 적어두면
  // 같은 정보가 화면마다 다르게 보여 누구인지 가리는 데 쓸 수가 없다.
  const ros = readFileSync(resolve(ROOT, 'components/RosterCard.tsx'), 'utf8');
  if (!/className="svr">\{normServer\(m\.server\)\}/.test(ros)) {
    throw new Error('혈맹원 관리 명단에 서버 배지가 없습니다.');
  }
  // 아랫줄의 "01 서버 ·" 글은 배지와 겹치므로 남아 있으면 안 된다
  if (/ali\.serverN[^)]*\}\)\} · `/.test(ros) || /m\.server \? `\$\{t\('ali\.serverN'/.test(ros)) {
    throw new Error('명단 아랫줄에 서버가 글로 또 적혀 있습니다.');
  }
  const bulk = readFileSync(resolve(ROOT, 'components/ServerBulkSheet.tsx'), 'utf8');
  if (!/className=\{'svr'/.test(bulk)) throw new Error('서버 일괄 지정 목록에 서버 배지가 없습니다.');
  // ★ 미지정에는 배지를 만들지 않는다 — 빈 배지는 지정된 것처럼 보인다
  if (!/\) : \(\s*<span className="cur">\{t\('sv\.none'\)\}<\/span>/.test(bulk)) {
    throw new Error('미지정에도 배지를 만듭니다.');
  }
  if (!/\.svrow \.svr/.test(css)) throw new Error('일괄 지정 목록의 배지 스타일이 없습니다.');
  // 잘못된 값은 danger 색으로. 정의되지 않은 토큰을 쓰면 배경이 엉뚱하게 나온다
  if (!/--danger-soft:/.test(css)) throw new Error('--danger-soft 토큰이 없습니다.');
  const dark = css.slice(css.indexOf('prefers-color-scheme: dark'), css.indexOf('\n}\n\n*'));
  if (!/--danger-soft:/.test(dark)) throw new Error('어두운 화면에 --danger-soft 가 없습니다.');

  // 배지가 붙은 이름이 실제로 칩을 안 넘는지 계산해 본다
  const CHIP = Number((src.match(/export const CHIP_NAME_PX = (\d+)/) ?? [])[1]);
  const SVR = Number((src.match(/export const CHIP_SVR_PX = (\d+)/) ?? [])[1]);
  if (!CHIP || !SVR) throw new Error('칩 폭 상수가 없습니다.');
  if (SVR >= CHIP / 2) throw new Error(`배지(${SVR}px)가 이름 폭(${CHIP}px)의 절반을 넘게 먹습니다.`);
  const ctx = vm.createContext({});
  for (const fn of ['fitFont', 'fitIn']) {
    const b = src.match(new RegExp(`export function ${fn}[\\s\\S]*?\\n\\}`))[0];
    const nl = b.indexOf('\n');
    const sig = b.slice(0, nl);
    const params = sig
      .slice(sig.indexOf('(') + 1, sig.lastIndexOf(')'))
      .split(',')
      .map((x) => x.trim())
      .map((x) => (x.includes('=') ? x.replace(/:\s*[^=]+(?==)/, '') : x.replace(/:.*$/, '')).trim());
    vm.runInContext(`function ${fn}(${params.join(', ')}) {` + b.slice(nl), ctx);
  }
  const widthOf = (text) =>
    [...text].reduce((n, ch) => n + (/[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-｠]/.test(ch) ? 1 : 0.55), 0);
  for (const name of ['가이', 'TC무식', '선륙소농포', 'PlusS']) {
    ctx.__a = name; ctx.__b = CHIP - SVR;
    const px = vm.runInContext('fitIn(__a, __b, 14, 10)', ctx);
    if (px > 10 && widthOf(name) * px + SVR > CHIP + 0.5) {
      throw new Error(`${name}: 배지까지 ${Math.round(widthOf(name) * px + SVR)}px 로 칩(${CHIP}px)을 넘습니다.`);
    }
  }

  return `규칙 1벌 · 화면 ${Object.keys(need).length}곳 + 참여자 칩 + 관리 2곳 · 폭 예산 4케이스`;
});

check('사람 목록은 어디서나 이름순(ㄱ~ㅎ)이다', () => {
  const src = readFileSync(resolve(ROOT, 'lib/client.ts'), 'utf8');
  const m = src.match(/export function byName[\s\S]*?\n\}/);
  if (!m) throw new Error('byName 이 없습니다.');
  // ★ 코드포인트 비교(`<`)로는 ㄱ~ㅎ 이 안 맞는다 — 반드시 한국어 collator 를 써야 한다
  if (!/Intl\.Collator\('ko'/.test(src)) throw new Error("Intl.Collator('ko') 를 쓰지 않습니다.");
  if (!/numeric: true/.test(src)) throw new Error('숫자를 글자로 비교합니다 — 유저10 이 유저2 앞에 옵니다.');
  // 같은 사람이 표기 차이로 멀어지면 안 된다 (규칙 4)
  if (!/NAME_COLLATOR\.compare\(normName\(a\), normName\(b\)\)/.test(m[0])) {
    throw new Error('이름을 _normName 없이 비교합니다.');
  }

  // 실제로 실행해 본다 — 소스를 그대로 돌리되 시그니처의 타입만 벗긴다
  const ctx = vm.createContext({});
  const norm = (src.match(/export function normName[\s\S]*?\n\}/) ?? [''])[0];
  const nl = norm.indexOf('\n');
  vm.runInContext('function normName(s) {' + norm.slice(nl), ctx);
  vm.runInContext(
    (src.match(/const NAME_COLLATOR = [^;]+;/) ?? [''])[0] +
      '\nfunction byName(a, b) {' + m[0].slice(m[0].indexOf('\n')),
    ctx,
  );
  const sort = (names) => { ctx.__n = names; return vm.runInContext('__n.slice().sort(byName)', ctx); };

  let r = sort(['하늘', '가이', '바람', '나무']);
  if (r.join(',') !== '가이,나무,바람,하늘') throw new Error(`ㄱ~ㅎ 순이 아닙니다: ${r.join(',')}`);
  // 표기가 달라도 같은 자리 — `잠단 (斬斷)` 과 `잠단(斬斷)` 이 떨어지면 안 된다
  r = sort(['잠단(斬斷)', '자유', '잠단 (斬斷)']);
  if (r[0] !== '자유') throw new Error(`괄호 표기가 정렬을 흔듭니다: ${r.join(',')}`);
  // 숫자는 숫자로
  r = sort(['유저10', '유저2', '유저1']);
  if (r.join(',') !== '유저1,유저2,유저10') throw new Error(`숫자 정렬이 틀립니다: ${r.join(',')}`);
  // 라틴·한자가 섞여도 터지지 않고 항상 같은 순서를 낸다
  const mixed = ['PlusS', '가이', '詹阿呆', 'TC무식'];
  if (sort(mixed).join(',') !== sort(mixed.slice().reverse()).join(',')) {
    throw new Error('입력 순서에 따라 결과가 달라집니다.');
  }

  // 세 화면이 모두 이 함수를 쓴다 — 한 곳만 빠지면 화면마다 순서가 달라진다
  const screens = {
    'components/BalanceTab.tsx': '잔액',
    'components/ItemsTab.tsx': '아이템',
    'components/RosterCard.tsx': '관리',
  };
  for (const [f, what] of Object.entries(screens)) {
    const body = readFileSync(resolve(ROOT, f), 'utf8');
    if (!/byName\(/.test(body)) throw new Error(`${what}(${f}) 목록이 이름순이 아닙니다.`);
    // 예전의 금액순 정렬이 남아 있으면 안 된다
    if (/sort\(\(a, b\) => b\.pending - a\.pending\)/.test(body)) {
      throw new Error(`${what} 가 아직 금액순으로 정렬합니다.`);
    }
  }
  // ★ 정렬 **뒤**에 혈비를 올려야 한다. 앞에서 올리면 정렬이 다시 내려버린다.
  const bal = readFileSync(resolve(ROOT, 'components/BalanceTab.tsx'), 'utf8');
  if (bal.indexOf('fundFirst(') < bal.indexOf('byName(a.name, b.name)')) {
    throw new Error('잔액: 정렬 전에 혈비를 올려서 다시 내려갑니다.');
  }
  const ros = readFileSync(resolve(ROOT, 'components/RosterCard.tsx'), 'utf8');
  if (ros.indexOf('fundFirst(sorted') < ros.indexOf('sort((a, b) => byName')) {
    throw new Error('관리: 정렬 전에 혈비를 올려서 다시 내려갑니다.');
  }

  return '정렬 4케이스 · 화면 3곳 · 혈비는 정렬 뒤에 고정';
});

check('혈맹운영비는 목록 맨 위에 온다', () => {
  const src = readFileSync(resolve(ROOT, 'lib/client.ts'), 'utf8');
  const m = src.match(/export function fundFirst[\s\S]*?\n\}/);
  if (!m) throw new Error('fundFirst 가 없습니다.');
  const ctx = vm.createContext({});
  const nl = m[0].indexOf('\n');
  vm.runInContext('function fundFirst(items, isFund) {' + m[0].slice(nl), ctx);
  const run = (items, key) => {
    ctx.__i = items; ctx.__k = key;
    return vm.runInContext('fundFirst(__i, (x) => x === __k)', ctx);
  };

  // 맨 위로 올라오되, **나머지 순서는 그대로**여야 한다.
  // 화면이 정해 놓은 정렬(잔액 많은 순)을 여기서 흐트러뜨리면 안 된다.
  let r = run(['가', '혈비', '나', '다'], '혈비');
  if (r.join(',') !== '혈비,가,나,다') throw new Error(`순서가 다릅니다: ${r.join(',')}`);
  // ★ 걸러져 없으면 억지로 되살리지 않는다. "받을 사람만 보기"를 켰는데 혈비가
  //   튀어나오면 필터가 거짓말을 하는 것이다.
  r = run(['가', '나'], '혈비');
  if (r.join(',') !== '가,나') throw new Error('목록에 없는 혈비를 만들어 냅니다.');
  r = run([], '혈비');
  if (r.length !== 0) throw new Error('빈 목록에 무언가를 넣습니다.');
  // 개수가 변하면 안 된다
  r = run(['혈비', '가'], '혈비');
  if (r.length !== 2 || r[0] !== '혈비') throw new Error('이미 맨 위일 때 어긋납니다.');

  // 두 화면 모두 적용 — [잔액]은 이름으로(정규화 경유, 규칙 4), [혈맹원 관리]는 시트의 isFund 로
  const bal = readFileSync(resolve(ROOT, 'components/BalanceTab.tsx'), 'utf8');
  if (!/fundFirst\(filtered,/.test(bal)) throw new Error('잔액 목록에서 혈비를 올리지 않습니다.');
  if (!/normName\(r\.name\) === fundKey/.test(bal)) throw new Error('혈비 판정에 _normName 을 안 씁니다 (규칙 4).');
  // 정렬 **뒤**에 올려야 한다. 앞에서 올리면 정렬이 다시 내려버린다.
  if (bal.indexOf('fundFirst(') < bal.indexOf('.sort((a, b) => b.pending')) {
    throw new Error('정렬 전에 올려서 다시 내려갑니다.');
  }
  // 맨 위에 아무 표시가 없으면 "잔액이 제일 많은 사람" 으로 읽힌다
  if (!/ros\.fundBadge/.test(bal)) throw new Error('잔액 목록의 혈비에 운영비 배지가 없습니다.');

  const ros = readFileSync(resolve(ROOT, 'components/RosterCard.tsx'), 'utf8');
  if (!/fundFirst\(sorted, \(m\) => m\.isFund\)/.test(ros)) {
    throw new Error('혈맹원 관리에서 혈비를 올리지 않습니다.');
  }
  return '순서 보존 4케이스 · 잔액(정렬 뒤·배지) · 혈맹원 관리';
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

check('보스 시간표는 요일별로 나뉘고 못 읽은 값을 지어내지 않는다', () => {
  // 한 줄에 '월,수,금' 을 몰아 넣으면 오늘 것만 고르는 계산이 불가능해진다.
  // 그래서 요일마다 한 줄이고, 요일·시간은 정규화 함수를 반드시 거친다.
  for (const fn of ['api_getRaid', 'api_addRaid', 'api_updateRaid', 'api_deleteRaid', '_normDay', '_normTime']) {
    if (!new RegExp(`function ${fn}\\b`).test(gs)) throw new Error(`${fn} 이(가) 없습니다.`);
  }

  // _normDay / _normTime 을 실제로 돌려본다 — "못 읽으면 빈 값" 이 지켜져야 한다
  const ctx = vm.createContext({
    RAID_DAYS: ['월', '화', '수', '목', '금', '토', '일'],
    Utilities: { formatDate: () => '20:20' },
    Session: { getScriptTimeZone: () => 'Asia/Seoul' },
  });
  vm.runInContext(extractFn(gs, '_normDay') + extractFn(gs, '_normTime'), ctx);

  const dayCases = [['월', 1], ['일요일', 7], [3, 3], ['', 0], ['아무거나', 0], [9, 0]];
  for (const [input, want] of dayCases) {
    const got = ctx._normDay(input);
    if (got !== want) throw new Error(`_normDay(${JSON.stringify(input)}) = ${got}, 기대 ${want}`);
  }
  const timeCases = [['20:20', '20:20'], ['8:5', '08:05'], ['20시20분', '20:20'], ['', ''], ['저녁쯤', '']];
  for (const [input, want] of timeCases) {
    const got = ctx._normTime(input);
    if (got !== want) throw new Error(`_normTime(${JSON.stringify(input)}) = ${JSON.stringify(got)}, 기대 ${JSON.stringify(want)}`);
  }

  // 읽을 수 없는 줄을 화면에 올리면 "요일 없는 보스"가 목록에 낀다
  const get = (gs.match(/function api_getRaid[\s\S]*?\n\}\n/) ?? [''])[0];
  if (!/if \(!day \|\| !time \|\| !boss\) return;/.test(get)) {
    throw new Error('요일·시간·보스가 빈 줄을 건너뛰지 않습니다.');
  }

  // 라우터·쓰기목록
  for (const action of ['raid', 'addRaid', 'updateRaid', 'deleteRaid']) {
    if (!new RegExp(`case '${action}':`).test(gs)) throw new Error(`라우터에 ${action} 이(가) 없습니다.`);
  }
  if (!/'addRaid', 'updateRaid', 'deleteRaid'/.test(gs)) {
    throw new Error('레이드 쓰기 액션이 API_WRITE_ACTIONS 에 없습니다.');
  }
  if (!/const RAID_SHEET\s*=/.test(gs)) throw new Error('RAID_SHEET 상수가 없습니다.');
  if (!/const BASE_SHEET_ORDER[^\n]*RAID_SHEET/.test(gs)) {
    throw new Error('[레이드] 시트가 시트 순서(BASE_SHEET_ORDER)에 없습니다.');
  }

  // 편집은 관리자 이상 — app/api/admin/raid 아래에 있어야 인증이 강제된다
  const route = readFileSync(resolve(ROOT, 'app/api/admin/raid/route.ts'), 'utf8');
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    if (!new RegExp(`export async function ${method}`).test(route)) throw new Error(`관리자 라우트에 ${method} 가 없습니다.`);
  }
  const pub = readFileSync(resolve(ROOT, 'app/api/raid/route.ts'), 'utf8');
  if (/export async function (POST|PATCH|DELETE)/.test(pub)) {
    throw new Error('공개 /api/raid 에 쓰기 메서드가 있습니다 — 인증 없이 시간표가 바뀝니다.');
  }
  if (!/dropIfFresh\(req, 'raid'\)/.test(pub)) throw new Error('/api/raid 가 fresh 조회를 지원하지 않습니다.');

  // 앱: 오늘 요일이 기본이고, 시트(1=월)와 getDay()(0=일)의 차이를 변환해야 한다
  const tab = readFileSync(resolve(ROOT, 'components/RaidTab.tsx'), 'utf8');
  if (!/js === 0 \? 7 : js/.test(tab)) throw new Error('getDay()(0=일) → 시트 요일(1=월) 변환이 없습니다.');
  if (!/useState\(\(\) => todayDay\(\)\)/.test(tab)) throw new Error('기본 요일이 오늘이 아닙니다.');

  return `요일·시간 정규화 ${dayCases.length + timeCases.length}케이스 · 빈 줄 제외 · 라우터 4종 · 공개 라우트 읽기 전용`;
});

check('공유 버튼은 게시판·관리 탭에 없다', () => {
  // 게시판 글은 그 자체가 이미 공유물이고, 관리 탭에는 PIN·도구처럼
  // 밖으로 나가면 안 되는 것이 섞여 있다.
  const want = ['BalanceTab', 'ItemsTab', 'AllianceTab', 'RaidTab', 'MeTab'];
  const forbid = ['BoardTab', 'AdminTab', 'ToolsCard', 'MasterCard', 'RosterCard', 'LedgerCard'];

  for (const name of want) {
    const src = readFileSync(resolve(ROOT, `components/${name}.tsx`), 'utf8');
    if (!/<ShareBtn/.test(src)) throw new Error(`${name} 에 공유 버튼이 없습니다.`);
  }
  for (const name of forbid) {
    const src = readFileSync(resolve(ROOT, `components/${name}.tsx`), 'utf8');
    if (/<ShareBtn/.test(src)) throw new Error(`${name} 에 공유 버튼이 있습니다 — 여기는 공유 대상이 아닙니다.`);
  }

  // 공유 시트를 그냥 닫은 것을 실패로 알리면 같은 걸 여러 번 보내게 된다
  if (!/AbortError/.test(clientTs)) throw new Error('공유 취소(AbortError)를 실패와 구분하지 않습니다.');
  const btn = readFileSync(resolve(ROOT, 'components/ShareBtn.tsx'), 'utf8');
  if (!/r === 'copied'/.test(btn)) throw new Error('클립보드로 물러섰을 때 사용자에게 알리지 않습니다.');

  // 화면 목록 (v11.2.1 — 하단 탭이 없어져 App.tsx 의 제목표가 곧 전체 화면 목록이다)
  const app = readFileSync(resolve(ROOT, 'components/App.tsx'), 'utf8');
  const screens = [...app.matchAll(/^  (\w+): 'tab\.\w+',$/gm)].map((m) => m[1]);
  const expected = ['balance', 'items', 'alliance', 'raid', 'me', 'board', 'admin'];
  if (screens.join(',') !== expected.join(',')) {
    throw new Error(`화면 목록이 다릅니다: ${screens.join(' ')} (기대 ${expected.join(' ')})`);
  }

  return `공유 ${want.length}곳 · 제외 ${forbid.length}곳 · 화면 ${expected.length}개`;
});

check('아이콘을 바꾸면 폰에서도 실제로 바뀐다', () => {
  /*
   * 아이콘을 갈았는데 폰에는 옛 그림이 그대로 나오던 일이 있었다.
   * 원인은 서비스워커였다 — JS·CSS 는 파일명에 빌드 해시가 붙어서 캐시 우선으로
   * 둬도 되지만, 아이콘과 manifest 는 **주소가 늘 같다.** 한 번 캐시에 들어가면
   * 파일을 바꿔도 영원히 옛 그림이 나온다.
   */
  const sw = readFileSync(resolve(ROOT, 'public/sw.js'), 'utf8');
  const noHash = sw.match(/const NO_HASH = (\/.*\/);/);
  if (!noHash) throw new Error('sw.js 에 주소가 고정된 파일 목록(NO_HASH)이 없습니다.');

  const re = new RegExp(noHash[1].slice(1, -1));
  // 주소가 고정된 것은 네트워크 우선이어야 한다
  for (const p of ['/manifest.webmanifest', '/favicon.ico', '/icon-192.png', '/icon-512.png', '/apple-icon.png']) {
    if (!re.test(p)) throw new Error(`${p} 이(가) 네트워크 우선 대상에서 빠졌습니다 — 갱신되지 않습니다.`);
  }
  // 해시가 붙은 것까지 네트워크 우선으로 만들면 캐시가 무의미해진다
  if (re.test('/_next/static/chunks/app/page-a87a505e.js')) {
    throw new Error('해시가 붙은 자산까지 네트워크 우선입니다 — 캐시가 무의미해집니다.');
  }
  if (!/caches\.match\(req\)/.test(sw.slice(sw.indexOf('NO_HASH.test')))) {
    throw new Error('네트워크가 끊겼을 때 캐시로 물러서지 않습니다.');
  }

  // 아이콘 파일이 실제로 있고, 빈 껍데기가 아닌지
  const need = [
    ['app/icon.png', 5_000],
    ['app/apple-icon.png', 5_000],
    ['app/favicon.ico', 1_000],
    ['public/icon-192.png', 5_000],
    ['public/icon-512.png', 20_000],
    ['public/icon-maskable-512.png', 20_000],
  ];
  for (const [file, min] of need) {
    const size = statSync(resolve(ROOT, file)).size;
    if (size < min) throw new Error(`${file} 이(가) 너무 작습니다 (${size}바이트) — 제대로 만들어지지 않았습니다.`);
    // 설치할 때마다 받는 파일이라 너무 커도 곤란하다
    if (size > 400_000) throw new Error(`${file} 이(가) 너무 큽니다 (${Math.round(size / 1024)}KB).`);
  }

  // manifest 가 가리키는 파일이 전부 있어야 한다 — 없으면 설치 시 아이콘이 비어버린다
  const mf = JSON.parse(readFileSync(resolve(ROOT, 'public/manifest.webmanifest'), 'utf8'));
  for (const ic of mf.icons) {
    statSync(resolve(ROOT, 'public' + ic.src));
  }
  /*
   * ★ maskable 은 안드로이드가 원·사각형 등으로 잘라낸다. 안쪽 80% 밖은 잘려나가므로
   *   여백을 넣은 별도 파일이어야 한다. 같은 파일을 쓰면 귀가 잘린다.
   */
  const any = mf.icons.filter((i) => i.purpose === 'any').map((i) => i.src);
  const mask = mf.icons.filter((i) => i.purpose === 'maskable').map((i) => i.src);
  if (mask.length === 0) throw new Error('manifest 에 maskable 아이콘이 없습니다.');
  if (mask.some((m) => any.includes(m))) {
    throw new Error('maskable 이 일반 아이콘과 같은 파일입니다 — 잘릴 때 얼굴이 잘려나갑니다.');
  }

  return `네트워크 우선 5종 · 아이콘 ${need.length}개 · manifest ${mf.icons.length}개 · maskable 분리`;
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
