/**
 * 가짜 구글시트 — 로컬 개발·테스트용.
 *
 * 진짜 스프레드시트를 건드리지 않고 앱을 돌려보기 위한 것이다.
 * Apps Script 의 doPost 와 같은 규약(JSON in / JSON out)으로 응답하며,
 * 등록·분배·지급이 실제로 잔액을 바꾸도록 상태를 들고 있다.
 *
 *   node scripts/mock-sheet.mjs            # 포트 8787
 *   MOCK_PORT=9000 node scripts/mock-sheet.mjs
 *
 * ⚠️ 진짜 정산 로직이 아니다. 산식이 맞는지는 `npm run verify:gs` 가
 *    실제 .gs 를 실행해서 검사한다. 여기서는 화면 흐름만 확인한다.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT) || 8787;
const TOKEN = process.env.MOCK_TOKEN || 'TESTTOKEN';

const FUND_NAME = '혈맹운영비';
const FUND_RATE = 0.1;
const DEFAULT_WEIGHT = 100;
const UNIT = '다이아';
const SERVER_LIST = ['01','02','03','04','05','06','07','08','09','10','11','12'];
// .gs · lib/client.ts 와 같은 목록이어야 한다 (verify:gs 가 대조한다)
/** .gs 의 _lootMeta 와 같은 규칙 — 루팅서버만 01~12 로 제한한다 */
function lootMeta(m) {
  const o = m || {};
  const sv = String(o.lootSv ?? '').trim();
  return {
    item: String(o.item ?? '').trim(),
    raid: String(o.raid ?? '').trim(),
    boss: String(o.boss ?? '').trim(),
    lootSv: SERVER_LIST.includes(sv) ? sv : '',
    lootCh: String(o.lootCh ?? '').trim(),
  };
}

const CLASS_LIST = ['기사', '요정', '마법사', '다크엘프', '전사', '군주', '수라',
                    '총사', '마격사', '성기사', '나찰', '귀검사', '혈법사'];
const MAX_MEMBERS = 100;   // .gs 의 MAX_MEMBERS 와 반드시 같아야 한다
const ST_WAIT = '⏳미분배';
const ST_DONE = '✅분배완료';
// 앱이 기대하는 버전과 같은 값 — 화면에 "버전 불일치" 경고가 뜨지 않아야 정상이다.
// ★ 한 곳에만 적는다. 여기저기 흩어 적으면 버전을 올릴 때 한 군데가 남아
//   "실어 온 상태의 버전이 다르다"는 엉뚱한 실패로 나타난다 (실제로 겪었다).
const GS_VERSION = '11.8';
let MOCK_GS_VERSION = GS_VERSION;

/**
 * .gs 의 `_rc` 와 같은 모양으로 결과에 코드·값을 붙인다.
 * 시트는 문장을 한 벌(한국어)만 만들고, 화면 언어 문장은 앱이 lib/i18n 사전으로 조립한다.
 * 모의 시트가 이걸 흉내내지 않으면 E2E 언어 검사가 진짜 동작을 확인하지 못한다.
 */
function rc(res, code, vars) {
  res.code = code;
  res.vars = vars || {};
  return res;
}

/** .gs 의 API_WRITE_ACTIONS 와 같은 목록 — 상태를 실어 보낼 대상 판정에 쓴다 */
const WRITE_ACTIONS = ['saveTerm', 'deleteTerm', 'bulkTerms',
                       'register', 'distribute', 'payout', 'rename', 'addMember', 'removeMember',
                       'correctItem', 'deleteItem', 'editItem', 'undoPayout', 'runTool',
                       'editAlliance', 'addAllianceServers',
                       'deletePost', 'addAlliance', 'creditAlliance', 'deleteAlliance', 'updateMember',
                       'bulkAddMembers',
                       'addRaid', 'updateRaid', 'deleteRaid',
                       'setAppName', 'setAdminPin', 'setSeasonServer'];

/**
 * .gs 의 `_withState` 와 같은 규약 (v10.2).
 * 쓰기 응답에 최신 상태를 같이 실어 보내, 앱이 한 번 더 왕복하지 않게 한다.
 * 모의 시트가 이걸 흉내내지 않으면 E2E 가 진짜 동작을 확인하지 못한다.
 */
function withState(result, payload) {
  if (!result || result.ok !== true) return result;
  if (payload.withState !== true) return result;
  if (!WRITE_ACTIONS.includes(payload.action)) return result;
  result.state = handlers.state().data;
  return result;
}

/** 실제 로스터를 흉내 낸 표본 — 한글·한자·영문 혼합, 이름 길이도 다양하게 */
function freshState() {
  return {
    // weight/server/hanja 는 멤버DB E·F·G 열을 흉내낸다.
    // '대서과Z' 를 50% 로 두어 비중 계산이 화면까지 이어지는지 볼 수 있게 한다.
    rows: [
      { name: '가이', pending: 12400, paid: 88000, cnt: 31, weight: 100, server: '01', hanja: '', cls: '기사' },
      { name: '잠단(斬斷)', pending: 0, paid: 45200, cnt: 19, weight: 100, server: '02', hanja: '斬斷', cls: '요정' },
      { name: 'TC무식', pending: 33150, paid: 120400, cnt: 44, weight: 100, server: '01', hanja: '车武植', cls: '마법사' },
      { name: FUND_NAME, pending: 51000, paid: 0, cnt: 12, weight: 100, server: '', hanja: '' },
      { name: 'PlusS', pending: 7700, paid: 15000, cnt: 8, weight: 100, server: '03', hanja: '', cls: '기사' },
      { name: '향로셔틀', pending: 0, paid: 9800, cnt: 5, weight: 100, server: '', hanja: '' },
      { name: '대서과Z', pending: 4500, paid: 0, cnt: 3, weight: 50, server: '04', hanja: '大西瓜Z', cls: '다크엘프' },
      { name: '팩맨', pending: 0, paid: 0, cnt: 0, weight: 100, server: '', hanja: '' },
      // ★ 서버가 '2' 다 — 앞의 0 이 빠진 채 저장된 사람. 사람이 손으로 넣는 칸이라
      //   실제로 생긴다. 모든 화면이 이걸 '02' 로 같게 읽는지 보는 표본이다 (v10.8.7)
      { name: '詹阿呆', pending: 2100, paid: 3300, cnt: 6, weight: 100, server: '2', hanja: '詹阿呆', cls: '군주' },
      // 긴 이름 — 좁은 칩에서 글자 크기가 실제로 줄어드는지 확인하기 위한 표본
      { name: '선륙소농포 (鮮肉小籠包)', pending: 0, paid: 0, cnt: 0, weight: 100, server: '06', hanja: '鮮肉小籠包', cls: '기사' },
    ],
    items: [
      // 인증샷 두 장 — 아이템명을 누르면 앱 안에서 바로 보인다 (v11.1).
      // ★ v11.7 — 한 장은 01서버, 한 장은 **서버 미지정**이다 (옛 기록이 그렇다).
      { row: 2, item: '기란 세금', date: '08/01', cnt: 3, names: ['가이', 'TC무식', '대서과Z'],
        photos: ['https://drive.google.com/file/d/MOCKFILEID001/view', 'https://drive.google.com/file/d/MOCKFILEID002/view'],
        shots: [{ sv: '01', url: 'https://drive.google.com/file/d/MOCKFILEID001/view' },
                { sv: '', url: 'https://drive.google.com/file/d/MOCKFILEID002/view' }] },
      { row: 5, item: '용의 심장', date: '08/03', cnt: 2, names: ['가이', 'PlusS'] },
    ],
    // 분배완료된 아이템 — 정정·삭제 대상.
    // 하나는 되돌릴 수 있고, 하나는 이미 지급되어 막히는 상황을 일부러 만들어 둔다.
    done: [
      { row: 3, item: '고대의 검', date: '07/28', cnt: 3, amount: 3000, names: ['가이', 'TC무식', '詹阿呆'] },
      { row: 4, item: '지급된 아이템', date: '07/20', cnt: 2, amount: 100000, names: ['팩맨', '향로셔틀'] },
    ],
    // 지급 이력 — 마지막 건을 되돌릴 수 있다
    payouts: [{ name: '향로셔틀', amount: 9800, date: '08/02 21:10' }],
    season: 3,
    seasonServer: '아덴-03',
    appName: '길드정산',
    nextRow: 9,
    nextPostId: 3,
    posts: [
      { id: 1, kind: 'notice', title: '이번 주 공성 일정', body: '토요일 21시 집합입니다.', author: '군주', at: '08/01 10:00' },
      { id: 2, kind: 'post', title: '레이드 파티 구합니다', body: '오늘 밤 9시요', author: 'PlusS', at: '08/03 19:20' },
    ],
    // 연합 — 시트와 같이 **서버마다 한 줄**이고, 같은 묶음(group)이 아이템 하나다 (v11.0)
    alliance: [
      { row: 2, group: 'A1', date: '08/02 14:00', server: '03', item: '연합 보스',
        amount: 40000, pct: 0, people: 12, credited: 24000, fund: 12000, done: true,
        photos: ['https://drive.google.com/file/d/MOCKFILEIDA01/view', 'https://drive.google.com/file/d/MOCKFILEIDB01/view'] },
      { row: 3, group: 'A1', date: '08/02 14:00', server: '05', item: '연합 보스',
        amount: 40000, pct: 0, people: 6, credited: 12000, photos: [], fund: 0, done: true },
      // 금액을 기다리는 등록 건 — v10.3 의 2단계 흐름을 화면에서 볼 수 있게
      // ★ 서버가 '5' 로 저장된 옛 행 — 시트 서식이 자동이면 '05' 가 숫자 5 로 바뀐다.
      //   그대로 집계하면 이 건의 금액이 서버별 누적에서 통째로 빠진다 (v11.1)
      { row: 4, group: 'A2', date: '08/05 21:00', server: '5', item: '연합 레이드',
        amount: 0, pct: 0, people: 18, credited: 0, photos: [], fund: 0, done: false },
    ],
    nextAllianceRow: 5,
    // 보스 시간표 (v10.8) — 요일은 1(월)~7(일). 요일마다 한 줄이다.
    raid: [
      { row: 2, day: 1, time: '20:20', boss: '다이아몬드골렘', note: '' },
      { row: 3, day: 2, time: '20:20', boss: '칼립소', note: '' },
      { row: 4, day: 3, time: '20:20', boss: '거대드레이크', note: '' },
      { row: 5, day: 4, time: '20:20', boss: '자이언트웜', note: '' },
      { row: 6, day: 5, time: '20:20', boss: '대혹장로', note: '' },
      { row: 7, day: 6, time: '20:20', boss: '샤스키', note: '' },
      { row: 8, day: 7, time: '20:20', boss: '칠흑데스', note: '' },
      // 요일 전체에 나오는 보스 — 어느 요일을 눌러도 하나는 보이게 해 둔다
      ...[1, 2, 3, 4, 5, 6, 7].map((d, i) => ({ row: 9 + i, day: d, time: '19:10', boss: '커츠', note: '' })),
      // 같은 시간에 둘 이상 겹치는 경우 (묶어서 보여주는지 확인용)
      ...[1, 2, 3, 4, 5, 6, 7].map((d, i) => ({ row: 16 + i, day: d, time: '19:10', boss: '오만1층2층', note: '' })),
    ],
    nextRaidRow: 23,
    // 📚 용어 사전 (v11.4) — 국문 · 中文 · English. 빈칸은 "아직 확인 못 했다"는 뜻이다
    terms: [
      { row: 2, cat: '보스', ko: '안타라스', zh: '安塔瑞斯', en: 'Antharas', img: '', note: '' },
      { row: 3, cat: '보스', ko: '발라카스', zh: '巴拉卡斯', en: 'Valakas', img: '', note: '' },
      // 그림 주소가 들어 있는 줄 — 공식 게임정보가 주는 주소다 (npm run icons:official).
      // 목록에서 이름 앞에 아이콘이 붙는 것을 실제로 보기 위한 표본이다.
      { row: 4, cat: '전설', ko: '용의 심장', zh: '龙之心', en: 'Dragon Heart', img: 'https://assets.playnccdn.com/gamedata/powerbook/linw/Item/item_Shield_Eva.png', note: '', tier: '3티어' },
      // 中文·English 를 아직 못 채운 줄 — 앱이 지어내지 않고 그대로 둔다
      { row: 5, cat: '스킬북', ko: '기란 마법서', zh: '', en: '', img: '', note: '확인 필요', tier: '' },
      // 장비인데 티어 표기가 없는 것 — 빈칸이 아니라 0티어다
      { row: 6, cat: '신화', ko: '드래곤 슬레이어', zh: '屠龍劍', en: 'Dragon Slayer', img: 'https://assets.playnccdn.com/gamedata/powerbook/linw/Item/item_Bow_saiha.png', note: '', tier: '0티어' },
      /* ── 아이템 → 보스 제안(lib/drops.ts)을 실제로 볼 표본 (v11.6.2) ──
         이름은 공식 표기 그대로여야 한다. 지어낸 이름을 넣으면 drops.ts 와
         짝이 안 맞아, 기능이 멀쩡한데 검사만 실패하는 상황이 된다. */
      // 보스가 하나뿐 → 아이템을 고르면 보스 칸이 자동으로 채워진다
      { row: 7, cat: '전설', ko: '군단의 대검', zh: '軍團大劍', en: 'Legion Greatsword', img: '', note: '', tier: '' },
      { row: 8, cat: '보스', ko: '망령 크리퍼스', zh: '亡靈克里佩斯', en: 'Revenant Creepers', img: '', note: '' },
      // 보스가 둘 → 자동으로 정하지 않고 칩으로 늘어놓아 사람이 고른다
      { row: 9, cat: '전설', ko: '검은 망령의 투구', zh: '黑色亡靈頭盔', en: "Black Revenant's Helm", img: '', note: '', tier: '3티어' },
      { row: 10, cat: '보스', ko: '명법군왕 헬바인', zh: '冥法君王赫爾拜恩', en: 'Hellvine', img: '', note: '' },
      { row: 11, cat: '보스', ko: '일렉카둠', zh: '伊萊卡頓', en: 'Elecadum', img: '', note: '' },
    ],
    nextTermRow: 12,
    adminPinOverride: '',
    renames: [
      { at: '07/12 09:30', before: '옛닉네임', after: '가이', by: 'admin@example.com', merged: false, detail: '"옛닉네임" → "가이"' },
    ],
  };
}

