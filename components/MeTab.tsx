'use client';

import { useEffect, useState } from 'react';
import type { GuildState, LookupResult } from '@/lib/types';
import { api, fmt, getStoredName, setStoredName } from '@/lib/client';

/**
 * 내 다이아 조회. 전체 목록은 [잔액] 탭에도 있지만,
 * 여기서는 공유 캐시를 거치지 않고 시트에서 바로 읽어온다
 * (지급받은 직후 내 숫자가 맞는지 확인하는 용도라 신선도가 중요하다).
 */
export default function MeTab({ state }: { state: GuildState }) {
  const [name, setName] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const options = state.members.filter((m) => m !== state.fundName);

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
      setError('이름을 선택해주세요.');
      return;
    }
    setLoading(true);
    setError('');
    const res = await api('/api/lookup', { name: target });
    setLoading(false);

    if (!res.ok) {
      setResult(null);
      setError(res.msg ?? '조회하지 못했습니다.');
      return;
    }
    setStoredName(target);
    setResult(res.data as LookupResult);
  }

  return (
    <div className="page">
      <div className="sect">🙋 내 다이아 조회</div>

      <div className="card">
        <div className="field">
          <label className="fl" htmlFor="meName">
            이름 선택 (다음부터는 자동으로 불러옵니다)
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
            <option value="">이름을 선택하세요</option>
            {options.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button className="btn block" style={{ marginTop: 12 }} disabled={!name || loading} onClick={() => lookup(name)}>
            {loading ? '조회 중…' : '조회하기'}
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
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>{result.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'var(--pending-soft)', borderRadius: 12, padding: '16px 8px' }}>
                <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--pending)' }}>{fmt(result.pending)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>분배전 (받을 예정)</div>
              </div>
              <div style={{ background: 'var(--paid-soft)', borderRadius: 12, padding: '16px 8px' }}>
                <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--paid)' }}>{fmt(result.paid)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>분배완료 (받은 누적)</div>
              </div>
            </div>
            <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text-dim)' }}>
              시즌 {state.season} · 참여 {result.cnt}회 · 단위 {state.unit}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
