'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Sheet from './Sheet';
import type { AllianceState } from '@/lib/types';
import { api, calcAlliance, fmt, getStoredEmail } from '@/lib/client';
import { useT } from '@/lib/i18n';

/**
 * 연합 정산 — 혈맹 내부 분배와 완전히 분리된 장부다.
 *
 * · 인증샷은 "몇 명인지"만 센다. 누가 찍혔는지는 판별하지 않는다
 *   (연합 인원은 우리 멤버DB에 없으므로 이름을 맞출 근거가 없다).
 * · 서버 · 금액 · 아이템명 · 비중(%)을 넣으면 그 서버에 누적된다.
 * · 잔액현황에는 전혀 손대지 않는다.
 */
export default function AllianceTab({
  admin,
  toast,
  setBusy,
}: {
  admin: boolean;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, unit } = useT();
  const [data, setData] = useState<AllianceState | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const res = await api('/api/alliance');
    if (res.ok) {
      setError('');
      setData(res.data as AllianceState);
      return;
    }
    // 시트가 아직 v10 이 아니면 이 액션 자체가 없다 — 뼈대만 계속 돌리지 말고 이유를 말해준다
    setError(res.msg || ' ');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(row: number) {
    setBusy(true);
    const res = await api('/api/admin/alliance', { row, email: getStoredEmail() }, 'DELETE');
    setBusy(false);
    toast(res.msg ?? (res.ok ? t('r.deleted') : t('r.deleteFailed')), !res.ok);
    if (res.ok) void load();
  }

  const u = unit(data?.unit ?? '다이아');
  const grand = (data?.totals ?? []).reduce((a, b) => a + b.credited, 0);

  if (error) {
    return (
      <div className="page">
        <div className="sect">🤝 {t('ali.title')}</div>
        <div className="card">
          <div className="field">
            <div className="note" style={{ whiteSpace: 'pre-wrap' }}>
              ⚠️ {error.trim()}
              {'\n\n'}
              {t('ali.needSheet')}
            </div>
            <button className="btn block" style={{ marginTop: 12 }} onClick={() => void load()}>
              {t('c.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="sect">🤝 {t('ali.title')}</div>

      {admin ? (
        <button className="btn block" onClick={() => setAdding(true)}>
          ➕ {t('ali.add')}
        </button>
      ) : null}

      <div className="sect" style={{ marginTop: 14 }}>
        📊 {t('ali.byServer')} — {t('c.total')} {fmt(grand)} {u}
      </div>
      <div className="card">
        {!data ? (
          <div className="field">
            <div className="skeleton" style={{ width: '80%' }} />
          </div>
        ) : (
          data.totals.map((s) => (
            <div className="row" key={s.server}>
              <div className="row-main">
                <div className="row-name">{t('ali.serverN', { s: s.server })}</div>
                <div className="row-sub">
                  {t('c.cases', { n: s.count })} · {t('c.people')} {s.people}
                </div>
              </div>
              <div className="row-amt">
                {fmt(s.credited)} {u}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="sect" style={{ marginTop: 14 }}>
        {t('ali.records')}
      </div>
      <div className="card">
        {!data ? (
          <div className="field">
            <div className="skeleton" style={{ width: '60%' }} />
          </div>
        ) : data.rows.length === 0 ? (
          <div className="empty">{t('ali.empty')}</div>
        ) : (
          data.rows.map((r) => (
            <div className="row" key={r.row}>
              <div className="row-main">
                <div className="row-name">
                  [{r.server}] {r.item}
                </div>
                <div className="row-sub">
                  {r.date} · {fmt(r.amount)} × {r.pct}% · {t('c.people')} {r.people}
                </div>
              </div>
              <div className="row-amt">{fmt(r.credited)}</div>
              {admin ? (
                <button className="btn ghost" onClick={() => void remove(r.row)}>
                  {t('c.delete')}
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {adding && data ? (
        <AddSheet
          servers={data.serverList}
          unit={u}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            void load();
          }}
          toast={toast}
          setBusy={setBusy}
        />
      ) : null}
    </div>
  );
}

function AddSheet({
  servers,
  unit,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  servers: string[];
  unit: string;
  onClose: () => void;
  onDone: () => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t } = useT();
  const [server, setServer] = useState(servers[0] ?? '01');
  const [item, setItem] = useState('');
  const [raw, setRaw] = useState('');
  const [pct, setPct] = useState(100);
  const [people, setPeople] = useState('0');
  const [photoLink, setPhotoLink] = useState('');
  const [photoMsg, setPhotoMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const amount = Number(raw.replace(/[,\s]/g, ''));
  const valid = Boolean(item.trim()) && Number.isInteger(amount) && amount > 0;
  const calc = valid ? calcAlliance(amount, pct) : null;

  async function pickPhoto(file: File) {
    setBusy(true);
    setPhotoMsg('');
    const base64 = await new Promise<string>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
      fr.readAsDataURL(file);
    });
    const res = await api('/api/admin/alliance-photo', { base64 });
    setBusy(false);
    if (res.ok) {
      setPeople(String(res.people ?? 0));
      setPhotoLink(String(res.photoUrl ?? ''));
      setPhotoMsg(String(res.msg ?? ''));
    } else {
      toast(res.msg ?? t('ali.photoFailed'), true);
    }
  }

  async function submit() {
    if (!valid) return;
    setBusy(true);
    const res = await api('/api/admin/alliance', {
      server,
      item: item.trim(),
      amount,
      pct,
      people: Number(people) || 0,
      photoLink,
      email: getStoredEmail(),
    });
    setBusy(false);
    toast(res.msg ?? (res.ok ? t('r.registered') : t('r.registerFailed')), !res.ok);
    if (res.ok) onDone();
  }

  return (
    <Sheet title={`🤝 ${t('ali.add')}`} subtitle={t('ali.addSub')} onClose={onClose}>
      <label className="fl" htmlFor="asv">
        {t('c.server')}
      </label>
      <select id="asv" value={server} onChange={(e) => setServer(e.target.value)}>
        {servers.map((s) => (
          <option key={s} value={s}>
            {t('ali.serverN', { s })}
          </option>
        ))}
      </select>

      <label className="fl" htmlFor="ait" style={{ marginTop: 10 }}>
        {t('c.itemName')}
      </label>
      <input id="ait" type="text" maxLength={40} value={item} onChange={(e) => setItem(e.target.value)} />

      <label className="fl" htmlFor="aam" style={{ marginTop: 10 }}>
        {t('c.amount')} ({unit})
      </label>
      <input
        id="aam"
        type="text"
        inputMode="numeric"
        placeholder={t('dist.amountPh')}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />

      <label className="fl" htmlFor="apc" style={{ marginTop: 10 }}>
        {t('c.ratio')} (%)
      </label>
      <select id="apc" value={pct} onChange={(e) => setPct(Number(e.target.value))}>
        {Array.from({ length: 100 }, (_, i) => 100 - i).map((n) => (
          <option key={n} value={n}>
            {n}%
          </option>
        ))}
      </select>

      <label className="fl" htmlFor="apl" style={{ marginTop: 10 }}>
        {t('c.people')}
      </label>
      <input
        id="apl"
        type="text"
        inputMode="numeric"
        value={people}
        onChange={(e) => setPeople(e.target.value.replace(/[^0-9]/g, ''))}
      />

      <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => fileRef.current?.click()}>
        📷 {t('ali.photoCount')}
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
      {photoMsg ? <p className="hint">{photoMsg}</p> : null}

      {calc ? (
        <div className="calc">
          <div className="calc-line">
            <span>💎 {t('c.amount')}</span>
            <strong>
              {fmt(calc.amount)} {unit}
            </strong>
          </div>
          <div className="calc-line">
            <span>{t('ali.credited', { s: server, pct: calc.pct })}</span>
            <strong>{fmt(calc.credited)}</strong>
          </div>
        </div>
      ) : null}

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('c.cancel')}
        </button>
        <button className="btn" disabled={!valid} onClick={() => void submit()}>
          {t('ali.add')}
        </button>
      </div>
    </Sheet>
  );
}