/**
 * 실제 Apps Script 의 _toolRegistry() 와 같은 모양.
 * master 플래그는 .gs 의 _toolNeedsMaster 와 같은 규칙(위험도 3)으로 붙인다.
 */
const TOOLS = [
  { id: 'recalcCounts', name: '🔁 참여횟수 재계산', desc: '등록 이력을 다시 세어 참여횟수를 맞춥니다.', danger: 1, confirm: '', inputs: [] },
  { id: 'tidy', name: '📐 시트 정돈', desc: '시트 순서와 행 높이를 표준으로 되돌립니다.', danger: 1, confirm: '', inputs: [] },
  { id: 'discord', name: '🔗 디스코드 알림 설정', desc: '등록·분배 시 자동 알림을 보냅니다.', danger: 1, confirm: '', inputs: [{ key: 'url', label: '웹훅 주소' }] },
  { id: 'importSeasons', name: '📚 지난 시즌 기록만 가져오기', desc: '옛 파일의 [시즌N] 시트만 복사합니다.', danger: 2, confirm: '', inputs: [{ key: 'url', label: '옛 스프레드시트 주소' }] },
  { id: 'seasonServer', name: '🗺️ 이번 시즌 서버 설정', desc: '이번 시즌의 서버 이름을 지정합니다.', danger: 1, confirm: '', inputs: [{ key: 'server', label: '서버 이름' }] },
  { id: 'seedRaid', name: '🗡️ 보스 시간표 기본값 채우기', desc: '[레이드] 시트를 기본 보스 시간표로 채웁니다.', danger: 2, confirm: '', inputs: [] },
  { id: 'renameFund', name: '🏦 혈비 계정을 혈맹운영비로 통일', desc: 'v9 이하의 계정명을 v10 이름으로 바꿉니다.', danger: 2, confirm: '', inputs: [] },
  { id: 'seasonEnd', name: '🏁 시즌 종료', desc: '기록을 보존하고 초기화합니다.', danger: 3, confirm: '시즌종료', inputs: [] },
  { id: 'importData', name: '📥 기존 파일에서 가져오기', desc: '쓰던 시트의 데이터를 옮깁니다.', danger: 3, confirm: '가져오기', inputs: [{ key: 'url', label: '기존 스프레드시트 주소' }] },
  { id: 'install', name: '🚀 최초 설치', desc: '빈 시트에 구조를 만듭니다.', danger: 3, confirm: '설치', inputs: [] },
  { id: 'factoryReset', name: '⚠️ 공장 초기화', desc: '전부 삭제하고 처음 상태로 되돌립니다.', danger: 3, confirm: '전부삭제', inputs: [] },
];

const RAID_DAYS = ['월', '화', '수', '목', '금', '토', '일'];

/** .gs 의 api_addRaid / api_updateRaid 와 같은 순서로 검사한다 */
function checkRaid(day, time, boss) {
  const d = Number(day);
  if (!Number.isInteger(d) || d < 1 || d > 7) return rc({ ok: false, msg: '요일을 골라주세요.' }, 'e.badDay');
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(time || ''))) {
    return rc({ ok: false, msg: '시간을 24시간 형식(예 20:20)으로 넣어주세요.' }, 'e.badTime');
  }
  const b = String(boss || '').trim();
  if (!b) return rc({ ok: false, msg: '보스 이름을 입력해주세요.' }, 'e.bossEmpty');
  if (b.length > 40) return rc({ ok: false, msg: '보스 이름이 너무 깁니다 (40자 이내).' }, 'e.bossLong');
  return null;
}

/** 보관된 시즌 기록 (실제 시트의 섹션 구조를 흉내낸다) */
const SEASONS = [
  {
    num: 2,
    title: '🏁 시즌 2 최종 기록  (종료일: 2026-07-10 · 정산 14건)',
    summary: [
      { label: '총 분배액', value: '182,000 다이아' },
      { label: '총 혈비 적립', value: '18,200 다이아' },
      { label: '이번 시즌 참여 인원(고유)', value: '21명' },
    ],
    sections: [
      {
        title: '💰 최종 잔액현황',
        headers: ['멤버', '분배전(다이아)', '분배완료(다이아)', '참여횟수'],
        rows: [
          ['가이', '0', '48,200', '18'],
          ['TC무식', '0', '62,400', '22'],
          ['PlusS', '0', '11,300', '7'],
        ],
      },
      {
        title: '📊 시즌 요약 통계',
        headers: ['항목', '값'],
        rows: [
          ['총 분배액', '182,000 다이아'],
          ['총 혈비 적립', '18,200 다이아'],
          ['이번 시즌 참여 인원(고유)', '21명'],
          ['최다 참여자', 'TC무식 (22회)'],
        ],
      },
    ],
  },
  {
    num: 1,
    title: '🏁 시즌 1 최종 기록  (종료일: 2026-05-30 · 정산 9건)',
    summary: [
      { label: '총 분배액', value: '95,000 다이아' },
      { label: '이번 시즌 참여 인원(고유)', value: '15명' },
    ],
    sections: [
      {
        title: '💰 최종 잔액현황',
        headers: ['멤버', '분배전(다이아)', '분배완료(다이아)', '참여횟수'],
        rows: [['가이', '0', '21,000', '9']],
      },
    ],
  },
];

let S = freshState();

/** .gs 의 _normName — 공백과 '(미등록)' 을 무시하고 비교한다 */
const norm = (s) => String(s ?? '').replace(/\s+/g, '').replace(/\(미등록\)/g, '');

/** .gs 의 _calcSplit 과 같은 산식 (v10: 비중 배열) */
function calcSplit(total, weights) {
  const w = typeof weights === 'number' ? Array.from({ length: weights }, () => DEFAULT_WEIGHT) : weights;
  const n = w.length;
  const fund = Math.floor(total * FUND_RATE);
  const distributable = total - fund;
  const perPerson = n > 0 ? Math.floor(distributable / n) : 0;
  const shares = w.map((p) => Math.floor((perPerson * p) / 100));
  const paid = shares.reduce((a, b) => a + b, 0);
  const remainder = distributable - paid;
  return { fund, distributable, perPerson, shares, remainder, fundTotal: fund + remainder };
}

/** 참여자 명단 → 비중 배열 */
function weightsFor(names) {
  return names.map((nm) => findRow(nm)?.weight ?? DEFAULT_WEIGHT);
}

function topNotice() {
  const n = S.posts.filter((p) => p.kind === 'notice');
  return n.length ? { id: n[n.length - 1].id, title: n[n.length - 1].title, at: n[n.length - 1].at } : null;
}

function findRow(name) {
  return S.rows.find((r) => norm(r.name) === norm(name));
}

/**
 * .gs 의 _recalcAllParticipationCounts — 참여횟수는 **전부 다시 센다.**
 * 증감으로 맞추면 한 번만 어긋나도 영원히 틀어진 채로 남는다 (규칙 3).
 */
function recalcCounts() {
  const tally = new Map();
  for (const it of [...S.items, ...S.done]) {
    for (const nm of participantsOf(it)) {
      tally.set(norm(nm), (tally.get(norm(nm)) ?? 0) + 1);
    }
  }
  for (const r of S.rows) {
    if (r.name === FUND_NAME) continue;
    r.cnt = tally.get(norm(r.name)) ?? 0;
  }
}

/**
 * .gs 의 _normServer — '1' 과 '01' 은 같은 서버다.
 * 시트에 '01' 을 넣어도 서식이 자동이면 구글시트가 숫자 1 로 바꿔 저장한다.
 */
function normServer(v) {
  const t = String(v == null ? '' : v).trim();
  return /^\d{1,2}$/.test(t) ? ('0' + t).slice(-2) : t;
}

