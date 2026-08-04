'use client';

import { useMemo, useState } from 'react';
import type { BalanceRow, GuildState } from '@/lib/types';
import { fmt } from '@/lib/client';

export default function BalanceTab({
  state,
  admin,
  onPayout,
}: {
  state: GuildState;
  admin: boolean;
  onPayout: (row: BalanceRow) => void;
}) {
  const [q, setQ] = useState('');
  const [onlyOwed, setOnlyOwed] = useState(false);

  const { list, totalPending, totalPaid, owedCount } = useMemo(() => {
    let tp = 0;
    let td = 0;
    let owed = 0;
    for (const r of state.rows) {
      tp += r.pending;
      td += r.paid;
      if (r.pending > 0) owed += 1;
    }

    const needle = q.trim().toLowerCase();
    const filtered = state.rows
      .filter((r) => (onlyOwed ? r.pending > 0 : true))
      .filter((r) => (needle ? r.name.toLowerCase().includes(needle) : true))
      // 받을 게 남은 사람이 위로 오는 편이 지급할 때 편하다
      .sort((a, b) => b.pending - a.pending);

    return { list: filtered, totalPending: tp, totalPaid: td, owedCount: owed };
  }, [state.rows, q, onlyOwed]);

  return (
    <div className="page">
      <div className="dash">
        <div className="dash-item">
          <div className="dash-num warn">{state.items.length}</div>
          <div className="dash-label">⏳ 미분배 아이템</div>
        </div>
        <div className="dash-item">
          <div className="dash-num warn">{owedCount}</div>
          <div className="dash-label">💰 잔액 남은 인원</div>
        </div>
        <div className="dash-item">
          <div className="dash-num">{fmt(totalPending)}</div>
          <div className="dash-label">분배전 합계</div>
        </div>
      </div>

      <div className="sect">
        💰 멤버별 잔액 · 분배완료 누적 {fmt(totalPaid)} {state.unit}
      </div>

      <div className="card">
        <div className="field">
          <input
            type="text"
            inputMode="search"
            placeholder="이름 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="멤버 이름 검색"
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 10,
              fontSize: 13,
              color: 'var(--text-dim)',
            }}
          >
            <input
              type="checkbox"
              checked={onlyOwed}
              onChange={(e) => setOnlyOwed(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--brand)' }}
            />
            받을 잔액이 남은 사람만 보기
          </label>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        {list.length === 0 ? (
          <div className="empty">{q || onlyOwed ? '조건에 맞는 멤버가 없습니다.' : '멤버가 없습니다.'}</div>
        ) : (
          list.map((r) => (
            <div className="row" key={r.name}>
              <div className="row-main">
                <div className="row-name">{r.name}</div>
                <div className="row-sub">참여 {r.cnt}회</div>
              </div>
              <div className="row-amt">
                <div className={'amt-pending' + (r.pending > 0 ? '' : ' zero')}>
                  {fmt(r.pending)} {state.unit}
                </div>
                <div className="amt-paid">완료 {fmt(r.paid)}</div>
              </div>
              {admin ? (
                <button className="btn" disabled={r.pending <= 0} onClick={() => onPayout(r)}>
                  지급
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
