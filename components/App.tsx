'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BalanceRow, GuildState, LedgerItem } from '@/lib/types';
import { api } from '@/lib/client';
import BalanceTab from './BalanceTab';
import ItemsTab from './ItemsTab';
import MeTab from './MeTab';
import AdminTab from './AdminTab';
import DistributeSheet from './DistributeSheet';
import PayoutSheet from './PayoutSheet';

type Tab = 'balance' | 'items' | 'me' | 'admin';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'balance', icon: '💰', label: '잔액' },
  { id: 'items', icon: '📦', label: '아이템' },
  { id: 'me', icon: '🙋', label: '내 정보' },
  { id: 'admin', icon: '⚙️', label: '관리' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('balance');
  const [state, setState] = useState<GuildState | null>(null);
  const [admin, setAdmin] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; err: boolean } | null>(null);

  const [payTarget, setPayTarget] = useState<BalanceRow | null>(null);
  const [distTarget, setDistTarget] = useState<LedgerItem | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((text: string, err = false) => {
    setToastMsg({ text, err });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 5000);
  }, []);

  const refresh = useCallback(async () => {
    const res = await api('/api/state');
    setAdmin(Boolean(res.admin));
    if (!res.ok) {
      setLoadError(res.msg ?? '불러오지 못했습니다.');
      return;
    }
    setLoadError('');
    setState(res.data as GuildState);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 앱을 다시 열거나 탭으로 돌아오면 자동으로 최신 상태를 가져온다
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // 서비스워커 등록 (홈 화면 설치 + 오프라인 껍데기)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* 등록 실패해도 앱 자체는 정상 동작한다 */
    });
  }, []);

  return (
    <>
      <header className="header">
        <h1>🎮 길드정산</h1>
        <div className="meta">
          {admin ? <span className="chip">🔓 관리자</span> : null}
          {state ? <span className="chip">시즌 {state.season}</span> : null}
          <button
            onClick={() => void refresh()}
            aria-label="새로고침"
            style={{ color: '#fff', fontSize: 17, padding: '2px 4px' }}
          >
            ↻
          </button>
        </div>
      </header>

      {loadError ? (
        <div className="page">
          <div className="card">
            <div className="field">
              <div className="note" style={{ background: 'transparent', padding: 0 }}>
                ⚠️ 데이터를 불러오지 못했습니다.
              </div>
              <p className="hint" style={{ marginTop: 8, fontSize: 13 }}>
                {loadError}
              </p>
              <button className="btn block" style={{ marginTop: 14 }} onClick={() => void refresh()}>
                다시 시도
              </button>
              <a className="btn ghost block" style={{ marginTop: 8 }} href="/api/health" target="_blank" rel="noreferrer">
                설정 점검하기
              </a>
            </div>
          </div>
        </div>
      ) : !state ? (
        <div className="page">
          <div className="card">
            <div className="field">
              {[70, 100, 85, 60].map((w, i) => (
                <div key={i} className="skeleton" style={{ width: `${w}%`, marginBottom: 12 }} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <main>
          {tab === 'balance' ? <BalanceTab state={state} admin={admin} onPayout={setPayTarget} /> : null}
          {tab === 'items' ? (
            <ItemsTab
              state={state}
              admin={admin}
              onDistribute={setDistTarget}
              onDone={() => void refresh()}
              toast={toast}
              setBusy={setBusy}
            />
          ) : null}
          {tab === 'me' ? <MeTab state={state} /> : null}
          {tab === 'admin' ? (
            <AdminTab admin={admin} onAuthChange={() => void refresh()} toast={toast} />
          ) : null}
        </main>
      )}

      <nav className="nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            <span className="ico">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {payTarget && state ? (
        <PayoutSheet
          row={payTarget}
          state={state}
          onClose={() => setPayTarget(null)}
          onDone={() => void refresh()}
          toast={toast}
          setBusy={setBusy}
        />
      ) : null}

      {distTarget && state ? (
        <DistributeSheet
          item={distTarget}
          state={state}
          onClose={() => setDistTarget(null)}
          onDone={() => void refresh()}
          toast={toast}
          setBusy={setBusy}
        />
      ) : null}

      {busy ? (
        <div className="overlay">
          <div className="spinner" />
        </div>
      ) : null}

      {toastMsg ? (
        <div className={'toast' + (toastMsg.err ? ' err' : '')} role="status" onClick={() => setToastMsg(null)}>
          {toastMsg.text}
        </div>
      ) : null}
    </>
  );
}
