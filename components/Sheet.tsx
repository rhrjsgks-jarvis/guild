'use client';

import { useEffect } from 'react';
import { useT } from '@/lib/i18n';
import { useBackClose } from '@/lib/back';

/**
 * 아래에서 올라오는 모달. prompt/confirm 대신 쓴다
 * (홈 화면 앱 모드에서 브라우저 팝업은 어색하다).
 *
 * ★ 바깥을 눌러도 닫히지 않는다 (v11.1). 예전에는 배경을 누르면 닫혔는데,
 *   폰에서는 시트가 화면을 거의 다 채워서 스크롤하려다 가장자리를 스치는 일이
 *   잦고, 그때마다 **입력하던 내용이 통째로 사라졌다.** 아이템 등록처럼
 *   참여자를 스무 명 체크한 뒤라면 손해가 크다.
 *   닫는 길은 세 가지다 — 오른쪽 위 [✕], 아래쪽 버튼(취소·저장·닫기),
 *   그리고 **폰 뒤로가기** (v11.2.1). Esc 도 남겨둔다.
 *
 * ★ 뒤로가기로 닫히는 것이 v11.2.1 에서 가장 중요한 수정이다. 그전까지는
 *   팝업을 닫으려고 뒤로가기를 누르면 앱을 통째로 벗어나서, 입력하던 내용이
 *   전부 사라졌다 — 배경 닫기를 막아둔 탓에 오히려 더 자주 눌렸다.
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

  // 폰 뒤로가기 = 이 팝업만 닫기 (앱을 벗어나지 않는다)
  useBackClose(onClose);

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
