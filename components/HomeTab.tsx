'use client';

import { useEffect, useState } from 'react';
import type { AllianceState, GuildState, RaidState } from '@/lib/types';
import { api } from '@/lib/client';
import { useT } from '@/lib/i18n';
import { todayDay } from './RaidTab';

/**
 * 홈 (v11.2.1) — 하단 탭을 7개에서 4개로 줄이면서 생긴 자리.
 *
 * ★ 두 가지만 한다
 *   ① **지금 처리할 일**을 숫자로 보여주고, 누르면 그 화면으로 보낸다
 *   ② 자주 안 쓰는 화면(레이드·내 정보·게시판·관리·언어)을 아이콘으로 모은다
 *
 * ★ 왜 탭을 줄였나
 *   탭 7개는 글자를 8.8px 까지 줄여야 들어갔다 (영문 "Balance"·"Alliance" 기준).
 *   4개가 되면서 11.5px 이 되어, 눈이 나쁜 사람도 읽을 수 있다.
 *   대신 잔액·아이템·연합은 **그대로 1탭**이라 매일 하는 왕복은 늘지 않는다.
 *
 * ★ 숫자를 어디서 가져오는가
 *   미분배·지급할 사람은 이미 받아둔 상태(`/api/state`)에 들어 있어 공짜다.
 *   연합·레이드만 따로 읽어야 하는데, 홈은 자주 열리므로 **1분 동안은
 *   다시 읽지 않는다.** 못 읽었으면 그 줄만 조용히 빼는 것이 아니라 아예
 *   숫자를 안 붙인다 — 0 으로 보여주면 "처리할 일이 없다"는 거짓말이 된다.
 */

type Extra = { ally: number; raid: number };

/** 홈을 여닫을 때마다 시트를 읽지 않게 한다 (탭 왕복은 흔하다) */
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
  onGo: (to: 'balance' | 'items' | 'alliance' | 'raid' | 'me' | 'board' | 'admin') => void;
  onLang: () => void;
}) {
  const { t } = useT();
  const [extra, setExtra] = useState<Extra | null>(memo && Date.now() - memo.at < MEMO_MS ? memo.extra : null);

  useEffect(() => {
    if (memo && Date.now() - memo.at < MEMO_MS) return;
    let alive = true;
    void (async () => {
      const [a, r] = await Promise.all([api('/api/alliance'), api('/api/raid')]);
      const ally = a.ok ? ((a.data as AllianceState).waiting?.length ?? 0) : -1;
      const day = todayDay();
      const raid = r.ok ? ((r.data as RaidState).rows ?? []).filter((x) => x.day === day).length : -1;
      const next = { ally, raid };
      // 못 읽은 것은 -1 로 남겨 배지를 아예 안 붙인다 (0 건과 구별해야 한다)
      memo = { at: Date.now(), extra: next };
      if (alive) setExtra(next);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const items = state.items.length;
  // 잔액 탭 대시보드와 같은 기준으로 센다 — 두 화면의 숫자가 다르면 고장으로 보인다
  const owed = state.rows.filter((r) => r.pending > 0).length;
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

  const tiles: { key: string; em: string; label: string; sub: string; badge?: number; go: () => void }[] = [
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
    { key: 'admin', em: '⚙️', label: t('tab.admin'), sub: t('home.adminSub'), go: () => onGo('admin') },
    { key: 'lang', em: '🌏', label: t('home.lang'), sub: t('home.langSub'), go: onLang },
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
