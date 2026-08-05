'use client';

import { useCallback, useEffect, useState } from 'react';
import Sheet from './Sheet';
import type { SeasonDetail, SeasonInfo } from '@/lib/types';
import { api } from '@/lib/client';

/**
 * 지난 시즌 기록 보기.
 *
 * 시즌 시트는 사람이 읽는 보고서 형식이라, 서버가 섹션 단위로 잘라 보내준다.
 * 여기서는 그걸 그대로 표로 그린다 — 시트 형식이 바뀌어도 화면은 따라간다.
 */
export default function SeasonSheet({ current, onClose }: { current: number; onClose: () => void }) {
  const [list, setList] = useState<SeasonInfo[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<SeasonDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const res = await api('/api/seasons');
    if (!res.ok) {
      setError(res.msg ?? '시즌 기록을 불러오지 못했습니다.');
      return;
    }
    setList(res.data as SeasonInfo[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openSeason(num: number) {
    setLoading(true);
    const res = await api(`/api/seasons?num=${num}`);
    setLoading(false);
    if (!res.ok) {
      setError(res.msg ?? '불러오지 못했습니다.');
      return;
    }
    setOpen(res.data as SeasonDetail);
  }

  if (open) {
    return (
      <Sheet title={`🗓️ 시즌 ${open.num}`} subtitle={open.title} onClose={() => setOpen(null)}>
        {open.sections.map((sec, i) => (
          <div key={i} style={{ marginBottom: 18 }}>
            <div className="sect" style={{ margin: '0 0 8px' }}>
              {sec.title}
            </div>
            {sec.rows.length === 0 ? (
              <p className="hint">기록 없음</p>
            ) : (
              <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--line)' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      {sec.headers.map((h, j) => (
                        <th
                          key={j}
                          style={{
                            padding: '8px 10px',
                            background: 'var(--surface-2)',
                            borderBottom: '1px solid var(--line)',
                            whiteSpace: 'nowrap',
                            textAlign: j === 0 ? 'left' : 'right',
                            fontWeight: 700,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sec.rows.map((r, ri) => (
                      <tr key={ri}>
                        {r.map((c, ci) => (
                          <td
                            key={ci}
                            style={{
                              padding: '7px 10px',
                              borderBottom: '1px solid var(--line)',
                              whiteSpace: 'nowrap',
                              textAlign: ci === 0 ? 'left' : 'right',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        <div className="sheet-actions">
          <button className="btn ghost" onClick={() => setOpen(null)}>
            시즌 목록으로
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="🗓️ 지난 시즌" subtitle={`지금은 시즌 ${current} 진행 중입니다`} onClose={onClose}>
      {error ? (
        <p className="hint" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : !list ? (
        [70, 70].map((w, i) => <div key={i} className="skeleton" style={{ width: `${w}%`, marginBottom: 10 }} />)
      ) : list.length === 0 ? (
        <p className="hint">
          아직 종료된 시즌이 없습니다. 시즌을 종료하면 그때까지의 기록이 여기에 보관됩니다.
        </p>
      ) : (
        list.map((s) => (
          <button
            key={s.num}
            onClick={() => openSeason(s.num)}
            disabled={loading}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>시즌 {s.num}</div>
            {s.summary.length > 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                {s.summary.slice(0, 3).map((x) => `${x.label} ${x.value}`).join(' · ')}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{s.title || '기록 보기'}</div>
            )}
          </button>
        ))
      )}
    </Sheet>
  );
}
