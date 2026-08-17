'use client';

import { CLASS_LIST, classLabel } from '@/lib/client';
import { useT } from '@/lib/i18n';

/** 클래스 칸이 비어 있는 사람 — 시트의 빈 칸과 같다 */
export const NO_CLASS = '';
/** "전체"를 뜻하는 내부 값. 클래스 미지정(`''`)과 구분해야 해서 따로 둔다 */
export const ANY_CLASS = '*';

/**
 * 클래스로 좁혀 보는 드롭다운 — **한 번에 하나만** (v11.6.1).
 *
 * 서버 필터(`ServerFilter`)는 칩이고 복수 선택이다. 여기는 일부러 다르게 만들었다:
 * ★ 클래스는 13종이다. 칩으로 깔면 서버 칩(12개) 아래에 또 13개가 붙어
 *   화면 절반이 필터가 된다 — 정작 봐야 할 명단이 밀려난다.
 * ★ "기사와 요정을 한 화면에서" 볼 일은 없다. 복수 선택은 자리만 먹고
 *   쓰이지 않는 기능이 된다.
 *
 * 서버 필터와는 **AND** 로 겹친다 (01서버의 기사).
 */
export default function ClassFilter({
  counts,
  noneCount,
  value,
  onChange,
}: {
  /** 클래스별 인원 — 0명인 클래스는 고를 이유가 없으므로 목록에서 뺀다 */
  counts: Record<string, number>;
  /** 클래스가 지정되지 않은 사람 수 */
  noneCount: number;
  /** 고른 클래스. `ANY_CLASS` 면 전체 */
  value: string;
  onChange: (next: string) => void;
}) {
  const { t, lang } = useT();

  const total = Object.values(counts).reduce((a, b) => a + b, 0) + noneCount;
  // 아무도 클래스를 안 넣었으면 필터 자체가 뜻이 없다 — 빈 드롭다운을 보여주지 않는다
  if (total === 0 || total === noneCount) return null;

  return (
    <select
      className={'clsfilter' + (value !== ANY_CLASS ? ' on' : '')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t('cls.filter')}
    >
      <option value={ANY_CLASS}>{t('cls.all')}</option>
      {CLASS_LIST.filter((c) => (counts[c] ?? 0) > 0).map((c) => (
        <option key={c} value={c}>
          {classLabel(c, lang)} ({counts[c]})
        </option>
      ))}
      {noneCount > 0 ? <option value={NO_CLASS}>{t('cls.none', { n: noneCount })}</option> : null}
    </select>
  );
}
