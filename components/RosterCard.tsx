'use client';

import { useCallback, useEffect, useState } from 'react';
import Sheet from './Sheet';
import type { RenameRecord, RosterEntry } from '@/lib/types';
import { api, fmt, getStoredEmail } from '@/lib/client';

/**
 * 혈맹원 관리 (관리자 전용) — 추가 · 아이디 변경 · 탈퇴.
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
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<RosterEntry | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const res = await api('/api/admin/roster');
    if (!res.ok) {
      setError(res.msg ?? '명단을 불러오지 못했습니다.');
      return;
    }
    setError('');
    setRoster(res.data as RosterEntry[]);
  }, []);

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
      <div className="sect">👥 혈맹원 관리 {roster ? `(${roster.length}명)` : ''}</div>
      <div className="card">
        {error ? (
          <div className="field">
            <p className="hint" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
            <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => void load()}>
              다시 시도
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
                ➕ 혈맹원 추가
              </button>
              <p className="hint">
                게임에서 아이디를 바꾼 사람은 눌러서 수정하세요. 잔액과 참여횟수는 새 이름으로 그대로 따라갑니다.
              </p>
            </div>
            {roster.map((m) => (
              <div className="row" key={m.name}>
                <div className="row-main">
                  <div className="row-name">
                    {m.name}
                    {m.isFund ? (
                      <span className="badge" style={{ marginLeft: 6 }}>
                        운영비
                      </span>
                    ) : null}
                  </div>
                  <div className="row-sub">
                    {m.hanja ? `${m.hanja} · ` : ''}
                    {m.server ? `${m.server}서버 · ` : ''}
                    {m.weight !== undefined && m.weight !== 100 ? `비중 ${m.weight}% · ` : ''}
                    분배전 {fmt(m.pending)} {unit}
                  </div>
                </div>
                <button className="btn ghost" disabled={m.isFund} onClick={() => setTarget(m)}>
                  관리
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
      <div className="sect">🕘 아이디 변경 이력</div>
      <div className="card">
        {!open ? (
          <div className="field">
            <button className="btn ghost block" onClick={() => setOpen(true)}>
              이력 보기
            </button>
            <p className="hint">누가 언제 어떤 이름에서 어떤 이름으로 바뀌었는지 [작업기록]에서 가져옵니다.</p>
          </div>
        ) : !rows ? (
          <div className="field">
            <div className="skeleton" style={{ width: '70%' }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="empty">아직 아이디를 바꾼 기록이 없습니다.</div>
        ) : (
          rows.map((r, i) => (
            <div className="row" key={i}>
              <div className="row-main">
                <div className="row-name">
                  {r.before} <span style={{ color: 'var(--text-dim)' }}>→</span> {r.after}
                  {r.merged ? (
                    <span className="badge" style={{ marginLeft: 6 }}>
                      병합
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
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const res = await api('/api/admin/member', { name: name.trim(), email: getStoredEmail() });
    setBusy(false);
    toast(res.msg ?? (res.ok ? '추가했습니다.' : '추가하지 못했습니다.'), !res.ok);
    if (res.ok) onDone();
  }

  return (
    <Sheet title="➕ 혈맹원 추가" subtitle="새로 가입한 혈맹원을 명단에 넣습니다" onClose={onClose}>
      <label className="fl" htmlFor="addName">
        아이디
      </label>
      <input
        id="addName"
        type="text"
        placeholder="게임 아이디"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) void submit();
        }}
      />
      <p className="hint">
        <strong>게임에서 보이는 이름과 정확히 같게</strong> 입력하세요. 띄어쓰기·괄호·한자까지 그대로여야
        인증샷에서 자동으로 찾아냅니다.
      </p>

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          취소
        </button>
        <button className="btn" disabled={!name.trim() || busy} onClick={submit}>
          {busy ? '추가 중…' : '추가하기'}
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
  const [newName, setNewName] = useState(member.name);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('edit');
  const [warning, setWarning] = useState('');

  const [weight, setWeight] = useState(member.weight ?? 100);
  const [server, setServer] = useState(member.server ?? '');
  const [hanja, setHanja] = useState(member.hanja ?? '');

  const settingsChanged =
    weight !== (member.weight ?? 100) ||
    server !== (member.server ?? '') ||
    hanja !== (member.hanja ?? '');

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
    toast(res.msg ?? (res.ok ? '저장했습니다.' : '저장하지 못했습니다.'), !res.ok);
    if (res.ok) onDone();
  }

  const trimmed = newName.trim();
  const changed = trimmed.length > 0 && trimmed !== member.name;

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
      setWarning(String(res.msg ?? ''));
      setMode('confirmMerge');
      return;
    }
    toast(res.msg ?? (res.ok ? '변경했습니다.' : '변경하지 못했습니다.'), !res.ok);
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
      setWarning(String(res.msg ?? ''));
      setMode('confirmRemove');
      return;
    }
    toast(res.msg ?? (res.ok ? '탈퇴 처리했습니다.' : '처리하지 못했습니다.'), !res.ok);
    if (res.ok) onDone();
  }

  if (mode !== 'edit') {
    const merging = mode === 'confirmMerge';
    return (
      <Sheet
        title={merging ? '⚠️ 계정을 합칩니다' : '⚠️ 확인이 필요합니다'}
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
            뒤로
          </button>
          <button
            className="btn warn"
            disabled={busy}
            onClick={() => (merging ? rename(true) : remove(true))}
          >
            {merging ? '합치기' : '탈퇴 처리'}
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="👤 혈맹원 관리" subtitle={`현재: ${member.name}`} onClose={onClose}>
      <label className="fl" htmlFor="newName">
        아이디
      </label>
      <input id="newName" type="text" value={newName} autoFocus onChange={(e) => setNewName(e.target.value)} />
      <p className="hint">
        <strong>게임에서 보이는 이름과 정확히 같게</strong> 입력하세요. 띄어쓰기·괄호·한자까지 그대로여야
        인증샷에서 자동으로 찾아냅니다.
      </p>

      <div className="calc">
        <div className="calc-line">
          <span>따라오는 분배전</span>
          <strong>
            {fmt(member.pending)} {unit}
          </strong>
        </div>
        {member.displayName ? (
          <div className="calc-line" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
            <span>기존 게임표시명</span>
            <span>{member.displayName}</span>
          </div>
        ) : null}
      </div>

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          취소
        </button>
        <button className="btn" disabled={!changed || busy} onClick={() => rename(false)}>
          {busy ? '처리 중…' : '변경하기'}
        </button>
      </div>

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        <label className="fl" htmlFor="mw">
          분배비중 (%)
        </label>
        <select id="mw" value={weight} onChange={(e) => setWeight(Number(e.target.value))}>
          {Array.from({ length: 100 }, (_, i) => 100 - i).map((n) => (
            <option key={n} value={n}>
              {n}%
            </option>
          ))}
        </select>
        <p className="hint">
          기본 1인당 금액의 이 비율만 받습니다. 남는 금액은 <strong>전액 혈맹운영비로 귀속</strong>됩니다.
          이미 분배된 아이템에는 영향이 없습니다 (그때 금액이 그대로 기록돼 있습니다).
        </p>

        <label className="fl" htmlFor="ms" style={{ marginTop: 10 }}>
          서버
        </label>
        <select id="ms" value={server} onChange={(e) => setServer(e.target.value)}>
          <option value="">(지정 안 함)</option>
          {servers.map((s) => (
            <option key={s} value={s}>
              {s} 서버
            </option>
          ))}
        </select>

        <label className="fl" htmlFor="mh" style={{ marginTop: 10 }}>
          한자표기 (중국어)
        </label>
        <input
          id="mh"
          type="text"
          maxLength={30}
          placeholder="예: 车武植"
          value={hanja}
          onChange={(e) => setHanja(e.target.value)}
        />
        <p className="hint">
          중국어권 혈맹원에게 <strong>{member.name} ({hanja || '漢字'})</strong> 형태로 함께 보여줍니다.
          이름은 시스템이 추측하지 않습니다 — 게임에서 쓰는 표기를 직접 확인해 넣어주세요.
        </p>

        <button className="btn block" style={{ marginTop: 12 }} disabled={!settingsChanged || busy} onClick={saveSettings}>
          {busy ? '저장 중…' : '설정 저장'}
        </button>
      </div>

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        <button className="btn danger block" disabled={busy} onClick={() => remove(false)}>
          ➖ 탈퇴 처리
        </button>
        <p className="hint">
          명단에서만 빼고 <strong>기록은 남깁니다.</strong> 잔액이나 참여 이력이 있으면 잔액현황에
          &ldquo;(미등록)&rdquo;으로 보존되고, 이력이 전혀 없을 때만 목록에서 사라집니다.
        </p>
      </div>
    </Sheet>
  );
}
