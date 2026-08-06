'use client';

import { useState } from 'react';
import Sheet from './Sheet';
import type { BalanceRow, GuildState } from '@/lib/types';
import { api, fmt, getStoredEmail } from '@/lib/client';
import type { ApiResult } from '@/lib/client';
import { useT } from '@/lib/i18n';

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
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, unit, srv } = useT();
  // 기본값은 전액 — 대부분은 그대로 확인만 누르면 된다
  const [raw, setRaw] = useState(String(row.pending));

  const u = unit(state.unit);
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
    toast(srv(res, res.ok ? 'r.paid' : 'r.payFailed'), !res.ok);
    if (res.ok) {
      onClose();
      onDone(res);
    }
  }

  return (
    <Sheet
      title={t('pay.title', { name: row.name })}
      subtitle={t('pay.sub', { v: `${fmt(row.pending)} ${u}` })}
      onClose={onClose}
    >
      <label className="fl" htmlFor="payamt">
        {t('pay.label', { unit: u })}
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
          {t('pay.full', { v: fmt(row.pending) })}
        </button>
        <button
          className="btn ghost"
          style={{ flex: 1 }}
          onClick={() => setRaw(String(Math.floor(row.pending / 2)))}
        >
          {t('pay.half', { v: fmt(Math.floor(row.pending / 2)) })}
        </button>
      </div>

      <div className="calc">
        {valid ? (
          <>
            <div className="calc-line">
              <span>{t('pay.give')}</span>
              <strong>
                {fmt(amount)} {u}
              </strong>
            </div>
            <div className="calc-line">
              <span>{t('pay.left')}</span>
              <strong>{fmt(row.pending - amount)}</strong>
            </div>
            <div className="calc-line" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
              <span>{partial ? t('pay.partial') : t('pay.whole')}</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--danger)' }}>
            {amount > row.pending ? t('pay.tooMuch', { v: `${fmt(row.pending)} ${u}` }) : t('pay.needInt')}
          </div>
        )}
      </div>

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('c.cancel')}
        </button>
        <button className="btn" disabled={!valid} onClick={run}>
          {t('pay.do')}
        </button>
      </div>
    </Sheet>
  );
}
