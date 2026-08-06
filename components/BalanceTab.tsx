'use client';

import { useMemo, useState } from 'react';
import type { BalanceRow, GuildState } from '@/lib/types';
import { fmt, normName, splitName } from '@/lib/client';
import { useT } from '@/lib/i18n';

export default function BalanceTab({
  state,
  admin,
  onPayout,
}: {
  state: GuildState;
  admin: boolean;
  onPayout: (row: BalanceRow) => void;
}) {
  const { t, unit } = useT();
  const [q, setQ] = useState('');
  const [onlyOwed, setOnlyOwed] = useState(false);

  const u = unit(state.unit);

  // 멤버DB F열의 서버 번호 — 이름만으로는 누가 어느 서버인지 알 수 없다
  const serverOf = useMemo(() => {
    const map = new Map<string, string>();
    (state.memberInfo ?? []).forEach((m) => {
      const sv = String(m.server ?? '').trim();
      if (sv) map.set(normName(m.name), sv.padStart(2, '0'));
    });
    return map;
  }, [state.memberInfo]);

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
          <div className="dash-label">{t('bal.waitingItems')}</div>
        </div>
        <div className="dash-item">
          <div className="dash-num warn">{owedCount}</div>
          <div className="dash-label">{t('bal.owedPeople')}</div>
        </div>
        <div className="dash-item">
          <div className="dash-num">{fmt(totalPending)}</div>
          <div className="dash-label">{t('bal.pendingTotal')}</div>
        </div>
      </div>

      <div className="sect">{t('bal.sect', { v: `${fmt(totalPaid)} ${u}` })}</div>

      <div className="card">
        <div className="field">
          <input
            type="text"
            inputMode="search"
            placeholder={t('bal.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={t('bal.search')}
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
            {t('bal.onlyOwed')}
          </label>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        {list.length === 0 ? (
          <div className="empty">{q || onlyOwed ? t('bal.noMatch') : t('bal.noMember')}</div>
        ) : (
          list.map((r) => (
            <div className="row" key={r.name}>
              <div className="row-main">
                <div className="row-name">
                  {serverOf.get(normName(r.name)) ? (
                    <span className="svr">{serverOf.get(normName(r.name))}</span>
                  ) : null}
                  {splitName(r.name).main}
                  {splitName(r.name).sub ? <span className="hanja">({splitName(r.name).sub})</span> : null}
                </div>
                <div className="row-sub">
                  {t('c.joined')} {t('c.times', { n: r.cnt })}
                </div>
              </div>
              <div className="row-amt">
                <div className={'amt-pending' + (r.pending > 0 ? '' : ' zero')}>
                  {fmt(r.pending)} {u}
                </div>
                <div className="amt-paid">
                  {t('c.done')} {fmt(r.paid)}
                </div>
              </div>
              {admin ? (
                <button className="btn" disabled={r.pending <= 0} onClick={() => onPayout(r)}>
                  {t('bal.payout')}
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
