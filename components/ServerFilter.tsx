'use client';

import { useMemo, useState } from 'react';
import { foldServers } from '@/lib/client';
import { useT } from '@/lib/i18n';

/** 서버가 지정되지 않은 사람을 가리키는 내부 값 — 시트의 빈 칸과 같다 */
export const NO_SERVER = '';

/**
 * 서버로 참여자를 좁히는 칩 — **여러 개 고를 수 있다** (v10.8.6).
 *
 * [혈맹원 관리]의 `ServerPicker` 는 한 사람에게 한 서버를 정하는 것이라 하나만
 * 고른다. 여기는 다르다 — 한 레이드에 두세 서버가 같이 들어가는 일이 있으므로
 * "더 추가하실 서버는 없나요?" 를 물어보고 복수로 받는다.
 *
 * ★ `(미지정)` 도 하나의 칩이다. 서버 칸이 아직 비어 있는 사람을 고를 길이
 *   없으면, 서버를 다 채우기 전까지 등록 자체가 막힌다.
 * ★ 접는 규칙은 `foldServers` 한 벌을 쓴다 (`ServerPicker` 와 공유).
 */
export default function ServerFilter({
  servers,
  counts,
  noneCount,
  value,
  onChange,
}: {
  servers: string[];
  /** 서버별 인원 수 — 비어 있는 서버는 고를 이유가 없으므로 칩에서 접힌다 */
  counts: Record<string, number>;
  /** 서버가 지정되지 않은 사람 수 */
  noneCount: number;
  /** 고른 서버들. `NO_SERVER` 가 들어 있으면 미지정도 포함 */
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useT();
  const [showAll, setShowAll] = useState(false);

  const inUse = useMemo(() => servers.filter((s) => (counts[s] ?? 0) > 0), [servers, counts]);
  const { primary, rest } = useMemo(() => foldServers(servers, inUse, value), [servers, inUse, value]);

  const flip = (s: string) =>
    onChange(value.includes(s) ? value.filter((v) => v !== s) : [...value, s]);

  const chip = (s: string) => {
    const n = counts[s] ?? 0;
    return (
      <button
        key={s}
        type="button"
        className={'svchip' + (value.includes(s) ? ' on' : '') + (n === 0 ? ' vacant' : '')}
        aria-pressed={value.includes(s)}
        onClick={() => flip(s)}
      >
        {s}
        <em>{n}</em>
      </button>
    );
  };

  return (
    <div className="svpick" id="itemServers">
      {primary.map(chip)}
      {rest.length > 0 && !showAll ? (
        <button type="button" className="svchip more" onClick={() => setShowAll(true)}>
          + {t('sv.more', { n: rest.length })}
        </button>
      ) : null}
      {showAll ? rest.map(chip) : null}
      {/* 서버 칸이 비어 있는 사람 — 없으면 칩 자체를 띄우지 않는다 */}
      {noneCount > 0 ? (
        <button
          type="button"
          className={'svchip wide' + (value.includes(NO_SERVER) ? ' on' : '')}
          aria-pressed={value.includes(NO_SERVER)}
          onClick={() => flip(NO_SERVER)}
        >
          {t('sv.noneChip')}
          <em>{noneCount}</em>
        </button>
      ) : null}
    </div>
  );
}
