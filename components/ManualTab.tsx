'use client';

import Glyph from './Glyph';
import { MANUAL, type Block, type Tri } from '@/lib/manual';
import { useT } from '@/lib/i18n';

/**
 * 설명서 (v11.7) — 앱 안에서, 화면 언어 그대로.
 *
 * ★ **관리자용 절은 관리자 모드일 때만 그린다.** 숨기는 것이 아니라 아예 만들지
 *   않는다 — 접어두면 눌러 볼 수 있고, 혈맹원에게 "내가 못 하는 일" 목록을
 *   보여줄 이유가 없다. (권한 자체는 언제나 서버가 판정한다. 이건 화면 정리다.)
 * ★ 서식은 **네 가지뿐**이다 — 문단 · 번호흐름 · 표 · 강조상자.
 *   그림 설명서(docs/manual)와 같은 얼개라 두 문서가 따로 놀지 않는다.
 */

/** `**굵게**` 만 해석한다. 서식이 늘면 세 언어를 맞추기 어려워진다 */
function rich(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/).map((piece, i) =>
    piece.startsWith('**') && piece.endsWith('**') ? (
      <b key={i}>{piece.slice(2, -2)}</b>
    ) : (
      <span key={i}>{piece}</span>
    ),
  );
}

function BlockView({ block, idx }: { block: Block; idx: number }) {
  const T = (t: Tri) => rich(t[idx]);

  if ('p' in block) return <p className="man-line">{T(block.p)}</p>;

  if ('steps' in block) {
    return (
      <div className="man-flow">
        {block.steps.map((s, i) => (
          <div className="man-step" key={i}>
            <div className="rail">
              <div className="dot">{i + 1}</div>
              {i < block.steps.length - 1 ? <div className="bar" /> : null}
            </div>
            <div className="body">
              <h4>{T(s.h)}</h4>
              <p>{T(s.d)}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if ('table' in block) {
    return (
      <div className="man-tablewrap">
        <table className="man-table">
          <thead>
            <tr>
              {block.table.head.map((h, i) => (
                <th key={i}>{T(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.table.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, k) => (
                  <td key={k}>{T(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={'man-note' + (block.warn ? ' warn' : '')}>
      {block.h ? <h4>{T(block.h)}</h4> : null}
      <p>{T(block.note)}</p>
    </div>
  );
}

export default function ManualTab({ admin }: { admin: boolean }) {
  const { t, lang } = useT();
  const idx = lang === 'zh' ? 1 : lang === 'en' ? 2 : 0;
  const shown = MANUAL.filter((s) => !s.admin || admin);

  return (
    <div className="page">
      <div className="note" style={{ marginBottom: 14 }}>
        {t('man.intro')}
      </div>

      {shown.map((s, i) => (
        <div key={i}>
          <div className="sect">
            <Glyph name={s.icon} size={16} />
            {s.title[idx]}
            {s.admin ? <span className="badge">{t('c.admin')}</span> : null}
          </div>
          {s.sub ? <p className="man-sub">{s.sub[idx]}</p> : null}
          <div className="card">
            <div className="field">
              {s.blocks.map((b, k) => (
                <BlockView key={k} block={b} idx={idx} />
              ))}
            </div>
          </div>
        </div>
      ))}

      <div className="note" style={{ marginTop: 18 }}>
        {t('man.more')}
      </div>
    </div>
  );
}
