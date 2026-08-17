'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Glyph from './Glyph';
import type { BalanceRow, GuildState, LedgerItem } from '@/lib/types';
import { api, getStoredAppName, setStoredAppName } from '@/lib/client';
import type { ApiResult } from '@/lib/client';
import { useT } from '@/lib/i18n';
import { APP_VERSION } from '@/lib/version';
import BalanceTab from './BalanceTab';
import ItemsTab from './ItemsTab';
import BoardTab from './BoardTab';
import AllianceTab from './AllianceTab';
import RaidTab from './RaidTab';
import MeTab from './MeTab';
import AdminTab from './AdminTab';
import TermsTab from './TermsTab';
import HomeTab, { dropHomeMemo } from './HomeTab';
import ManualTab from './ManualTab';
import Screen from './Screen';
import LangSheet from './LangSheet';
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

/**
 * 화면 (v11.2.1) — 하단 탭이 없다. 홈의 아이콘에서 열고, [✕]·뒤로가기로 닫는다.
 *
 * 탭 7개 시절에는 글자를 8.8px 까지 줄여야 들어갔고, 눈이 나쁜 사람은 읽지 못했다.
 * 아이콘 격자는 글자를 줄일 이유가 없고, 화면이 늘어도 한 칸만 더 놓으면 된다.
 * 첫 화면은 **홈**이다 — 열자마자 "지금 처리할 일"이 숫자로 보인다.
 */
type Screen = 'balance' | 'items' | 'alliance' | 'raid' | 'me' | 'board' | 'manual' | 'terms' | 'admin';

/** 화면 제목 — 지금 어디에 있고 어떻게 나가는지가 위에 항상 보인다 */
const SCREEN_TITLE: Record<Screen, string> = {
  balance: 'tab.balance',
  items: 'tab.items',
  alliance: 'tab.alliance',
  raid: 'tab.raid',
  me: 'tab.me',
  board: 'tab.board',
  manual: 'tab.manual',
  terms: 'term.title',
  admin: 'tab.admin',
};

