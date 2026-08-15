'use client';

import { useT } from '@/lib/i18n';
import { useBackClose } from '@/lib/back';

/**
 * 홈에서 연 화면 (v11.2.1 → v11.3) — 잔액·아이템·연합·레이드·내 정보·게시판·관리.
 *
 * 하단 탭바가 없으므로 **어디에 있는지와 어떻게 나가는지**가 화면에 항상 보여야 한다.
 * 나가는 길은 셋이다 — 오른쪽 위 [✕], **아래쪽 [🏠 홈]**, 그리고 폰 뒤로가기.
 *
 * ★ 아래쪽 홈 버튼을 따로 두는 이유 (v11.3): 목록이 길면 [✕]까지 다시 올라가야 하고,
 *   폰은 화면 위쪽이 엄지에서 가장 먼 자리다. 스크롤을 어디까지 내렸든 손이 닿는
 *   곳에 나가는 길이 하나 있어야 한다.
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
    <div className="screen">
      <div className="screen-bar">
        <h2>{title}</h2>
        <button type="button" className="screen-x" aria-label={t('c.close')} onClick={onClose}>
          ✕
        </button>
      </div>

      {children}

      {/* 손이 닿는 자리에 있는 나가는 길 — 스크롤을 따라다닌다 */}
      <div className="home-bar">
        <button type="button" className="home-btn" onClick={onClose}>
          <span aria-hidden="true">🏠</span> {t('home.goHome')}
        </button>
      </div>
    </div>
  );
}
