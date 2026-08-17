'use client';

import { useMemo, useRef, useState } from 'react';
import Glyph from './Glyph';
import IconText from './IconText';
import ServerPicker from './ServerPicker';
import Sheet from './Sheet';
import { api, getStoredEmail, prepPhoto, splitName } from '@/lib/client';
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
  inUse,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  servers: string[];
  /** 실제로 인원이 있는 서버 — 안 쓰는 서버는 칩에서 접어 둔다 */
  inUse: string[];
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, srv } = useT();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<AnalyzedRow[] | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  /** 시트에 현재 있는 전체 명단 — 개명 대상 드롭다운의 원본 */
  const [roster, setRoster] = useState<string[]>([]);
  const [ocrText, setOcrText] = useState('');
  const [showOcr, setShowOcr] = useState(false);
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

  /**
   * 이미 다른 줄이 물려받기로 한 아이디.
   *
   * 한 아이디를 두 사람이 물려받을 수는 없다 — 먼저 처리된 쪽만 잔액을
   * 가져가고 뒤쪽은 조용히 실패한다. 그래서 아예 고를 수 없게 한다.
   * (서버도 같은 검사를 한다. 앱은 고칠 수 있으므로 최종 판정은 서버가 한다.)
   */
  const takenBy = useMemo(() => {
    const map = new Map<string, number>();
    decisions.forEach((d, i) => {
      if (d.op === 'rename' && d.from) map.set(d.from, i);
    });
    return map;
  }, [decisions]);

  async function analyze(payload: { text?: string; base64?: string }) {
    setBusy(true);
    const res = await api('/api/admin/members-bulk', { op: 'analyze', ...payload });
    setBusy(false);
    if (!res.ok) {
      toast(srv(res, 'r.failed'), true);
      return;
    }
    const list = (res.rows ?? []) as AnalyzedRow[];
    setOcrText(String(res.ocrPreview ?? ''));
    if (list.length === 0) {
      // 빈 표로 넘어가면 왜 안 됐는지 알 수 없다 — 입력 화면에 남아 이유를 보여준다
      setNote(srv(res));
      toast(srv(res), true);
      return;
    }
    setRows(list);
    setDecisions(list.map(defaultDecision));
    setRoster((res.roster ?? []) as string[]);
    setRoom(typeof res.room === 'number' ? res.room : null);
    setNote(srv(res));
  }

  async function pickPhoto(file: File) {
    // 원본을 그대로 보내면 요청이 비대해지고 OCR 도 오히려 더 못 읽는다
    setBusy(true);
    const jpeg = await prepPhoto(file);
    setBusy(false);
    if (!jpeg) {
      toast(t('items.formatFailed'), true);
      return;
    }
    await analyze({ base64: jpeg.split(',')[1] ?? '' });
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
            <IconText text={t('bulk.pasteLabel')} />
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
            <Glyph name="photo" size={16} /> {t('bulk.fromPhoto')}
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

          {/* 왜 안 읽혔는지를 그대로 보여준다. "글자를 못 읽었다"만으로는
              관리자가 사진 탓인 줄 알고 계속 다시 찍게 된다. */}
          {note ? (
            <div className="note" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>
              {note}
            </div>
          ) : null}
          {ocrText ? (
            <>
              <button
                className="btn ghost block"
                style={{ marginTop: 8, fontSize: 12, padding: '8px 11px' }}
                onClick={() => setShowOcr((v) => !v)}
              >
                {showOcr ? t('items.ocrHide') : t('items.ocrShow')}
              </button>
              {showOcr ? (
                <>
                  <div className="ocr-raw">{ocrText}</div>
                  <button
                    className="btn ghost block"
                    style={{ marginTop: 8, fontSize: 12, padding: '8px 11px' }}
                    onClick={() => setText(ocrText)}
                  >
                    {t('bulk.useOcr')}
                  </button>
                </>
              ) : null}
            </>
          ) : null}

          <div className="sheet-actions">
            <button className="btn ghost" onClick={onClose}>
            <IconText text={t('c.cancel')} />
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

          {/* 서버는 이름에서 떼어냈으니 여기서 고른다 (v10.9).
              드롭다운은 열고·굴리고·누르는 세 동작이라 칩으로 바꿨다 — 다른 화면과 같다. */}
          <label className="fl" style={{ marginTop: 12 }}>
            <IconText text={t('bulk.serverLabel')} />
          </label>
          <ServerPicker id="bulkSv" servers={servers} value={server} onChange={setServer} inUse={inUse} />
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
                  {/* 시트가 [혈맹/서버] 표시를 떼어냈으면 원문을 같이 보여준다 (v10.9).
                      조용히 바꾸면 무엇이 지워졌는지 관리자가 알 수 없다. */}
                  {r.raw.trim() !== r.name ? (
                    <div className="bulk-raw">{t('bulk.cleaned', { raw: r.raw.trim() })}</div>
                  ) : null}

                  <div className="bulk-ops">
                    {(['add', 'rename', 'skip'] as const).map((op) => {
                      // 이미 있는 이름을 또 추가하면 중복 행이 생긴다.
                      // 개명은 상태와 무관하게 고를 수 있어야 한다 — 실제로는
                      // 전혀 다른 이름으로 갈아타는 경우가 대부분이라, 후보가
                      // 0명이라고 막아버리면 잔액이 승계되지 않는다.
                      const blocked =
                        (op === 'add' && (r.status === 'exists' || r.status === 'dup' || r.status === 'invalid')) ||
                        (op === 'rename' && (r.status === 'exists' || r.status === 'dup' || roster.length === 0));
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
                    <>
                      <select
                        className={'bulk-from' + (d.from ? '' : ' need')}
                        value={d.from}
                        onChange={(e) => setFrom(i, e.target.value)}
                        aria-label={t('bulk.fromLabel')}
                      >
                        <option value="">{t('bulk.fromPick')}</option>
                        {/* 비슷해 보이는 사람을 위로 올려주되, 고를 수 있는 범위는 전체 명단이다 */}
                        {[...r.suggest, ...roster.filter((n) => !r.suggest.includes(n))].map((sName) => {
                          const owner = takenBy.get(sName);
                          const taken = owner !== undefined && owner !== i;
                          return (
                            <option key={sName} value={sName} disabled={taken}>
                              {sName}
                              {r.suggest.includes(sName) ? ` ${t('bulk.suggestMark')}` : ''}
                              {taken ? ` ${t('bulk.takenMark', { by: rows[owner]?.name ?? '' })}` : ''}
                            </option>
                          );
                        })}
                      </select>
                      {!d.from ? <p className="bulk-warn">{t('bulk.pickRequired')}</p> : null}
                    </>
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
