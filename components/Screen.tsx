'use client';

import { useT } from '@/lib/i18n';
import { useBackClose } from '@/lib/back';

/**
 * 홈에서 연 화면 (v11.2.1) — 레이드·내 정보·게시판·관리.
 *
 * 하단 탭에서 빠진 화면들이라, 어디에 있는지와 **어떻게 나가는지**가
 * 화면 위에 항상 보여야 한다. 나가는 길은 두 가지다 —
 * 오른쪽 위 [✕] 와 **폰 뒤로가기**. 하단 탭은 그대로 있어서
 * 잔액·아이템·연합으로는 여기서도 한 번에 갈 수 있다.
 */
export default function Screen({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useT();

  // 폰 뒤로가기 = 홈으로 (앱을 벗어나지 않는다)
  useBackClose(onClose);

  return (
    <>
      <div className="screen-bar">
        <h2>{title}</h2>
        <button type="button" className="screen-x" aria-label={t('c.close')} onClick={onClose}>
          ✕
        </button>
      </div>
      {children}
    </>
  );
}
