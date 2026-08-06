'use client';

import { useState } from 'react';
import Sheet from './Sheet';
import type { GuildState, LedgerItem } from '@/lib/types';
import { api, calcSplit, fmt, getStoredEmail, weightsOf } from '@/lib/client';
import { useT } from '@/lib/i18n';

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
  const { t, unit, srv } = useT();
  const [raw, setRaw] = useState('');

  const u = unit(state.unit);
  const pct = Math.round(state.fundRate * 100);
  const names = item.names?.length ? item.names : [];
  // 명단을 받지 못한 옛 데이터는 전원 100%로 본다 (시트 쪽 계산과 같은 결과)
  const weightList = names.length ? weightsOf(state, names) : [];
  const weights: number | number[] = names.length ? weightList : item.cnt;
  const reduced = names.filter((_, i) => weightList[i] !== undefined && weightList[i] < 100);

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
    toast(srv(res, res.ok ? 'r.distributed' : 'r.distributeFailed'), !res.ok);
    if (res.ok) {
      onClose();
      onDone();
    }
  }

  return (
    <Sheet
      title={`📦 ${item.item}`}
      subtitle={t('dist.sub', { n: item.cnt, fund: state.fundName, pct })}
      onClose={onClose}
    >
      <label className="fl" htmlFor="amt">
        {t('dist.amount', { unit: u })}
      </label>
      <input
        id="amt"
        type="text"
        inputMode="numeric"
        placeholder={t('dist.amountPh')}
        value={raw}
        autoFocus
        onChange={(e) => setRaw(e.target.value)}
      />

      {split ? (
        <div className="calc">
          <div className="calc-line">
            <span>{t('dist.sale')}</span>
            <strong>
              {fmt(amount)} {u}
            </strong>
          </div>
          <div className="calc-line">
            <span>{t('dist.fund', { fund: state.fundName, pct })}</span>
            <strong>{fmt(split.fund)}</strong>
          </div>
          <div className="calc-line">
            <span>{t('dist.base', { n: item.cnt })}</span>
            <strong>{fmt(split.perPerson)}</strong>
          </div>
          {reduced.map((nm, i) => {
            const idx = names.indexOf(nm);
            return (
              <div className="calc-line" key={nm + i}>
                <span>
                  ⚖️ {nm} ({weightList[idx]}%)
                </span>
                <strong>{fmt(split.shares[idx])}</strong>
              </div>
            );
          })}
          {split.remainder > 0 ? (
            <div className="calc-line">
              <span>{t('dist.remainder', { fund: state.fundName })}</span>
              <strong>{fmt(split.remainder)}</strong>
            </div>
          ) : null}
          <div className="calc-line" style={{ borderTop: '1px solid rgba(0,0,0,.12)', paddingTop: 6, marginTop: 2 }}>
            <span>{t('dist.fundTotal', { fund: state.fundName })}</span>
            <strong>{fmt(split.fundTotal)}</strong>
          </div>
        </div>
      ) : (
        <p className="hint" style={{ marginTop: 10 }}>
          {raw ? t('dist.needInt') : t('dist.enterAmount')}
        </p>
      )}

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('c.cancel')}
        </button>
        <button className="btn warn" disabled={!valid} onClick={run}>
          {t('dist.do')}
        </button>
      </div>
    </Sheet>
  );
}
