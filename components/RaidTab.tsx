'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Glyph from './Glyph';
import IconText from './IconText';
import Sheet from './Sheet';
import ShareBtn from './ShareBtn';
import type { RaidRow, RaidState } from '@/lib/types';
import { api, getStoredEmail } from '@/lib/client';
import { useT } from '@/lib/i18n';
import ItemNameInput from './ItemNameInput';

/** 시트는 1=월 … 7=일, 자바스크립트 getDay()는 0=일 … 6=토 */
export function todayDay(d: Date = new Date()): number {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

/** 'HH:MM' → 오전/오후 표기. 사람이 시간표를 읽는 방식에 맞춘다. */
function ampm(time: string, t: (k: string, v?: Record<string, string | number>) => string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  const half = h < 12 ? t('raid.am') : t('raid.pm');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${half} ${h12}:${m[2]}`;
}

/**
 * 보스 시간표 (v10.8).
 *
 * ★ 이 탭의 출발점은 "전부 보여주지 않는 것"이다.
 *   46종을 한 화면에 띄우면 폰에서 읽을 수가 없어서, 사람들이 결국 안 본다.
 *   그래서 기본은 **오늘 요일**만이고, 다른 요일은 칩을 눌러야 나온다.
 *
 * ★ 요일 판정은 **폰의 시계**로 한다. 서버에서 걸러 보내면 중국에서 접속했을 때
 *   (시차 1시간) 자정 근처에 엉뚱한 요일이 나오고, 요일을 바꿔 볼 때마다
 *   왕복이 생긴다. 표 전체는 50건 남짓이라 한 번에 받아도 부담이 없다.
 *
 * 편집은 관리자·마스터관리자 모두 할 수 있다 — 잘못 지워도 한 줄 다시 넣으면 끝이라
 * 마스터 전용으로 둘 이유가 없다.
 */
export default function RaidTab({
  admin,
  toast,
  setBusy,
}: {
  admin: boolean;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, srv } = useT();
  const [data, setData] = useState<RaidState | null>(null);
  const [error, setError] = useState('');
  const [day, setDay] = useState(() => todayDay());
  // 사람이 요일 칩을 누르기 전까지만 오늘을 따라간다 — 눌렀는데 도로 오늘로 돌아가면 고장으로 보인다
  const [pinned, setPinned] = useState(false);
  const [editing, setEditing] = useState<RaidRow | 'new' | null>(null);

  const load = useCallback(
    async (fresh = false) => {
      const res = await api(fresh ? '/api/raid?fresh=1' : '/api/raid');
      if (res.ok) {
        setError('');
        setData(res.data as RaidState);
        return;
      }
      // 시트가 아직 v10.8 이 아니면 이 액션 자체가 없다 — 뼈대만 돌리지 말고 이유를 말해준다
      setError(srv(res) || ' ');
    },
    [srv],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // 폰을 켜둔 채 자정을 넘기면 요일이 바뀐다. 사람이 칩을 누른 뒤에는 따라가지 않는다.
  useEffect(() => {
    if (pinned) return;
    const id = setInterval(() => setDay(todayDay()), 60_000);
    return () => clearInterval(id);
  }, [pinned]);

  const dayLabels = useMemo(() => [1, 2, 3, 4, 5, 6, 7].map((d) => t(`raid.d${d}`)), [t]);

  const todays = useMemo(() => (data?.rows ?? []).filter((r) => r.day === day), [data, day]);

  // 같은 시간에 여러 보스가 겹치는 일이 많다 — 시간별로 묶어야 한 줄로 읽힌다
  const groups = useMemo(() => {
    const map = new Map<string, RaidRow[]>();
    todays.forEach((r) => {
      const list = map.get(r.time);
      if (list) list.push(r);
      else map.set(r.time, [r]);
    });
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [todays]);

  /** 공유용 글 — 스크린샷 대신 카카오톡·디스코드에 그대로 붙일 수 있게 */
  function buildShare(): string {
    const head = `🗡️ ${t('raid.title')} — ${dayLabels[day - 1]}`;
    if (groups.length === 0) return `${head}\n${t('raid.empty')}`;
    const body = groups
      .map(([time, list]) => `${ampm(time, t)}  ${list.map((r) => r.boss + (r.note ? ` (${r.note})` : '')).join(', ')}`)
      .join('\n');
    return `${head}\n${body}`;
  }

  async function remove(row: number) {
    setBusy(true);
    const res = await api('/api/admin/raid', { row, email: getStoredEmail() }, 'DELETE');
    setBusy(false);
    toast(srv(res, res.ok ? 'r.deleted' : 'r.deleteFailed'), !res.ok);
    if (res.ok) void load(true);
  }

  if (error) {
    return (
      <div className="page">
        <div className="sect"><Glyph name="raid" size={16} /> {t('raid.title')}</div>
        <div className="card">
          <div className="field">
            <div className="note" style={{ whiteSpace: 'pre-wrap' }}>
              ⚠️ {error.trim()}
              {'\n\n'}
              {t('raid.needSheet')}
            </div>
            <button className="btn block" style={{ marginTop: 12 }} onClick={() => void load()}>
              {t('c.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isToday = day === todayDay();

  return (
    <div className="page">
      <div className="sect-row">
        <div className="sect"><Glyph name="raid" size={16} /> {t('raid.title')}</div>
        <ShareBtn title={t('raid.title')} build={buildShare} toast={toast} />
      </div>

      {/* 요일 칩 — 오늘이 먼저 켜져 있고, 눌러서 다른 요일을 미리 볼 수 있다 */}
      <div className="daybar" role="tablist" aria-label={t('raid.pickDay')}>
        {dayLabels.map((label, i) => {
          const d = i + 1;
          return (
            <button
              key={d}
              role="tab"
              aria-selected={day === d}
              className={'daychip' + (day === d ? ' on' : '') + (d === todayDay() ? ' today' : '')}
              onClick={() => {
                setPinned(true);
                setDay(d);
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="sect" style={{ marginTop: 12 }}>
        {isToday ? t('raid.todaySect', { d: dayLabels[day - 1] }) : t('raid.daySect', { d: dayLabels[day - 1] })}
        {todays.length > 0 ? ` (${todays.length})` : ''}
      </div>

      {admin ? (
        <button className="btn block" style={{ marginBottom: 10 }} onClick={() => setEditing('new')}>
          <Glyph name="plus" size={16} /> {t('raid.add')}
        </button>
      ) : null}

      <div className="card">
        {!data ? (
          <div className="field">
            <div className="skeleton" style={{ width: '70%' }} />
          </div>
        ) : groups.length === 0 ? (
          <div className="empty">{t('raid.empty')}</div>
        ) : (
          groups.map(([time, list]) => (
            <div className="row" key={time}>
              <div className="raid-time">{ampm(time, t)}</div>
              <div className="row-main">
                {list.map((r) => (
                  <div className="raid-boss" key={r.row}>
                    <span className="raid-name">{r.boss}</span>
                    {r.note ? <span className="raid-note">{r.note}</span> : null}
                    {admin ? (
                      <span className="raid-acts">
                        <button className="btn ghost tiny" onClick={() => setEditing(r)}>
                          {t('c.edit')}
                        </button>
                        <button className="btn ghost tiny" onClick={() => void remove(r.row)}>
                          {t('c.delete')}
                        </button>
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {!admin ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="field">
            <p className="hint">{t('raid.viewerHint')}</p>
          </div>
        </div>
      ) : null}

      {editing ? (
        <RaidSheet
          target={editing === 'new' ? null : editing}
          defaultDay={day}
          dayLabels={dayLabels}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void load(true);
          }}
          toast={toast}
          setBusy={setBusy}
        />
      ) : null}
    </div>
  );
}

/** 추가·수정 공용 시트 — 넣는 값이 같으므로 화면을 두 벌로 만들지 않는다 */
function RaidSheet({
  target,
  defaultDay,
  dayLabels,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  target: RaidRow | null;
  defaultDay: number;
  dayLabels: string[];
  onClose: () => void;
  onDone: () => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, srv } = useT();
  const [day, setDay] = useState(target?.day ?? defaultDay);
  const [time, setTime] = useState(target?.time ?? '20:20');
  const [boss, setBoss] = useState(target?.boss ?? '');
  const [note, setNote] = useState(target?.note ?? '');
  const [sending, setSending] = useState(false);

  async function submit() {
    const b = boss.trim();
    if (!b) {
      toast(t('raid.needBoss'), true);
      return;
    }
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) {
      toast(t('raid.needTime'), true);
      return;
    }

    setSending(true);
    setBusy(true);
    const payload = { row: target?.row, day, time, boss: b, note: note.trim(), email: getStoredEmail() };
    const res = target
      ? await api('/api/admin/raid', payload, 'PATCH')
      : await api('/api/admin/raid', payload, 'POST');
    setBusy(false);
    setSending(false);

    toast(srv(res, res.ok ? 'r.saved' : 'r.failed'), !res.ok);
    if (res.ok) onDone();
  }

  return (
    <Sheet
      title={target ? t('raid.editTitle') : t('raid.addTitle')}
      subtitle={t('raid.sheetSub')}
      onClose={onClose}
    >
      <div className="field">
        <label htmlFor="raid-day">{t('raid.day')}</label>
        <div className="daybar" style={{ marginTop: 6 }} id="raid-day">
          {dayLabels.map((label, i) => (
            <button
              key={i}
              className={'daychip' + (day === i + 1 ? ' on' : '')}
              onClick={() => setDay(i + 1)}
              aria-pressed={day === i + 1}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="raid-time">{t('raid.time')}</label>
        {/* type=time 은 폰에서 기기 시계와 같은 방식으로 뜬다 — 24시간 문자열로 나온다 */}
        <input id="raid-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} step={60} />
        <p className="hint">{t('raid.timeHint')}</p>
      </div>

      <div className="field">
        <label htmlFor="raid-boss">{t('raid.boss')}</label>
        {/* 용어 사전 자동완성 (v11.4) — 中文·English 로 쳐도 보스를 찾는다 */}
        <ItemNameInput id="raid-boss" value={boss} onChange={setBoss} />
      </div>

      <div className="field">
        <label htmlFor="raid-note">{t('raid.note')}</label>
        <input
          id="raid-note"
          type="text"
          value={note}
          maxLength={60}
          placeholder={t('raid.notePh')}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="field">
        <button className="btn block" disabled={sending} onClick={() => void submit()}>
          {sending ? t('c.saving') : t('c.save')}
        </button>
        <button className="btn ghost block" style={{ marginTop: 8 }} onClick={onClose}>
            <IconText text={t('c.cancel')} />
          </button>
      </div>
    </Sheet>
  );
}
