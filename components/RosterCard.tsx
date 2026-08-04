'use client';

import { useCallback, useEffect, useState } from 'react';
import Sheet from './Sheet';
import type { RosterEntry } from '@/lib/types';
import { api, fmt, getStoredEmail } from '@/lib/client';

/**
 * 혈맹원 아이디 관리 (관리자 전용).
 *
 * 게임에서 이름을 바꾸면 시트의 이름도 따라가야 OCR 자동 감지와 분배가 맞는다.
 * 이름을 바꾸면 잔액·참여횟수가 그대로 따라오고, 이미 있는 이름으로 바꾸면
 * 두 계정이 합쳐지므로 그 경우에는 서버가 한 번 더 확인을 요구한다.
 */
export default function RosterCard({
  unit,
  onChanged,
  toast,
}: {
  unit: string;
  onChanged: () => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<RosterEntry | null>(null);

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

  return (
    <>
      <div className="sect">👥 혈맹원 아이디 관리</div>
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
            <div className="field" style={{ paddingBottom: 8 }}>
              <p className="hint">
                게임에서 아이디를 바꾼 사람을 눌러 수정하세요. 잔액과 참여횟수는 새 이름으로 그대로 따라갑니다.
              </p>
            </div>
            {roster.map((m) => (
              <div className="row" key={m.name}>
                <div className="row-main">
                  <div className="row-name">
                    {m.name}
                    {m.isFund ? <span className="badge" style={{ marginLeft: 6 }}>혈비</span> : null}
                  </div>
                  <div className="row-sub">
                    {m.displayName ? `게임표시명 ${m.displayName} · ` : ''}
                    분배전 {fmt(m.pending)} {unit}
                  </div>
                </div>
                <button className="btn ghost" disabled={m.isFund} onClick={() => setTarget(m)}>
                  변경
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {target ? (
        <RenameSheet
          member={target}
          unit={unit}
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

function RenameSheet({
  member,
  unit,
  onClose,
  onDone,
  toast,
}: {
  member: RosterEntry;
  unit: string;
  onClose: () => void;
  onDone: () => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const [newName, setNewName] = useState(member.name);
  const [busy, setBusy] = useState(false);
  // 서버가 "이미 있는 이름이라 합쳐진다"고 알려오면 여기에 담아 한 번 더 확인받는다
  const [mergeWarning, setMergeWarning] = useState('');

  const trimmed = newName.trim();
  const changed = trimmed.length > 0 && trimmed !== member.name;

  async function submit(confirmMerge: boolean) {
    setBusy(true);
    const res = await api('/api/admin/rename', {
      oldName: member.name,
      newName: trimmed,
      email: getStoredEmail(),
      confirmMerge,
    });
    setBusy(false);

    if (res.needsConfirm) {
      setMergeWarning(String(res.msg ?? ''));
      return;
    }
    toast(res.msg ?? (res.ok ? '변경했습니다.' : '변경하지 못했습니다.'), !res.ok);
    if (res.ok) onDone();
  }

  return (
    <Sheet title="✏️ 아이디 변경" subtitle={`현재: ${member.name}`} onClose={onClose}>
      {mergeWarning ? (
        <>
          <div className="note" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {mergeWarning}
          </div>
          <div className="sheet-actions">
            <button className="btn ghost" onClick={() => setMergeWarning('')}>
              뒤로
            </button>
            <button className="btn warn" disabled={busy} onClick={() => submit(true)}>
              합치기
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="fl" htmlFor="newName">
            새 아이디
          </label>
          <input
            id="newName"
            type="text"
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
          />
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
            <button className="btn" disabled={!changed || busy} onClick={() => submit(false)}>
              {busy ? '변경 중…' : '변경하기'}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
