'use client';

import { useEffect, useState } from 'react';
import type { GuildState, LookupResult } from '@/lib/types';
import { api, fmt, getStoredName, nameParts, setStoredName } from '@/lib/client';
import { useT } from '@/lib/i18n';
import ShareBtn from './ShareBtn';

/**
 * 내 다이아 조회. 전체 목록은 [잔액] 탭에도 있지만,
 * 여기서는 공유 캐시를 거치지 않고 시트에서 바로 읽어온다
 * (지급받은 직후 내 숫자가 맞는지 확인하는 용도라 신선도가 중요하다).
 */
export default function MeTab({
  state,
  toast,
}: {
  state: GuildState;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t, unit, srv } = useT();
  const [name, setName] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const options = state.members.filter((m) => m !== state.fundName);

  // 한자만 아는 길드원도 목록에서 자기 이름을 찾을 수 있어야 한다
  const label = (n: string) => {
    const { main, sub } = nameParts(state, n);
    return sub ? `${main} (${sub})` : main;
  };
  const u = unit(state.unit);

  useEffect(() => {
    const saved = getStoredName();
    if (saved && options.includes(saved)) {
      setName(saved);
      void lookup(saved);
    }
    // 최초 1회만 — 저장된 이름 자동 조회
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lookup(target: string) {
    if (!target) {
      setError(t('me.needName'));
      return;
    }
    setLoading(true);
    setError('');
    const res = await api('/api/lookup', { name: target });
    setLoading(false);

    if (!res.ok) {
      setResult(null);
      setError(srv(res, 'me.failed'));
      return;
    }
    setStoredName(target);
    setResult(res.data as LookupResult);
  }

  return (
    <div className="page">
      <div className="sect">{t('me.sect')}</div>

      <div className="card">
        <div className="field">
          <label className="fl" htmlFor="meName">
            {t('me.pick')}
          </label>
          <select
            id="meName"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setResult(null);
              setError('');
            }}
          >
            <option value="">{t('me.pickPh')}</option>
            {options.map((m) => (
              <option key={m} value={m}>
                {label(m)}
              </option>
            ))}
          </select>
          <button
            className="btn block"
            style={{ marginTop: 12 }}
            disabled={!name || loading}
            onClick={() => lookup(name)}
          >
            {loading ? t('me.looking') : t('me.look')}
          </button>
          {error ? (
            <div className="hint" style={{ color: 'var(--danger)', marginTop: 10 }}>
              {error}
            </div>
          ) : null}
        </div>
      </div>

      {result ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="field" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>{label(result.name)}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'var(--pending-soft)', borderRadius: 12, padding: '16px 8px' }}>
                <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--pending)' }}>{fmt(result.pending)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>{t('me.pendingBox')}</div>
              </div>
              <div style={{ background: 'var(--paid-soft)', borderRadius: 12, padding: '16px 8px' }}>
                <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--paid)' }}>{fmt(result.paid)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>{t('me.paidBox')}</div>
              </div>
            </div>
            <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text-dim)' }}>
              {t('me.meta', { s: state.season, n: result.cnt, unit: u })}
            </div>
            <ShareBtn
              title={result.name}
              className="btn ghost block share-mine"
              build={() =>
                [
                  `🙋 ${label(result.name)} — ${t('c.season')} ${state.season}`,
                  `${t('c.pending')} ${fmt(result.pending)} ${u}`,
                  `${t('c.paid')} ${fmt(result.paid)} ${u}`,
                  `${t('c.joined')} ${t('c.times', { n: result.cnt })}`,
                ].join('\n')
              }
              toast={toast}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
