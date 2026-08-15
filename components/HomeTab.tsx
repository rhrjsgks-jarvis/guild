'use client';

import { useEffect, useState } from 'react';
import type { AllianceState, GuildState, RaidState } from '@/lib/types';
import { api, fmt } from '@/lib/client';
import { useT } from '@/lib/i18n';
import { todayDay } from './RaidTab';

/**
 * 홈 (v11.2.1) — 앱을 열면 여기서 시작한다.
 *
 * ★ 두 가지만 한다
 *   ① **지금 처리할 일**을 숫자로 보여주고, 누르면 그 화면으로 보낸다
 *   ② 모든 화면을 아이콘 하나씩으로 늘어놓는다 (관리는 **맨 마지막**)
 *
 * ★ 왜 하단 탭을 없앴나
 *   탭 7개는 글자를 8.8px 까지 줄여야 들어갔다 (영문 "Balance"·"Alliance" 기준).
 *   눈이 나쁜 사람은 읽지 못했다. 아이콘 격자는 글자를 줄일 이유가 없고,
 *   화면이 하나 더 늘어도 칸만 하나 더 놓으면 된다.
 *
 * ★ 관리가 맨 마지막인 이유
 *   엄지가 닿기 쉬운 자리에 두면 잘못 눌린다. PIN·도구가 들어 있는 화면이다.
 *
 * ★ 숫자를 어디서 가져오는가
 *   미분배·지급할 사람은 이미 받아둔 상태(`/api/state`)에 들어 있어 공짜다.
 *   연합·레이드만 따로 읽어야 하는데, 홈은 이제 **모든 이동의 길목**이라
 *   더더욱 자주 열린다 — **1분 동안은 다시 읽지 않는다.**
 *   못 읽었으면 숫자를 아예 안 붙인다. 0 으로 보여주면 "처리할 일이 없다"는
 *   거짓말이 된다 (규칙 7).
 */

/** 홈에서 갈 수 있는 화면 — App.tsx 의 Screen 과 같은 목록이다 */
export type Dest = 'balance' | 'items' | 'alliance' | 'raid' | 'me' | 'board' | 'admin';

type Extra = { ally: number; raid: number };

/** 홈을 여닫을 때마다 시트를 읽지 않게 한다 (홈은 모든 이동의 길목이다) */
let memo: { at: number; extra: Extra } | null = null;
const MEMO_MS = 60_000;

