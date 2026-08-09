'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import BulkMemberSheet from './BulkMemberSheet';
import ServerBulkSheet from './ServerBulkSheet';
import ServerPicker from './ServerPicker';
import Sheet from './Sheet';
import type { RenameRecord, RosterEntry } from '@/lib/types';
import { api, fmt, fullName, fundFirst, getStoredEmail, mergeName, normName, normServer } from '@/lib/client';
import type { ApiResult } from '@/lib/client';
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
  onChanged: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t, srv } = useT();
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<RosterEntry | null>(null);
  const [bulk, setBulk] = useState(false);
  const [svBulk, setSvBulk] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api('/api/admin/roster');
    if (!res.ok) {
      setError(srv(res));
      return;
    }
    setError('');
    // 혈비는 사람이 아니라 길드의 금고다 — 사람들 사이에 섞이지 않게 맨 위로 (v10.8.7)
    setRoster(fundFirst(res.data as RosterEntry[], (m) => m.isFund));
  }, [srv]);

  useEffect(() => {
    void load();
  }, [load]);

  // 혈맹운영비는 계정이라 서버를 붙일 대상이 아니다
  const noServer = (roster ?? []).filter((m) => !m.isFund && !normServer(m.server)).length;
  // 실제로 인원이 있는 서버 — 안 쓰는 서버는 칩에서 접어 둔다.
  // `1` 도 `01` 로 맞춰서 센다. 안 맞추면 같은 서버가 두 개로 갈린다 (v10.8.7)
  const inUse = [...new Set((roster ?? []).map((m) => normServer(m.server)).filter(Boolean))].sort();

  const done = (res?: ApiResult) => {
    setTarget(null);
    setBulk(false);
    void load();
    onChanged(res);
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
              <button className="btn block" onClick={() => setBulk(true)}>
                {t('ros.add')}
              </button>
              {/* 서버를 한 명씩 넣으려면 40번 열었다 닫아야 한다 — 한 화면에서 끝내는 길 */}
              <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => setSvBulk(true)}>
                🗂️ {t('sv.title')}
              </button>
              <p className="hint">{t('ros.addHint')}</p>
              {/* 서버가 비어 있으면 나중에 아이템 등록을 서버로 좁힐 수 없다 — 미리 알려준다 */}
              {noServer > 0 ? (
                <div className="note" style={{ marginTop: 10 }}>
                  {t('sv.needAssign', { n: noServer })}
                </div>
              ) : null}
            </div>
            {roster.map((m) => (
              <div className="row" key={m.name}>
                <div className="row-main">
                  {/* 한자표기는 이름 옆에 붙는다 (v10.8.1).
                      아래 줄에 작게 두면 아이디에 괄호로 넣은 사람과 모양이 달라져,
                      같은 명단인데 어떤 사람은 한자가 있고 어떤 사람은 없어 보인다. */}
                  <div className="row-name">
                    {/* 서버 번호는 [잔액]·[아이템]과 같은 배지로 (v10.8.9).
                        아랫줄에 "01 서버 ·" 라고 글로 적어두면 같은 정보가 화면마다
                        다르게 보여, 누구인지 가리는 데 쓸 수가 없다. */}
                    {normServer(m.server) ? <span className="svr">{normServer(m.server)}</span> : null}
                    {mergeName(m.name, m.hanja).main}
                    {mergeName(m.name, m.hanja).sub ? (
                      <span className="hanja">({mergeName(m.name, m.hanja).sub})</span>
                    ) : null}
                    {m.isFund ? (
                      <span className="badge" style={{ marginLeft: 6 }}>
                        {t('ros.fundBadge')}
                      </span>
                    ) : null}
                  </div>
                  <div className="row-sub">
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

      {svBulk && roster ? (
        <ServerBulkSheet
          roster={roster}
          servers={servers}
          onClose={() => setSvBulk(false)}
          onDone={done}
          toast={toast}
        />
      ) : null}
      {bulk ? (
        <BulkMemberSheet
          servers={servers}
          inUse={inUse}
          onClose={() => setBulk(false)}
          onDone={done}
          toast={toast}
          setBusy={setBusy}
        />
      ) : null}
      {busy ? (
        <div className="overlay">
          <div className="spinner" />
        </div>
      ) : null}
      {target ? (
        <MemberSheet
          member={target}
          roster={roster ?? []}
          unit={unit}
          servers={servers}
          inUse={inUse}
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

/* ──────────────────── 아이디 변경 · 탈퇴 ──────────────────── */

type Mode = 'edit' | 'pickFrom' | 'confirmMerge' | 'confirmRemove';

function MemberSheet({
  member,
  roster,
  unit,
  servers,
  inUse,
  onClose,
  onDone,
  toast,
}: {
  member: RosterEntry;
  /** 전체 명단 — "이전 아이디에서 불러오기" 후보와 중복 검사에 쓴다 (v10.9.1) */
  roster: RosterEntry[];
  unit: string;
  servers: string[];
  /** 실제로 인원이 있는 서버 — 안 쓰는 서버는 접어 둔다 */
  inUse: string[];
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t, srv } = useT();
  const [newName, setNewName] = useState(member.name);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('edit');
  const [warning, setWarning] = useState('');
  /** 기록을 가져올 옛 아이디 (v10.9.1) */
  const [from, setFrom] = useState<RosterEntry | null>(null);

  const [weight, setWeight] = useState(member.weight ?? 100);
  // `1` 로 저장된 사람도 `01` 칩이 켜져 보여야 한다 — 안 그러면 아무것도 안 고른 것처럼 보인다
  const [server, setServer] = useState(normServer(member.server));
  const [hanja, setHanja] = useState(member.hanja ?? '');

  const trimmed = newName.trim();
  const changed = trimmed.length > 0 && trimmed !== member.name;

  /**
   * 이미 명단에 있는 아이디로는 바꿀 수 없다 (v10.9.1).
   *
   * 예전에는 여기에 남의 이름을 치면 곧바로 "합칠까요?" 가 떴다. 개명하려던
   * 관리자가 오타 하나로 두 사람 잔액을 합쳐버리기 좋은 자리였다.
   * 기록을 가져오는 일은 아래 [이전 아이디에서 불러오기]로만 하게 하고,
   * 여기서는 **막고 그쪽을 가리킨다.**
   */
  const taken = changed
    ? (roster.find((m) => normName(m.name) === normName(trimmed) && m.name !== member.name) ?? null)
    : null;

  const hanjaChanged = hanja.trim() !== (member.hanja ?? '').trim();
  // 잔액·아이템에 실제로 나갈 모양을 그대로 보여준다 — 화면과 같은 함수를 쓴다
  const preview = fullName(trimmed || member.name, hanja);
  const settingsChanged =
    hanjaChanged || weight !== (member.weight ?? 100) || server !== normServer(member.server);
  const dirty = (changed && !taken) || settingsChanged;

  /**
   * 기록을 가져올 후보 (v10.9.1).
   *
   * 자기 자신과 혈비 계정은 뺀다 — 자신을 고르는 것은 뜻이 없고, 혈비는
   * 사람이 아니라 길드의 금고라 누구에게도 합쳐지면 안 된다.
   * 잔액이 남은 사람을 위로 올린다 — 합쳤을 때 실제로 옮겨오는 것이 그 값이다.
   */
  const candidates = useMemo(
    () =>
      roster
        .filter((m) => !m.isFund && normName(m.name) !== normName(member.name))
        .sort((a, b) => b.pending - a.pending),
    [roster, member.name],
  );

  /**
   * 옛 아이디의 기록을 이 아이디로 가져온다 — 서버의 개명 병합을 그대로 쓴다.
   *
   * ★ 먼저 `confirmMerge` 없이 불러 **서버가 구체적인 숫자로 되묻게** 한다 (규칙 5-1).
   *   앱이 임의로 true 를 채우면 안전장치가 통째로 무력화된다.
   */
  async function pull(target: RosterEntry, confirmMerge: boolean) {
    setBusy(true);
    const res = await api('/api/admin/rename', {
      oldName: target.name,
      newName: member.name,
      email: getStoredEmail(),
      confirmMerge,
    });
    setBusy(false);

    if (res.needsConfirm) {
      setFrom(target);
      setWarning(srv(res));
      setMode('confirmMerge');
      return;
    }
    toast(srv(res, res.ok ? 'r.saved' : 'r.changeFailed'), !res.ok);
    if (res.ok) onDone(res);
  }

  /**
   * 이 사람에 대한 변경을 **한 번에** 저장한다 (v10.8.2).
   *
   * 아이디는 개명 API(잔액·참여횟수를 끌고 간다), 나머지는 설정 API 로 가지만
   * 관리자에게는 "이 사람을 고친다"는 하나의 일이다. 버튼을 둘로 두면
   * 어느 쪽이 저장됐는지 알 수 없고, 한쪽만 누르고 창을 닫기도 쉽다.
   *
   * ★ 순서가 중요하다 — 개명을 먼저 하고, 설정은 **바뀐 이름**으로 저장한다.
   *   반대로 하면 옛 이름 행에 저장한 뒤 그 행이 사라진다.
   */
  async function save(confirmMerge: boolean) {
    setBusy(true);
    let current = member.name;
    let last: ApiResult | undefined;

    if (changed) {
      const res = await api('/api/admin/rename', {
        oldName: member.name,
        newName: trimmed,
        email: getStoredEmail(),
        confirmMerge,
      });
      // 이미 있는 이름이면 서버가 되묻는다 — 합치면 두 사람 잔액이 하나가 된다
      if (res.needsConfirm) {
        setBusy(false);
        setWarning(srv(res));
        setMode('confirmMerge');
        return;
      }
      if (!res.ok) {
        setBusy(false);
        toast(srv(res, 'r.changeFailed'), true);
        return;
      }
      current = trimmed;
      last = res;
    }

    if (settingsChanged) {
      const res = await api('/api/admin/member-settings', {
        name: current,
        weight,
        server,
        hanja,
        email: getStoredEmail(),
      });
      if (!res.ok) {
        setBusy(false);
        // 개명은 이미 끝났다 — 실패로만 알리면 관리자가 개명을 다시 시도한다
        toast(srv(res, changed ? 'ros.nameOkRestFailed' : 'r.failed'), true);
        if (changed) onDone(last);
        return;
      }
      last = res;
    }

    setBusy(false);
    if (!last) return;
    toast(srv(last, 'r.saved'));
    onDone(last);
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
    if (res.ok) onDone(res);
  }

  /* 어느 캐릭터의 기록을 이 아이디로 가져올지 고르는 화면 (v10.9.1) */
  if (mode === 'pickFrom') {
    return (
      <Sheet
        title={t('ros.pullTitle')}
        subtitle={t('ros.pullSub', { v: fullName(member.name, member.hanja) })}
        onClose={() => setMode('edit')}
      >
        <div className="note">{t('ros.pullNote')}</div>
        <div className="svlist" style={{ marginTop: 10 }}>
          {candidates.length === 0 ? (
            <div className="empty">{t('ros.pullNone')}</div>
          ) : (
            candidates.map((m) => {
              const { main, sub } = mergeName(m.name, m.hanja);
              return (
                <button
                  key={m.name}
                  className="svrow pick"
                  disabled={busy}
                  onClick={() => void pull(m, false)}
                >
                  <span className="nm">
                    {normServer(m.server) ? <i className="svr">{normServer(m.server)}</i> : null}
                    {main}
                    {sub ? <i>({sub})</i> : null}
                  </span>
                  {/* 합쳤을 때 실제로 옮겨오는 값 — 이걸 보고 같은 사람인지 판단한다 */}
                  <span className={'cur' + (m.pending > 0 ? ' has' : '')}>
                    {fmt(m.pending)} {unit}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          {t('ros.pullHint')}
        </p>
        <div className="sheet-actions">
          <button className="btn ghost" onClick={() => setMode('edit')}>
            {t('c.back')}
          </button>
        </div>
      </Sheet>
    );
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
          <button
            className="btn warn"
            disabled={busy}
            onClick={() => {
              if (!merging) return void remove(true);
              // `from` 이 있으면 [이전 아이디에서 불러오기], 없으면 아이디 칸을 통한 개명이다.
              // 두 경로 모두 서버가 되물은 뒤에만 여기에 온다.
              return void (from ? pull(from, true) : save(true));
            }}
          >
            {merging ? t('ros.merge') : t('ros.removeDo')}
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={t('ros.memberTitle')}
      subtitle={t('ros.current', { v: fullName(member.name, member.hanja) })}
      onClose={onClose}
    >
      {/* 아이디와 한자표기는 붙어 있어야 한다 (v10.8).
          같은 사람의 두 표기인데 예전에는 분배비중·서버를 사이에 두고 떨어져 있어서,
          한자를 넣어야 한다는 것 자체를 모르고 지나가기 쉬웠다. */}
      <label className="fl" htmlFor="newName">
        {t('ros.id')}
      </label>
      <input id="newName" type="text" value={newName} autoFocus onChange={(e) => setNewName(e.target.value)} />
      <p className="hint">{t('ros.idHint')}</p>

      <label className="fl" htmlFor="mh" style={{ marginTop: 12 }}>
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
      <p className="hint">{t('ros.hanjaHint', { v: preview })}</p>

      {/* 이미 있는 아이디로는 못 바꾼다 — 오타 하나로 두 사람 잔액이 합쳐지던 자리다 (v10.9.1).
          기록을 가져오는 일은 아래 [이전 아이디에서 불러오기]로만 한다. */}
      {taken ? (
        <div className="note" style={{ marginTop: 8, color: 'var(--danger)' }}>
          {t('ros.idTaken', { name: fullName(taken.name, taken.hanja) })}
        </div>
      ) : null}

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

      {/* 옛 아이디의 기록을 이 아이디로 가져온다 (v10.9.1).
          "먼저 신규로 넣어두고 나중에 이어붙이는" 흐름을 그 사람 화면에서 바로 할 수 있게 한다.
          누구의 기록이 따라오는지 **고르고 눈으로 확인한 뒤** 실행한다. */}
      <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => setMode('pickFrom')}>
        ⏪ {t('ros.pullOpen')}
      </button>
      <p className="hint">{t('ros.pullOpenHint')}</p>

      <label className="fl" htmlFor="mw" style={{ marginTop: 12 }}>
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

      <label className="fl" style={{ marginTop: 10 }}>
        {t('c.server')}
      </label>
      {/* 드롭다운은 열고·굴리고·누르는 세 동작이다. 칩은 한 번 누르면 끝이다 (v10.8.5) */}
      <ServerPicker id="ms" servers={servers} value={server} onChange={setServer} inUse={inUse} />

      {/* 저장 버튼은 하나다 (v10.8.2).
          아이디는 개명 API, 나머지는 설정 API 로 가지만 관리자에게는 한 가지 일이다.
          버튼이 둘이면 어느 쪽이 저장됐는지 알 수 없고, 한쪽만 누르고 닫기도 쉽다. */}
      <div className="sheet-actions" style={{ marginTop: 18 }}>
        <button className="btn ghost" onClick={onClose}>
          {t('c.cancel')}
        </button>
        <button className="btn" disabled={!dirty || busy} onClick={() => save(false)}>
          {busy ? t('c.saving') : t('c.save')}
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
