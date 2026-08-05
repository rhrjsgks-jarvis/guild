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

const FUND_NAME = '유일배분(혈비)';
const REMAINDER_NAME = 'TC무식';
const FUND_RATE = 0.1;
const UNIT = '다이아';

/** 실제 로스터를 흉내 낸 표본 — 한글·한자·영문 혼합, 이름 길이도 다양하게 */
function freshState() {
  return {
    rows: [
      { name: '가이', pending: 12400, paid: 88000, cnt: 31 },
      { name: '잠단(斬斷)', pending: 0, paid: 45200, cnt: 19 },
      { name: 'TC무식', pending: 33150, paid: 120400, cnt: 44 },
      { name: FUND_NAME, pending: 51000, paid: 0, cnt: 12 },
      { name: 'PlusS', pending: 7700, paid: 15000, cnt: 8 },
      { name: '향로셔틀', pending: 0, paid: 9800, cnt: 5 },
      { name: '대서과Z', pending: 4500, paid: 0, cnt: 3 },
      { name: '팩맨', pending: 0, paid: 0, cnt: 0 },
      { name: '詹阿呆', pending: 2100, paid: 3300, cnt: 6 },
    ],
    items: [
      { row: 2, item: '기란 세금', date: '08/01', cnt: 19 },
      { row: 5, item: '용의 심장', date: '08/03', cnt: 12 },
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
    nextRow: 9,
  };
}

/** 실제 Apps Script 의 _toolRegistry() 와 같은 모양 */
const TOOLS = [
  { id: 'recalcCounts', name: '🔁 참여횟수 재계산', desc: '등록 이력을 다시 세어 참여횟수를 맞춥니다.', danger: 1, confirm: '', inputs: [] },
  { id: 'tidy', name: '📐 시트 정돈', desc: '시트 순서와 행 높이를 표준으로 되돌립니다.', danger: 1, confirm: '', inputs: [] },
  { id: 'discord', name: '🔗 디스코드 알림 설정', desc: '등록·분배 시 자동 알림을 보냅니다.', danger: 1, confirm: '', inputs: [{ key: 'url', label: '웹훅 주소' }] },
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

/** .gs 의 _calcSplit 과 같은 산식 */
function calcSplit(total, n) {
  const fund = Math.floor(total * FUND_RATE);
  const distributable = total - fund;
  const perPerson = Math.floor(distributable / n);
  return { fund, distributable, perPerson, remainder: distributable - perPerson * n };
}

function findRow(name) {
  return S.rows.find((r) => norm(r.name) === norm(name));
}

/** 아이템의 참여자 명단 (없으면 혈비를 뺀 앞쪽 인원으로 근사) */
function participantsOf(item) {
  if (item.names) return item.names;
  return S.rows.filter((r) => r.name !== FUND_NAME).slice(0, item.cnt).map((r) => r.name);
}

function add(name, amount) {
  const row = findRow(name);
  if (row) row.pending += amount;
  else S.rows.push({ name, pending: amount, paid: 0, cnt: 0 });
}

const handlers = {
  ping: () => ({ ok: true, version: '8.0-mock', unit: UNIT }),

  state: () => ({
    ok: true,
    data: {
      rows: S.rows.map((r) => ({ ...r })),
      items: S.items.map((i) => ({ ...i })),
      members: S.rows.map((r) => r.name),
      fundName: FUND_NAME,
      remainderName: REMAINDER_NAME,
      fundRate: FUND_RATE,
      unit: UNIT,
      season: S.season,
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
    });
    return { ok: true, msg: `✅ "${itemName}" 등록 완료 (${list.length}명, ⏳미분배)` };
  },

  distribute: ({ row, amount }) => {
    const idx = S.items.findIndex((i) => i.row === Number(row));
    if (idx < 0) return { ok: false, msg: '이미 분배된 아이템입니다. 새로고침해주세요.' };
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) return { ok: false, msg: '⚠️ 판매금액은 양의 정수여야 합니다.' };

    const item = S.items[idx];
    const { fund, perPerson, remainder } = calcSplit(amt, item.cnt);

    add(FUND_NAME, fund);
    S.rows
      .filter((r) => r.name !== FUND_NAME)
      .slice(0, item.cnt)
      .forEach((r) => (r.pending += perPerson));
    if (remainder > 0) add(REMAINDER_NAME, remainder);

    S.items.splice(idx, 1);
    S.done.push({ ...item, amount: amt, names: participantsOf(item) });
    let msg = `✅ "${item.item}" ${amt.toLocaleString()}${UNIT} 분배 완료 — 혈비 ${fund.toLocaleString()} / ${item.cnt}명 × ${perPerson.toLocaleString()}`;
    if (remainder > 0) msg += ` / 나머지 ${remainder}${UNIT} → ${REMAINDER_NAME}`;
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
      })),
  }),

  rename: ({ oldName, newName, confirmMerge }) => {
    const from = findRow(oldName);
    if (!from) return { ok: false, msg: `"${oldName}" 을(를) 멤버DB에서 찾지 못했습니다.` };
    if (norm(oldName) === norm(newName)) return { ok: false, msg: '기존 이름과 같습니다.' };
    if (oldName === FUND_NAME || newName === FUND_NAME) {
      return { ok: false, msg: `혈비 계정(${FUND_NAME})은 앱에서 변경할 수 없습니다.` };
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
      return { ok: true, merged: true, msg: `✅ "${oldName}" → "${newName}" 변경 완료 (중복 계정 병합됨)` };
    }

    from.name = newName;
    return { ok: true, merged: false, msg: `✅ "${oldName}" → "${newName}" 변경 완료` };
  },

  addMember: ({ name }) => {
    const nm = String(name || '').trim();
    if (!nm) return { ok: false, msg: '아이디를 입력해주세요.' };
    if (nm === FUND_NAME) return { ok: false, msg: '혈비 계정은 앱에서 추가할 수 없습니다.' };
    if (findRow(nm)) return { ok: false, msg: `"${nm}" 은(는) 이미 명단에 있습니다.` };
    if (S.rows.length >= 50) return { ok: false, msg: '멤버가 최대 인원(50명)에 도달했습니다.' };

    S.rows.push({ name: nm, pending: 0, paid: 0, cnt: 0 });
    return { ok: true, msg: `✅ "${nm}" 을(를) 명단에 추가했습니다.` };
  },

  removeMember: ({ name, confirmRemove }) => {
    const r = findRow(name);
    if (!r) return { ok: false, msg: `"${name}" 을(를) 멤버DB에서 찾지 못했습니다.` };
    if (r.name === FUND_NAME) return { ok: false, msg: '혈비 계정은 앱에서 뺄 수 없습니다.' };

    const isRemainder = r.name === REMAINDER_NAME;
    if (confirmRemove !== true && (r.pending > 0 || isRemainder)) {
      let warn = `"${r.name}" 을(를) 명단에서 뺍니다.\n\n`;
      if (r.pending > 0) {
        warn += `⚠️ 아직 받지 않은 분배전 잔액이 ${r.pending.toLocaleString()}${UNIT} 남아 있습니다.\n\n`;
      }
      if (isRemainder) warn += '⚠️ 이 사람은 분배 나머지가 적립되는 대상입니다.\n\n';
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
      perPerson: i.amount ? calcSplit(i.amount, i.cnt).perPerson : 0,
      fund: i.amount ? calcSplit(i.amount, i.cnt).fund : 0,
    })),
  }),

  previewReverse: ({ row }) => {
    const it = S.done.find((x) => x.row === Number(row)) ?? S.items.find((x) => x.row === Number(row));
    if (!it) return { ok: false, msg: '아이템을 찾을 수 없습니다.' };
    if (!it.amount) {
      return { ok: true, data: { item: it.item, status: '⏳미분배', n: it.cnt, amount: 0, needsReverse: false, blocked: false } };
    }
    const sp = calcSplit(it.amount, it.cnt);
    // 되돌릴 만큼 분배전이 남아 있는지 참여자 명단대로 확인한다
    const insufficient = participantsOf(it)
      .map((nm) => findRow(nm))
      .filter((r) => !r || r.pending < sp.perPerson)
      .map((r) => `${r ? r.name : '(없음)'} (분배전 ${r ? r.pending : 0} < 필요 ${sp.perPerson})`);
    return {
      ok: true,
      data: {
        item: it.item, status: '✅분배완료', n: it.cnt, amount: it.amount, needsReverse: true,
        perPerson: sp.perPerson, fund: sp.fund, remainder: sp.remainder, remainderTo: REMAINDER_NAME,
        blocked: insufficient.length > 0, insufficient,
      },
    };
  },

  correctItem: ({ row, newAmount, confirm }) => {
    if (confirm !== true) return { ok: false, needsConfirm: true, msg: '확인이 필요합니다.' };
    const idx = S.done.findIndex((x) => x.row === Number(row));
    if (idx < 0) return { ok: false, msg: '분배완료 상태인 아이템만 정정할 수 있습니다.' };
    const it = S.done[idx];
    const sp = calcSplit(it.amount, it.cnt);
    const short = participantsOf(it).filter((nm) => (findRow(nm)?.pending ?? 0) < sp.perPerson);
    if (short.length) return { ok: false, reason: 'insufficient', msg: '정정할 수 없습니다. 이미 지급✓ 처리된 대상이 있습니다: ' + short.join(', ') };

    // 되돌리기 (명단 기준)
    add(FUND_NAME, -sp.fund);
    participantsOf(it).forEach((nm) => { const r = findRow(nm); if (r) r.pending -= sp.perPerson; });
    if (sp.remainder > 0) add(REMAINDER_NAME, -sp.remainder);

    S.done.splice(idx, 1);
    if (newAmount === null || newAmount === undefined || newAmount === '') {
      S.items.push({ row: it.row, item: it.item, date: it.date, cnt: it.cnt });
      return { ok: true, redistributed: false, msg: `✅ "${it.item}" 되돌리기 완료 — ⏳미분배 상태로 돌아갔습니다.` };
    }
    const amt = Number(newAmount);
    const ns = calcSplit(amt, it.cnt);
    add(FUND_NAME, ns.fund);
    participantsOf(it).forEach((nm) => { const r = findRow(nm); if (r) r.pending += ns.perPerson; });
    if (ns.remainder > 0) add(REMAINDER_NAME, ns.remainder);
    S.done.push({ ...it, amount: amt });
    return { ok: true, redistributed: true, msg: `✅ "${it.item}" 정정 완료 — ${it.amount} → ${amt}${UNIT}` };
  },

  deleteItem: ({ row, confirm }) => {
    if (confirm !== true) return { ok: false, needsConfirm: true, msg: '확인이 필요합니다.' };
    const di = S.done.findIndex((x) => x.row === Number(row));
    if (di >= 0) {
      const it = S.done[di];
      const sp = calcSplit(it.amount, it.cnt);
      const short = participantsOf(it).filter((nm) => (findRow(nm)?.pending ?? 0) < sp.perPerson);
      if (short.length) return { ok: false, reason: 'insufficient', msg: '삭제할 수 없습니다. 이미 지급✓ 처리된 대상이 있습니다: ' + short.join(', ') };
      add(FUND_NAME, -sp.fund);
      participantsOf(it).forEach((nm) => { const r = findRow(nm); if (r) r.pending -= sp.perPerson; });
      if (sp.remainder > 0) add(REMAINDER_NAME, -sp.remainder);
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
    if (id === 'importData' && !String(params?.url || '').match(/[-\w]{25,}/)) {
      return { ok: false, msg: '주소에서 파일 ID를 찾지 못했습니다.' };
    }
    return { ok: true, msg: `✅ ${tool.name} 완료 (모의).` };
  },

  // 테스트가 매번 같은 상태에서 시작할 수 있도록
  __reset: () => {
    S = freshState();
    return { ok: true, msg: '초기화됨' };
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
