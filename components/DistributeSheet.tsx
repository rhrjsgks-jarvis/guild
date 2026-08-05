'use client';

import { useState } from 'react';
import Sheet from './Sheet';
import type { GuildState, LedgerItem } from '@/lib/types';
import { api, calcSplit, fmt, getStoredEmail, weightsOf } from '@/lib/client';

export default function DistributeSheet({
  item,
  state,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  item: LedgerItem;
  state: GuildState;
  onClose: () => void;
  onDone: () => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const [raw, setRaw] = useState('');

  const names = item.names?.length ? item.names : [];
  // 명단을 받지 못한 옛 데이터는 전원 100%로 본다 (시트 쪽 계산과 같은 결과)
  const weights = names.length ? weightsOf(state, names) : item.cnt;
  const reduced = names.filter((_, i) => (weights as number[])[i] !== undefined && (weights as number[])[i] < 100);

  const amount = Number(raw.replace(/[,\s]/g, ''));
  const valid = Number.isInteger(amount) && amount > 0;
  const split = valid ? calcSplit(amount, weights, state.fundRate) : null;

  async function run() {
    if (!valid) return;
    setBusy(true);
    const res = await api('/api/admin/distribute', {
      row: item.row,
      amount,
      email: getStoredEmail(),
    });
    setBusy(false);
    toast(res.msg ?? (res.ok ? '분배했습니다.' : '분배에 실패했습니다.'), !res.ok);
    if (res.ok) {
      onClose();
      onDone();
    }
  }

  return (
    <Sheet
      title={`📦 ${item.item}`}
      subtitle={`참여 ${item.cnt}명 · ${state.fundName} ${Math.round(state.fundRate * 100)}% 공제 후 1/N 분배`}
      onClose={onClose}
    >
      <label className="fl" htmlFor="amt">
        판매금액 ({state.unit})
      </label>
      <input
        id="amt"
        type="text"
        inputMode="numeric"
        placeholder="예: 50000"
        value={raw}
        autoFocus
        onChange={(e) => setRaw(e.target.value)}
      />

      {split ? (
        <div className="calc">
          <div className="calc-line">
            <span>💎 판매금액</span>
            <strong>
              {fmt(amount)} {state.unit}
            </strong>
          </div>
          <div className="calc-line">
            <span>🏦 {state.fundName} ({Math.round(state.fundRate * 100)}%)</span>
            <strong>{fmt(split.fund)}</strong>
          </div>
          <div className="calc-line">
            <span>👥 기본 1인당 × {item.cnt}명</span>
            <strong>{fmt(split.perPerson)}</strong>
          </div>
          {reduced.map((nm, i) => {
            const idx = names.indexOf(nm);
            return (
              <div className="calc-line" key={nm + i}>
                <span>
                  ⚖️ {nm} ({(weights as number[])[idx]}%)
                </span>
                <strong>{fmt(split.shares[idx])}</strong>
              </div>
            );
          })}
          {split.remainder > 0 ? (
            <div className="calc-line">
              <span>➕ 잔여분 → {state.fundName}</span>
              <strong>{fmt(split.remainder)}</strong>
            </div>
          ) : null}
          <div className="calc-line" style={{ borderTop: '1px solid rgba(0,0,0,.12)', paddingTop: 6, marginTop: 2 }}>
            <span>🏦 {state.fundName} 최종 적립</span>
            <strong>{fmt(split.fundTotal)}</strong>
          </div>
        </div>
      ) : (
        <p className="hint" style={{ marginTop: 10 }}>
          {raw ? '판매금액은 양의 정수여야 합니다.' : '금액을 입력하면 분배 결과를 미리 보여드립니다.'}
        </p>
      )}

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          취소
        </button>
        <button className="btn warn" disabled={!valid} onClick={run}>
          분배하기
        </button>
      </div>
    </Sheet>
  );
}
