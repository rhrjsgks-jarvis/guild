'use client';

import { useEffect } from 'react';
import { useT } from '@/lib/i18n';

/**
 * 아래에서 올라오는 모달. prompt/confirm 대신 쓴다
 * (홈 화면 앱 모드에서 브라우저 팝업은 어색하다).
 *
 * ★ 바깥을 눌러도 닫히지 않는다 (v11.1). 예전에는 배경을 누르면 닫혔는데,
 *   폰에서는 시트가 화면을 거의 다 채워서 스크롤하려다 가장자리를 스치는 일이
 *   잦고, 그때마다 **입력하던 내용이 통째로 사라졌다.** 아이템 등록처럼
 *   참여자를 스무 명 체크한 뒤라면 손해가 크다.
 *   닫는 길은 두 가지뿐이다 — 오른쪽 위 [✕] 와 아래쪽 버튼(취소·저장·닫기).
 *   Esc 도 남겨둔다 (PC 에서는 실수로 눌릴 일이 없고, 키보드만 쓰는 사람에게 필요하다).
 */
export default function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // 시트가 떠 있는 동안 뒤 배경이 같이 스크롤되지 않게 한다
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="backdrop" role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grip" />
        <button type="button" className="sheet-x" aria-label={t('c.close')} onClick={onClose}>
          ✕
        </button>
        <h2>{title}</h2>
        {subtitle ? <div className="sheet-sub">{subtitle}</div> : null}
        {children}
      </div>
    </div>
  );
}
