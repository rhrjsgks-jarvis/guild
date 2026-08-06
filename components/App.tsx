'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BalanceRow, GuildState, LedgerItem } from '@/lib/types';
import { api } from '@/lib/client';
import type { ApiResult } from '@/lib/client';
import { useT } from '@/lib/i18n';
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

/** Apps Script 가 앱 이름을 정하지 않았을 때 내려주는 기본값 */
const DEFAULT_APP_NAME = '길드정산';

/**
 * 앱을 켜둔 동안 자동으로 따라가는 주기.
 *
 * 서버 캐시(4초)가 뒤에서 요청을 흡수하므로, 사람이 몇 명이 보고 있든
 * 구글시트가 실제로 열리는 횟수는 이 주기와 무관하게 제한된다.
 * 화면이 보이지 않을 때는 아예 돌지 않는다.
 */
const POLL_MS = 25_000;

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
  const { t, srv } = useT();
  const [tab, setTab] = useState<Tab>('balance');
  const [state, setState] = useState<GuildState | null>(null);
  const [admin, setAdmin] = useState(false);
  const [master, setMaster] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState(0);
  const [nowTick, setNowTick] = useState(0);
  const [toastMsg, setToastMsg] = useState<{ text: string; err: boolean } | null>(null);

  const [seasonOpen, setSeasonOpen] = useState(false);
  // 공지 띠를 눌렀을 때 게시판에서 그 글을 바로 펼치기 위한 값
  const [focusPostId, setFocusPostId] = useState<number | null>(null);
  const [payTarget, setPayTarget] = useState<BalanceRow | null>(null);
  const [distTarget, setDistTarget] = useState<LedgerItem | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((text: string, err = false) => {
    setToastMsg({ text, err });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 5000);
  }, []);

  /**
   * 최신 상태 가져오기.
   *
   * `fresh` 는 등록·분배·지급 **직후**에만 켠다. 서버 캐시를 건너뛰게 해서
   * "방금 넣었는데 숫자가 그대로다" 를 없앤다 (자세한 이유는 lib/fresh.ts).
   * 평소 조회까지 fresh 로 부르면 캐시가 없는 것과 같아져 Apps Script
   * 실행 할당량을 그대로 태운다.
   */
  const refresh = useCallback(
    async (fresh = false) => {
      setSyncing(true);
      const res = await api(fresh ? '/api/state?fresh=1' : '/api/state');
      setSyncing(false);
      setAdmin(Boolean(res.admin));
      setMaster(Boolean(res.master));
      if (!res.ok) {
        setLoadError(srv(res));
        return;
      }
      setLoadError('');
      setState(res.data as GuildState);
      setSyncedAt(Date.now());
    },
    [srv],
  );

  /**
   * 쓰기 직후 호출용.
   *
   * 시트가 쓰기 응답에 최신 상태를 같이 실어 보내므로(v10.2 `_withState`),
   * 그게 있으면 **왕복 없이** 바로 화면에 반영한다. 없으면 (옛 버전 시트이거나
   * 시트 쪽 상태 읽기가 실패한 경우) 캐시를 건너뛴 조회로 물러선다.
   */
  const refreshNow = useCallback(
    (res?: ApiResult) => {
      const fresh = res?.state as GuildState | undefined;
      if (fresh) {
        setState(fresh);
        setSyncedAt(Date.now());
        setLoadError('');
        return;
      }
      void refresh(true);
    },
    [refresh],
  );

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

  /**
   * 앱을 켜둔 채로 있으면 주기적으로 따라간다 — 다른 사람이 등록·분배한 것이
   * 내 화면에도 저절로 나타난다. 화면이 꺼지거나 다른 앱으로 넘어가면
   * (visibilityState !== 'visible') 멈춰서 할당량을 낭비하지 않는다.
   */
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // "n초 전" 표시를 살아 있게 한다 (표시용 — 네트워크 호출과 무관)
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  // 서비스워커 등록 (홈 화면 설치 + 오프라인 껍데기)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* 등록 실패해도 앱 자체는 정상 동작한다 */
    });
  }, []);

  // 앱 이름: 마스터가 직접 지은 이름이면 데이터로 보고 그대로 두고,
  // 시트 기본값('길드정산')이면 화면 문구로 보고 언어에 맞춰 바꾼다.
  const rawName = state?.appName?.trim() ?? '';
  const title = !rawName || rawName === DEFAULT_APP_NAME ? t('app.title') : rawName;

  // 시트(.gs)는 사용자가 직접 붙여넣고 재배포해야 해서, 앱만 새 버전인 상태가 되기 쉽다.
  // 그 어긋남을 제목 옆에서 바로 보이게 한다.
  const sheetVersion = state?.version ?? '';
  const versionMismatch = Boolean(sheetVersion) && sheetVersion !== APP_VERSION;

  // "지금 보는 숫자가 언제 것인지" 를 버튼에 같이 띄운다.
  // 새로고침을 눌러야 할지 사용자가 스스로 판단할 수 있게 하는 것이 목적이다.
  const ago = (() => {
    if (!syncedAt) return '';
    const sec = Math.max(Math.floor((Math.max(nowTick, Date.now()) - syncedAt) / 1000), 0);
    if (sec < 30) return t('c.justNow');
    if (sec < 3600) return t('c.agoMin', { n: Math.floor(sec / 60) || 1 });
    return t('c.agoHour', { n: Math.floor(sec / 3600) });
  })();

  return (
    <>
      <header className="header">
        <h1>
          {/* 마스터가 넣은 줄바꿈이 그대로 살아야 한다 — 어디서 끊을지는 사람이 정한다 */}
          <span className="nm">🛡️ {title}</span>
          <span
            className={'ver' + (versionMismatch ? ' warn' : '')}
            title={`v${APP_VERSION}${versionMismatch ? ` / sheet v${sheetVersion}` : ''}`}
          >
            v{APP_VERSION}
            {versionMismatch ? ` ⚠️ ${sheetVersion}` : ''}
          </span>
        </h1>
        <div className="meta">
          {master ? (
            <span className="chip">👑 {t('c.master')}</span>
          ) : admin ? (
            <span className="chip">🔓 {t('c.admin')}</span>
          ) : null}
          {state ? (
            <button
              className="chip"
              onClick={() => setSeasonOpen(true)}
              aria-label={t('season.title')}
              style={{ color: '#fff' }}
            >
              {t('c.season')} {state.season}
              {state.seasonServer ? ` · ${state.seasonServer}` : ''} ▾
            </button>
          ) : null}
          <button
            className={'sync' + (syncing ? ' on' : '')}
            onClick={() => void refresh(true)}
            disabled={syncing}
            aria-label={t('c.refresh')}
            title={t('c.refresh')}
          >
            <span className="ico" aria-hidden="true">
              ↻
            </span>
            {syncing ? t('c.syncing') : ago}
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
                ⚠️ {t('c.loadFailed')}
              </div>
              <p className="hint" style={{ marginTop: 8, fontSize: 13 }}>
                {loadError}
              </p>
              <button className="btn block" style={{ marginTop: 14 }} onClick={() => void refresh()}>
                {t('c.retry')}
              </button>
              <a className="btn ghost block" style={{ marginTop: 8 }} href="/api/health" target="_blank" rel="noreferrer">
                {t('c.checkSetup')}
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
              master={master}
              onDistribute={setDistTarget}
              onDone={refreshNow}
              toast={toast}
              setBusy={setBusy}
            />
          ) : null}
          {tab === 'board' ? (
            <BoardTab
              admin={admin}
              focusPostId={focusPostId}
              onFocusHandled={() => setFocusPostId(null)}
              toast={toast}
              onChanged={refreshNow}
            />
          ) : null}
          {tab === 'alliance' ? <AllianceTab admin={admin} toast={toast} setBusy={setBusy} /> : null}
          {tab === 'me' ? <MeTab state={state} /> : null}
          {tab === 'admin' ? (
            <AdminTab
              admin={admin}
              master={master}
              unit={state.unit}
              servers={state.serverList ?? []}
              appName={title}
              onAuthChange={refreshNow}
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

      {seasonOpen && state ? <SeasonSheet current={state.season} onClose={() => setSeasonOpen(false)} /> : null}

      {payTarget && state ? (
        <PayoutSheet
          row={payTarget}
          state={state}
          onClose={() => setPayTarget(null)}
          onDone={refreshNow}
          toast={toast}
          setBusy={setBusy}
        />
      ) : null}

      {distTarget && state ? (
        <DistributeSheet
          item={distTarget}
          state={state}
          onClose={() => setDistTarget(null)}
          onDone={refreshNow}
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