/** 혈맹운영비 잔액에 더한다 (음수면 뺀다). 참여횟수는 건드리지 않는다 — 다른 사건이다 (규칙 3) */
function creditFund(delta) {
  if (!delta) return;
  const row = findRow(FUND_NAME);
  if (row) row.pending = Math.max(row.pending + delta, 0);
  else if (delta > 0) S.rows.push({ name: FUND_NAME, pending: delta, paid: 0, cnt: 0, weight: 100, server: '', hanja: '' });
}

/** 아이템의 참여자 명단 (없으면 혈비를 뺀 앞쪽 인원으로 근사) */
function participantsOf(item) {
  if (item.names) return item.names;
  return S.rows.filter((r) => r.name !== FUND_NAME).slice(0, item.cnt).map((r) => r.name);
}

/** .gs 의 _reversalPlan — 분배 시점 금액이 있으면 그대로, 없으면 전원 100%로 복원 */
function reversalPlan(it) {
  const plan = [];
  if (it.splits?.length) {
    it.splits.forEach((sp) => { if (sp.amount > 0) plan.push({ name: sp.name, amount: sp.amount }); });
  } else {
    const names = participantsOf(it);
    const sp = calcSplit(it.amount, names.length);
    names.forEach((nm) => { if (sp.perPerson > 0) plan.push({ name: nm, amount: sp.perPerson }); });
  }
  const toMembers = plan.reduce((a, b) => a + b.amount, 0);
  const fundBack = it.amount - toMembers;
  if (fundBack > 0) plan.push({ name: FUND_NAME, amount: fundBack });
  return plan;
}

function add(name, amount) {
  const row = findRow(name);
  if (row) row.pending += amount;
  else S.rows.push({ name, pending: amount, paid: 0, cnt: 0 });
}

/**
 * 이름에 딸려 온 게임 화면 요소를 떼어낸다 — `.gs` 의 `_stripNameTag` 와 같은 규칙.
 * 두 벌이 어긋나면 E2E 가 실제 시트와 다른 것을 검사하게 된다.
 */
