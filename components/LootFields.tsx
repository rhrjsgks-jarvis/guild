'use client';

import { useEffect, useRef } from 'react';
import { byName } from '@/lib/client';
import { bossesOf } from '@/lib/drops';
import { useT } from '@/lib/i18n';
import ItemNameInput from './ItemNameInput';
import ServerPicker from './ServerPicker';

/**
 * 레이드일 · 보스 · 루팅서버 · 루팅캐릭터 (v11.6) — 연합·아이템이 같은 한 벌을 쓴다.
 *
 * ★ 왜 칸을 나누는가
 *   지금까지는 아이템명 한 칸에 몰아 적어 왔다:
 *     `8/14 수룡 / 불변의 목걸이 / 차무식루팅`
 *   그러면 "안타라스가 준 것만" 세거나 "차무식이 먹은 것만" 찾을 수가 없고,
 *   아이템명이 사전과 안 맞아 등급 테두리·티어도 붙지 않는다.
 *
 * ★ 전부 **선택**이다. 비워두면 빈칸으로 남는다 — 모르는 값을 지어내지 않는다.
 * ★ 보스·루팅캐릭터는 사전·명단에 없는 값도 그대로 받는다. 막으면 새 보스가
 *   나오거나 외부 혈맹원이 루팅했을 때 등록 자체가 멈춘다 (규칙 6-4).
 * ★ 티어 입력칸은 두지 않는다. 아이템명을 고르면 사전에서 따라온다 —
 *   손으로 적게 하면 사전과 어긋나는 순간 어느 쪽이 맞는지 알 수 없다.
 */
export type Loot = { item?: string; raid: string; boss: string; lootSv: string; lootCh: string };

export const EMPTY_LOOT: Loot = { raid: '', boss: '', lootSv: '', lootCh: '' };

export default function LootFields({
  value,
  onChange,
  servers,
  members,
  idPrefix,
  item,
}: {
  value: Loot;
  onChange: (next: Loot) => void;
  servers: string[];
  /** 루팅캐릭터 제안용 — 명단에 없는 이름도 칠 수 있다 */
  members: string[];
  idPrefix: string;
  /** 지금 고른 아이템명 — 이걸 주는 보스를 제안한다 (v11.6.2). 없으면 제안 없음 */
  item?: string;
}) {
  const { t } = useT();
  const set = (patch: Partial<Loot>) => onChange({ ...value, ...patch });
  const listId = `${idPrefix}-chars`;

  /**
   * 이 아이템을 주는 보스 (공식 게임정보). 모르면 빈 배열이고, 그러면
   * 화면에 아무것도 안 나온다 — 모를 때 지어내지 않는다 (규칙 7).
   */
  const bosses = bossesOf(item ?? '');

  /**
   * 보스가 **하나뿐이면** 자동으로 채운다 (v11.6.2).
   *
   * ★ 아이템이 바뀐 순간에만, 그리고 **보스 칸이 비어 있을 때만** 넣는다.
   *   관리자가 지우거나 고쳐 둔 값을 다시 덮어쓰면, 고칠 때마다 되돌아오는
   *   칸이 되어 아예 못 쓰게 된다.
   * ★ 둘 이상이면 채우지 않는다. 고를 근거가 없는데 하나를 고르면 그건 추측이고,
   *   기록에 남은 뒤에는 아무도 못 알아챈다 (규칙 5-4 — 애매한 것을 확정하지 않는다).
   */
  const filledFor = useRef<string | null>(null);
  useEffect(() => {
    const key = String(item ?? '').trim();
    if (filledFor.current === key) return;
    filledFor.current = key;
    if (!key || bosses.length !== 1 || value.boss.trim()) return;
    onChange({ ...value, boss: bosses[0] });
    // value·onChange 는 매 렌더 새로 만들어진다 — 넣으면 무한 루프가 된다.
    // 아이템이 바뀔 때만 도는 것이 이 훅의 뜻이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  return (
    <>
      <label className="fl" htmlFor={`${idPrefix}-raid`}>
        {t('loot.raidDate')}
      </label>
      <input
        id={`${idPrefix}-raid`}
        type="date"
        value={value.raid}
        onChange={(e) => set({ raid: e.target.value })}
      />
      <p className="hint">{t('loot.raidHint')}</p>

      <label className="fl" htmlFor={`${idPrefix}-boss`} style={{ marginTop: 12 }}>
        {t('loot.boss')}
      </label>
      {/* 제안을 보스로 좁힌다 — 337개 아이템에 묻히면 167개 보스가 안 보인다 */}
      <ItemNameInput
        id={`${idPrefix}-boss`}
        cat="보스"
        value={value.boss}
        onChange={(v) => set({ boss: v })}
      />
      {/* 이 아이템을 주는 보스 — 눌러서 넣는다 (v11.6.2).
          하나뿐이면 위에서 이미 채웠으므로 "이걸로 채웠다"고 알려주기만 하고,
          여럿이면 칩으로 늘어놓아 사람이 고른다. 여기 없는 보스도 그냥 칠 수 있다. */}
      {bosses.length === 1 && value.boss.trim() === bosses[0] ? (
        <p className="hint">{t('loot.bossAuto', { boss: bosses[0] })}</p>
      ) : bosses.length > 0 ? (
        <>
          <p className="hint" style={{ marginBottom: 6 }}>
            {t('loot.bossFrom', { n: bosses.length })}
          </p>
          <div className="svpick">
            {bosses.map((b) => (
              <button
                key={b}
                type="button"
                className={'svchip wide' + (value.boss.trim() === b ? ' on' : '')}
                aria-pressed={value.boss.trim() === b}
                onClick={() => set({ boss: value.boss.trim() === b ? '' : b })}
              >
                {b}
              </button>
            ))}
          </div>
        </>
      ) : null}

      <label className="fl" style={{ marginTop: 12 }}>
        {t('loot.lootServer')}
      </label>
      {/* 참여 서버와 다른 것이다 — 여기는 **떨어진 곳** 하나다 */}
      <ServerPicker
        id={`${idPrefix}-lsv`}
        servers={servers}
        value={value.lootSv}
        onChange={(v) => set({ lootSv: v })}
        inUse={servers}
      />

      <label className="fl" htmlFor={`${idPrefix}-lch`} style={{ marginTop: 12 }}>
        {t('loot.lootChar')}
      </label>
      {/* datalist 는 **제안**일 뿐 입력을 막지 않는다 — 연합은 타 혈맹원이 먹기도 한다 */}
      <input
        id={`${idPrefix}-lch`}
        type="text"
        maxLength={30}
        value={value.lootCh}
        list={listId}
        autoComplete="off"
        onChange={(e) => set({ lootCh: e.target.value })}
      />
      <datalist id={listId}>
        {[...members].sort(byName).map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <p className="hint">{t('loot.lootCharHint')}</p>
    </>
  );
}

/** 화면에 한 줄로 — `8/14 · 안타라스 · 11서버 · 차무식`. 빈 칸은 건너뛴다 */
export function lootLine(v: {
  raid?: string;
  boss?: string;
  lootSv?: string;
  lootCh?: string;
}): string {
  return [v.raid, v.boss, v.lootSv, v.lootCh].map((x) => String(x ?? '').trim()).filter(Boolean).join(' · ');
}
