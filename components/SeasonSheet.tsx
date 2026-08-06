'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Sheet from './Sheet';
import type { SeasonDetail, SeasonInfo } from '@/lib/types';
import { api, fmt } from '@/lib/client';
import { useT } from '@/lib/i18n';

/**
 * 지난 시즌 기록 보기.
 *
 * 시즌 시트는 사람이 읽는 보고서 형식이라, 서버가 섹션 단위로 잘라 보내준다.
 * 기본 화면은 **캐릭터명 + 정산 다이아**만 보여준다 — 지난 시즌에 누가 얼마를
 * 받았는지가 실제로 확인하고 싶은 전부이기 때문. 나머지(아이템 이력·지급 이력
 * ·요약 통계)는 [자세히 보기]를 눌렀을 때만 표로 펼친다.
 */

type Settlement = { name: string; amount: number };

/** 💰 최종 잔액현황 섹션에서 "이름 · 분배완료 다이아"만 뽑아 큰 금액순으로 */
function settlementsOf(detail: SeasonDetail): Settlement[] {
  const balance = detail.sections.find((s) => s.title.startsWith('💰'));
  if (!balance) return [];

  // 헤더에서 "분배완료" 열을 찾는다. 못 찾으면 마지막 금액 열로 폴백한다.
  let col = balance.headers.findIndex((h) => h.replace(/\s/g, '').includes('분배완료'));
  if (col < 0) col = balance.headers.length >= 3 ? 2 : balance.headers.length - 1;

  const toNum = (s: string) => Number(String(s ?? '').replace(/[^0-9-]/g, '')) || 0;

  return balance.rows
    .map((r) => ({ name: String(r[0] ?? '').trim(), amount: toNum(r[col]) }))
    // '합계' 행은 아래에서 따로 계산하므로 목록에서 뺀다
    .filter((x) => x.name && x.name !== '합계')
    .sort((a, b) => b.amount - a.amount);
}

export default function SeasonSheet({ current, onClose }: { current: number; onClose: () => void }) {
  const { t, srv } = useT();
  const [list, setList] = useState<SeasonInfo[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<SeasonDetail | null>(null);
  const [detailed, setDetailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const res = await api('/api/seasons');
    if (!res.ok) {
      setError(srv(res, 'season.loadFailed'));
      return;
    }
    setList(res.data as SeasonInfo[]);
  }, [srv]);

  useEffect(() => {
    void load();
  }, [load]);

  const settlements = useMemo(() => (open ? settlementsOf(open) : []), [open]);
  const total = settlements.reduce((a, b) => a + b.amount, 0);

  async function openSeason(num: number) {
    setLoading(true);
    const res = await api(`/api/seasons?num=${num}`);
    setLoading(false);
    if (!res.ok) {
      setError(srv(res, 'season.loadFailed'));
      return;
    }
    setDetailed(false);
    setOpen(res.data as SeasonDetail);
  }

  if (open) {
    return (
      <Sheet
        title={`🗓️ ${t('c.season')} ${open.num}`}
        subtitle={t('season.detailSub', { n: settlements.length, v: `${fmt(total)} ${t('c.unit.diamond')}` })}
        onClose={() => setOpen(null)}
      >
        {settlements.length === 0 ? (
          <p className="hint">{t('season.noRecord')}</p>
        ) : (
          <div className="card" style={{ margin: 0 }}>
            {settlements.map((s, i) => (
              <div className="row" key={s.name + i}>
                <div className="row-main">
                  <div className="row-name">{s.name}</div>
                </div>
                <div className="row-amt">{fmt(s.amount)}</div>
              </div>
            ))}
          </div>
        )}

        <button className="btn ghost block" style={{ marginTop: 12 }} onClick={() => setDetailed((v) => !v)}>
          {detailed ? t('season.less') : t('season.more')}
        </button>

        {detailed
          ? open.sections.map((sec, i) => (
              <div key={i} style={{ marginTop: 18 }}>
                <div className="sect" style={{ margin: '0 0 8px' }}>
                  {sec.title}
                </div>
                {sec.rows.length === 0 ? (
                  <p className="hint">{t('season.noRows')}</p>
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
            ))
          : null}

        <div className="sheet-actions">
          <button className="btn ghost" onClick={() => setOpen(null)}>
            {t('season.backToList')}
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={t('season.title')} subtitle={t('season.sub', { n: current })} onClose={onClose}>
      {error ? (
        <p className="hint" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : !list ? (
        [70, 70].map((w, i) => <div key={i} className="skeleton" style={{ width: `${w}%`, marginBottom: 10 }} />)
      ) : list.length === 0 ? (
        <div className="note" style={{ whiteSpace: 'pre-wrap' }}>
          {t('season.emptyGuide')}
        </div>
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
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>
              {t('c.season')} {s.num}
            </div>
            {s.summary.length > 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                {s.summary.slice(0, 3).map((x) => `${x.label} ${x.value}`).join(' · ')}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{s.title || t('c.view')}</div>
            )}
          </button>
        ))
      )}
    </Sheet>
  );
}