export default function HomeTab({
  state,
  admin,
  onGo,
  onLang,
}: {
  state: GuildState;
  admin: boolean;
  onGo: (to: Dest) => void;
  onLang: () => void;
}) {
  const { t } = useT();
  const [extra, setExtra] = useState<Extra | null>(memo && Date.now() - memo.at < MEMO_MS ? memo.extra : null);

  useEffect(() => {
    if (memo && Date.now() - memo.at < MEMO_MS) return;
    let alive = true;
    void (async () => {
      const [a, r] = await Promise.all([api('/api/alliance'), api('/api/raid')]);
      // 못 읽은 것은 -1 로 남겨 숫자를 아예 안 붙인다 (0 건과 구별해야 한다)
      const ally = a.ok ? ((a.data as AllianceState).waiting?.length ?? 0) : -1;
      const day = todayDay();
      const raid = r.ok ? ((r.data as RaidState).rows ?? []).filter((x) => x.day === day).length : -1;
      const next = { ally, raid };
      memo = { at: Date.now(), extra: next };
      if (alive) setExtra(next);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const items = state.items.length;
  // 잔액 화면 대시보드와 같은 기준으로 센다 — 두 화면의 숫자가 다르면 고장으로 보인다
  const owed = state.rows.filter((r) => r.pending > 0).length;
  const pendingTotal = state.rows.reduce((sum, r) => sum + r.pending, 0);
  const ally = extra && extra.ally >= 0 ? extra.ally : null;
  const raid = extra && extra.raid >= 0 ? extra.raid : null;

  const todo: { key: string; em: string; label: string; n: string; go: () => void; quiet?: boolean }[] = [];
  if (items > 0)
    todo.push({ key: 'items', em: '⏳', label: t('home.items'), n: t('c.cases', { n: items }), go: () => onGo('items') });
  if (ally && ally > 0)
    todo.push({ key: 'ally', em: '🤝', label: t('home.ally'), n: t('c.cases', { n: ally }), go: () => onGo('alliance') });
  if (owed > 0)
    todo.push({
      key: 'owed',
      em: '💰',
      label: t('home.owed'),
      n: t('c.persons', { n: owed }),
      go: () => onGo('balance'),
    });
  if (raid && raid > 0)
    todo.push({
      key: 'raid',
      em: '🗡️',
      label: t('home.raidToday'),
      n: t('c.cases', { n: raid }),
      go: () => onGo('raid'),
      quiet: true,
    });

  /**
   * 아이콘 순서 — 자주 여는 것부터, **관리는 맨 마지막**.
   * 배지는 "지금 몇 건이 기다리는가"만 붙인다 (없으면 안 붙인다).
   */
  const tiles: { key: string; em: string; label: string; sub: string; badge?: number; go: () => void }[] = [
    {
      key: 'balance',
      em: '💰',
      label: t('tab.balance'),
      // 단위까지 넣으면 줄이 넘어가 칸 하나만 키가 커진다 — 숫자만 넣는다
      sub: t('home.balanceSub', { v: fmt(pendingTotal) }),
      badge: owed || undefined,
      go: () => onGo('balance'),
    },
    {
      key: 'items',
      em: '📦',
      label: t('tab.items'),
      sub: t('home.itemsSub'),
      badge: items || undefined,
      go: () => onGo('items'),
    },
    {
      key: 'alliance',
      em: '🤝',
      label: t('tab.alliance'),
      sub: t('home.allySub'),
      badge: ally || undefined,
      go: () => onGo('alliance'),
    },
    {
      key: 'raid',
      em: '🗡️',
      label: t('tab.raid'),
      sub: raid === null ? t('home.raidSub') : t('home.raidCount', { n: raid }),
      badge: raid ?? undefined,
      go: () => onGo('raid'),
    },
    { key: 'me', em: '🙋', label: t('tab.me'), sub: t('home.meSub'), go: () => onGo('me') },
    { key: 'board', em: '📋', label: t('tab.board'), sub: t('home.boardSub'), go: () => onGo('board') },
    { key: 'lang', em: '🌏', label: t('home.lang'), sub: t('home.langSub'), go: onLang },
    // ★ 관리는 언제나 맨 마지막이다 — 엄지가 닿기 쉬운 자리에 두면 잘못 눌린다
    { key: 'admin', em: '⚙️', label: t('tab.admin'), sub: t('home.adminSub'), go: () => onGo('admin') },
  ];

  return (
    <div className="page">
      <div className="sect">{admin ? t('home.todo') : t('home.now')}</div>
      {todo.length > 0 ? (
        <div className="todo">
          {todo.map((r) => (
            <button key={r.key} type="button" className="todo-row" onClick={r.go}>
              <span className="em" aria-hidden="true">
                {r.em}
              </span>
              <span className="tx">{r.label}</span>
              <span className={'n' + (r.quiet ? ' q' : '')}>{r.n}</span>
              <span className="go" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="field">
            <p className="hint" style={{ margin: 0 }}>
              {t('home.clear')}
            </p>
          </div>
        </div>
      )}

      <div className="sect">{t('home.all')}</div>
      <div className="grid">
        {tiles.map((x) => (
          <button key={x.key} type="button" className="tile" onClick={x.go}>
            <span className="em" aria-hidden="true">
              {x.em}
            </span>
            <b>{x.label}</b>
            <span className="sub">{x.sub}</span>
            {x.badge ? <span className="bdg">{x.badge}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 홈을 다시 열었을 때 낡은 숫자를 쓰지 않게 한다 — 등록·삭제 직후에 부른다 */
export function dropHomeMemo() {
  memo = null;
}
