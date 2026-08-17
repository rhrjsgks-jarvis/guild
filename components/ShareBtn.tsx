'use client';

import { useState } from 'react';
import Glyph from './Glyph';
import { shareText } from '@/lib/client';
import { useT } from '@/lib/i18n';

/**
 * 지금 보고 있는 화면을 글로 만들어 밖으로 내보내는 버튼 (v10.8).
 *
 * 길드 운영은 결국 카카오톡·디스코드에서 이뤄진다. 화면을 스크린샷으로
 * 찍어 올리면 글자가 작아 읽히지 않고, 검색도 되지 않는다. 그래서 **텍스트**로
 * 내보낸다.
 *
 * ★ 게시판·관리 탭에는 붙이지 않는다.
 *   게시판 글은 이미 그 자체가 공유물이고, 관리 탭에는 PIN·도구처럼
 *   밖으로 나가면 안 되는 것이 섞여 있다.
 *
 * `build` 를 호출 시점에 실행하는 이유: 누를 때의 최신 화면을 담기 위해서다.
 * 미리 만들어 두면 필터를 바꾼 뒤 눌렀을 때 옛 내용이 나간다.
 */
export default function ShareBtn({
  title,
  build,
  toast,
  className = 'btn ghost share-btn',
}: {
  title: string;
  build: () => string;
  toast: (msg: string, isError?: boolean) => void;
  className?: string;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    let body = '';
    try {
      body = build();
    } catch {
      body = '';
    }
    if (!body.trim()) {
      setBusy(false);
      toast(t('sh.empty'), true);
      return;
    }
    const r = await shareText(title, body);
    setBusy(false);
    if (r === 'copied') toast(t('sh.copied'));
    else if (r === 'failed') toast(t('sh.failed'), true);
    // 'shared' 는 공유 시트가 알아서 알려준다. 'cancelled' 는 사용자가 닫은 것 — 알릴 일이 아니다.
  }

  return (
    <button className={className} onClick={() => void go()} disabled={busy} aria-label={t('sh.share')}>
      <Glyph name="share" size={16} /> {t('sh.share')}
    </button>
  );
}
