'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BalanceRow, GuildState, LedgerItem } from '@/lib/types';
import { api } from '@/lib/client';
import { getLang, makeT, type Lang } from '@/lib/i18n';
import { APP_VERSION } from '@/lib/version';
import BalanceTab from './BalanceTab';
import ItemsTab from './ItemsTab';
import BoardTab from './BoardTab';
import AllianceTab from './AllianceTab';
import MeTab from './MeTab';
import AdminTab from './AdminTab';
import DistributeSheet from './DistributeSheet';
import PayoutSheet from './PayoutSheet';
import SeasonSheet from './SeasonSheet';

type Tab = 'balance' | 'items' | 'board' | 'alliance' | 'me' | 'admin';

const TABS: { id: Tab; icon: string; key: string }[] = [
  { id: 'balance', icon: '💰', key: 'tab.balance' },
  { id: 'items', icon: '📦', key: 'tab.items' },
  { id: 'board', icon: '📋', key: 'tab.board' },
  { id: 'alliance', icon: '🤝', key: 'tab.alliance' },
  { id: 'me', icon: '🙋', key: 'tab.me' },
  { id: 'admin', icon: '⚙️', key: 'tab.admin' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('balance');
  const [state, setState] = useState<GuildState | null>(null);
  const [admin, setAdmin] = useState(false);
  const [master, setMaster] = useState(false);
  const [lang, setLangState] = useState<Lang>('ko');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; err: boolean } | null>(null);

  const [seasonOpen, setSeasonOpen] = useState(false);
  // 공지 띠를 눌렀을 때 게시판에서 그 글을 바로 펼치기 위한 값
  const [focusPostId, setFocusPostId] = useState<number | null>(null);
  const [payTarget, setPayTarget] = useState<BalanceRow | null>(null);
  const [distTarget, setDistTarget] = useState<LedgerItem | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = makeT(lang);

  const toast = useCallback((text: string, err = false) => {
    setToastMsg({ text, err });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 5000);
  }, []);

  const refresh = useCallback(async () => {
    const res = await api('/api/state');
    setAdmin(Boolean(res.admin));
    setMaster(Boolean(res.master));
    if (!res.ok) {
      setLoadError(res.msg ?? '불러오지 못했습니다.');
      return;
    }
    setLoadError('');
    setState(res.data as GuildState);
  }, []);

  useEffect(() => {
    setLangState(getLang());
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

  const title = state?.appName?.trim() || '길드정산';

  // 시트(.gs)는 사용자가 직접 붙여넣고 재배포해야 해서, 앱만 새 버전인 상태가 되기 쉽다.
  // 그 어긋남을 제목 옆에서 바로 보이게 한다.
  const sheetVersion = state?.version ?? '';
  const versionMismatch = Boolean(sheetVersion) && sheetVersion !== APP_VERSION;

  return (
    <>
      <header className="header">
        <h1>
          🛡️ {title}
          <span
            className={'ver' + (versionMismatch ? ' warn' : '')}
            title={
              versionMismatch
                ? `앱 v${APP_VERSION} · 구글시트 v${sheetVersion} — 시트에 새 코드를 붙여넣고 [배포 관리] → 새 버전으로 배포해주세요.`
                : `앱 · 구글시트 모두 v${APP_VERSION}`
            }
          >
            v{APP_VERSION}
            {versionMismatch ? ` ⚠️ 시트 v${sheetVersion}` : ''}
          </span>
        </h1>
        <div className="meta">
          {master ? <span className="chip">👑 {t('common.master')}</span> : admin ? <span className="chip">🔓 {t('common.admin')}</span> : null}
          {state ? (
            <button
              className="chip"
              onClick={() => setSeasonOpen(true)}
              aria-label="지난 시즌 기록 보기"
              style={{ color: '#fff' }}
            >
              {t('common.season')} {state.season}
              {state.seasonServer ? ` · ${state.seasonServer}` : ''} ▾
            </button>
          ) : null}
          <button
            onClick={() => void refresh()}
            aria-label={t('common.refresh')}
            style={{ color: '#fff', fontSize: 17, padding: '2px 4px' }}
          >
            ↻
          </button>
        </div>
      </header>

      {/* 공지는 어느 탭에 있든 항상 맨 위에 보인다 — 눌러서 게시판으로 */}
      {state?.notice ? (
        <button
          className="notice-bar"
          onClick={() => {
            setTab('board');
            setFocusPostId(state.notice?.id ?? null);
          }}
        >
          📌 {state.notice.title}
        </button>
      ) : null}

      {loadError ? (
        <div className="page">
          <div className="card">
            <div className="field">
              <div className="note" style={{ background: 'transparent', padding: 0 }}>
                ⚠️ {t('common.loadFailed')}
              </div>
              <p className="hint" style={{ marginTop: 8, fontSize: 13 }}>
                {loadError}
              </p>
              <button className="btn block" style={{ marginTop: 14 }} onClick={() => void refresh()}>
                {t('common.retry')}
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
          {tab === 'board' ? (
            <BoardTab
              admin={admin}
              lang={lang}
              focusPostId={focusPostId}
              onFocusHandled={() => setFocusPostId(null)}
              toast={toast}
              onChanged={() => void refresh()}
            />
          ) : null}
          {tab === 'alliance' ? (
            <AllianceTab admin={admin} lang={lang} toast={toast} setBusy={setBusy} />
          ) : null}
          {tab === 'me' ? <MeTab state={state} /> : null}
          {tab === 'admin' ? (
            <AdminTab
              admin={admin}
              master={master}
              unit={state.unit}
              servers={state.serverList ?? []}
              appName={title}
              lang={lang}
              onLangChange={setLangState}
              onAuthChange={() => void refresh()}
              toast={toast}
            />
          ) : null}
        </main>
      )}

      <nav className="nav">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            className={tab === tb.id ? 'on' : ''}
            onClick={() => setTab(tb.id)}
            aria-current={tab === tb.id ? 'page' : undefined}
          >
            <span className="ico">{tb.icon}</span>
            {t(tb.key)}
          </button>
        ))}
      </nav>

      {seasonOpen && state ? (
        <SeasonSheet current={state.season} onClose={() => setSeasonOpen(false)} />
      ) : null}

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
