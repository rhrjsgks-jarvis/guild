'use client';

import { useEffect } from 'react';

/** 아래에서 올라오는 모달. prompt/confirm 대신 쓴다 (홈 화면 앱 모드에서 브라우저 팝업은 어색하다) */
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
    <div
      className="backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grip" />
        <h2>{title}</h2>
        {subtitle ? <div className="sheet-sub">{subtitle}</div> : null}
        {children}
      </div>
    </div>
  );
}
