'use client';

import { useCallback, useEffect, useState } from 'react';
import Sheet from './Sheet';
import type { PayoutRecord, Tool } from '@/lib/types';
import { api, fmt, getStoredEmail } from '@/lib/client';
import type { ApiResult } from '@/lib/client';
import { useT } from '@/lib/i18n';

/**
 * 관리 도구 (관리자 전용) — 시즌 종료, 데이터 이관, 초기화 등.
 *
 * 목록은 서버(Apps Script)가 내려준다. 도구가 늘어도 이 화면은 고치지 않아도 된다.
 * 이름·설명·결과 메시지는 시트가 화면 언어에 맞춰 보내준다 (쿠키로 언어를 전달).
 * 되돌릴 수 없는 도구(danger 3)는 정해진 문구를 정확히 입력해야만 실행된다.
 */
export default function ToolsCard({
  unit,
  master,
  onChanged,
  toast,
}: {
  unit: string;
  /** 마스터관리자인가 — 되돌릴 수 없는 도구·지급취소는 이 권한이 있어야 한다 */
  master: boolean;
  onChanged: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t, srv } = useT();
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [lastPayout, setLastPayout] = useState<PayoutRecord | null>(null);
  const [active, setActive] = useState<Tool | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [tl, p] = await Promise.all([api('/api/admin/tools'), api('/api/admin/payout-undo')]);
    if (tl.ok) setTools(tl.data as Tool[]);
    setLastPayout(p.ok ? (p.data as PayoutRecord) : null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function undoPayout() {
    setBusy(true);
    const res = await api('/api/admin/payout-undo', { email: getStoredEmail(), confirm: true });
    setBusy(false);
    setUndoing(false);
    toast(srv(res, res.ok ? 'r.undone' : 'r.undoFailed'), !res.ok);
    if (res.ok) {
      void load();
      onChanged(res);
    }
  }

  return (
    <>
      {/* 지급 취소는 자주 쓰는 기능이라 도구 목록보다 위에 둔다 */}
      <div className="sect">{t('tool.undoSect')}</div>
      <div className="card">
        <div className="field">
          {lastPayout ? (
            <>
              <div className="calc" style={{ marginTop: 0 }}>
                <div className="calc-line">
                  <span>{lastPayout.date}</span>
                  <strong>{lastPayout.name}</strong>
                </div>
                <div className="calc-line">
                  <span>{t('tool.payAmount')}</span>
                  <strong>
                    {fmt(lastPayout.amount)} {unit}
                  </strong>
                </div>
              </div>
              <button className="btn ghost block" disabled={busy || !master} onClick={() => setUndoing(true)}>
                {master ? t('tool.undoBtn') : `🔒 ${t('tool.undoBtn')}`}
              </button>
              <p className="hint">{master ? t('tool.undoHint') : t('tool.masterOnly')}</p>
            </>
          ) : (
            <p className="hint">{t('tool.undoNone')}</p>
          )}
        </div>
      </div>

      <div className="sect">{t('tool.sect')}</div>
      <div className="card">
        {!tools ? (
          <div className="field">
            {[70, 90, 60].map((w, i) => (
              <div key={i} className="skeleton" style={{ width: `${w}%`, marginBottom: 10 }} />
            ))}
          </div>
        ) : (
          tools.map((tl) => {
            // 되돌릴 수 없는 도구는 마스터관리자만. 서버가 최종 판정을 하지만,
            // 화면에서도 왜 못 누르는지 보여줘야 한다 (막힌 뒤에 알면 늦다).
            const locked = (tl.master === true || tl.danger >= 3) && !master;
            return (
              <div className="row" key={tl.id}>
                <div className="row-main">
                  <div className="row-name">
                    {tl.name}
                    {tl.danger >= 3 ? (
                      <span
                        className="badge"
                        style={{ marginLeft: 6, background: 'var(--pending-soft)', color: 'var(--pending)' }}
                      >
                        {t('tool.irreversible')}
                      </span>
                    ) : null}
                    {tl.master === true || tl.danger >= 3 ? (
                      <span className="badge" style={{ marginLeft: 6 }}>
                        👑 {t('c.master')}
                      </span>
                    ) : null}
                  </div>
                  <div className="row-sub" style={{ whiteSpace: 'normal', lineHeight: 1.45 }}>
                    {locked ? t('tool.masterOnly') : tl.desc}
                  </div>
                </div>
                <button
                  className={tl.danger >= 3 ? 'btn danger' : 'btn ghost'}
                  disabled={locked}
                  onClick={() => setActive(tl)}
                >
                  {locked ? '🔒' : t('c.run')}
                </button>
              </div>
            );
          })
        )}
      </div>

      {undoing && lastPayout ? (
        <Sheet
          title={t('tool.undoTitle')}
          subtitle={`${lastPayout.date} · ${lastPayout.name}`}
          onClose={() => setUndoing(false)}
        >
          <div className="note" style={{ whiteSpace: 'pre-wrap' }}>
            {t('tool.undoNote', { v: `${fmt(lastPayout.amount)} ${unit}` })}
          </div>
          <div className="sheet-actions">
            <button className="btn ghost" onClick={() => setUndoing(false)}>
              {t('c.cancel')}
            </button>
            <button className="btn warn" disabled={busy} onClick={undoPayout}>
              {t('led.revert')}
            </button>
          </div>
        </Sheet>
      ) : null}

      {active ? (
        <ToolSheet
          tool={active}
          onClose={() => setActive(null)}
          onDone={(res) => {
            setActive(null);
            void load();
            onChanged(res);
          }}
          toast={toast}
        />
      ) : null}
    </>
  );
}

function ToolSheet({
  tool,
  onClose,
  onDone,
  toast,
}: {
  tool: Tool;
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t, srv } = useT();
  const [values, setValues] = useState<Record<string, string>>({});
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const needsPhrase = tool.danger >= 3;
  const phraseOk = !needsPhrase || confirmText.trim() === tool.confirm;

  async function run() {
    setBusy(true);
    const res = await api('/api/admin/tools', {
      id: tool.id,
      params: values,
      email: getStoredEmail(),
      confirmText: confirmText.trim(),
    });
    setBusy(false);
    toast(srv(res, res.ok ? 'r.completed' : 'r.runFailed'), !res.ok);
    if (res.ok) onDone(res);
  }

  return (
    <Sheet
      title={tool.name}
      subtitle={tool.desc}
      onClose={onClose}
    >
      {tool.inputs.map((f) => (
        <div key={f.key} style={{ marginBottom: 12 }}>
          <label className="fl" htmlFor={`tool-${f.key}`}>
            {f.label}
          </label>
          <input
            id={`tool-${f.key}`}
            type="text"
            placeholder={f.placeholder ?? ''}
            value={values[f.key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          />
        </div>
      ))}

      {needsPhrase ? (
        <>
          <div className="note" style={{ whiteSpace: 'pre-wrap' }}>
            {t('tool.phraseNote', { v: tool.confirm })}
          </div>
          <input
            type="text"
            inputMode="text"
            placeholder={tool.confirm}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            style={{ marginTop: 10 }}
            aria-label={t('tool.phraseAria')}
          />
        </>
      ) : null}

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('c.cancel')}
        </button>
        <button className={needsPhrase ? 'btn warn' : 'btn'} disabled={!phraseOk || busy} onClick={run}>
          {busy ? t('c.running') : t('c.run')}
        </button>
      </div>
    </Sheet>
  );
}
