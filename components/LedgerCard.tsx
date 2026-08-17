'use client';

import { useCallback, useEffect, useState } from 'react';
import Glyph from './Glyph';
import IconText from './IconText';
import Sheet from './Sheet';
import type { GuildState, LedgerEntry, ReversePreview } from '@/lib/types';
import { api, byName, calcSplit, fmt, getStoredEmail, serverOf, weightsOf } from '@/lib/client';
import type { ApiResult } from '@/lib/client';
import { useT } from '@/lib/i18n';

/**
 * 등록된 모든 아이템 (관리자 전용) — 판매금액 정정과 완전 삭제.
 *
 * 둘 다 잔액을 되돌리는 작업이라, 실행 전에 서버에서 "무엇을 얼마나 되돌리는지"
 * 를 받아 그대로 보여준다. 이미 지급✓ 된 사람이 있으면 서버가 아예 막는다.
 *
 * ★ 이 카드 전체가 마스터관리자 전용이다 (ItemsTab 이 master 일 때만 그린다).
 *   이미 끝난 분배를 되돌리는 자리라, 관리자에게는 존재 자체를 보이지 않는다.
 */
export default function LedgerCard({
  state,
  unit,
  fundRate,
  fundName,
  onChanged,
  toast,
}: {
  /** 참여자를 고르려면 명단이 필요하다 (v11.1) */
  state: GuildState;
  unit: string;
  fundRate: number;
  fundName: string;
  onChanged: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t } = useT();
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
      <div className="sect"><IconText text={t('led.sect')} /></div>
      <div className="card">
        {!items ? (
          <div className="field">
            {[80, 60].map((w, i) => (
              <div key={i} className="skeleton" style={{ width: `${w}%`, marginBottom: 10 }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="empty">{t('led.empty')}</div>
        ) : (
          items.map((it) => (
            <div className="row" key={it.row}>
              <div className="row-main">
                <div className="row-name">{it.item}</div>
                <div className="row-sub">
                  {it.date} · {t('c.persons', { n: it.cnt })} · {it.status}
                  {it.amount > 0 ? ` · ${fmt(it.amount)} ${unit}` : ''}
                </div>
              </div>
              <button className="btn ghost" onClick={() => setTarget(it)}>
                {t('c.manage')}
              </button>
            </div>
          ))
        )}
      </div>

      {target ? (
        <ItemSheet
          entry={target}
          state={state}
          unit={unit}
          fundRate={fundRate}
          fundName={fundName}
          onClose={() => setTarget(null)}
          onDone={(res) => {
            setTarget(null);
            void load();
            onChanged(res);
          }}
          toast={toast}
        />
      ) : null}
    </>
  );
}

type Mode = 'menu' | 'correct' | 'delete' | 'edit';

function ItemSheet({
  entry,
  state,
  unit,
  fundRate,
  fundName,
  onClose,
  onDone,
  toast,
}: {
  entry: LedgerEntry;
  state: GuildState;
  unit: string;
  fundRate: number;
  fundName: string;
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t, srv } = useT();
  const [preview, setPreview] = useState<ReversePreview | null>(null);
  const [mode, setMode] = useState<Mode>('menu');
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  // ── 참여자·금액 함께 고치기 (v11.1, 마스터) ──
  const [picked, setPicked] = useState<Set<string>>(new Set(entry.names ?? []));
  const [editAmt, setEditAmt] = useState(String(entry.amount || ''));

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
    toast(srv(res, res.ok ? 'r.done' : 'r.failed'), !res.ok);
    if (res.ok) onDone(res);
  }

  const blocked = preview?.blocked === true;

  // 이미 참여로 잡혀 있는 사람은 명단에서 빠졌더라도 계속 보여야 한다 —
  // 안 보이면 체크를 풀 수도, 그대로 둘 수도 없어 저장 자체가 막힌다
  const selectable = (() => {
    const all = new Set(state.members.filter((m) => m !== state.fundName));
    (entry.names ?? []).forEach((n) => all.add(n));
    return [...all].sort((a, b) => byName(a, b));
  })();

  const editAmount = Number(editAmt.replace(/[,\s]/g, ''));
  const editValid =
    picked.size > 0 && Number.isInteger(editAmount) && editAmount > 0;
  // 확인 화면 숫자는 시트와 같은 산식으로 만든다 (규칙 1)
  const editSplit = editValid
    ? calcSplit(editAmount, weightsOf(state, [...picked]), fundRate)
    : null;

  /**
   * 참여자·금액을 함께 고친다 (v11.1).
   *
   * 시트는 **분배 시점 스냅샷(O열)으로 먼저 회수**한 뒤 새 명단·새 금액으로 다시
   * 나눈다 (규칙 2-1). 돈이 움직이므로 `confirm` 없이 한 번 불러 바뀔 숫자를 받고,
   * 사용자가 그 숫자를 본 뒤에 다시 부른다 — 앱이 임의로 채우지 않는다 (규칙 5-1).
   */
  async function saveEdit(confirm: boolean) {
    if (!editValid) return;
    setBusy(true);
    const res = await api('/api/master/item', {
      row: entry.row,
      itemName: entry.item,
      participants: [...picked],
      amount: editAmount,
      email: getStoredEmail(),
      confirm,
    });
    setBusy(false);
    if (!res.ok && res.needsConfirm) {
      toast(srv(res), false);
      return;
    }
    toast(srv(res, res.ok ? 'r.done' : 'r.failed'), !res.ok);
    if (res.ok) onDone(res);
  }

  return (
    <Sheet
      title={`📦 ${entry.item}`}
      subtitle={`${entry.date} · ${t('c.persons', { n: entry.cnt })} · ${entry.status}`}
      onClose={onClose}
    >
      {!preview ? (
        <div className="skeleton" style={{ width: '70%' }} />
      ) : (
        <>
          {preview.needsReverse ? (
            <div className="calc">
              <div className="calc-line">
                <span>{t('led.currentAmount')}</span>
                <strong>
                  {fmt(preview.amount)} {unit}
                </strong>
              </div>
              {(preview.lines ?? []).map((l, i) => (
                <div className="calc-line" key={l.name + i}>
                  <span><Glyph name="undo" size={13} /> {l.name}</span>
                  <strong>{fmt(l.amount)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="hint">{t('led.notDistributed')}</p>
          )}

          {blocked ? (
            <div className="note" style={{ whiteSpace: 'pre-wrap' }}>
              {t('led.blocked', { v: (preview.insufficient ?? []).join('\n') })}
            </div>
          ) : null}
        </>
      )}

      {mode === 'menu' ? (
        <div style={{ marginTop: 16 }}>
          {preview?.needsReverse ? (
            <>
              {/* 참여 인원과 분배금액을 한 화면에서 고친다 (v11.1) */}
              <button className="btn block" disabled={blocked} onClick={() => setMode('edit')}>
                {t('led.editMembers')}
              </button>
              <button
                className="btn block"
                style={{ marginTop: 8 }}
                disabled={blocked}
                onClick={() => setMode('correct')}
              >
                {t('led.correct')}
              </button>
            </>
          ) : null}
          <button
            className="btn danger block"
            style={{ marginTop: 8 }}
            disabled={blocked}
            onClick={() => setMode('delete')}
          >
            {t('led.delete')}
          </button>
          <button className="btn ghost block" style={{ marginTop: 8 }} onClick={onClose}>
            <IconText text={t('c.close')} />
          </button>
        </div>
      ) : mode === 'edit' ? (
        <div style={{ marginTop: 16 }}>
          <label className="fl"><IconText text={t('items.membersLabel', { n: picked.size })} /></label>
          <div className="mgrid">
            {selectable.map((m) => {
              const sv = serverOf(state, m);
              const on = picked.has(m);
              return (
                <button
                  key={m}
                  type="button"
                  className={'mchip' + (on ? ' sel' : '')}
                  aria-pressed={on}
                  onClick={() =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(m)) next.delete(m);
                      else next.add(m);
                      return next;
                    })
                  }
                >
                  <span className="nm">
                    <b>
                      {sv ? <span className="svr">{sv}</span> : null}
                      {m}
                    </b>
                  </span>
                </button>
              );
            })}
          </div>

          <label className="fl" htmlFor="edAmt" style={{ marginTop: 12 }}>
            <IconText text={t('led.newAmount', { unit })} />
          </label>
          <input
            id="edAmt"
            type="text"
            inputMode="numeric"
            value={editAmt}
            onChange={(e) => setEditAmt(e.target.value)}
          />

          {editSplit ? (
            <div className="calc">
              <div className="calc-line">
                <span>{t('led.currentAmount')}</span>
                <strong>
                  {fmt(entry.amount)} → {fmt(editAmount)} {unit}
                </strong>
              </div>
              <div className="calc-line">
                <span>{t('led.newFund', { fund: fundName })}</span>
                <strong>{fmt(editSplit.fundTotal)}</strong>
              </div>
              <div className="calc-line">
                <span>{t('led.newBase', { n: picked.size })}</span>
                <strong>{fmt(editSplit.perPerson)}</strong>
              </div>
            </div>
          ) : (
            <p className="hint">{t('dist.needInt')}</p>
          )}
          <p className="hint">{t('led.editNote', { fund: fundName })}</p>

          <div className="sheet-actions">
            <button className="btn ghost" onClick={() => setMode('menu')}>
              {t('c.back')}
            </button>
            <button className="btn warn" disabled={!editValid || busy} onClick={() => void saveEdit(true)}>
              {busy ? t('c.processing') : t('c.save')}
            </button>
          </div>
        </div>
      ) : mode === 'correct' ? (
        <div style={{ marginTop: 16 }}>
          <label className="fl" htmlFor="newAmt">
            <IconText text={t('led.newAmount', { unit })} />
          </label>
          <input
            id="newAmt"
            type="text"
            inputMode="numeric"
            placeholder={t('led.currentPh', { v: fmt(entry.amount) })}
            value={raw}
            autoFocus
            onChange={(e) => setRaw(e.target.value)}
          />
          {newSplit ? (
            <div className="calc">
              <div className="calc-line">
                <span>{t('led.newFund', { fund: fundName })}</span>
                <strong>{fmt(newSplit.fund)}</strong>
              </div>
              <div className="calc-line">
                <span>{t('led.newBase', { n: entry.cnt })}</span>
                <strong>{fmt(newSplit.perPerson)}</strong>
              </div>
              {newSplit.remainder > 0 ? (
                <div className="calc-line">
                  <span>{t('led.newRemainder', { fund: fundName })}</span>
                  <strong>{fmt(newSplit.remainder)}</strong>
                </div>
              ) : null}
              <p className="hint" style={{ marginTop: 6 }}>
                {t('led.weightNote', { fund: fundName })}
              </p>
            </div>
          ) : (
            <p className="hint">{raw.trim() === '' ? t('led.revertOnly') : t('dist.needInt')}</p>
          )}
          <div className="sheet-actions">
            <button className="btn ghost" onClick={() => setMode('menu')}>
              {t('c.back')}
            </button>
            <button className="btn warn" disabled={!newValid || busy} onClick={() => run('correct')}>
              {busy ? t('c.processing') : raw.trim() === '' ? t('led.revert') : t('led.correctDo')}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <div className="note" style={{ whiteSpace: 'pre-wrap' }}>
            {t('led.deleteNote', { item: entry.item })}
            {preview?.needsReverse ? `\n${t('led.deleteAlsoRevert')}` : ''}
          </div>
          <div className="sheet-actions">
            <button className="btn ghost" onClick={() => setMode('menu')}>
              {t('c.back')}
            </button>
            <button className="btn danger" disabled={busy} onClick={() => run('delete')}>
              {busy ? t('c.deleting') : t('led.deleteDo')}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
