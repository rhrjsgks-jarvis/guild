'use client';

import Sheet from './Sheet';
import { LANGS, useT } from '@/lib/i18n';

/**
 * 언어 고르기 (v11.2.1).
 *
 * 예전에는 [관리] 탭 맨 위에만 있었다. 관리는 PIN 을 넣는 곳이라
 * 중국 혈맹원이 언어를 바꾸려고 들어갔다가 "여긴 내 자리가 아닌가" 하고
 * 나오는 일이 있었다. 홈에서 바로 고를 수 있게 옮긴다
 * (관리 탭의 것은 그대로 둔다 — 쓰던 사람이 못 찾으면 안 된다).
 */
export default function LangSheet({ onClose }: { onClose: () => void }) {
  const { t, lang, setLang } = useT();

  return (
    <Sheet title={`🌏 ${t('home.lang')}`} subtitle={t('adm.langNote')} onClose={onClose}>
      <div className="field" style={{ display: 'flex', gap: 8 }}>
        {LANGS.map((l) => (
          <button
            key={l.id}
            className={'btn block' + (lang === l.id ? '' : ' ghost')}
            style={{ padding: '11px 4px', fontSize: 13 }}
            onClick={() => {
              setLang(l.id);
              onClose();
            }}
          >
            {l.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
