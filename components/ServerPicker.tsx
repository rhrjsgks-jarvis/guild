'use client';

import { useMemo, useState } from 'react';
import { useT } from '@/lib/i18n';

/**
 * 서버 고르기 — 드롭다운 대신 칩 (v10.8.5).
 *
 * 예전에는 `<select>` 였다. 12개를 고르려면 열고 · 굴리고 · 누르는 세 동작이
 * 필요한데, 혈맹원 40명에게 서버를 넣으려면 그게 120번이다.
 * 칩은 **한 번 누르면 끝**이다.
 *
 * ★ `inUse` 를 주면 실제로 쓰는 서버만 앞에 두고 나머지는 접는다.
 *   12개 중 서너 개만 쓰는 길드에서 나머지 여덟 개는 매번 눈에 걸리는 잡음이다.
 *   다만 아직 아무도 배정되지 않았을 때(=inUse 가 거의 비었을 때)는
 *   접어봐야 고를 것이 없으므로 전부 보여준다.
 */
export default function ServerPicker({
  servers,
  value,
  onChange,
  allowNone = true,
  inUse,
  id,
}: {
  servers: string[];
  value: string;
  onChange: (next: string) => void;
  /** '지정 안 함' 칩을 둘 것인가 (혈맹원 설정에는 필요, 일괄 지정에는 불필요) */
  allowNone?: boolean;
  /** 실제로 인원이 있는 서버 — 이 목록이 2개 이상일 때만 나머지를 접는다 */
  inUse?: string[];
  id?: string;
}) {
  const { t } = useT();
  const [showAll, setShowAll] = useState(false);

  const { primary, rest } = useMemo(() => {
    const used = (inUse ?? []).filter((s) => servers.includes(s));
    // 쓰는 서버가 하나뿐이거나 아예 없으면 접을 이유가 없다 — 고를 것이 없어진다
    if (used.length < 2) return { primary: servers, rest: [] as string[] };
    // 지금 고른 값은 접힌 쪽에 있어도 항상 보여야 한다. 안 보이면 뭘 골랐는지 알 수 없다
    const front = servers.filter((s) => used.includes(s) || s === value);
    return { primary: front, rest: servers.filter((s) => !front.includes(s)) };
  }, [servers, inUse, value]);

  const chip = (s: string) => (
    <button
      key={s}
      type="button"
      className={'svchip' + (value === s ? ' on' : '')}
      aria-pressed={value === s}
      onClick={() => onChange(s)}
    >
      {s}
    </button>
  );

  return (
    <div className="svpick" id={id}>
      {allowNone ? (
        <button
          type="button"
          className={'svchip wide' + (value === '' ? ' on' : '')}
          aria-pressed={value === ''}
          onClick={() => onChange('')}
        >
          {t('ali.none')}
        </button>
      ) : null}
      {primary.map(chip)}
      {rest.length > 0 && !showAll ? (
        <button type="button" className="svchip more" onClick={() => setShowAll(true)}>
          + {t('sv.more', { n: rest.length })}
        </button>
      ) : null}
      {showAll ? rest.map(chip) : null}
    </div>
  );
}
