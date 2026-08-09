'use client';

import { useMemo, useState } from 'react';
import type { BalanceRow, GuildState } from '@/lib/types';
import { byName, fmt, fundFirst, nameParts, normName, normServer } from '@/lib/client';
import { useT } from '@/lib/i18n';
import ShareBtn from './ShareBtn';

export default function BalanceTab({
  state,
  admin,
  onPayout,
  toast,
}: {
  state: GuildState;
  admin: boolean;
  onPayout: (row: BalanceRow) => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t, unit } = useT();
  const [q, setQ] = useState('');
  const [onlyOwed, setOnlyOwed] = useState(false);

  const u = unit(state.unit);

  // 멤버DB F열의 서버 번호 — 이름만으로는 누가 어느 서버인지 알 수 없다
  const serverOf = useMemo(() => {
    const map = new Map<string, string>();
    (state.memberInfo ?? []).forEach((m) => {
      // `1` 로 넣은 사람과 `01` 로 넣은 사람을 한 곳에서 맞춘다 (v10.8.7)
      const sv = normServer(m.server);
      if (sv) map.set(normName(m.name), sv);
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
      // 이름순(ㄱ~ㅎ) — 금액순으로 두면 분배할 때마다 자리가 바뀌어 눈으로 찾을 수가 없다.
      // "받을 사람만 보기"와 이름 검색이 있으므로 지급할 때도 불편하지 않다 (v10.9.2)
      .sort((a, b) => byName(a.name, b.name));

    // 혈비는 사람이 아니라 길드의 금고다 — 사람들 사이에 섞이지 않게 맨 위로 (v10.8.7)
    const fundKey = normName(state.fundName);
    const pinned = fundFirst(filtered, (r) => normName(r.name) === fundKey);

    return { list: pinned, totalPending: tp, totalPaid: td, owedCount: owed };
  }, [state.rows, state.fundName, q, onlyOwed]);

  /**
   * 공유용 글 — 지금 화면에 보이는 목록 그대로 내보낸다.
   *
   * 검색어·필터를 걸어둔 채 누르면 그 결과만 나가는 것이 맞다. 전체를 내보내면
   * "지급할 사람만 뽑아 보내려던 것"이 명단 전체가 돼버린다.
   */
  function buildShare(): string {
    const head = `💰 ${t('tab.balance')} (${t('c.season')} ${state.season})`;
    const lines = list.map((r) => {
      const { main, sub } = nameParts(state, r.name);
      const who = sub ? `${main} (${sub})` : main;
      return `${who}  ${t('c.pending')} ${fmt(r.pending)} / ${t('c.paid')} ${fmt(r.paid)}`;
    });
    const foot = `${t('bal.pendingTotal')} ${fmt(totalPending)} ${u}`;
    return [head, ...lines, '', foot].join('\n');
  }

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

      <div className="sect-row">
        <div className="sect">{t('bal.sect', { v: `${fmt(totalPaid)} ${u}` })}</div>
        <ShareBtn title={t('tab.balance')} build={buildShare} toast={toast} />
      </div>

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
          list.map((r) => {
            // 한자는 멤버DB G열이 먼저, 없으면 이름 괄호 (lib/client 의 nameParts 한 곳에서만 정한다)
            const { main, sub } = nameParts(state, r.name);
            // 맨 위에 아무 표시 없이 있으면 "잔액이 제일 많은 사람"으로 읽힌다
            const isFund = normName(r.name) === normName(state.fundName);
            return (
              <div className={'row' + (isFund ? ' fundrow' : '')} key={r.name}>
                <div className="row-main">
                  <div className="row-name">
                    {serverOf.get(normName(r.name)) ? (
                      <span className="svr">{serverOf.get(normName(r.name))}</span>
                    ) : null}
                    {main}
                    {sub ? <span className="hanja">({sub})</span> : null}
                    {isFund ? (
                      <span className="badge" style={{ marginLeft: 6 }}>
                        {t('ros.fundBadge')}
                      </span>
                    ) : null}
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
            );
          })
        )}
      </div>
    </div>
  );
}
