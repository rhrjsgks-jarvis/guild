'use client';

import Glyph from './Glyph';
import { MANUAL } from '@/lib/manual';
import { useT } from '@/lib/i18n';

/**
 * 설명서 (v11.7) — 앱 안에서, 화면 언어 그대로.
 *
 * ★ **관리자용 절은 관리자 모드일 때만 그린다.** 숨기는 것이 아니라 아예 만들지
 *   않는다 — 접어두면 눌러 볼 수 있고, 혈맹원에게 "내가 못 하는 일" 목록을
 *   보여줄 이유가 없다. (권한 자체는 언제나 서버가 판정한다. 이건 화면 정리다.)
 * ★ 그림 설명서와 **같은 내용을 두 벌로 자세히 적지 않는다.** 여기는 빠른 안내이고,
 *   자세한 것은 맨 아래 링크로 잇는다 — 두 벌이면 반드시 어긋난다.
 */
export default function ManualTab({ admin }: { admin: boolean }) {
  const { t, lang } = useT();
  const idx = lang === 'zh' ? 1 : lang === 'en' ? 2 : 0;
  const shown = MANUAL.filter((s) => !s.admin || admin);

  return (
    <div className="page">
      <div className="note" style={{ marginBottom: 12 }}>
        {t('man.intro')}
      </div>

      {shown.map((s, i) => (
        <div key={i}>
          <div className="sect">
            <Glyph name={s.icon} size={16} />
            {s.title[idx]}
            {s.admin ? <span className="badge">{t('c.admin')}</span> : null}
          </div>
          <div className="card">
            <div className="field">
              {s.lines.map((line, k) => (
                <p key={k} className="man-line">
                  {/* `**굵게**` 만 쓴다 — 설명서에 서식이 더 늘어나면 세 언어를 맞추기 어려워진다 */}
                  {line[idx].split(/(\*\*[^*]+\*\*)/).map((piece, j) =>
                    piece.startsWith('**') && piece.endsWith('**') ? (
                      <b key={j}>{piece.slice(2, -2)}</b>
                    ) : (
                      <span key={j}>{piece}</span>
                    ),
                  )}
                </p>
              ))}
            </div>
          </div>
        </div>
      ))}

      <div className="note" style={{ marginTop: 16 }}>
        {t('man.more')}
      </div>
    </div>
  );
}
