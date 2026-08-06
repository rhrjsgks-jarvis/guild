'use client';

import { useCallback, useEffect, useState } from 'react';
import Sheet from './Sheet';
import type { RenameRecord, RosterEntry } from '@/lib/types';
import { api, fmt, getStoredEmail } from '@/lib/client';
import { useT } from '@/lib/i18n';

/**
 * 혈맹원 관리 (관리자 전용) — 추가 · 아이디 변경 · 탈퇴 · 비중/서버/한자 설정.
 *
 * 되돌리기 어려운 두 가지는 서버가 한 번 더 확인을 요구한다.
 *  - 이미 있는 이름으로 변경 → 두 계정이 합쳐짐
 *  - 잔액이 남은 사람을 탈퇴 → 받지 못한 다이아가 (미등록)으로 남음
 */
export default function RosterCard({
  unit,
  servers,
  onChanged,
  toast,
}: {
  unit: string;
  servers: string[];
  onChanged: () => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t, srv } = useT();
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<RosterEntry | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const res = await api('/api/admin/roster');
    if (!res.ok) {
      setError(srv(res));
      return;
    }
    setError('');
    setRoster(res.data as RosterEntry[]);
  }, [srv]);

  useEffect(() => {
    void load();
  }, [load]);

  const done = () => {
    setTarget(null);
    setAdding(false);
    void load();
    onChanged();
  };

  return (
    <>
      <div className="sect">
        {t('ros.sect')} {roster ? `(${t('c.persons', { n: roster.length })})` : ''}
      </div>
      <div className="card">
        {error ? (
          <div className="field">
            <p className="hint" style={{ color: 'var(--danger)' }}>
              {error || t('ros.loadFailed')}
            </p>
            <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => void load()}>
              {t('c.retry')}
            </button>
          </div>
        ) : !roster ? (
          <div className="field">
            {[80, 60, 70].map((w, i) => (
              <div key={i} className="skeleton" style={{ width: `${w}%`, marginBottom: 10 }} />
            ))}
          </div>
        ) : (
          <>
            <div className="field" style={{ paddingBottom: 10 }}>
              <button className="btn block" onClick={() => setAdding(true)}>
                {t('ros.add')}
              </button>
              <p className="hint">{t('ros.addHint')}</p>
            </div>
            {roster.map((m) => (
              <div className="row" key={m.name}>
                <div className="row-main">
                  <div className="row-name">
                    {m.name}
                    {m.isFund ? (
                      <span className="badge" style={{ marginLeft: 6 }}>
                        {t('ros.fundBadge')}
                      </span>
                    ) : null}
                  </div>
                  <div className="row-sub">
                    {m.hanja ? `${m.hanja} · ` : ''}
                    {m.server ? `${t('ali.serverN', { s: m.server })} · ` : ''}
                    {m.weight !== undefined && m.weight !== 100 ? `${t('c.ratio')} ${m.weight}% · ` : ''}
                    {t('c.pending')} {fmt(m.pending)} {unit}
                  </div>
                </div>
                <button className="btn ghost" disabled={m.isFund} onClick={() => setTarget(m)}>
                  {t('c.manage')}
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      <RenameHistoryCard />

      {adding ? <AddSheet onClose={() => setAdding(false)} onDone={done} toast={toast} /> : null}
      {target ? (
        <MemberSheet
          member={target}
          unit={unit}
          servers={servers}
          onClose={() => setTarget(null)}
          onDone={done}
          toast={toast}
        />
      ) : null}
    </>
  );
}

/* ─────────────── 아이디 변경 이력 (변경 전 → 변경 후) ─────────────── */

function RenameHistoryCard() {
  const { t } = useT();
  const [rows, setRows] = useState<RenameRecord[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || rows) return;
    void (async () => {
      const res = await api('/api/admin/rename-history');
      setRows(res.ok ? (res.data as RenameRecord[]) : []);
    })();
  }, [open, rows]);

  return (
    <>
      <div className="sect">{t('ros.histSect')}</div>
      <div className="card">
        {!open ? (
          <div className="field">
            <button className="btn ghost block" onClick={() => setOpen(true)}>
              {t('ros.histOpen')}
            </button>
            <p className="hint">{t('ros.histHint')}</p>
          </div>
        ) : !rows ? (
          <div className="field">
            <div className="skeleton" style={{ width: '70%' }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="empty">{t('ros.histEmpty')}</div>
        ) : (
          rows.map((r, i) => (
            <div className="row" key={i}>
              <div className="row-main">
                <div className="row-name">
                  {r.before} <span style={{ color: 'var(--text-dim)' }}>→</span> {r.after}
                  {r.merged ? (
                    <span className="badge" style={{ marginLeft: 6 }}>
                      {t('ros.merged')}
                    </span>
                  ) : null}
                </div>
                <div className="row-sub">
                  {r.at}
                  {r.by ? ` · ${r.by}` : ''}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/* ───────────────────────── 추가 ───────────────────────── */

function AddSheet({
  onClose,
  onDone,
  toast,
}: {
  onClose: () => void;
  onDone: () => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t, srv } = useT();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const res = await api('/api/admin/member', { name: name.trim(), email: getStoredEmail() });
    setBusy(false);
    toast(srv(res, res.ok ? 'r.added' : 'r.addFailed'), !res.ok);
    if (res.ok) onDone();
  }

  return (
    <Sheet title={t('ros.add')} subtitle={t('ros.addSub')} onClose={onClose}>
      <label className="fl" htmlFor="addName">
        {t('ros.id')}
      </label>
      <input
        id="addName"
        type="text"
        placeholder={t('ros.idPh')}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) void submit();
        }}
      />
      <p className="hint">{t('ros.idHint')}</p>

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('c.cancel')}
        </button>
        <button className="btn" disabled={!name.trim() || busy} onClick={submit}>
          {busy ? t('ros.adding') : t('ros.addDo')}
        </button>
      </div>
    </Sheet>
  );
}

/* ──────────────────── 아이디 변경 · 탈퇴 ──────────────────── */

type Mode = 'edit' | 'confirmMerge' | 'confirmRemove';

function MemberSheet({
  member,
  unit,
  servers,
  onClose,
  onDone,
  toast,
}: {
  member: RosterEntry;
  unit: string;
  servers: string[];
  onClose: () => void;
  onDone: () => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t, srv } = useT();
  const [newName, setNewName] = useState(member.name);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('edit');
  const [warning, setWarning] = useState('');

  const [weight, setWeight] = useState(member.weight ?? 100);
  const [server, setServer] = useState(member.server ?? '');
  const [hanja, setHanja] = useState(member.hanja ?? '');

  const trimmed = newName.trim();
  const changed = trimmed.length > 0 && trimmed !== member.name;
  const settingsChanged =
    weight !== (member.weight ?? 100) || server !== (member.server ?? '') || hanja !== (member.hanja ?? '');

  async function saveSettings() {
    setBusy(true);
    const res = await api('/api/admin/member-settings', {
      name: member.name,
      weight,
      server,
      hanja,
      email: getStoredEmail(),
    });
    setBusy(false);
    toast(srv(res, res.ok ? 'r.saved' : 'r.failed'), !res.ok);
    if (res.ok) onDone();
  }

  async function rename(confirmMerge: boolean) {
    setBusy(true);
    const res = await api('/api/admin/rename', {
      oldName: member.name,
      newName: trimmed,
      email: getStoredEmail(),
      confirmMerge,
    });
    setBusy(false);

    if (res.needsConfirm) {
      setWarning(srv(res));
      setMode('confirmMerge');
      return;
    }
    toast(srv(res, res.ok ? 'r.changed' : 'r.changeFailed'), !res.ok);
    if (res.ok) onDone();
  }

  async function remove(confirmRemove: boolean) {
    setBusy(true);
    const res = await api(
      '/api/admin/member',
      { name: member.name, email: getStoredEmail(), confirmRemove },
      'DELETE',
    );
    setBusy(false);

    if (res.needsConfirm) {
      setWarning(srv(res));
      setMode('confirmRemove');
      return;
    }
    toast(srv(res, res.ok ? 'r.removed' : 'r.removeFailed'), !res.ok);
    if (res.ok) onDone();
  }

  if (mode !== 'edit') {
    const merging = mode === 'confirmMerge';
    return (
      <Sheet
        title={merging ? t('ros.mergeTitle') : t('ros.confirmTitle')}
        onClose={() => {
          setMode('edit');
          setWarning('');
        }}
      >
        <div className="note" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {warning}
        </div>
        <div className="sheet-actions">
          <button
            className="btn ghost"
            onClick={() => {
              setMode('edit');
              setWarning('');
            }}
          >
            {t('c.back')}
          </button>
          <button className="btn warn" disabled={busy} onClick={() => (merging ? rename(true) : remove(true))}>
            {merging ? t('ros.merge') : t('ros.removeDo')}
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={t('ros.memberTitle')} subtitle={t('ros.current', { v: member.name })} onClose={onClose}>
      <label className="fl" htmlFor="newName">
        {t('ros.id')}
      </label>
      <input id="newName" type="text" value={newName} autoFocus onChange={(e) => setNewName(e.target.value)} />
      <p className="hint">{t('ros.idHint')}</p>

      <div className="calc">
        <div className="calc-line">
          <span>{t('ros.carried')}</span>
          <strong>
            {fmt(member.pending)} {unit}
          </strong>
        </div>
        {member.displayName ? (
          <div className="calc-line" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
            <span>{t('ros.oldDisplay')}</span>
            <span>{member.displayName}</span>
          </div>
        ) : null}
      </div>

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('c.cancel')}
        </button>
        <button className="btn" disabled={!changed || busy} onClick={() => rename(false)}>
          {busy ? t('c.processing') : t('ros.rename')}
        </button>
      </div>

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        <label className="fl" htmlFor="mw">
          {t('ros.weight')}
        </label>
        <select id="mw" value={weight} onChange={(e) => setWeight(Number(e.target.value))}>
          {Array.from({ length: 100 }, (_, i) => 100 - i).map((n) => (
            <option key={n} value={n}>
              {n}%
            </option>
          ))}
        </select>
        <p className="hint">{t('ros.weightHint')}</p>

        <label className="fl" htmlFor="ms" style={{ marginTop: 10 }}>
          {t('c.server')}
        </label>
        <select id="ms" value={server} onChange={(e) => setServer(e.target.value)}>
          <option value="">{t('ali.none')}</option>
          {servers.map((s) => (
            <option key={s} value={s}>
              {t('ali.serverN', { s })}
            </option>
          ))}
        </select>

        <label className="fl" htmlFor="mh" style={{ marginTop: 10 }}>
          {t('ros.hanja')}
        </label>
        <input
          id="mh"
          type="text"
          maxLength={30}
          placeholder={t('ros.hanjaPh')}
          value={hanja}
          onChange={(e) => setHanja(e.target.value)}
        />
        <p className="hint">{t('ros.hanjaHint', { name: member.name, h: hanja || '漢字' })}</p>

        <button
          className="btn block"
          style={{ marginTop: 12 }}
          disabled={!settingsChanged || busy}
          onClick={saveSettings}
        >
          {busy ? t('c.saving') : t('ros.saveSettings')}
        </button>
      </div>

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        <button className="btn danger block" disabled={busy} onClick={() => remove(false)}>
          {t('ros.remove')}
        </button>
        <p className="hint">{t('ros.removeHint')}</p>
      </div>
    </Sheet>
  );
}
