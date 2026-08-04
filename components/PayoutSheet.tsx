'use client';

import { useState } from 'react';
import Sheet from './Sheet';
import type { BalanceRow, GuildState } from '@/lib/types';
import { api, fmt, getStoredEmail } from '@/lib/client';

export default function PayoutSheet({
  row,
  state,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  row: BalanceRow;
  state: GuildState;
  onClose: () => void;
  onDone: () => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  // 기본값은 전액 — 대부분은 그대로 확인만 누르면 된다
  const [raw, setRaw] = useState(String(row.pending));

  const amount = Number(raw.replace(/[,\s]/g, ''));
  const valid = Number.isInteger(amount) && amount > 0 && amount <= row.pending;
  const partial = valid && amount < row.pending;

  async function run() {
    if (!valid) return;
    setBusy(true);
    const res = await api('/api/admin/payout', {
      name: row.name,
      amount,
      email: getStoredEmail(),
    });
    setBusy(false);
    toast(res.msg ?? (res.ok ? '지급했습니다.' : '지급에 실패했습니다.'), !res.ok);
    if (res.ok) {
      onClose();
      onDone();
    }
  }

  return (
    <Sheet
      title={`💰 ${row.name} 지급`}
      subtitle={`분배전 잔액 ${fmt(row.pending)} ${state.unit}`}
      onClose={onClose}
    >
      <label className="fl" htmlFor="payamt">
        지급할 금액 ({state.unit})
      </label>
      <input
        id="payamt"
        type="text"
        inputMode="numeric"
        value={raw}
        autoFocus
        onChange={(e) => setRaw(e.target.value)}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn ghost" style={{ flex: 1 }} onClick={() => setRaw(String(row.pending))}>
          전액 {fmt(row.pending)}
        </button>
        <button
          className="btn ghost"
          style={{ flex: 1 }}
          onClick={() => setRaw(String(Math.floor(row.pending / 2)))}
        >
          절반 {fmt(Math.floor(row.pending / 2))}
        </button>
      </div>

      <div className="calc">
        {valid ? (
          <>
            <div className="calc-line">
              <span>지급</span>
              <strong>
                {fmt(amount)} {state.unit}
              </strong>
            </div>
            <div className="calc-line">
              <span>지급 후 남는 분배전</span>
              <strong>{fmt(row.pending - amount)}</strong>
            </div>
            <div className="calc-line" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
              <span>{partial ? '부분 지급입니다' : '전액 지급입니다'}</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--danger)' }}>
            {amount > row.pending
              ? `분배전 잔액(${fmt(row.pending)} ${state.unit})보다 클 수 없습니다.`
              : '지급액은 양의 정수여야 합니다.'}
          </div>
        )}
      </div>

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          취소
        </button>
        <button className="btn" disabled={!valid} onClick={run}>
          지급 처리
        </button>
      </div>
    </Sheet>
  );
}
