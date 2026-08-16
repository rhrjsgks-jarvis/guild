'use client';

import { useT } from '@/lib/i18n';
import { GRADE_UNKNOWN, gradeColor, imgOf, termDisplay, tierOf, useTerms } from '@/lib/terms';

/**
 * 아이템 이름 한 벌 (v11.5) — 등급 테두리 · 티어 배지 · 아이콘.
 *
 * 아이템·연합·정산 어디서나 같은 모양으로 보이게 하려고 한 곳에 모았다.
 * 화면마다 따로 그리면 색이 갈리고, 한쪽만 고쳐 어긋난다.
 *
 * ★ 등급은 **사전의 분류로만** 정한다. 이름을 보고 짐작하지 않는다 —
 *   '전설 제작 비법서'(전설)와 '전설의 도전자'(보스)는 둘 다 '전설'로 시작한다.
 * ★ 사전에 없으면 검정이다. "모른다"를 색으로 드러내는 것이지, 등급이 없다는
 *   뜻이 아니다. 새 아이템이 나오면 사전에 넣기 전까지 검정으로 보인다.
 * ★ 티어는 빈칸이면 배지를 아예 그리지 않는다. 마법서·정수처럼 티어라는
 *   개념이 없는 것에 '0티어'를 붙이면 없는 등급을 지어내는 것이다 (규칙 7).
 * ★ 그림은 관리자가 사전에 넣은 주소만 쓴다. 우리가 어디선가 긁어오지 않는다.
 */
export default function ItemName({
  name,
  size = 'md',
}: {
  name: string;
  /** 목록에서는 md, 제목 자리에서는 lg */
  size?: 'md' | 'lg';
}) {
  const { t, lang } = useT();
  const { terms } = useTerms();
  const color = gradeColor(terms, name);
  /**
   * 시트에는 '3티어' 로 저장되지만 화면에는 **언어별로** 그린다.
   * 아이템 이름은 고유명사라 번역하지 않지만 '티어'는 일반 명사다 —
   * 대만 혈맹원에게 '3티어' 는 읽히지 않는다.
   */
  const tierNo = (tierOf(terms, name).match(/([0-3])/) ?? [])[1] ?? '';
  const img = imgOf(terms, name);
  const known = color !== GRADE_UNKNOWN;

  return (
    <span className={`iname ${size}`}>
      {/* 그림이 있으면 이름 앞에 붙인다. 없으면 자리도 차지하지 않는다.
          next/image 를 쓰지 않는 이유: 주소가 관리자가 넣은 임의의 외부 링크라
          미리 등록할 도메인을 알 수 없다 (PhotoStrip 도 같은 이유로 img 를 쓴다) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {img ? <img className="iname-img" src={img} alt="" loading="lazy" /> : null}
      <span
        className="iname-txt"
        style={{
          borderColor: color,
          // 아는 등급만 은은하게 배경을 깐다 — 검정에 배경까지 깔면 글자가 묻힌다
          background: known ? `${color}1A` : 'transparent',
        }}
      >
        {/* 화면 언어로 보여준다 (v11.6) — 사전에 있는 것만 바뀌고, 없으면 국문 그대로다.
            저장되는 이름은 언제나 국문이라 이 표시가 기록을 바꾸지는 않는다 */}
        {termDisplay(terms, name, lang)}
      </span>
      {tierNo ? <span className="iname-tier">{t('item.tierN', { n: tierNo })}</span> : null}
    </span>
  );
}
