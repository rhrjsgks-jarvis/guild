'use client';

import { byName } from '@/lib/client';
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
export type Loot = { raid: string; boss: string; lootSv: string; lootCh: string };

export const EMPTY_LOOT: Loot = { raid: '', boss: '', lootSv: '', lootCh: '' };

export default function LootFields({
  value,
  onChange,
  servers,
  members,
  idPrefix,
}: {
  value: Loot;
  onChange: (next: Loot) => void;
  servers: string[];
  /** 루팅캐릭터 제안용 — 명단에 없는 이름도 칠 수 있다 */
  members: string[];
  idPrefix: string;
}) {
  const { t } = useT();
  const set = (patch: Partial<Loot>) => onChange({ ...value, ...patch });
  const listId = `${idPrefix}-chars`;

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
