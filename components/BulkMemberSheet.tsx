'use client';

import { useMemo, useRef, useState } from 'react';
import Sheet from './Sheet';
import { api, getStoredEmail, splitName } from '@/lib/client';
import type { ApiResult } from '@/lib/client';
import { useT } from '@/lib/i18n';

/**
 * 혈맹원 일괄 추가 (v10.4).
 *
 * 40명을 한 명씩 넣는 것은 현실적이지 않고, 손으로 넣으면 오타가 난다.
 * 그런데 잘못 넣으면 되돌리기가 아주 번거로우므로, 이 화면의 목적은
 * "빨리 넣는 것"이 아니라 **넣기 전에 관리자가 눈으로 걸러내는 것**이다.
 *
 *   ① 붙여넣기 / 사진  →  ② 시트가 한 줄씩 판정  →  ③ 관리자가 확정  →  ④ 반영
 *
 * 판정(신규·이미있음·중복·개명후보·확인필요)은 전부 시트가 한다.
 * 앱에서만 검사하면 앱을 고쳐서 우회할 수 있다.
 *
 * ★ 개명으로 지정한 건은 추가가 아니라 이름 변경으로 처리된다 —
 *   그래야 잔액·참여횟수·지난 시즌 기록이 그대로 승계된다.
 */

type Status = 'new' | 'rename' | 'exists' | 'dup' | 'invalid';

type AnalyzedRow = {
  raw: string;
  name: string;
  status: Status;
  suggest: string[];
};

/** 화면에서 관리자가 고른 처리 방식 */
type Decision = {
  op: 'add' | 'rename' | 'skip';
  from: string;
};

const STATUS_KEY: Record<Status, string> = {
  new: 'bulk.stNew',
  rename: 'bulk.stRename',
  exists: 'bulk.stExists',
  dup: 'bulk.stDup',
  invalid: 'bulk.stInvalid',
};

/** 판정 결과의 기본 처리 방식 — 애매한 것은 전부 건너뛰기로 시작한다 */
function defaultDecision(r: AnalyzedRow): Decision {
  if (r.status === 'new') return { op: 'add', from: '' };
  // 개명 후보는 자동으로 정하지 않는다. 잘못 이으면 두 사람 잔액이 합쳐진다.
  if (r.status === 'rename') return { op: 'skip', from: r.suggest[0] ?? '' };
  return { op: 'skip', from: '' };
}