function stripTag(raw) {
  let out = String(raw || '');
  out = out.replace(/\[[^[\]]*\]/g, ' ');
  out = out.replace(/(^|\s)[+＋]+(?=\s|$)/g, ' ');
  const parts = out.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    const kept = parts.filter((p, i) => i === 0 || !p.includes(']'));
    if (kept.length > 0) out = kept.join(' ');
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

/** 연합 서버 줄 정규화 — .gs 의 _allyEntries 와 같은 모양 (v11.3, 사진은 줄마다) */
function allyEntries(entries) {
  return (entries || [])
    .map((e) => ({
      server: normServer(e && e.server),
      people: Math.max(Math.floor(Number(e && e.people) || 0), 0),
      photos: ((e && e.photos) || []).map((u) => String(u || '').trim()).filter(Boolean),
    }))
    .filter((e) => e.server);
}

const handlers = {
  ping: () => ({ ok: true, version: MOCK_GS_VERSION, unit: UNIT }),

  state: () => ({
    ok: true,
    data: {
      rows: S.rows.map((r) => ({ ...r })),
      items: S.items.map((i) => ({ ...i, shots: i.shots ?? (i.photos ?? []).map((url) => ({ sv: '', url })) })),
      // 분배완료 목록 (v11.7) — 어떤 아이템이 얼마에 팔렸는지. 최근 것이 위로
      done: S.done
        .map((i) => {
          const sp = calcSplit(i.amount, weightsFor(participantsOf(i)));
          return {
            ...i,
            amount: i.amount,
            fund: sp.fundTotal,
            per: sp.perPerson,
            soldAt: i.soldAt ?? '',
            shots: i.shots ?? (i.photos ?? []).map((url) => ({ sv: '', url })),
          };
        })
        .reverse(),
      members: S.rows.map((r) => r.name),
      memberInfo: S.rows.map((r) => ({ name: r.name, weight: r.weight ?? 100, server: r.server ?? '', hanja: r.hanja ?? '', cls: r.cls ?? '' })),
      fundName: FUND_NAME,
      fundRate: FUND_RATE,
      defaultWeight: DEFAULT_WEIGHT,
      serverList: SERVER_LIST,
      seasonServer: S.seasonServer,
      appName: S.appName,
      notice: topNotice(),
      unit: UNIT,
      season: S.season,
      version: MOCK_GS_VERSION,
    },
  }),

  members: () => ({ ok: true, data: S.rows.map((r) => r.name).filter((n) => n !== FUND_NAME) }),

  lookup: ({ name }) => {
    const r = findRow(name);
    return r
      ? { ok: true, unit: UNIT, season: S.season, data: { ...r } }
      : { ok: false, msg: '멤버DB에서 찾지 못했습니다. 이름을 다시 확인해주세요.' };
  },

  register: ({ itemName, participants, photoLink, photoLinks, meta, photoEntries }) => {
    const list = (participants || []).filter((p) => p && p !== FUND_NAME);
    if (!itemName) return rc({ ok: false, msg: '아이템명을 입력해주세요.' }, 'e.itemEmpty');
    if (list.length === 0) return rc({ ok: false, msg: '참여 멤버를 선택해주세요.' }, 'e.noParticipants');

    // 참여횟수는 등록 시점에 확정된다 (다이아와 무관한 출석 지표)
    list.forEach((p) => {
      const r = findRow(p);
      if (r) r.cnt += 1;
    });
    // v11.0 — 한 아이템에 인증샷 여러 장. 옛 photoLink(한 장)도 그대로 받는다
    const pics = ((photoLinks && photoLinks.length ? photoLinks : [photoLink]) || [])
      .map((u) => String(u || '').trim())
      .filter(Boolean);
    /*
     * v11.7 — 어느 서버 파티의 사진인지까지 받는다 (.gs 의 _itemShots 와 같은 모양).
     * 서버 표시가 없는 것은 미지정으로 들어가고, 같은 주소는 한 번만 저장된다.
     */
    const shots = [];
    const seenUrl = new Set();
    (photoEntries || []).forEach((e) => {
      const sv = normServer(e && e.server) || '';
      (e?.photos || []).forEach((u) => {
        const url = String(u || '').trim();
        if (!url || seenUrl.has(url)) return;
        seenUrl.add(url);
        shots.push({ sv: SERVER_LIST.includes(sv) ? sv : '', url });
      });
    });
    pics.forEach((url) => {
      if (seenUrl.has(url)) return;
      seenUrl.add(url);
      shots.push({ sv: '', url });
    });
    // ★ item 은 빼고 펼친다 — lootMeta 의 빈 item 이 방금 넣은 이름을 덮어쓴다.
    //   (펼치기는 뒤에 오는 것이 이긴다 — 조용히)
    const { item: _ignore, ...lm } = lootMeta(meta);
    S.items.push({
      row: S.nextRow++,
      item: itemName,
      ...lm,
      date: new Date().toISOString().slice(5, 10).replace('-', '/'),
      cnt: list.length,
      names: list,
      photos: shots.map((x) => x.url),
      shots,
    });
    return rc({ ok: true, msg: `✅ "${itemName}" 등록 완료 (${list.length}명, ⏳미분배)` },
      'reg.ok', { item: itemName, n: list.length });
  },

  // ✏️ 미분배 아이템 수정 (v11.0, 마스터 전용) — 참여횟수는 전면 재계산한다
  editItem: ({ row, itemName, participants, amount, confirm }) => {
    const nm0 = String(itemName || '').trim();

    // ── 분배완료 아이템 (v11.1) — 참여자·분배금액을 고친다 ──
    const di = S.done.findIndex((x) => x.row === Number(row));
    if (di >= 0) {
      const cur = S.done[di];
      if (!nm0) return rc({ ok: false, msg: '아이템명을 입력해주세요.' }, 'e.itemEmpty');
      const seen0 = new Set();
      const parts0 = [];
      for (const p of participants || []) {
        const v = String(p || '').trim();
        if (!v || seen0.has(norm(v))) continue;
        seen0.add(norm(v));
        parts0.push(v);
      }
      if (parts0.length === 0) return rc({ ok: false, msg: '참여자를 한 명 이상 골라주세요.' }, 'e.noParts');
      const amt = amount === '' || amount === null || amount === undefined ? cur.amount : Number(String(amount).replace(/,/g, ''));
      if (!Number.isInteger(amt) || amt <= 0) return rc({ ok: false, msg: '금액은 양의 정수여야 합니다.' }, 'e.badAmount');

      // ★ 돈이 움직인다 — 바뀔 숫자를 보여준 뒤에만 실행한다 (규칙 5-1)
      if (confirm !== true) {
        const prev = calcSplit(amt, weightsFor(parts0));
        return rc({
          ok: false, needsConfirm: true, item: cur.item,
          before: { amount: cur.amount, n: participantsOf(cur).length },
          after: { amount: amt, n: parts0.length, fundTotal: prev.fundTotal, perPerson: prev.perPerson },
          msg: `"${cur.item}" 정정 — ${cur.amount} → ${amt}. 확인 후 다시 실행해주세요.`,
        }, 'item.editAsk', { item: cur.item, from: cur.amount, to: amt, fromN: participantsOf(cur).length, toN: parts0.length });
      }

      // ★ 회수는 분배 시점 금액으로 (규칙 2-1). 그 뒤에 명단을 갈아끼운다
      const plan = reversalPlan(cur);
      const short = plan.filter((e) => (findRow(e.name)?.pending ?? 0) < e.amount).map((e) => e.name);
      if (short.length) {
        return { ok: false, reason: 'insufficient', msg: '정정할 수 없습니다. 이미 지급✓ 처리된 대상이 있습니다: ' + short.join(', ') };
      }
      plan.forEach((e) => add(e.name, -e.amount));

      const ns = calcSplit(amt, weightsFor(parts0));
      parts0.forEach((p, i) => add(p, ns.shares[i]));
      add(FUND_NAME, ns.fundTotal);
      S.done[di] = { ...cur, item: nm0, amount: amt, cnt: parts0.length, names: parts0,
                     splits: parts0.map((p, i) => ({ name: p, amount: ns.shares[i] })) };
      recalcCounts();
      return rc({ ok: true, item: nm0, n: parts0.length, msg: `✅ "${nm0}" 정정 완료 — 참여 ${parts0.length}명` },
        'item.editOk', { item: nm0, n: parts0.length });
    }

    const it = S.items.find((i) => i.row === Number(row));
    if (!it) return rc({ ok: false, msg: '고칠 수 없는 상태입니다. 새로고침해주세요.' }, 'e.alreadyDone');
    const nm = nm0;
    if (!nm) return rc({ ok: false, msg: '아이템명을 입력해주세요.' }, 'e.itemEmpty');

    const seen = new Set();
    const parts = [];
    for (const p of participants || []) {
      const v = String(p || '').trim();
      if (!v || seen.has(norm(v))) continue;
      seen.add(norm(v));
      parts.push(v);
    }
    if (parts.length === 0) return rc({ ok: false, msg: '참여자를 한 명 이상 골라주세요.' }, 'e.noParts');

    it.item = nm;
    it.names = parts;
    it.cnt = parts.length;
    recalcCounts();
    return rc({ ok: true, item: nm, n: parts.length, msg: `✅ "${nm}" 수정 완료 — 참여 ${parts.length}명` },
      'item.editOk', { item: nm, n: parts.length });
  },

  distribute: ({ row, amount }) => {
    const idx = S.items.findIndex((i) => i.row === Number(row));
    if (idx < 0) return rc({ ok: false, msg: '이미 분배된 아이템입니다. 새로고침해주세요.' }, 'e.alreadyDone');
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) return rc({ ok: false, msg: '⚠️ 판매금액은 양의 정수여야 합니다.' }, 'e.badAmount');

    const item = S.items[idx];
    const names = participantsOf(item);
    const sp = calcSplit(amt, weightsFor(names));

    names.forEach((nm, i) => add(nm, sp.shares[i]));
    add(FUND_NAME, sp.fundTotal);

    S.items.splice(idx, 1);
    // 분배 시점 금액을 그대로 남긴다 — 비중이 나중에 바뀌어도 되돌리기가 정확해진다
    S.done.push({ ...item, amount: amt, soldAt: '08/05', names,
      splits: names.map((nm, i) => ({ name: nm, amount: sp.shares[i] })) });
    let msg = `✅ "${item.item}" ${amt.toLocaleString()}${UNIT} 분배 완료 — ${FUND_NAME} ${sp.fundTotal.toLocaleString()} / ${names.length}명 기본 ${sp.perPerson.toLocaleString()}`;
    if (sp.remainder > 0) msg += ` (잔여 ${sp.remainder.toLocaleString()}${UNIT} 운영비 귀속)`;
    return rc({ ok: true, msg }, 'dist.ok', {
      item: item.item, amount: amt, fund: FUND_NAME, fundTotal: sp.fundTotal,
      n: names.length, per: sp.perPerson, remainder: sp.remainder, missing: '',
    });
  },

  payout: ({ name, amount }) => {
    const r = findRow(name);
    if (!r) return rc({ ok: false, msg: `"${name}"을 찾지 못했습니다.` }, 'e.noMember', { name });
    if (r.pending <= 0) return rc({ ok: false, msg: `"${name}" 분배전 금액이 0입니다.` }, 'e.payZero', { name });

    const amt = amount === null || amount === undefined || amount === '' ? r.pending : Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) return rc({ ok: false, msg: '⚠️ 지급액은 양의 정수여야 합니다.' }, 'e.badAmount');
    if (amt > r.pending) {
      return rc({ ok: false, msg: `⚠️ 지급액이 분배전(${r.pending.toLocaleString()}${UNIT})보다 큽니다.` },
        'e.payOver', { pending: r.pending });
    }

    r.pending -= amt;
    r.paid += amt;
    S.payouts.push({ name: r.name, amount: amt, date: '08/04 12:00' });
    let msg = `✅ "${name}" ${amt.toLocaleString()}${UNIT} 지급 완료`;
    if (r.pending > 0) msg += ` (잔여 분배전 ${r.pending.toLocaleString()}${UNIT})`;
    return rc({ ok: true, msg }, 'pay.ok', { name, amount: amt, partial: r.pending > 0 ? 1 : 0, left: r.pending });
  },

  // 명단은 멤버DB 기준이라, 탈퇴 처리된 '(미등록)' 행은 빠진다
  roster: () => ({
    ok: true,
    data: S.rows
      .filter((r) => !r.name.includes('(미등록)'))
      .map((r) => ({
        name: r.name,
        displayName: '',
        pending: r.pending,
        isFund: r.name === FUND_NAME,
        weight: r.weight ?? 100,
        server: r.server ?? '',
        hanja: r.hanja ?? '',
        cls: r.cls ?? '',
      })),
  }),

  rename: ({ oldName, newName, confirmMerge }) => {
    const from = findRow(oldName);
    if (!from) return { ok: false, msg: `"${oldName}" 을(를) 멤버DB에서 찾지 못했습니다.` };
    if (norm(oldName) === norm(newName)) return { ok: false, msg: '기존 이름과 같습니다.' };
    if (oldName === FUND_NAME || newName === FUND_NAME) {
      return { ok: false, msg: `운영비 계정(${FUND_NAME})은 앱에서 변경할 수 없습니다.` };
    }

    const dup = findRow(newName);
    if (dup && confirmMerge !== true) {
      return {
        ok: false,
        needsConfirm: true,
        msg:
          `"${newName}" 은(는) 이미 명단에 있는 이름입니다.\n\n` +
          `그대로 진행하면 두 계정이 하나로 합쳐집니다.\n` +
          `· ${oldName} 분배전 ${from.pending.toLocaleString()}${UNIT}\n` +
          `· ${newName} 분배전 ${dup.pending.toLocaleString()}${UNIT}\n\n` +
          `동일 인물이 맞을 때만 진행하세요.`,
      };
    }

    if (dup) {
      // 병합 — 잔액·지급·참여횟수를 합치고 옛 행을 지운다
      dup.pending += from.pending;
      dup.paid += from.paid;
      dup.cnt += from.cnt;
      // 살아남는 쪽의 **빈 칸만** 옛 행에서 채워 온다 (.gs 의 _renameCore 와 같은 규칙, v10.9).
      // 채워져 있는 값을 덮어쓰면 관리자가 방금 넣은 값을 지우게 된다.
      ['server', 'hanja'].forEach((k) => {
        if (!String(dup[k] ?? '').trim() && String(from[k] ?? '').trim()) dup[k] = from[k];
      });
      S.rows.splice(S.rows.indexOf(from), 1);
      S.renames.push({ at: '08/04 12:00', before: oldName, after: newName, by: 'mock', merged: true, detail: `"${oldName}" → "${newName}" (중복 병합 발생)` });
      return rc({ ok: true, merged: true, msg: `✅ "${oldName}" → "${newName}" 변경 완료 (중복 계정 병합됨)` },
        'ren.ok', { from: oldName, to: newName, merged: 1 });
    }

    from.name = newName;
    S.renames.push({ at: '08/04 12:00', before: oldName, after: newName, by: 'mock', merged: false, detail: `"${oldName}" → "${newName}"` });
    return rc({ ok: true, merged: false, msg: `✅ "${oldName}" → "${newName}" 변경 완료` },
      'ren.ok', { from: oldName, to: newName, merged: 0 });
  },

  addMember: ({ name }) => {
    const nm = String(name || '').trim();
    if (!nm) return rc({ ok: false, msg: '아이디를 입력해주세요.' }, 'e.nameEmpty');
    if (nm === FUND_NAME) return { ok: false, msg: '운영비 계정은 앱에서 추가할 수 없습니다.' };
    if (findRow(nm)) return rc({ ok: false, msg: `"${nm}" 은(는) 이미 명단에 있습니다.` }, 'e.dupMember', { name: nm });
    if (S.rows.length >= MAX_MEMBERS) return rc({ ok: false, msg: `멤버가 최대 인원(${MAX_MEMBERS}명)에 도달했습니다.` }, 'e.maxMembers', { max: MAX_MEMBERS });

    S.rows.push({ name: nm, pending: 0, paid: 0, cnt: 0, weight: DEFAULT_WEIGHT, server: '', hanja: '' });
    return rc({ ok: true, msg: `✅ "${nm}" 을(를) 명단에 추가했습니다.` }, 'add.ok', { name: nm });
  },

  removeMember: ({ name, confirmRemove }) => {
    const r = findRow(name);
    if (!r) return { ok: false, msg: `"${name}" 을(를) 멤버DB에서 찾지 못했습니다.` };
    if (r.name === FUND_NAME) return { ok: false, msg: '운영비 계정은 앱에서 뺄 수 없습니다.' };

    if (confirmRemove !== true && r.pending > 0) {
      const warn =
        `"${r.name}" 을(를) 명단에서 뺍니다.\n\n` +
        `⚠️ 아직 받지 않은 분배전 잔액이 ${r.pending.toLocaleString()}${UNIT} 남아 있습니다.\n\n`;
      return { ok: false, needsConfirm: true, msg: warn + '그래도 진행할까요?' };
    }

    // 이력이 전혀 없을 때만 목록에서 지우고, 그 외에는 '(미등록)'으로 보존한다
    const kept = !(r.pending === 0 && r.paid === 0 && r.cnt === 0);
    if (kept) r.name = `${r.name} (미등록)`;
    else S.rows.splice(S.rows.indexOf(r), 1);

    return {
      ok: true,
      kept,
      code: 'rm.ok',
      vars: { name, kept: kept ? 1 : 0 },
      msg: `✅ "${name}" 탈퇴 처리 완료` + (kept ? ' — 기록은 "(미등록)" 으로 남겨두었습니다.' : ' — 이력이 없어 목록에서 지웠습니다.'),
    };
  },

  // OCR은 흉내만 낸다 — 실제 인식은 드라이브가 필요하다
  photo: () => ({
    ok: true,
    photoUrl: 'https://drive.google.com/file/d/MOCK/view',
    matched: ['가이', 'PlusS'],
    ocrPreview: '[모의 OCR]\n가이\nPlusS\n斬斷\n...',
    msg: '📷 사진 저장 완료 · 2명 자동 감지 (모의)',
  }),

  /* ── 정정 · 삭제 · 지급취소 · 도구 (v9.0) ── */

  itemsAll: () => ({
    ok: true,
    data: [...S.items, ...S.done].map((i) => ({
      row: i.row,
      item: i.item,
      status: i.amount ? '✅분배완료' : '⏳미분배',
      date: i.date,
      cnt: i.cnt,
      amount: i.amount ?? 0,
      perPerson: i.amount ? calcSplit(i.amount, weightsFor(participantsOf(i))).perPerson : 0,
      fund: i.amount ? calcSplit(i.amount, weightsFor(participantsOf(i))).fund : 0,
    })),
  }),

  previewReverse: ({ row }) => {
    const it = S.done.find((x) => x.row === Number(row)) ?? S.items.find((x) => x.row === Number(row));
    if (!it) return { ok: false, msg: '아이템을 찾을 수 없습니다.' };
    if (!it.amount) {
      return { ok: true, data: { item: it.item, status: '⏳미분배', n: it.cnt, amount: 0, needsReverse: false, blocked: false } };
    }
    const plan = reversalPlan(it);
    // 되돌릴 만큼 분배전이 남아 있는지 계획대로 확인한다
    const insufficient = plan
      .filter((e) => {
        const r = findRow(e.name);
        return !r || r.pending < e.amount;
      })
      .map((e) => `${e.name} (분배전 ${findRow(e.name)?.pending ?? 0} < 필요 ${e.amount})`);
    return {
      ok: true,
      data: {
        item: it.item, status: '✅분배완료', n: it.cnt, amount: it.amount, needsReverse: true,
        fundName: FUND_NAME,
        toMembers: plan.filter((e) => e.name !== FUND_NAME).reduce((a, b) => a + b.amount, 0),
        fund: plan.filter((e) => e.name === FUND_NAME).reduce((a, b) => a + b.amount, 0),
        lines: plan.map((e) => ({ name: e.name, amount: e.amount })),
        blocked: insufficient.length > 0, insufficient,
      },
    };
  },

  correctItem: ({ row, newAmount, confirm }) => {
    if (confirm !== true) return { ok: false, needsConfirm: true, msg: '확인이 필요합니다.' };
    const idx = S.done.findIndex((x) => x.row === Number(row));
    if (idx < 0) return { ok: false, msg: '분배완료 상태인 아이템만 정정할 수 있습니다.' };
    const it = S.done[idx];
    const plan = reversalPlan(it);
    const short = plan.filter((e) => (findRow(e.name)?.pending ?? 0) < e.amount).map((e) => e.name);
    if (short.length) return { ok: false, reason: 'insufficient', msg: '정정할 수 없습니다. 이미 지급✓ 처리된 대상이 있습니다: ' + short.join(', ') };

    plan.forEach((e) => add(e.name, -e.amount));

    S.done.splice(idx, 1);
    if (newAmount === null || newAmount === undefined || newAmount === '') {
      S.items.push({ row: it.row, item: it.item, date: it.date, cnt: it.cnt, names: it.names });
      return rc({ ok: true, redistributed: false, msg: `✅ "${it.item}" 되돌리기 완료 — ⏳미분배 상태로 돌아갔습니다.` },
        'cor.revert', { item: it.item });
    }
    const amt = Number(newAmount);
    const names = participantsOf(it);
    const ns = calcSplit(amt, weightsFor(names));
    names.forEach((nm, i) => add(nm, ns.shares[i]));
    add(FUND_NAME, ns.fundTotal);
    S.done.push({ ...it, amount: amt, splits: names.map((nm, i) => ({ name: nm, amount: ns.shares[i] })) });
    return { ok: true, redistributed: true, msg: `✅ "${it.item}" 정정 완료 — ${it.amount} → ${amt}${UNIT}` };
  },

  deleteItem: ({ row, confirm }) => {
    if (confirm !== true) return { ok: false, needsConfirm: true, msg: '확인이 필요합니다.' };
    // ★ v11.7 — 이미 분배된 건은 지우지 않는다. 잔액은 되돌려도 "그때 누가 얼마를
    //   받았다" 는 사실은 되돌릴 수 없다. 고칠 것은 [수정]이 담당한다
    const di = S.done.findIndex((x) => x.row === Number(row));
    if (di >= 0) {
      const it = S.done[di];
      return rc(
        { ok: false, reason: 'done', msg: `이미 분배된 "${it.item}" 은(는) 삭제할 수 없습니다. [수정]으로 고쳐주세요.` },
        'e.doneNoDelete',
        { item: it.item },
      );
    }
    const wi = S.items.findIndex((x) => x.row === Number(row));
    if (wi < 0) return { ok: false, msg: '아이템을 찾을 수 없습니다.' };
    const it = S.items[wi];
    S.items.splice(wi, 1);
    return { ok: true, msg: `✅ "${it.item}" 삭제 완료 — 참여횟수가 자동으로 재계산되었습니다.` };
  },

  lastPayout: () =>
    S.payouts.length
      ? { ok: true, data: S.payouts[S.payouts.length - 1] }
      : { ok: false, msg: '취소할 지급 기록이 없습니다.' },

  undoPayout: ({ confirm }) => {
    if (confirm !== true) return { ok: false, needsConfirm: true, msg: '확인이 필요합니다.' };
    const rec = S.payouts.pop();
    if (!rec) return { ok: false, msg: '취소할 지급 기록이 없습니다.' };
    const r = findRow(rec.name);
    if (r) {
      r.pending += rec.amount;
      r.paid = Math.max(r.paid - rec.amount, 0);
    }
    return rc({ ok: true, msg: `✅ "${rec.name}" ${rec.amount.toLocaleString()}${UNIT}가 분배전으로 복구되었습니다.` },
      'undo.ok', { name: rec.name, amount: rec.amount });
  },

  seasons: () => ({
    ok: true,
    data: SEASONS.map((x) => ({ num: x.num, name: '시즌' + x.num, title: x.title, summary: x.summary })),
  }),

  season: ({ num }) => {
    const s = SEASONS.find((x) => x.num === Number(num));
    return s
      ? { ok: true, data: { num: s.num, name: '시즌' + s.num, title: s.title, sections: s.sections } }
      : { ok: false, msg: '시즌' + num + ' 기록을 찾을 수 없습니다.' };
  },

  tools: () => ({ ok: true, data: TOOLS.map((t) => ({ ...t, master: t.danger >= 3 })) }),

  runTool: ({ id, params, confirmText }) => {
    const tool = TOOLS.find((t) => t.id === id);
    if (!tool) return { ok: false, msg: '알 수 없는 도구입니다: ' + id };
    if (tool.danger >= 3 && String(confirmText || '').trim() !== tool.confirm) {
      return {
        ok: false,
        needsConfirm: true,
        confirm: tool.confirm,
        msg: `이 작업은 되돌릴 수 없습니다.\n계속하려면 "${tool.confirm}" 을(를) 정확히 입력해주세요.`,
      };
    }
    if (id === 'seasonEnd') {
      S.season += 1;
      S.items = [];
      S.done = [];
      S.rows.forEach((r) => { r.pending = 0; r.paid = 0; r.cnt = 0; });
      return { ok: true, msg: `✅ 시즌을 종료했습니다. (시즌 ${S.season} 시작)` };
    }
    if (id === 'importSeasons') {
      if (!String(params?.url || '').match(/[-\w]{25,}/)) {
        return { ok: false, msg: '주소에서 파일 ID를 찾지 못했습니다.' };
      }
      return { ok: true, msg: '✅ 시즌1, 시즌2 을(를) 가져왔습니다. 이제 시즌 3 입니다.' };
    }
    if (id === 'seasonServer') {
      S.seasonServer = String(params?.server || '').trim();
      return { ok: true, msg: S.seasonServer ? `✅ 이번 시즌 서버를 "${S.seasonServer}" 로 설정했습니다.` : '✅ 시즌 서버명을 비웠습니다.' };
    }
    if (id === 'seedRaid') {
      // 실제 시트와 같이 통째로 지우고 다시 채운다
      S.raid = [];
      let row = 2;
      [
        { time: '19:10', boss: '커츠', days: [1, 2, 3, 4, 5, 6, 7] },
        { time: '20:20', boss: '오만10층', days: [1, 2, 3, 4, 5, 6, 7] },
        { time: '20:20', boss: '칠흑데스', days: [7] },
      ].forEach((e) => e.days.forEach((d) => S.raid.push({ row: row++, day: d, time: e.time, boss: e.boss, note: '' })));
      S.nextRaidRow = row;
      return rc({ ok: true, msg: `✅ 보스 시간표 ${S.raid.length}건을 채웠습니다.` }, 'raid.seedOk', { n: S.raid.length });
    }
    if (id === 'renameFund') {
      return { ok: true, msg: `✅ 이미 "${FUND_NAME}" 으로 되어 있습니다. 바꿀 것이 없습니다.` };
    }
    if (id === 'importData' && !String(params?.url || '').match(/[-\w]{25,}/)) {
      return { ok: false, msg: '주소에서 파일 ID를 찾지 못했습니다.' };
    }
    return { ok: true, msg: `✅ ${tool.name} 완료 (모의).` };
  },

  /* ── v10.0 ── */

  renameHistory: () => ({ ok: true, data: [...S.renames].reverse() }),

  posts: () => ({
    ok: true,
    data: [
      ...S.posts.filter((p) => p.kind === 'notice').reverse(),
      ...S.posts.filter((p) => p.kind !== 'notice').reverse(),
    ],
  }),

  addPost: ({ title, body, author, isNotice }) => {
    const t = String(title || '').trim();
    if (!t) return { ok: false, msg: '제목을 입력해주세요.' };
    if (t.length > 60) return { ok: false, msg: '제목이 너무 깁니다 (60자 이내).' };
    if (String(body || '').length > 1500) return { ok: false, msg: '내용이 너무 깁니다 (1500자 이내).' };
    const id = S.nextPostId++;
    S.posts.push({
      id,
      kind: isNotice === true ? 'notice' : 'post',
      title: t,
      body: String(body || ''),
      author: String(author || '').trim() || '익명',
      at: '08/05 09:00',
    });
    return rc({ ok: true, id, msg: isNotice === true ? '✅ 공지를 등록했습니다.' : '✅ 글을 등록했습니다.' },
      isNotice === true ? 'post.noticeOk' : 'post.ok');
  },

  deletePost: ({ id }) => {
    const i = S.posts.findIndex((p) => p.id === Number(id));
    if (i < 0) return { ok: false, msg: '이미 삭제된 글입니다.' };
    S.posts.splice(i, 1);
    return rc({ ok: true, msg: '✅ 삭제했습니다.' }, 'post.delOk');
  },

  /* ── 📚 용어 사전 (v11.4) ── */
  terms: () => ({
    ok: true,
    data: { terms: S.terms, cats: ['전설', '신화', '스킬북', '보스', '서버', '기타'], tiers: ['0티어', '1티어', '2티어', '3티어'] },
  }),

  // ★ 실제 시트가 받는 칸을 **하나도 빠짐없이** 받는다. 여기서 하나를 빠뜨리면
  //   그 칸이 지워지는 버그를 E2E 가 영영 못 잡는다 — 실제로 img·tier 가 그랬다.
  saveTerm: ({ row, cat, ko, zh, en, img, note, tier }) => {
    const name = String(ko || '').trim();
    if (!name) return rc({ ok: false, msg: '한국어 표기를 넣어주세요.' }, 'e.termKo');
    const at = Number(row) || 0;
    const key = (v) => String(v ?? '').replace(/\s+/g, '').toLowerCase();
    // 같은 국문이 두 줄이면 어느 것을 보여줄지 알 수 없다
    if (S.terms.some((t) => t.row !== at && key(t.ko) === key(name))) {
      return rc({ ok: false, msg: `"${name}" 은(는) 이미 있습니다.` }, 'e.termDup', { item: name });
    }
    const next = {
      cat: String(cat || '기타').trim(),
      ko: name,
      zh: String(zh || '').trim(),
      en: String(en || '').trim(),
      img: String(img || '').trim(),
      note: String(note || '').trim(),
      // 빈칸과 0티어는 다르다 — `|| ''` 로 뭉개면 0티어가 통째로 사라진다
      tier: String(tier ?? '').trim(),
    };
    const hit = S.terms.find((t) => t.row === at);
    if (hit) Object.assign(hit, next);
    else S.terms.push({ row: S.nextTermRow++, ...next });
    return rc({ ok: true, msg: `✅ "${name}" 을(를) 저장했습니다.` }, 'term.saveOk', { item: name });
  },

  bulkTerms: ({ rows }) => {
    const list = (rows || []).map((r) => ({
      cat: String((r && r.cat) || '기타').trim(),
      ko: String((r && r.ko) || '').trim(),
      zh: String((r && r.zh) || '').trim(),
      en: String((r && r.en) || '').trim(),
    })).filter((r) => r.ko);
    if (list.length === 0) return rc({ ok: false, msg: '넣을 용어가 없습니다.' }, 'e.termEmpty');

    const key = (v) => String(v ?? '').replace(/\s+/g, '').toLowerCase();
    const have = new Set(S.terms.map((t) => key(t.ko)));
    let added = 0;
    let skipped = 0;
    for (const r of list) {
      // ★ 이미 있는 것은 손대지 않는다 — 사람이 고쳐둔 표기를 지킨다
      if (have.has(key(r.ko))) { skipped += 1; continue; }
      have.add(key(r.ko));
      S.terms.push({ row: S.nextTermRow++, ...r, img: '', note: r.zh && r.en ? '' : '확인 필요' });
      added += 1;
    }
    return rc({ ok: true, added, skipped,
                msg: `✅ 용어 ${added}개를 넣었습니다.` }, 'term.bulkOk', { n: added, k: skipped });
  },

  deleteTerm: ({ row }) => {
    const at = Number(row) || 0;
    const i = S.terms.findIndex((t) => t.row === at);
    if (i < 0) return rc({ ok: false, msg: '지울 용어를 찾을 수 없습니다.' }, 'e.noRecord');
    const [gone] = S.terms.splice(i, 1);
    return rc({ ok: true, msg: `✅ "${gone.ko}" 을(를) 지웠습니다.` }, 'term.delOk', { item: gone.ko });
  },

  alliance: () => {
    const shape = (r) => ({ ...r, server: normServer(r.server), status: r.done ? ST_DONE : ST_WAIT });
    const totals = SERVER_LIST.map((sv) => {
      // ★ 아직 금액이 안 정해진 건은 누적에 넣지 않는다 (0원이 건수만 부풀린다)
      const rows = S.alliance.filter((r) => normServer(r.server) === sv && r.done);
      return {
        server: sv,
        credited: rows.reduce((a, b) => a + b.credited, 0),
        amount: rows.reduce((a, b) => a + b.amount, 0),
        people: rows.reduce((a, b) => a + b.people, 0),
        count: rows.length,
      };
    });

    // 같은 묶음을 아이템 하나로 모은다 — 화면은 언제나 이 단위로 본다
    const byGroup = new Map();
    for (const r of S.alliance) {
      if (!byGroup.has(r.group)) {
        byGroup.set(r.group, {
          group: r.group, date: r.date, item: r.item, by: '',
          amount: 0, fund: 0, people: 0, credited: 0,
          photos: [], servers: [], rows: [], done: r.done,
          // v11.6 — 묶음으로 옮기지 않으면 시트에는 있는데 화면에 안 보인다.
          // 화면은 언제나 묶음 단위로 그린다 (.gs 와 같은 규칙)
          raid: r.raid ?? '', boss: r.boss ?? '', lootSv: r.lootSv ?? '', lootCh: r.lootCh ?? '',
        });
      }
      const g = byGroup.get(r.group);
      g.servers.push({ server: normServer(r.server), people: r.people, credited: r.credited, photos: r.photos ?? [] });
      g.rows.push(r.row);
      g.people += r.people;
      g.credited += r.credited;
      g.fund += r.fund;
      if (r.amount > g.amount) g.amount = r.amount;
      for (const u of r.photos) if (!g.photos.includes(u)) g.photos.push(u);
      if (!r.done) g.done = false;
    }
    const groups = [...byGroup.values()].reverse();

    return {
      ok: true,
      data: {
        rows: [...S.alliance].reverse().map(shape),
        groups,
        waiting: groups.filter((g) => !g.done),
        records: groups.filter((g) => g.done),
        totals,
        serverList: SERVER_LIST,
        unit: UNIT,
      },
    };
  },

  // ① 등록 — 금액은 받지 않는다. 아이템 하나에 여러 서버 · 사진 여러 장 (v11.0)
  addAlliance: ({ item, entries, photoLinks, meta }) => {
    const nm = String(item || '').trim();
    if (!nm) return rc({ ok: false, msg: '아이템명을 입력해주세요.' }, 'e.itemEmpty');

    const list = allyEntries(entries);
    if (list.length === 0) return rc({ ok: false, msg: '참여한 서버를 하나 이상 넣어주세요.' }, 'e.badServer');

    const seen = new Set();
    for (const e of list) {
      if (!SERVER_LIST.includes(e.server)) return rc({ ok: false, msg: '서버를 01~12 중에서 선택해주세요.' }, 'e.badServer');
      // 같은 서버를 두 줄로 넣으면 인원이 갈려 분배 비율이 틀어진다
      if (seen.has(e.server)) {
        return rc({ ok: false, msg: `${e.server}서버가 두 번 들어갔습니다. 한 줄로 합쳐주세요.` }, 'e.dupServer', { s: e.server });
      }
      seen.add(e.server);
    }

    const group = 'A' + S.nextAllianceRow;
    const pics = (photoLinks || []).map((u) => String(u || '').trim()).filter(Boolean);
    list.forEach((e, i) => {
      S.alliance.push({
        row: S.nextAllianceRow++, group, date: '08/05 09:00', server: e.server, item: nm,
        ...(() => { const { item: _drop, ...rest } = lootMeta(meta); return rest; })(),
        // ★ 사진은 줄마다 그 서버의 것 (v11.3). 묶음 공용(옛 앱)은 첫 줄에 함께
        amount: 0, pct: 0, people: e.people, credited: 0,
        photos: i === 0 ? [...e.photos, ...pics] : [...e.photos], fund: 0, done: false,
      });
    });

    const total = list.reduce((a, e) => a + e.people, 0);
    const where = list.map((e) => `${e.server}서버 ${e.people}명`).join(' · ');
    return rc({ ok: true, group, servers: list.length, people: total,
                msg: `✅ "${nm}" 등록 완료 — ${where} (${ST_WAIT})` },
      'ally.regMulti', { item: nm, sv: list.length, n: total });
  },

  // ② 정산 — 혈비를 떼고 인원수 비례로 서버에 나눈다 (v11.0)
  /**
   * 레이드일·보스·루팅서버·루팅캐릭터만 고친다 (v11.6) — 관리자 이상.
   * 돈을 다루는 editAlliance 와 일부러 나뉘어 있다 — 이 경로로는 금액이 안 바뀐다.
   */
  setAllianceMeta: ({ group, meta }) => {
    const hit = S.alliance.filter((r) => r.group === group);
    if (hit.length === 0) return rc({ ok: false, msg: '기록을 찾을 수 없습니다.' }, 'e.noRecord');
    const m = lootMeta(meta);
    // 이름은 준 경우에만 바꾼다 (.gs 와 같은 규칙)
    hit.forEach((r) => Object.assign(r, m, m.item ? { item: m.item } : { item: r.item }));
    return rc({ ok: true, msg: '✅ 저장했습니다.' }, 'meta.saveOk');
  },

  /**
   * 📷 인증샷 더 붙이기 (v11.7) — .gs 의 api_addItemPhotos 와 같은 규칙.
   * **잇기만** 한다. 분배가 끝난 건에도 붙는다 (다이아를 안 움직인다).
   */
  addItemPhotos: ({ row, entries }) => {
    const hit =
      S.items.find((i) => i.row === Number(row)) ?? S.done.find((i) => i.row === Number(row));
    if (!hit) return rc({ ok: false, msg: '기록을 찾을 수 없습니다.' }, 'e.noRecord');
    for (const e of entries || []) {
      const sv = normServer(e && e.server) || '';
      if (sv && !SERVER_LIST.includes(sv)) return rc({ ok: false, msg: '서버를 01~12 중에서 선택해주세요.' }, 'e.badServer');
    }
    const cur = hit.shots ?? (hit.photos ?? []).map((url) => ({ sv: '', url }));
    const before = cur.length;
    const seen = new Set(cur.map((x) => x.url));
    (entries || []).forEach((e) => {
      const sv = normServer(e && e.server) || '';
      (e?.photos || []).forEach((u) => {
        const url = String(u || '').trim();
        if (!url || seen.has(url)) return;
        seen.add(url);
        cur.push({ sv: SERVER_LIST.includes(sv) ? sv : '', url });
      });
    });
    hit.shots = cur;
    hit.photos = cur.map((x) => x.url);
    const added = cur.length - before;
    return rc(
      {
        ok: true,
        added,
        total: cur.length,
        msg: added > 0
          ? `✅ "${hit.item}" 에 인증샷 ${added}장을 더했습니다. (모두 ${cur.length}장)`
          : `이미 붙어 있는 사진입니다. (모두 ${cur.length}장)`,
      },
      added > 0 ? 'shot.added' : 'shot.dup',
      { item: hit.item, n: added, total: cur.length },
    );
  },

  setItemMeta: ({ row, meta }) => {
    const hit =
      S.items.find((i) => i.row === Number(row)) ?? S.done.find((i) => i.row === Number(row));
    if (!hit) return rc({ ok: false, msg: '기록을 찾을 수 없습니다.' }, 'e.noRecord');
    const mm = lootMeta(meta);
    Object.assign(hit, mm, mm.item ? { item: mm.item } : { item: hit.item });
    return rc({ ok: true, msg: '✅ 저장했습니다.' }, 'meta.saveOk');
  },

  creditAlliance: ({ group, amount }) => {
    const targets = S.alliance.filter((r) => r.group === String(group));
    if (targets.length === 0) return rc({ ok: false, msg: '기록을 찾을 수 없습니다.' }, 'e.noRecord');
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) return rc({ ok: false, msg: '금액은 양의 정수여야 합니다.' }, 'e.badAmount');
    // 두 번 누적되면 서버 총액이 틀어진다
    if (targets.some((r) => r.done)) {
      return rc({ ok: false, msg: '이미 정산된 건입니다. 새로고침해주세요.' }, 'e.allyDone', { item: targets[0].item });
    }

    // ★ .gs 의 _calcAlliance 와 같은 산식이어야 한다 (규칙 1)
    const fund = Math.floor(amt * FUND_RATE);
    const pool = amt - fund;
    const people = targets.reduce((a, r) => a + r.people, 0);
    const shares = targets.map((r) => (people > 0 ? Math.floor((pool * r.people) / people) : 0));
    const fundTotal = fund + (pool - shares.reduce((a, b) => a + b, 0));

    targets.forEach((r, i) => {
      r.amount = amt;
      r.credited = shares[i];
      r.fund = i === 0 ? fundTotal : 0;
      r.done = true;
    });
    // 혈맹운영비 잔액에 실제로 적립된다 (개인 잔액은 건드리지 않는다)
    creditFund(fundTotal);

    const where = targets.map((r, i) => `${r.server} ${r.people}명 ${shares[i].toLocaleString()}`).join(' · ');
    return rc({ ok: true, group, credited: pool - (pool - shares.reduce((a, b) => a + b, 0)), fund: fundTotal, people,
                msg: `✅ "${targets[0].item}" ${amt.toLocaleString()}${UNIT} 정산 완료 — ${FUND_NAME} ${fundTotal.toLocaleString()} · ${where}` },
      'ally.creditMulti', { item: targets[0].item, amount: amt, fund: FUND_NAME, fundTotal, n: people, where });
  },

  // ✏️ 연합 정정 (v11.1, 마스터) — 미분배는 바로, 정산된 건은 되물은 뒤에
  editAlliance: ({ group, item, entries, amount, confirm }) => {
    const hit = S.alliance.filter((r) => r.group === String(group));
    if (hit.length === 0) return rc({ ok: false, msg: '기록을 찾을 수 없습니다.' }, 'e.noRecord');
    const nm = String(item || '').trim();
    if (!nm) return rc({ ok: false, msg: '아이템명을 입력해주세요.' }, 'e.itemEmpty');

    const list = allyEntries(entries);
    if (list.length === 0) return rc({ ok: false, msg: '참여한 서버를 하나 이상 넣어주세요.' }, 'e.badServer');
    const seen = new Set();
    for (const e of list) {
      if (!SERVER_LIST.includes(e.server)) return rc({ ok: false, msg: '서버를 01~12 중에서 선택해주세요.' }, 'e.badServer');
      if (seen.has(e.server)) return rc({ ok: false, msg: `${e.server}서버가 두 번 들어갔습니다.` }, 'e.dupServer', { s: e.server });
      seen.add(e.server);
    }

    // ★ v11.8 — 정산된 건도 관리자가 고친다. 대신 아래 confirm 게이트가 남는다
    const done = hit.some((r) => r.done);
    const oldFund = hit.reduce((a, r) => a + r.fund, 0);
    const oldAmount = hit.reduce((a, r) => Math.max(a, r.amount), 0);
    const before = hit[0].item;

    let s2 = null;
    if (done) {
      const raw = amount === '' || amount === null || amount === undefined ? oldAmount : amount;
      const amt = Number(String(raw).replace(/,/g, ''));
      if (!Number.isInteger(amt) || amt <= 0) return rc({ ok: false, msg: '금액은 양의 정수여야 합니다.' }, 'e.badAmount');
      const fund = Math.floor(amt * FUND_RATE);
      const pool = amt - fund;
      const people = list.reduce((a, e) => a + e.people, 0);
      const shares = list.map((e) => (people > 0 ? Math.floor((pool * e.people) / people) : 0));
      s2 = { amount: amt, shares, fundTotal: fund + (pool - shares.reduce((a, b) => a + b, 0)) };

      // ★ 돈이 움직이는 정정은 바뀔 숫자를 보여준 뒤에만 실행한다 (규칙 5-1)
      if (confirm !== true) {
        return rc({
          ok: false, needsConfirm: true, item: before,
          before: { amount: oldAmount, fund: oldFund },
          after: { amount: s2.amount, fund: s2.fundTotal },
          fundDelta: s2.fundTotal - oldFund,
          msg: `"${before}" 정정 — ${FUND_NAME} ${oldFund.toLocaleString()} → ${s2.fundTotal.toLocaleString()}. 확인 후 다시 실행해주세요.`,
        }, 'ally.editAsk', { item: before, fund: FUND_NAME, from: oldFund, to: s2.fundTotal });
      }
    }

    // 묶음을 새 목록으로 바꿔 끼운다 (첫 줄의 인증샷은 지킨다)
    const photos = hit[0].photos;
    const date = hit[0].date;
    const rows = list.map((e, i) => ({
      row: hit[i] ? hit[i].row : S.nextAllianceRow++,
      group: String(group), date, server: e.server, item: nm,
      amount: done ? s2.amount : 0, pct: 0, people: e.people,
      credited: done ? s2.shares[i] : 0,
      photos: i === 0 ? photos : [],
      fund: done && i === 0 ? s2.fundTotal : 0,
      done,
    }));
    const at = S.alliance.findIndex((r) => r.group === String(group));
    S.alliance = S.alliance.filter((r) => r.group !== String(group));
    S.alliance.splice(at, 0, ...rows);
    // ★ 전액을 다시 더하면 고칠 때마다 운영비가 불어난다 — 차액만 더한다
    if (done) creditFund(s2.fundTotal - oldFund);

    const total = list.reduce((a, e) => a + e.people, 0);
    return rc({ ok: true, group, servers: list.length, people: total,
                amount: done ? s2.amount : 0, fund: done ? s2.fundTotal : 0,
                msg: `✅ "${nm}" 정정 완료` },
      'ally.editOk', { item: nm, sv: list.length, n: total });
  },

  // ➕ 참여 서버 추가 (v11.1, 관리자) — 줄을 더하기만 한다
  addAllianceServers: ({ group, entries, photoLinks }) => {
    const hit = S.alliance.filter((r) => r.group === String(group));
    if (hit.length === 0) return rc({ ok: false, msg: '기록을 찾을 수 없습니다.' }, 'e.noRecord');
    if (hit.some((r) => r.done)) {
      return rc({ ok: false, msg: '이미 정산된 건입니다.' }, 'e.allyDone', { item: hit[0].item });
    }
    const list = allyEntries(entries);
    if (list.length === 0) return rc({ ok: false, msg: '추가할 서버를 하나 이상 넣어주세요.' }, 'e.badServer');

    const have = new Set(hit.map((r) => normServer(r.server)));
    const seen = new Set();
    for (const e of list) {
      if (!SERVER_LIST.includes(e.server)) return rc({ ok: false, msg: '서버를 01~12 중에서 선택해주세요.' }, 'e.badServer');
      if (seen.has(e.server) || have.has(e.server)) {
        return rc({ ok: false, msg: `${e.server}서버가 두 번 들어갔습니다.` }, 'e.dupServer', { s: e.server });
      }
      seen.add(e.server);
    }

    // ★ 인증샷은 묶음의 첫 줄에 모아 둔다. 새로 넣은 것을 뒤에 잇는다 (덮어쓰지 않는다)
    const added = (photoLinks || []).map((u) => String(u || '').trim()).filter(Boolean);
    for (const u of added) if (!hit[0].photos.includes(u)) hit[0].photos.push(u);

    const last = S.alliance.lastIndexOf(hit[hit.length - 1]);
    const rows = list.map((e) => ({
      row: S.nextAllianceRow++, group: String(group), date: hit[0].date, server: e.server,
      item: hit[0].item, amount: 0, pct: 0, people: e.people, credited: 0,
      photos: [...e.photos], fund: 0, done: false,
    }));
    S.alliance.splice(last + 1, 0, ...rows);

    const total = list.reduce((a, e) => a + e.people, 0);
    return rc({ ok: true, group, servers: list.length, people: total,
                msg: `✅ "${hit[0].item}" 에 서버 ${list.length}곳을 추가했습니다.` },
      'ally.addSv', { item: hit[0].item, sv: list.length, n: total });
  },

  deleteAlliance: ({ group }) => {
    const hit = S.alliance.filter((r) => r.group === String(group));
    if (hit.length === 0) return rc({ ok: false, msg: '기록을 찾을 수 없습니다.' }, 'e.noRecord');
    const item = hit[0].item;
    const credited = hit.reduce((a, r) => a + r.credited, 0);
    // ★ v11.8 — 정산이 끝난 건은 아무도 못 지운다. 혈비가 이미 적립된 뒤라,
    //   지우면 "그때 얼마가 들어왔다" 는 사실까지 사라진다. 고칠 것은 [수정]이 담당한다
    if (hit.some((r) => r.done)) {
      return rc(
        { ok: false, reason: 'done', msg: `이미 정산된 "${item}" 은(는) 삭제할 수 없습니다. [수정]으로 고쳐주세요.` },
        'e.allyNoDelete',
        { item },
      );
    }
    S.alliance = S.alliance.filter((r) => r.group !== String(group));
    return rc({ ok: true, msg: `✅ 삭제했습니다 — ${item} ${credited.toLocaleString()}${UNIT}` },
      'ally.delMulti', { item, credited, fund: 0 });
  },

  /* ── 레이드 (v10.8) — 실제 시트와 같은 판정을 흉내낸다 ── */

  raid: () => ({
    ok: true,
    data: {
      rows: [...S.raid].sort((a, b) => (a.time === b.time ? a.row - b.row : a.time < b.time ? -1 : 1)),
      days: RAID_DAYS,
    },
  }),

  addRaid: ({ day, time, boss, note }) => {
    const f = checkRaid(day, time, boss);
    if (f) return f;
    const row = S.nextRaidRow++;
    S.raid.push({ row, day: Number(day), time: String(time), boss: String(boss).trim(), note: String(note || '').trim() });
    return rc({ ok: true, msg: `✅ ${RAID_DAYS[day - 1]}요일 ${time} "${boss}" 추가했습니다.` },
      'raid.addOk', { day: RAID_DAYS[day - 1], time, boss });
  },

  updateRaid: ({ row, day, time, boss, note }) => {
    const rec = S.raid.find((r) => r.row === Number(row));
    if (!rec) return rc({ ok: false, msg: '기록을 찾을 수 없습니다.' }, 'e.noRecord');
    const f = checkRaid(day, time, boss);
    if (f) return f;
    rec.day = Number(day);
    rec.time = String(time);
    rec.boss = String(boss).trim();
    rec.note = String(note || '').trim();
    return rc({ ok: true, msg: `✅ ${RAID_DAYS[day - 1]}요일 ${time} "${boss}" 으로 수정했습니다.` },
      'raid.editOk', { day: RAID_DAYS[day - 1], time, boss });
  },

  deleteRaid: ({ row }) => {
    const i = S.raid.findIndex((r) => r.row === Number(row));
    if (i < 0) return rc({ ok: false, msg: '기록을 찾을 수 없습니다.' }, 'e.noRecord');
    S.raid.splice(i, 1);
    return rc({ ok: true, msg: '✅ 삭제했습니다.' }, 'raid.delOk');
  },

  // 사진마다 다른 인원수를 내준다 — 실제로도 장마다 다르고, 그래서 마지막 값이
  // 앞의 값을 덮어쓰는 사고가 났다 (v11.0). 부를 때마다 바뀌어야 그 사고를 재현할 수 있다.
  countPhoto: () => {
    S.photoReads = (S.photoReads ?? 0) + 1;
    const people = [13, 8, 8][(S.photoReads - 1) % 3];
    return rc({
      ok: true,
      people,
      photoUrl: `https://drive.google.com/file/d/MOCKSHOT${S.photoReads}/view`,
      msg: `📷 사진에서 ${people}명으로 읽었습니다. 실제 인원과 다르면 숫자를 직접 고쳐주세요.`,
    }, 'photo.count', { n: people });
  },

  updateMember: ({ name, patch }) => {
    const r = findRow(name);
    if (!r) return { ok: false, msg: `"${name}" 을(를) 명단에서 찾지 못했습니다.` };
    const changes = [];
    if (patch?.weight !== undefined && patch.weight !== null && patch.weight !== '') {
      const w = Math.round(Number(patch.weight));
      if (!Number.isFinite(w) || w < 1 || w > 100) return { ok: false, msg: '분배비중은 1~100 사이의 정수여야 합니다.' };
      if (w !== r.weight) { changes.push(`비중 ${r.weight}% → ${w}%`); r.weight = w; }
    }
    if (patch?.server !== undefined && patch.server !== null) {
      const sv = String(patch.server).trim();
      if (sv && !SERVER_LIST.includes(sv)) return { ok: false, msg: '서버는 01~12 중에서 선택해주세요.' };
      if (sv !== r.server) { changes.push(`서버 ${r.server || '-'} → ${sv || '-'}`); r.server = sv; }
    }
    if (patch?.hanja !== undefined && patch.hanja !== null) {
      const hj = String(patch.hanja).trim();
      if (hj.length > 30) return { ok: false, msg: '한자표기가 너무 깁니다 (30자 이내).' };
      if (hj !== r.hanja) { changes.push(`한자 ${r.hanja || '-'} → ${hj || '-'}`); r.hanja = hj; }
    }
    if (patch?.cls !== undefined && patch.cls !== null) {
      const cl = String(patch.cls).trim();
      if (cl && !CLASS_LIST.includes(cl)) return { ok: false, msg: '클래스는 목록에서 선택해주세요.' };
      if (cl !== (r.cls || '')) { changes.push(`클래스 ${r.cls || '-'} → ${cl || '-'}`); r.cls = cl; }
    }
    if (!changes.length) return { ok: true, msg: '바뀐 내용이 없습니다.' };
    return { ok: true, msg: `✅ ${name} — ${changes.join(' · ')}` };
  },

  // ── 명단 일괄 추가 (v10.4) — .gs 의 판정 규칙을 같은 순서로 흉내낸다 ──
  analyzeMembers: ({ text }) => {
    const raws = String(text || '')
      .split(/[\r\n,;\t|]+/)
      // 번호를 떼고 나니 빈 줄이 되면 원문을 남긴다 — 조용히 지우면 누가 빠졌는지 모른다
      .map((l) => l.trim())
      .map((l) => l.replace(/^\s*[-•*]?\s*\d{0,3}\s*[.)\]]?\s*/, '').trim() || l)
      .filter(Boolean);
    if (raws.length === 0) return rc({ ok: true, rows: [], msg: '읽어낸 이름이 없습니다.' }, 'bulk.noName');

    const members = S.rows.filter((r) => r.name !== FUND_NAME);
    const core = (v) => norm(String(v).replace(/\(.*$/, '')).toLowerCase();
    const seen = new Set();
    const rows = raws.map((raw) => {
      // 게임 화면의 [혈맹·서버] 표시와 '+' 를 떼어낸다 (.gs 의 _stripNameTag 와 같은 규칙)
      const name = stripTag(raw);
      const bare = name.replace(/[\s()（）]/g, '');
      if (!bare || /^[0-9.%\-+]+$/.test(bare) || bare.length < 2 || name.length > 30 || name === FUND_NAME) {
        return { raw, name: name || raw.trim(), status: 'invalid', suggest: [] };
      }
      // 떼어내지 못한 대괄호가 남으면 어디까지가 이름인지 알 수 없다 — 확인 필요
      if (/[[\]]/.test(name)) return { raw, name, status: 'invalid', suggest: [] };
      const key = norm(name).toLowerCase();
      if (seen.has(key)) return { raw, name, status: 'dup', suggest: [] };
      seen.add(key);
      if (members.some((m) => norm(m.name).toLowerCase() === key)) {
        return { raw, name, status: 'exists', suggest: [] };
      }
      const x = core(name);
      const suggest = members
        .filter((m) => {
          const y = core(m.name);
          if (!x || !y) return false;
          if (x === y) return true;
          if (x.length < 3 || y.length < 3) return false;
          if (x.includes(y) || y.includes(x)) return true;
          if (x.length !== y.length) return false;
          let diff = 0;
          for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) diff += 1;
          return diff === 1;
        })
        .map((m) => m.name)
        .slice(0, 5);
      return { raw, name, status: suggest.length ? 'rename' : 'new', suggest };
    });

    const c = (st) => rows.filter((r) => r.status === st).length;
    const summary = { total: rows.length, add: c('new'), rename: c('rename'), exists: c('exists'), dup: c('dup'), invalid: c('invalid') };
    return rc(
      // ★ 개명 대상은 "비슷한 사람"이 아니라 전체 명단에서 고를 수 있어야 한다
      { ok: true, rows, roster: members.map((m) => m.name), summary,
        room: MAX_MEMBERS - members.length, serverList: SERVER_LIST,
        msg: `읽은 줄 ${summary.total} · 신규 ${summary.add} · 개명후보 ${summary.rename}` },
      'bulk.analyzed', summary,
    );
  },

  bulkAddMembers: ({ entries, server, confirm }) => {
    const list = (entries || []).filter((e) => e && e.op !== 'skip');
    if (list.length === 0) return rc({ ok: false, msg: '처리할 대상이 없습니다.' }, 'bulk.nothing');
    const sv = String(server || '').trim();
    if (sv && !SERVER_LIST.includes(sv)) return rc({ ok: false, msg: '서버는 01~12 중에서 선택해주세요.' }, 'e.badServer');

    const adds = list.filter((e) => e.op === 'add');
    const renames = list.filter((e) => e.op === 'rename');

    // ★ 한 아이디를 두 사람이 물려받을 수는 없다 (앱이 아니라 여기서 최종 판정)
    const claimed = new Set();
    const conflict = [];
    renames.forEach((e) => {
      const key = norm(String(e.from || '')).toLowerCase();
      if (!key) return;
      if (claimed.has(key)) conflict.push(String(e.from));
      claimed.add(key);
    });
    if (conflict.length) {
      return rc({ ok: false, msg: `같은 아이디를 두 번 물려받도록 지정했습니다: ${conflict.join(', ')}` },
        'bulk.dupFrom', { list: conflict.join(', ') });
    }
    const missing = renames.filter((e) => !findRow(e.from)).map((e) => String(e.from));
    if (missing.length) {
      return rc({ ok: false, msg: `명단에 없는 아이디를 지정했습니다: ${missing.join(', ')}` },
        'bulk.noFrom', { list: missing.join(', ') });
    }

    const cur = S.rows.filter((r) => r.name !== FUND_NAME).length;
    if (cur + adds.length > MAX_MEMBERS) {
      return rc({ ok: false, msg: '정원을 넘습니다.' }, 'bulk.overCap', { cur, add: adds.length, max: MAX_MEMBERS });
    }
    // 되돌리기가 번거로운 작업이라 반드시 한 번 더 확인받는다
    if (confirm !== true) {
      return rc({ ok: false, needsConfirm: true, msg: `추가 ${adds.length}명 · 개명 ${renames.length}명을 반영합니다.` },
        'bulk.needConfirm', { add: adds.length, ren: renames.length, server: sv });
    }

    const added = [];
    const renamed = [];
    const failed = [];
    // 개명 먼저 — 추가보다 앞에 둬야 빈 칸을 두고 다투지 않는다
    renames.forEach((e) => {
      const from = findRow(e.from);
      if (!from) { failed.push(`${e.from} → ${e.name}: 찾지 못했습니다`); return; }
      from.name = String(e.name).trim();   // 잔액·참여횟수는 그대로 승계된다
      if (sv) from.server = sv;
      renamed.push(`${e.from} → ${e.name}`);
    });
    adds.forEach((e) => {
      const nm = String(e.name).trim();
      if (findRow(nm)) { failed.push(`${nm}: 이미 명단에 있습니다`); return; }
      S.rows.push({ name: nm, pending: 0, paid: 0, cnt: 0, weight: 100, server: sv, hanja: '' });
      added.push(nm);
    });

    const serverSet = sv ? added.length + renamed.length : 0;
    return rc(
      { ok: true, added, renamed, failed, serverSet,
        msg: `✅ 추가 ${added.length}명 · 개명 ${renamed.length}명` },
      failed.length ? 'bulk.partial' : 'bulk.ok',
      { add: added.length, ren: renamed.length, server: sv, set: serverSet, failN: failed.length, failList: failed.join(' / ') },
    );
  },

  checkPin: ({ pin }) => {
    if (!S.adminPinOverride) return { ok: true, hasOverride: false, match: false };
    return { ok: true, hasOverride: true, match: String(pin || '') === S.adminPinOverride };
  },

  setAppName: ({ name }) => {
    // 줄바꿈은 두 줄까지 (긴 이름을 마스터가 직접 끊을 수 있게)
    const lines = String(name || '').replace(/\r/g, '').split('\n').map((v) => v.trim());
    const nm = (lines.length <= 2 ? lines : [lines[0], lines.slice(1).join(' ')]).join('\n').trim();
    if (!nm) return rc({ ok: false, msg: '앱 이름을 입력해주세요.' }, 'e.appNameEmpty');
    if (nm.replace(/\n/g, '').length > 24) {
      return rc({ ok: false, msg: '앱 이름이 너무 깁니다 (24자 이내).' }, 'e.appNameLong', { max: 24 });
    }
    S.appName = nm;
    return { ok: true, msg: `✅ 앱 이름을 "${nm}" 으로 바꿨습니다.` };
  },

  setAdminPin: ({ pin }) => {
    const p = String(pin || '').trim();
    if (p && !/^[0-9A-Za-z!@#$%^&*_-]{6,32}$/.test(p)) {
      return { ok: false, msg: 'PIN 은 6~32자여야 하며 공백은 쓸 수 없습니다.' };
    }
    S.adminPinOverride = p;
    return { ok: true, msg: p ? '✅ 관리자 PIN 을 바꿨습니다.' : '✅ 시트에 저장된 PIN 을 지웠습니다.' };
  },

  setSeasonServer: ({ server }) => {
    S.seasonServer = String(server || '').trim();
    return { ok: true, msg: S.seasonServer ? `✅ 이번 시즌 서버를 "${S.seasonServer}" 로 설정했습니다.` : '✅ 시즌 서버명을 비웠습니다.' };
  },

  // 테스트가 매번 같은 상태에서 시작할 수 있도록
  __reset: () => {
    S = freshState();
    MOCK_GS_VERSION = GS_VERSION;
    return { ok: true, msg: '초기화됨' };
  },

  // "시트만 옛 버전인" 상황을 만들어 보기 위한 것 (테스트 전용)
  __setVersion: ({ version }) => {
    MOCK_GS_VERSION = String(version || GS_VERSION);
    return { ok: true, msg: '버전 ' + MOCK_GS_VERSION };
  },
};

createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const send = (obj) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj));
    };

    let payload;
    try {
      payload = JSON.parse(body || '{}');
    } catch {
      return send({ ok: false, msg: '요청 형식이 올바르지 않습니다(JSON 아님).' });
    }

    if (payload.token !== TOKEN) return send({ ok: false, msg: '인증에 실패했습니다.' });

    const handler = handlers[payload.action];
    if (!handler) return send({ ok: false, msg: '알 수 없는 요청입니다: ' + payload.action });

    try {
      send(withState(handler(payload), payload));
    } catch (err) {
      send({ ok: false, msg: '서버 오류: ' + err.message });
    }
  });
}).listen(PORT, () => {
  console.log(`🗒️  모의 구글시트 실행 중 — http://127.0.0.1:${PORT}/exec (token: ${TOKEN})`);
});
