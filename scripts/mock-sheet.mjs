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
    season: 3,
    nextRow: 9,
  };
}

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
    let msg = `✅ "${name}" ${amt.toLocaleString()}${UNIT} 지급 완료`;
    if (r.pending > 0) msg += ` (잔여 분배전 ${r.pending.toLocaleString()}${UNIT})`;
    return { ok: true, msg };
  },

  roster: () => ({
    ok: true,
    data: S.rows.map((r) => ({
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

  // OCR은 흉내만 낸다 — 실제 인식은 드라이브가 필요하다
  photo: () => ({
    ok: true,
    photoUrl: 'https://drive.google.com/file/d/MOCK/view',
    matched: ['가이', 'PlusS'],
    ocrPreview: '[모의 OCR]\n가이\nPlusS\n斬斷\n...',
    msg: '📷 사진 저장 완료 · 2명 자동 감지 (모의)',
  }),

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
