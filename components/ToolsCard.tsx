'use client';

import { useCallback, useEffect, useState } from 'react';
import Sheet from './Sheet';
import type { PayoutRecord, Tool } from '@/lib/types';
import { api, fmt, getStoredEmail } from '@/lib/client';

/**
 * 관리 도구 (관리자 전용) — 시즌 종료, 데이터 이관, 초기화 등.
 *
 * 목록은 서버(Apps Script)가 내려준다. 도구가 늘어도 이 화면은 고치지 않아도 된다.
 * 되돌릴 수 없는 도구(danger 3)는 정해진 문구를 정확히 입력해야만 실행된다 —
 * 폰에서 잘못 눌러 시즌이 종료되는 일을 막기 위한 장치다.
 */
export default function ToolsCard({
  unit,
  onChanged,
  toast,
}: {
  unit: string;
  onChanged: () => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [lastPayout, setLastPayout] = useState<PayoutRecord | null>(null);
  const [active, setActive] = useState<Tool | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [t, p] = await Promise.all([api('/api/admin/tools'), api('/api/admin/payout-undo')]);
    if (t.ok) setTools(t.data as Tool[]);
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
    toast(res.msg ?? (res.ok ? '취소했습니다.' : '취소하지 못했습니다.'), !res.ok);
    if (res.ok) {
      void load();
      onChanged();
    }
  }

  return (
    <>
      {/* 지급 취소는 자주 쓰는 기능이라 도구 목록보다 위에 둔다 */}
      <div className="sect">↩️ 최근 지급 취소</div>
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
                  <span>지급액</span>
                  <strong>
                    {fmt(lastPayout.amount)} {unit}
                  </strong>
                </div>
              </div>
              <button className="btn ghost block" disabled={busy} onClick={() => setUndoing(true)}>
                이 지급 되돌리기
              </button>
              <p className="hint">분배완료 → 분배전으로 되돌립니다. 취소 이력은 [작업기록]에 남습니다.</p>
            </>
          ) : (
            <p className="hint">되돌릴 지급 기록이 없습니다.</p>
          )}
        </div>
      </div>

      <div className="sect">🧰 관리 도구</div>
      <div className="card">
        {!tools ? (
          <div className="field">
            {[70, 90, 60].map((w, i) => (
              <div key={i} className="skeleton" style={{ width: `${w}%`, marginBottom: 10 }} />
            ))}
          </div>
        ) : (
          tools.map((t) => (
            <div className="row" key={t.id}>
              <div className="row-main">
                <div className="row-name">
                  {t.name}
                  {t.danger >= 3 ? (
                    <span className="badge" style={{ marginLeft: 6, background: 'var(--pending-soft)', color: 'var(--pending)' }}>
                      되돌릴 수 없음
                    </span>
                  ) : null}
                </div>
                <div className="row-sub" style={{ whiteSpace: 'normal', lineHeight: 1.45 }}>
                  {t.desc}
                </div>
              </div>
              <button className={t.danger >= 3 ? 'btn danger' : 'btn ghost'} onClick={() => setActive(t)}>
                실행
              </button>
            </div>
          ))
        )}
      </div>

      {undoing && lastPayout ? (
        <Sheet title="↩️ 지급 취소" subtitle={`${lastPayout.date} · ${lastPayout.name}`} onClose={() => setUndoing(false)}>
          <div className="note">
            {fmt(lastPayout.amount)} {unit} 를 분배완료에서 분배전으로 되돌립니다.
            <br />
            실제로 다이아를 이미 건네주셨다면 되돌리지 마세요.
          </div>
          <div className="sheet-actions">
            <button className="btn ghost" onClick={() => setUndoing(false)}>
              취소
            </button>
            <button className="btn warn" disabled={busy} onClick={undoPayout}>
              되돌리기
            </button>
          </div>
        </Sheet>
      ) : null}

      {active ? (
        <ToolSheet
          tool={active}
          onClose={() => setActive(null)}
          onDone={() => {
            setActive(null);
            void load();
            onChanged();
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
  onDone: () => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
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
    toast(res.msg ?? (res.ok ? '완료했습니다.' : '실행하지 못했습니다.'), !res.ok);
    if (res.ok) onDone();
  }

  return (
    <Sheet title={tool.name} subtitle={tool.desc} onClose={onClose}>
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
          <div className="note">
            이 작업은 <strong>되돌릴 수 없습니다.</strong>
            <br />
            정말 실행하려면 아래에 <strong>{tool.confirm}</strong> 을(를) 정확히 입력하세요.
          </div>
          <input
            type="text"
            inputMode="text"
            placeholder={tool.confirm}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            style={{ marginTop: 10 }}
            aria-label="확인 문구"
          />
        </>
      ) : null}

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          취소
        </button>
        <button
          className={needsPhrase ? 'btn warn' : 'btn'}
          disabled={!phraseOk || busy}
          onClick={run}
        >
          {busy ? '실행 중…' : '실행'}
        </button>
      </div>
    </Sheet>
  );
}
