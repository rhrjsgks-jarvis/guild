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
// 앱이 기대하는 버전과 같은 값 — 화면에 "버전 불일치" 경고가 뜨지 않아야 정상이다
let MOCK_GS_VERSION = '10.0';

/** 실제 로스터를 흉내 낸 표본 — 한글·한자·영문 혼합, 이름 길이도 다양하게 */
function freshState() {
  return {
    // weight/server/hanja 는 멤버DB E·F·G 열을 흉내낸다.
    // '대서과Z' 를 50% 로 두어 비중 계산이 화면까지 이어지는지 볼 수 있게 한다.
    rows: [
      { name: '가이', pending: 12400, paid: 88000, cnt: 31, weight: 100, server: '01', hanja: '' },
      { name: '잠단(斬斷)', pending: 0, paid: 45200, cnt: 19, weight: 100, server: '02', hanja: '斬斷' },
      { name: 'TC무식', pending: 33150, paid: 120400, cnt: 44, weight: 100, server: '01', hanja: '车武植' },
      { name: FUND_NAME, pending: 51000, paid: 0, cnt: 12, weight: 100, server: '', hanja: '' },
      { name: 'PlusS', pending: 7700, paid: 15000, cnt: 8, weight: 100, server: '03', hanja: '' },
      { name: '향로셔틀', pending: 0, paid: 9800, cnt: 5, weight: 100, server: '', hanja: '' },
      { name: '대서과Z', pending: 4500, paid: 0, cnt: 3, weight: 50, server: '04', hanja: '大西瓜Z' },
      { name: '팩맨', pending: 0, paid: 0, cnt: 0, weight: 100, server: '', hanja: '' },
      { name: '詹阿呆', pending: 2100, paid: 3300, cnt: 6, weight: 100, server: '02', hanja: '詹阿呆' },
    ],
    items: [
      { row: 2, item: '기란 세금', date: '08/01', cnt: 3, names: ['가이', 'TC무식', '대서과Z'] },
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
    alliance: [
      { row: 2, date: '08/02 14:00', server: '03', item: '연합 보스', amount: 40000, pct: 50, people: 12, credited: 20000, photo: '' },
    ],
    nextAllianceRow: 3,
    adminPinOverride: '',
    renames: [
      { at: '07/12 09:30', before: '옛닉네임', after: '가이', by: 'admin@example.com', merged: false, detail: '"옛닉네임" → "가이"' },
    ],
  };
}

/** 실제 Apps Script 의 _toolRegistry() 와 같은 모양 */
const TOOLS = [
  { id: 'recalcCounts', name: '🔁 참여횟수 재계산', desc: '등록 이력을 다시 세어 참여횟수를 맞춥니다.', danger: 1, confirm: '', inputs: [] },
  { id: 'tidy', name: '📐 시트 정돈', desc: '시트 순서와 행 높이를 표준으로 되돌립니다.', danger: 1, confirm: '', inputs: [] },
  { id: 'discord', name: '🔗 디스코드 알림 설정', desc: '등록·분배 시 자동 알림을 보냅니다.', danger: 1, confirm: '', inputs: [{ key: 'url', label: '웹훅 주소' }] },
  { id: 'importSeasons', name: '📚 지난 시즌 기록만 가져오기', desc: '옛 파일의 [시즌N] 시트만 복사합니다.', danger: 2, confirm: '', inputs: [{ key: 'url', label: '옛 스프레드시트 주소' }] },
  { id: 'seasonServer', name: '🗺️ 이번 시즌 서버 설정', desc: '이번 시즌의 서버 이름을 지정합니다.', danger: 1, confirm: '', inputs: [{ key: 'server', label: '서버 이름' }] },
  { id: 'renameFund', name: '🏦 혈비 계정을 혈맹운영비로 통일', desc: 'v9 이하의 계정명을 v10 이름으로 바꿉니다.', danger: 2, confirm: '', inputs: [] },
  { id: 'seasonEnd', name: '🏁 시즌 종료', desc: '기록을 보존하고 초기화합니다.', danger: 3, confirm: '시즌종료', inputs: [] },
  { id: 'importData', name: '📥 기존 파일에서 가져오기', desc: '쓰던 시트의 데이터를 옮깁니다.', danger: 3, confirm: '가져오기', inputs: [{ key: 'url', label: '기존 스프레드시트 주소' }] },
  { id: 'install', name: '🚀 최초 설치', desc: '빈 시트에 구조를 만듭니다.', danger: 3, confirm: '설치', inputs: [] },
  { id: 'factoryReset', name: '⚠️ 공장 초기화', desc: '전부 삭제하고 처음 상태로 되돌립니다.', danger: 3, confirm: '전부삭제', inputs: [] },
];

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

const handlers = {
  ping: () => ({ ok: true, version: MOCK_GS_VERSION, unit: UNIT }),

  state: () => ({
    ok: true,
    data: {
      rows: S.rows.map((r) => ({ ...r })),
      items: S.items.map((i) => ({ ...i })),
      members: S.rows.map((r) => r.name),
      memberInfo: S.rows.map((r) => ({ name: r.name, weight: r.weight ?? 100, server: r.server ?? '', hanja: r.hanja ?? '' })),
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

  register: ({ itemName, participants }) => {
    const list = (participants || []).filter((p) => p && p !== FUND_NAME);
    if (!itemName) return { ok: false, msg: '아이템명을 입력해주세요.' };
    if (list.length === 0) return { ok: false, msg: '참여 멤버를 선택해주세요.' };

    // 참여횟수는 등록 시점에 확정된다 (다이아와 무관한 출석 지표)
    list.forEach((p) => {
      const r = findRow(p);
      if (r) r.cnt += 1;
    });
    S.items.push({
      row: S.nextRow++,
      item: itemName,
      date: new Date().toISOString().slice(5, 10).replace('-', '/'),
      cnt: list.length,
      names: list,
    });
    return { ok: true, msg: `✅ "${itemName}" 등록 완료 (${list.length}명, ⏳미분배)` };
  },

  distribute: ({ row, amount }) => {
    const idx = S.items.findIndex((i) => i.row === Number(row));
    if (idx < 0) return { ok: false, msg: '이미 분배된 아이템입니다. 새로고침해주세요.' };
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) return { ok: false, msg: '⚠️ 판매금액은 양의 정수여야 합니다.' };

    const item = S.items[idx];
    const names = participantsOf(item);
    const sp = calcSplit(amt, weightsFor(names));

    names.forEach((nm, i) => add(nm, sp.shares[i]));
    add(FUND_NAME, sp.fundTotal);

    S.items.splice(idx, 1);
    // 분배 시점 금액을 그대로 남긴다 — 비중이 나중에 바뀌어도 되돌리기가 정확해진다
    S.done.push({ ...item, amount: amt, names, splits: names.map((nm, i) => ({ name: nm, amount: sp.shares[i] })) });
    let msg = `✅ "${item.item}" ${amt.toLocaleString()}${UNIT} 분배 완료 — ${FUND_NAME} ${sp.fundTotal.toLocaleString()} / ${names.length}명 기본 ${sp.perPerson.toLocaleString()}`;
    if (sp.remainder > 0) msg += ` (잔여 ${sp.remainder.toLocaleString()}${UNIT} 운영비 귀속)`;
    return { ok: true, msg };
  },

  payout: ({ name, amount }) => {
    const r = findRow(name);
    if (!r) return { ok: false, msg: `"${name}"을 찾지 못했습니다.` };
    if (r.pending <= 0) return { ok: false, msg: `"${name}" 분배전 금액이 0입니다.` };

    const amt = amount === null || amount === undefined || amount === '' ? r.pending : Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) return { ok: false, msg: '⚠️ 지급액은 양의 정수여야 합니다.' };
    if (amt > r.pending) {
      return { ok: false, msg: `⚠️ 지급액이 분배전(${r.pending.toLocaleString()}${UNIT})보다 큽니다.` };
    }

    r.pending -= amt;
    r.paid += amt;
    S.payouts.push({ name: r.name, amount: amt, date: '08/04 12:00' });
    let msg = `✅ "${name}" ${amt.toLocaleString()}${UNIT} 지급 완료`;
    if (r.pending > 0) msg += ` (잔여 분배전 ${r.pending.toLocaleString()}${UNIT})`;
    return { ok: true, msg };
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
      S.rows.splice(S.rows.indexOf(from), 1);
      S.renames.push({ at: '08/04 12:00', before: oldName, after: newName, by: 'mock', merged: true, detail: `"${oldName}" → "${newName}" (중복 병합 발생)` });
      return { ok: true, merged: true, msg: `✅ "${oldName}" → "${newName}" 변경 완료 (중복 계정 병합됨)` };
    }

    from.name = newName;
    S.renames.push({ at: '08/04 12:00', before: oldName, after: newName, by: 'mock', merged: false, detail: `"${oldName}" → "${newName}"` });
    return { ok: true, merged: false, msg: `✅ "${oldName}" → "${newName}" 변경 완료` };
  },

  addMember: ({ name }) => {
    const nm = String(name || '').trim();
    if (!nm) return { ok: false, msg: '아이디를 입력해주세요.' };
    if (nm === FUND_NAME) return { ok: false, msg: '운영비 계정은 앱에서 추가할 수 없습니다.' };
    if (findRow(nm)) return { ok: false, msg: `"${nm}" 은(는) 이미 명단에 있습니다.` };
    if (S.rows.length >= 50) return { ok: false, msg: '멤버가 최대 인원(50명)에 도달했습니다.' };

    S.rows.push({ name: nm, pending: 0, paid: 0, cnt: 0, weight: DEFAULT_WEIGHT, server: '', hanja: '' });
    return { ok: true, msg: `✅ "${nm}" 을(를) 명단에 추가했습니다.` };
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
      return { ok: true, redistributed: false, msg: `✅ "${it.item}" 되돌리기 완료 — ⏳미분배 상태로 돌아갔습니다.` };
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
    const di = S.done.findIndex((x) => x.row === Number(row));
    if (di >= 0) {
      const it = S.done[di];
      const plan = reversalPlan(it);
      const short = plan.filter((e) => (findRow(e.name)?.pending ?? 0) < e.amount).map((e) => e.name);
      if (short.length) return { ok: false, reason: 'insufficient', msg: '삭제할 수 없습니다. 이미 지급✓ 처리된 대상이 있습니다: ' + short.join(', ') };
      plan.forEach((e) => add(e.name, -e.amount));
      S.done.splice(di, 1);
      return { ok: true, msg: `✅ "${it.item}" 삭제 완료 — 참여횟수가 자동으로 재계산되었습니다.` };
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
    return { ok: true, msg: `✅ "${rec.name}" ${rec.amount.toLocaleString()}${UNIT}가 분배전으로 복구되었습니다.` };
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

  tools: () => ({ ok: true, data: TOOLS }),

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
    return { ok: true, id, msg: isNotice === true ? '✅ 공지를 등록했습니다.' : '✅ 글을 등록했습니다.' };
  },

  deletePost: ({ id }) => {
    const i = S.posts.findIndex((p) => p.id === Number(id));
    if (i < 0) return { ok: false, msg: '이미 삭제된 글입니다.' };
    S.posts.splice(i, 1);
    return { ok: true, msg: '✅ 삭제했습니다.' };
  },

  alliance: () => {
    const totals = SERVER_LIST.map((sv) => {
      const rows = S.alliance.filter((r) => r.server === sv);
      return {
        server: sv,
        credited: rows.reduce((a, b) => a + b.credited, 0),
        amount: rows.reduce((a, b) => a + b.amount, 0),
        people: rows.reduce((a, b) => a + b.people, 0),
        count: rows.length,
      };
    });
    return { ok: true, data: { rows: [...S.alliance].reverse(), totals, serverList: SERVER_LIST, unit: UNIT } };
  },

  addAlliance: ({ server, item, amount, pct, people }) => {
    if (!SERVER_LIST.includes(String(server))) return { ok: false, msg: '서버를 01~12 중에서 선택해주세요.' };
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) return { ok: false, msg: '금액은 양의 정수여야 합니다.' };
    let p = Math.round(Number(pct));
    if (!Number.isFinite(p) || p < 1) p = 1;
    if (p > 100) p = 100;
    const credited = Math.floor((amt * p) / 100);
    const n = Math.max(Math.floor(Number(people) || 0), 0);
    S.alliance.push({
      row: S.nextAllianceRow++,
      date: '08/05 09:00',
      server: String(server),
      item: String(item || '').trim(),
      amount: amt,
      pct: p,
      people: n,
      credited,
      photo: '',
    });
    return { ok: true, credited, server, msg: `✅ ${server}서버에 ${credited.toLocaleString()}${UNIT} 누적했습니다 (${n}명 참여).` };
  },

  deleteAlliance: ({ row }) => {
    const i = S.alliance.findIndex((r) => r.row === Number(row));
    if (i < 0) return { ok: false, msg: '기록을 찾을 수 없습니다.' };
    const [rec] = S.alliance.splice(i, 1);
    return { ok: true, msg: `✅ 삭제했습니다 — ${rec.server}서버 ${rec.item} ${rec.credited.toLocaleString()}${UNIT}` };
  },

  countPhoto: () => ({
    ok: true,
    people: 2,
    photoUrl: 'https://drive.google.com/file/d/MOCK/view',
    msg: '📷 사진에서 2명으로 읽었습니다. 실제 인원과 다르면 숫자를 직접 고쳐주세요.',
  }),

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
    if (!changes.length) return { ok: true, msg: '바뀐 내용이 없습니다.' };
    return { ok: true, msg: `✅ ${name} — ${changes.join(' · ')}` };
  },

  checkPin: ({ pin }) => {
    if (!S.adminPinOverride) return { ok: true, hasOverride: false, match: false };
    return { ok: true, hasOverride: true, match: String(pin || '') === S.adminPinOverride };
  },

  setAppName: ({ name }) => {
    const nm = String(name || '').trim();
    if (!nm) return { ok: false, msg: '앱 이름을 입력해주세요.' };
    if (nm.length > 20) return { ok: false, msg: '앱 이름이 너무 깁니다 (20자 이내).' };
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
    MOCK_GS_VERSION = '10.0';
    return { ok: true, msg: '초기화됨' };
  },

  // "시트만 옛 버전인" 상황을 만들어 보기 위한 것 (테스트 전용)
  __setVersion: ({ version }) => {
    MOCK_GS_VERSION = String(version || '10.0');
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
      send(handler(payload));
    } catch (err) {
      send({ ok: false, msg: '서버 오류: ' + err.message });
    }
  });
}).listen(PORT, () => {
  console.log(`🗒️  모의 구글시트 실행 중 — http://127.0.0.1:${PORT}/exec (token: ${TOKEN})`);
});