export default function BulkMemberSheet({
  servers,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  servers: string[];
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, srv } = useT();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<AnalyzedRow[] | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [server, setServer] = useState('');
  const [room, setRoom] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    let add = 0;
    let rename = 0;
    decisions.forEach((d) => {
      if (d.op === 'add') add += 1;
      else if (d.op === 'rename') rename += 1;
    });
    return { add, rename, total: add + rename };
  }, [decisions]);

  const overCapacity = room !== null && counts.add > room;

  async function analyze(payload: { text?: string; base64?: string }) {
    setBusy(true);
    const res = await api('/api/admin/members-bulk', { op: 'analyze', ...payload });
    setBusy(false);
    if (!res.ok) {
      toast(srv(res, 'r.failed'), true);
      return;
    }
    const list = (res.rows ?? []) as AnalyzedRow[];
    setRows(list);
    setDecisions(list.map(defaultDecision));
    setRoom(typeof res.room === 'number' ? res.room : null);
    setNote(srv(res));
    if (list.length === 0) toast(srv(res), true);
  }

  async function pickPhoto(file: File) {
    const base64 = await new Promise<string>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
      fr.readAsDataURL(file);
    });
    await analyze({ base64 });
  }

  function setOp(i: number, op: Decision['op']) {
    setDecisions((prev) => prev.map((d, k) => (k === i ? { ...d, op } : d)));
  }

  function setFrom(i: number, from: string) {
    setDecisions((prev) => prev.map((d, k) => (k === i ? { ...d, from } : d)));
  }

  async function apply(confirm: boolean) {
    if (!rows) return;
    const entries = rows.map((r, i) => ({
      name: r.name,
      op: decisions[i]?.op ?? 'skip',
      from: decisions[i]?.from ?? '',
    }));

    setBusy(true);
    const res = await api('/api/admin/members-bulk', {
      op: 'apply',
      entries,
      server,
      email: getStoredEmail(),
      // ★ 사용자가 실제로 누른 값만 넘긴다 — 임의로 true 로 만들면 재확인이 무의미해진다
      confirm,
    });
    setBusy(false);

    if (res.needsConfirm) {
      // 시트가 구체적인 숫자를 담아 돌려준 문장을 그대로 보여준다
      if (window.confirm(srv(res))) void apply(true);
      return;
    }
    toast(srv(res, res.ok ? 'r.added' : 'r.addFailed'), !res.ok);
    if (res.ok) onDone(res);
  }

  return (
    <Sheet title={`📋 ${t('bulk.title')}`} subtitle={t('bulk.sub')} onClose={onClose}>
      {!rows ? (
        <>
          <label className="fl" htmlFor="bulkText">
            {t('bulk.pasteLabel')}
          </label>
          <textarea
            id="bulkText"
            rows={7}
            placeholder={t('bulk.pastePh')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ resize: 'vertical' }}
          />
          <p className="hint">{t('bulk.pasteHint')}</p>

          <button
            className="btn ghost block"
            style={{ marginTop: 10 }}
            onClick={() => fileRef.current?.click()}
          >
            📷 {t('bulk.fromPhoto')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pickPhoto(f);
              e.target.value = '';
            }}
          />
          <p className="hint">{t('bulk.photoHint')}</p>

          <div className="sheet-actions">
            <button className="btn ghost" onClick={onClose}>
              {t('c.cancel')}
            </button>
            <button className="btn" disabled={!text.trim()} onClick={() => void analyze({ text })}>
              {t('bulk.analyze')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="note" style={{ whiteSpace: 'pre-wrap' }}>
            {note}
          </div>

          <label className="fl" htmlFor="bulkSv" style={{ marginTop: 12 }}>
            {t('bulk.serverLabel')}
          </label>
          <select id="bulkSv" value={server} onChange={(e) => setServer(e.target.value)}>
            <option value="">{t('ali.none')}</option>
            {servers.map((s) => (
              <option key={s} value={s}>
                {t('ali.serverN', { s })}
              </option>
            ))}
          </select>
          <p className="hint">{t('bulk.serverHint')}</p>

          <div className="bulk-list">
            {rows.map((r, i) => {
              const d = decisions[i] ?? { op: 'skip' as const, from: '' };
              const { main, sub } = splitName(r.name);
              return (
                <div className={'bulk-row s-' + r.status} key={`${r.raw}-${i}`}>
                  <div className="bulk-name">
                    <b>{main}</b>
                    {sub ? <i>({sub})</i> : null}
                    <span className={'bulk-tag t-' + r.status}>{t(STATUS_KEY[r.status])}</span>
                  </div>

                  <div className="bulk-ops">
                    {(['add', 'rename', 'skip'] as const).map((op) => {
                      // 이미 있는 이름을 또 추가하면 중복 행이 생긴다
                      const blocked =
                        (op === 'add' && (r.status === 'exists' || r.status === 'dup' || r.status === 'invalid')) ||
                        (op === 'rename' && r.suggest.length === 0);
                      return (
                        <button
                          key={op}
                          className={'bulk-op' + (d.op === op ? ' on' : '')}
                          disabled={blocked}
                          onClick={() => setOp(i, op)}
                        >
                          {t('bulk.op' + op[0].toUpperCase() + op.slice(1))}
                        </button>
                      );
                    })}
                  </div>

                  {d.op === 'rename' ? (
                    <select
                      className="bulk-from"
                      value={d.from}
                      onChange={(e) => setFrom(i, e.target.value)}
                      aria-label={t('bulk.fromLabel')}
                    >
                      <option value="">{t('bulk.fromPick')}</option>
                      {r.suggest.map((sName) => (
                        <option key={sName} value={sName}>
                          {sName}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              );
            })}
          </div>

          {overCapacity ? (
            <div className="note" style={{ marginTop: 10, color: 'var(--danger)' }}>
              ⚠️ {t('bulk.overCap', { n: counts.add, room: room ?? 0 })}
            </div>
          ) : null}

          <p className="hint" style={{ marginTop: 10 }}>
            {t('bulk.renameNote')}
          </p>

          <div className="sheet-actions">
            <button
              className="btn ghost"
              onClick={() => {
                setRows(null);
                setDecisions([]);
              }}
            >
              {t('c.back')}
            </button>
            <button
              className="btn"
              disabled={counts.total === 0 || overCapacity || decisions.some((d) => d.op === 'rename' && !d.from)}
              onClick={() => void apply(false)}
            >
              {t('bulk.apply', { add: counts.add, ren: counts.rename })}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
