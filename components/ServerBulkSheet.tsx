'use client';

import { useMemo, useState } from 'react';
import Sheet from './Sheet';
import ServerPicker from './ServerPicker';
import type { RosterEntry } from '@/lib/types';
import type { ApiResult } from '@/lib/client';
import { api, getStoredEmail, mergeName } from '@/lib/client';
import { useT } from '@/lib/i18n';

/**
 * 서버 일괄 지정 (v10.8.5).
 *
 * 아이템 등록을 서버로 좁히려면 멤버DB에 서버가 채워져 있어야 하는데,
 * [혈맹원 관리]를 40번 열었다 닫는 것은 현실적이지 않다. 한 화면에서
 * **서버 하나 고르고 → 사람 여럿 체크 → 한 번에 지정**한다.
 *
 * ★ 시트에 한 번에 보내는 액션은 없다. 그래서 한 명씩 순서대로 부른다.
 *   - **개별 try/catch** — 한 명이 실패해도 나머지는 계속 간다 (CLAUDE.md 규칙 6)
 *   - 끝나면 **성공·실패를 이름까지** 알려준다. 조용히 넘어가면 누가 빠졌는지 모른다
 *   - 순서대로 부르는 이유: 동시에 던지면 시트 쪽 락에 걸려 서로 밀어낸다
 */
export default function ServerBulkSheet({
  roster,
  servers,
  onClose,
  onDone,
  toast,
}: {
  roster: RosterEntry[];
  servers: string[];
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t } = useT();
  const [server, setServer] = useState(servers[0] ?? '01');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);

  // 혈맹운영비는 사람이 아니라 계정이다 — 서버를 붙일 대상이 아니다
  const people = useMemo(() => roster.filter((m) => !m.isFund), [roster]);
  const inUse = useMemo(
    () => [...new Set(people.map((m) => String(m.server ?? '').trim()).filter(Boolean))].sort(),
    [people],
  );
  const list = useMemo(
    () => (onlyEmpty ? people.filter((m) => !String(m.server ?? '').trim()) : people),
    [people, onlyEmpty],
  );
  const emptyCount = useMemo(() => people.filter((m) => !String(m.server ?? '').trim()).length, [people]);

  function toggle(name: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function apply() {
    const names = list.filter((m) => picked.has(m.name)).map((m) => m.name);
    if (names.length === 0) return;

    setBusy(true);
    setDone(0);
    const failed: string[] = [];
    let last: ApiResult | undefined;

    for (const name of names) {
      try {
        const res = await api('/api/admin/member-settings', {
          name,
          server,
          email: getStoredEmail(),
        });
        if (res.ok) last = res;
        else failed.push(name);
      } catch {
        // 통신이 끊겨도 남은 사람은 계속 시도한다 — 여기서 멈추면 절반만 반영된 채 끝난다
        failed.push(name);
      }
      setDone((n) => n + 1);
    }

    setBusy(false);
    const okCount = names.length - failed.length;

    if (failed.length === 0) {
      toast(t('sv.applied', { n: okCount, s: server }));
    } else {
      // 실패한 사람의 이름까지 알려준다. 숫자만 주면 누구를 다시 해야 하는지 모른다
      toast(t('sv.partial', { n: okCount, s: server, failN: failed.length, failList: failed.join(', ') }), true);
    }
    setPicked(new Set());
    onDone(last);
  }

  const pickedCount = list.filter((m) => picked.has(m.name)).length;

  return (
    <Sheet title={t('sv.title')} subtitle={t('sv.sub')} onClose={onClose}>
      <div className="field">
        <label className="fl">{t('sv.pickServer')}</label>
        <ServerPicker servers={servers} value={server} onChange={setServer} allowNone={false} inUse={inUse} />
      </div>

      <div className="field">
        <div className="sect-row" style={{ marginBottom: 6 }}>
          <label className="fl" style={{ flex: 1, margin: 0 }}>
            {t('sv.pickPeople', { n: pickedCount })}
          </label>
          <button
            className="btn ghost tiny"
            onClick={() => setPicked(new Set(list.map((m) => m.name)))}
            disabled={busy}
          >
            {t('items.selectAll')}
          </button>
          <button className="btn ghost tiny" onClick={() => setPicked(new Set())} disabled={busy}>
            {t('items.clearAll')}
          </button>
        </div>

        <label className="chkline">
          <input
            type="checkbox"
            checked={onlyEmpty}
            onChange={(e) => setOnlyEmpty(e.target.checked)}
            disabled={busy}
          />
          {t('sv.onlyEmpty', { n: emptyCount })}
        </label>

        <div className="svlist">
          {list.length === 0 ? (
            <div className="empty">{t('sv.allDone')}</div>
          ) : (
            list.map((m) => {
              const { main, sub } = mergeName(m.name, m.hanja);
              const cur = String(m.server ?? '').trim();
              // 형식이 어긋난 값(예: '1')은 눈에 띄게 — 이런 사람은 서버로 걸러도 안 잡힌다
              const bad = Boolean(cur) && !servers.includes(cur);
              return (
                <label key={m.name} className={'svrow' + (picked.has(m.name) ? ' sel' : '')}>
                  <input
                    type="checkbox"
                    checked={picked.has(m.name)}
                    onChange={() => toggle(m.name)}
                    disabled={busy}
                  />
                  <span className="nm">
                    {main}
                    {sub ? <i>({sub})</i> : null}
                  </span>
                  <span className={'cur' + (bad ? ' bad' : '')}>
                    {cur ? (bad ? `${cur} ⚠️` : cur) : t('sv.none')}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>

      <div className="field">
        <button className="btn block" disabled={pickedCount === 0 || busy} onClick={() => void apply()}>
          {busy
            ? t('sv.applying', { done, total: pickedCount })
            : t('sv.apply', { n: pickedCount, s: server })}
        </button>
        <p className="hint">{t('sv.hint')}</p>
        <button className="btn ghost block" style={{ marginTop: 8 }} disabled={busy} onClick={onClose}>
          {t('c.close')}
        </button>
      </div>
    </Sheet>
  );
}