export default function App() {
  const { t, srv } = useT();
  // null 이면 홈(아이콘 격자)이다 — 앱을 열면 여기서 시작한다
  const [screen, setScreen] = useState<Screen | null>(null);
  const [langOpen, setLangOpen] = useState(false);
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
      // 홈의 연합·레이드 숫자도 낡았을 수 있다 (등록·삭제 직후)
      dropHomeMemo();
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
  const fromSheet = !rawName || rawName === DEFAULT_APP_NAME ? '' : rawName;

  /**
   * 첫 화면에서 제목이 **스스로 바뀌지 않게** 한다 (v11.7).
   *
   * 이름은 시트에 있어서 첫 그림은 이름이 오기 전에 그려진다. 예전에는 기본 이름을
   * 띄웠다가 1초쯤 뒤 진짜 이름으로 갈아치웠고, 그게 눈에 보였다 — 제목이 저 혼자
   * 바뀌는 화면은 잘못 들어온 것처럼 읽힌다.
   *
   * ★ localStorage 는 **붙인 뒤에** 읽는다. 첫 그림에서 읽으면 서버가 그린 것과
   *   달라져 React 가 하이드레이션 경고를 낸다. 붙은 직후 한 프레임이라 눈에 안 띈다.
   * ★ 시트에서 온 값이 언제나 이긴다. 마스터가 이름을 바꿨는데 옛 이름이 남아 있으면
   *   그게 더 나쁘다.
   */
  const [cachedName, setCachedName] = useState('');
  useEffect(() => setCachedName(getStoredAppName()), []);
  useEffect(() => {
    if (fromSheet) setStoredAppName(fromSheet);
  }, [fromSheet]);

  const title = fromSheet || cachedName || t('app.title');

  /**
   * 브라우저 탭·앱 전환 화면의 이름 — 거기만 옛 이름이면 다른 앱으로 보인다.
   *
   * 🐛 처음에는 `document.title = title` 을 효과에서 넣었는데 **되돌아왔다.**
   *    Next 의 metadata 가 그린 `<title>` 요소가 다시 렌더될 때마다 제 값을
   *    덮어쓰기 때문이다. React 19 는 `<title>` 을 head 로 올려주므로
   *    **요소로 그리면** 그 싸움 자체가 없어진다.
   * ★ 이름에 마스터가 넣은 줄바꿈이 들어 있다 — 탭 제목에서는 한 줄로 편다.
   */
  const tabTitle = title.replace(/\s+/g, ' ').trim();

  // 시트(.gs)는 사용자가 직접 붙여넣고 재배포해야 해서, 앱만 새 버전인 상태가 되기 쉽다.
  // 그 어긋남을 제목 옆에서 바로 보이게 한다.
  //
  // ★ 앞 두 자리(10.8)만 본다. 시트를 건드리지 않는 화면 수정은 세 번째 자리만
  //   올리는데(10.8 → 10.8.1), 그것까지 비교하면 멀쩡한 시트에 경고가 붙는다.
  //   시트가 정말 뒤처졌는지는 major.minor 로만 판단할 수 있다.
  const sheetVersion = state?.version ?? '';
  const short = (v: string) => v.split('.').slice(0, 2).join('.');
  const versionMismatch = Boolean(sheetVersion) && short(sheetVersion) !== short(APP_VERSION);

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
      {/* React 19 가 head 로 올려준다 — metadata 의 기본 제목을 이긴다 */}
      <title>{tabTitle}</title>
      <header className="header">
        <h1>
          {/* 앱 아이콘과 같은 그림. 이모지 대신 마스코트를 쓰면 홈 화면 아이콘과
              헤더가 같은 얼굴이 돼서, 여러 앱 사이에서 찾기가 쉬워진다 (v10.8.3).
              alt 를 비워둔 이유: 바로 옆에 앱 이름이 글자로 있어 읽어줄 것이 없다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src="/icon-192.png" alt="" width={26} height={26} />
          {/* 마스코트는 항상 왼쪽에 붙어 있어야 한다. 제목과 같은 흐름에 두면
              이름이 길 때 그림만 윗줄에 남아 제목이 세 줄로 밀린다. */}
          <span className="ttl">
            {/* 마스터가 넣은 줄바꿈이 그대로 살아야 한다 — 어디서 끊을지는 사람이 정한다 */}
            <span className="nm">{title}</span>
            <span
              className={'ver' + (versionMismatch ? ' warn' : '')}
              title={`v${APP_VERSION}${versionMismatch ? ` / sheet v${sheetVersion}` : ''}`}
            >
              v{APP_VERSION}
              {versionMismatch ? ` ⚠️ ${sheetVersion}` : ''}
            </span>
          </span>
        </h1>
        <div className="meta">
          {/*
            지금 무슨 권한인지 알리는 칩.
            ★ 좁은 폰에서는 **글자를 접고 그림만** 남긴다 (CSS). 칩 넷이 붙으면
              제목이 밀려 "길드정 / 산" 처럼 끊기는데, 어느 앱인지 못 읽는 것이
              권한 글자를 못 읽는 것보다 나쁘다. 그림만 남아도 뜻은 통한다.
            ★ 그래도 이름은 남는다 — aria-label 로 낭독기에는 그대로 읽힌다.
          */}
          {master ? (
            <span className="chip role" aria-label={t('c.master')}>
              <Glyph name="crown" size={13} />
              <span className="txt">{t('c.master')}</span>
            </span>
          ) : admin ? (
            <span className="chip role" aria-label={t('c.admin')}>
              <Glyph name="unlock" size={13} />
              <span className="txt">{t('c.admin')}</span>
            </span>
          ) : null}
          {state ? (
            <button
              className="chip"
              onClick={() => setSeasonOpen(true)}
              aria-label={t('season.title')}
              style={{ color: '#fff' }}
            >
              {/* '시즌' 이라는 말은 아주 좁은 폰에서 접는다 — 숫자와 서버만 남아도
                  무엇인지 알 수 있고, 그 자리를 제목에 내주는 편이 낫다 */}
              <span className="txt">{t('c.season')} </span>
              {state.season}
              {state.seasonServer ? ` · ${state.seasonServer}` : ''} ▾
            </button>
          ) : null}
          {/*
            언어 바꾸기는 **헤더에 상시** 둔다 (v11.7).
            홈 아이콘에만 있으면 화면을 보다가 언어를 바꾸려고 매번 홈까지 나갔다
            와야 했다 — 대만·영어권 혈맹원은 그걸 자주 한다.
            ★ 지금 언어를 글자로 보여준다(한/中/EN). 지구본만 두면 눌러 보기 전에는
              지금 무슨 언어인지 알 수 없다.
          */}
          <button className="chip lang" onClick={() => setLangOpen(true)} aria-label={t('home.lang')}>
            <Glyph name="lang" size={13} />
            {t('lang.short')}
          </button>
          <button
            className={'sync' + (syncing ? ' on' : '')}
            onClick={() => void refresh(true)}
            disabled={syncing}
            aria-label={t('c.refresh')}
            title={t('c.refresh')}
          >
            <span className="ico" aria-hidden="true">
              <Glyph name="refresh" size={14} />
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
            setScreen('board');
            setFocusPostId(state.notice?.id ?? null);
          }}
        >
          <Glyph name="pin" size={16} /> {state.notice.title}
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
          {/* 홈에서 연 화면 — 하나만 떠 있고, [✕]·뒤로가기로 홈에 돌아온다 */}
          {screen ? (
            <Screen title={t(SCREEN_TITLE[screen])} onClose={() => setScreen(null)}>
              {screen === 'balance' ? (
                <BalanceTab state={state} admin={admin} onPayout={setPayTarget} toast={toast} />
              ) : null}
              {screen === 'items' ? (
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
              {screen === 'alliance' ? (
                // 연합 정산은 혈맹운영비 잔액을 실제로 늘리고 줄인다 — 잔액도 같이 맞춰야 한다
                <AllianceTab
                  admin={admin}
                  master={master}
                  fundName={state.fundName}
                  members={state.members}
                  toast={toast}
                  setBusy={setBusy}
                  onWrote={refreshNow}
                />
              ) : null}
              {screen === 'raid' ? <RaidTab admin={admin} toast={toast} setBusy={setBusy} /> : null}
              {screen === 'me' ? <MeTab state={state} toast={toast} /> : null}
              {screen === 'board' ? (
                <BoardTab
                  admin={admin}
                  focusPostId={focusPostId}
                  onFocusHandled={() => setFocusPostId(null)}
                  toast={toast}
                  onChanged={refreshNow}
                />
              ) : null}
              {/* 관리자용 절은 관리자 모드일 때만 그린다 — 접어두는 것이 아니라 아예 만들지 않는다 */}
              {screen === 'manual' ? <ManualTab admin={admin} /> : null}
              {screen === 'terms' ? <TermsTab admin={admin} toast={toast} setBusy={setBusy} /> : null}
              {screen === 'admin' ? (
                <AdminTab
                  admin={admin}
                  master={master}
                  unit={state.unit}
                  servers={state.serverList ?? []}
                  appName={title}
                  onAuthChange={refreshNow}
                  onTerms={() => setScreen('terms')}
                  toast={toast}
                />
              ) : null}
            </Screen>
          ) : (
            <HomeTab state={state} admin={admin} onGo={setScreen} />
          )}
        </main>
      )}

      {langOpen ? <LangSheet onClose={() => setLangOpen(false)} /> : null}

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
