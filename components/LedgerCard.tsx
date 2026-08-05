'use client';

import { useCallback, useEffect, useState } from 'react';
import Sheet from './Sheet';
import type { LedgerEntry, ReversePreview } from '@/lib/types';
import { api, calcSplit, fmt, getStoredEmail } from '@/lib/client';

/**
 * 등록된 모든 아이템 (관리자 전용) — 판매금액 정정과 완전 삭제.
 *
 * 둘 다 잔액을 되돌리는 작업이라, 실행 전에 서버에서 "무엇을 얼마나 되돌리는지"
 * 를 받아 그대로 보여준다. 이미 지급✓ 된 사람이 있으면 서버가 아예 막는다.
 */
export default function LedgerCard({
  unit,
  fundRate,
  fundName,
  onChanged,
  toast,
}: {
  unit: string;
  fundRate: number;
  fundName: string;
  onChanged: () => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const [items, setItems] = useState<LedgerEntry[] | null>(null);
  const [target, setTarget] = useState<LedgerEntry | null>(null);

  const load = useCallback(async () => {
    const res = await api('/api/admin/items');
    if (res.ok) setItems(res.data as LedgerEntry[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="sect">🗂️ 등록된 모든 아이템 — 정정 · 삭제</div>
      <div className="card">
        {!items ? (
          <div className="field">
            {[80, 60].map((w, i) => (
              <div key={i} className="skeleton" style={{ width: `${w}%`, marginBottom: 10 }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="empty">등록된 아이템이 없습니다.</div>
        ) : (
          items.map((it) => (
            <div className="row" key={it.row}>
              <div className="row-main">
                <div className="row-name">{it.item}</div>
                <div className="row-sub">
                  {it.date} · {it.cnt}명 · {it.status}
                  {it.amount > 0 ? ` · ${fmt(it.amount)} ${unit}` : ''}
                </div>
              </div>
              <button className="btn ghost" onClick={() => setTarget(it)}>
                관리
              </button>
            </div>
          ))
        )}
      </div>

      {target ? (
        <ItemSheet
          entry={target}
          unit={unit}
          fundRate={fundRate}
          fundName={fundName}
          onClose={() => setTarget(null)}
          onDone={() => {
            setTarget(null);
            void load();
            onChanged();
          }}
          toast={toast}
        />
      ) : null}
    </>
  );
}

type Mode = 'menu' | 'correct' | 'delete';

function ItemSheet({
  entry,
  unit,
  fundRate,
  fundName,
  onClose,
  onDone,
  toast,
}: {
  entry: LedgerEntry;
  unit: string;
  fundRate: number;
  fundName: string;
  onClose: () => void;
  onDone: () => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const [preview, setPreview] = useState<ReversePreview | null>(null);
  const [mode, setMode] = useState<Mode>('menu');
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await api('/api/admin/items', { op: 'preview', row: entry.row });
      if (res.ok) setPreview(res.data as ReversePreview);
    })();
  }, [entry.row]);

  const newAmount = Number(raw.replace(/[,\s]/g, ''));
  const newValid = raw.trim() === '' || (Number.isInteger(newAmount) && newAmount > 0);
  const newSplit = raw.trim() !== '' && newValid ? calcSplit(newAmount, entry.cnt, fundRate) : null;

  async function run(op: 'correct' | 'delete') {
    setBusy(true);
    const res = await api('/api/admin/items', {
      op,
      row: entry.row,
      newAmount: op === 'correct' ? raw.replace(/[,\s]/g, '') : undefined,
      email: getStoredEmail(),
      confirm: true,
    });
    setBusy(false);
    toast(res.msg ?? (res.ok ? '처리했습니다.' : '처리하지 못했습니다.'), !res.ok);
    if (res.ok) onDone();
  }

  const blocked = preview?.blocked === true;

  return (
    <Sheet
      title={`📦 ${entry.item}`}
      subtitle={`${entry.date} · 참여 ${entry.cnt}명 · ${entry.status}`}
      onClose={onClose}
    >
      {!preview ? (
        <div className="skeleton" style={{ width: '70%' }} />
      ) : (
        <>
          {preview.needsReverse ? (
            <div className="calc">
              <div className="calc-line">
                <span>지금 분배된 금액</span>
                <strong>
                  {fmt(preview.amount)} {unit}
                </strong>
              </div>
              {(preview.lines ?? []).map((l, i) => (
                <div className="calc-line" key={l.name + i}>
                  <span>↩️ {l.name}</span>
                  <strong>{fmt(l.amount)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="hint">아직 분배되지 않은 아이템입니다. 되돌릴 금액이 없습니다.</p>
          )}

          {blocked ? (
            <div className="note" style={{ whiteSpace: 'pre-wrap' }}>
              ⚠️ 되돌릴 수 없습니다. 아래 대상이 이미 지급✓ 처리되어 분배전 잔액이 부족합니다.
              {'\n\n'}
              {(preview.insufficient ?? []).join('\n')}
              {'\n\n'}
              먼저 [최근 지급 취소]로 지급을 되돌린 뒤 다시 시도하세요.
            </div>
          ) : null}
        </>
      )}

      {mode === 'menu' ? (
        <div style={{ marginTop: 16 }}>
          {preview?.needsReverse ? (
            <button className="btn block" disabled={blocked} onClick={() => setMode('correct')}>
              🔄 판매금액 정정
            </button>
          ) : null}
          <button
            className="btn danger block"
            style={{ marginTop: 8 }}
            disabled={blocked}
            onClick={() => setMode('delete')}
          >
            🗑️ 아이템 완전 삭제
          </button>
          <button className="btn ghost block" style={{ marginTop: 8 }} onClick={onClose}>
            닫기
          </button>
        </div>
      ) : mode === 'correct' ? (
        <div style={{ marginTop: 16 }}>
          <label className="fl" htmlFor="newAmt">
            새 판매금액 ({unit}) — 비우면 되돌리기만 합니다
          </label>
          <input
            id="newAmt"
            type="text"
            inputMode="numeric"
            placeholder={`현재 ${fmt(entry.amount)}`}
            value={raw}
            autoFocus
            onChange={(e) => setRaw(e.target.value)}
          />
          {newSplit ? (
            <div className="calc">
              <div className="calc-line">
                <span>새 {fundName}</span>
                <strong>{fmt(newSplit.fund)}</strong>
              </div>
              <div className="calc-line">
                <span>새 기본 1인당 × {entry.cnt}명</span>
                <strong>{fmt(newSplit.perPerson)}</strong>
              </div>
              {newSplit.remainder > 0 ? (
                <div className="calc-line">
                  <span>잔여분 → {fundName}</span>
                  <strong>{fmt(newSplit.remainder)}</strong>
                </div>
              ) : null}
              <p className="hint" style={{ marginTop: 6 }}>
                비중이 100% 미만인 참여자가 있으면 그만큼 덜 받고, 남는 금액은 {fundName}로 갑니다.
                정확한 금액은 재분배 직후 결과 메시지에 나옵니다.
              </p>
            </div>
          ) : (
            <p className="hint">
              {raw.trim() === ''
                ? `되돌리기만 하고 ⏳미분배 상태로 돌아갑니다.`
                : '판매금액은 양의 정수여야 합니다.'}
            </p>
          )}
          <div className="sheet-actions">
            <button className="btn ghost" onClick={() => setMode('menu')}>
              뒤로
            </button>
            <button className="btn warn" disabled={!newValid || busy} onClick={() => run('correct')}>
              {busy ? '처리 중…' : raw.trim() === '' ? '되돌리기' : '정정하기'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <div className="note">
            <strong>&ldquo;{entry.item}&rdquo;</strong> 기록을 완전히 삭제합니다.
            <br />
            되돌릴 수 없고, 참여자의 참여횟수도 이 항목만큼 줄어듭니다.
            {preview?.needsReverse ? <><br />분배된 금액은 먼저 자동으로 되돌립니다.</> : null}
            <br />
            <br />
            삭제 이력 자체는 [작업기록]에 영구히 남습니다.
          </div>
          <div className="sheet-actions">
            <button className="btn ghost" onClick={() => setMode('menu')}>
              뒤로
            </button>
            <button className="btn danger" disabled={busy} onClick={() => run('delete')}>
              {busy ? '삭제 중…' : '삭제합니다'}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
