'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Sheet from './Sheet';
import type { AllianceRow, AllianceState } from '@/lib/types';
import { api, calcAlliance, fmt, getStoredEmail, prepPhoto } from '@/lib/client';
import type { ApiResult } from '@/lib/client';
import { useT } from '@/lib/i18n';

/**
 * 연합 정산 — 혈맹 내부 분배와 완전히 분리된 장부다.
 *
 * v10.3 부터 혈맹 아이템과 **같은 순서**로 두 단계다:
 *   ① 등록 — 서버·아이템명·인증샷(인원수)까지만
 *   ② 정산 — 나중에 금액·비중(%)을 넣어 그 서버에 누적
 * 레이드 직후엔 아직 안 팔려서 금액을 모르는 것이 정상이다. 그때 금액을
 * 요구하면 등록 자체가 미뤄지고, 그 사이에 인증샷을 잃어버린다.
 *
 * · 인증샷은 "몇 명인지"만 센다. 누가 찍혔는지는 판별하지 않는다
 *   (연합 인원은 우리 멤버DB에 없으므로 이름을 맞출 근거가 없다).
 * · 잔액현황에는 어느 단계에서도 손대지 않는다.
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
  const { t, unit, srv } = useT();
  const [data, setData] = useState<AllianceState | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [crediting, setCrediting] = useState<AllianceRow | null>(null);

  // fresh=true 는 내가 방금 쓴 직후에만 — 서버 캐시를 건너뛴다 (lib/fresh.ts)
  const load = useCallback(async (fresh = false) => {
    const res = await api(fresh ? '/api/alliance?fresh=1' : '/api/alliance');
    if (res.ok) {
      setError('');
      setData(res.data as AllianceState);
      return;
    }
    // 시트가 아직 v10 이 아니면 이 액션 자체가 없다 — 뼈대만 계속 돌리지 말고 이유를 말해준다
    setError(srv(res) || ' ');
  }, [srv]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(row: number) {
    setBusy(true);
    const res = await api('/api/admin/alliance', { row, email: getStoredEmail() }, 'DELETE');
    setBusy(false);
    toast(srv(res, res.ok ? 'r.deleted' : 'r.deleteFailed'), !res.ok);
    if (res.ok) void load(true);
  }

  const u = unit(data?.unit ?? '다이아');
  const grand = (data?.totals ?? []).reduce((a, b) => a + b.credited, 0);
  // 시트가 v10.2 이하면 waiting 이 없다 — 그때는 금액 없는 행으로 골라낸다
  const waiting = data ? (data.waiting ?? data.rows.filter((r) => !r.done)) : [];
  const done = data ? data.rows.filter((r) => r.done) : [];

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
          📷 {t('ali.register')}
        </button>
      ) : null}

      {/* ① 등록만 된 건 — 금액을 넣으면 서버에 누적된다 */}
      <div className="sect" style={{ marginTop: 14 }}>
        ⏳ {t('ali.waitingSect')} {waiting.length > 0 ? `(${waiting.length})` : ''}
      </div>
      <div className="card">
        {!data ? (
          <div className="field">
            <div className="skeleton" style={{ width: '70%' }} />
          </div>
        ) : waiting.length === 0 ? (
          <div className="empty">{t('ali.waitingEmpty')}</div>
        ) : (
          waiting.map((r) => (
            <div className="row" key={r.row}>
              <div className="row-main">
                <div className="row-name">
                  <span className="svr">{r.server}</span>
                  {r.item}
                </div>
                <div className="row-sub">
                  {r.date} · {t('c.people')} {r.people}
                </div>
              </div>
              {admin ? (
                <>
                  <button className="btn warn" onClick={() => setCrediting(r)}>
                    {t('ali.credit')}
                  </button>
                  <button className="btn ghost" onClick={() => void remove(r.row)}>
                    {t('c.delete')}
                  </button>
                </>
              ) : (
                <span className="badge">{t('items.waiting')}</span>
              )}
            </div>
          ))
        )}
      </div>

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

      {/* ② 정산까지 끝난 건 */}
      <div className="sect" style={{ marginTop: 14 }}>
        {t('ali.records')}
      </div>
      <div className="card">
        {!data ? (
          <div className="field">
            <div className="skeleton" style={{ width: '60%' }} />
          </div>
        ) : done.length === 0 ? (
          <div className="empty">{t('ali.empty')}</div>
        ) : (
          done.map((r) => (
            <div className="row" key={r.row}>
              <div className="row-main">
                <div className="row-name">
                  <span className="svr">{r.server}</span>
                  {r.item}
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
        <RegisterSheet
          servers={data.serverList}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            void load(true);
          }}
          toast={toast}
          setBusy={setBusy}
        />
      ) : null}

      {crediting ? (
        <CreditSheet
          entry={crediting}
          unit={u}
          onClose={() => setCrediting(null)}
          onDone={() => {
            setCrediting(null);
            void load(true);
          }}
          toast={toast}
          setBusy={setBusy}
        />
      ) : null}
    </div>
  );
}

/** ① 등록 — 서버·아이템명·인증샷까지. 금액은 받지 않는다. */
function RegisterSheet({
  servers,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  servers: string[];
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, srv } = useT();
  const [server, setServer] = useState(servers[0] ?? '01');
  const [item, setItem] = useState('');
  const [people, setPeople] = useState('0');
  const [photoLink, setPhotoLink] = useState('');
  const [photoMsg, setPhotoMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const valid = Boolean(item.trim());

  async function pickPhoto(file: File) {
    setBusy(true);
    setPhotoMsg('');
    // 원본을 그대로 보내면 요청이 비대해지고 OCR 도 더 못 읽는다
    const jpeg = await prepPhoto(file);
    if (!jpeg) {
      setBusy(false);
      toast(t('items.formatFailed'), true);
      return;
    }
    const res = await api('/api/admin/alliance-photo', { base64: jpeg.split(',')[1] ?? '' });
    setBusy(false);
    if (res.ok) {
      setPeople(String(res.people ?? 0));
      setPhotoLink(String(res.photoUrl ?? ''));
      setPhotoMsg(srv(res));
    } else {
      toast(srv(res, 'ali.photoFailed'), true);
    }
  }

  async function submit() {
    if (!valid) return;
    setBusy(true);
    const res = await api('/api/admin/alliance', {
      op: 'register',
      server,
      item: item.trim(),
      people: Number(people) || 0,
      photoLink,
      email: getStoredEmail(),
    });
    setBusy(false);
    toast(srv(res, res.ok ? 'r.registered' : 'r.registerFailed'), !res.ok);
    if (res.ok) onDone(res);
  }

  return (
    <Sheet title={`📷 ${t('ali.register')}`} subtitle={t('ali.registerSub')} onClose={onClose}>
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

      <button className="btn ghost block" style={{ marginTop: 12 }} onClick={() => fileRef.current?.click()}>
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

      <p className="hint" style={{ marginTop: 10 }}>
        {t('ali.registerHint')}
      </p>

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('c.cancel')}
        </button>
        <button className="btn" disabled={!valid} onClick={() => void submit()}>
          {t('ali.register')}
        </button>
      </div>
    </Sheet>
  );
}

/** ② 정산 — 등록해둔 건에 금액·비중을 넣어 그 서버에 누적한다. */
function CreditSheet({
  entry,
  unit,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  entry: AllianceRow;
  unit: string;
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, srv } = useT();
  const [raw, setRaw] = useState('');
  const [pct, setPct] = useState(100);

  const amount = Number(raw.replace(/[,\s]/g, ''));
  const valid = Number.isInteger(amount) && amount > 0;
  const calc = valid ? calcAlliance(amount, pct) : null;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    const res = await api('/api/admin/alliance', {
      op: 'credit',
      row: entry.row,
      amount,
      pct,
      email: getStoredEmail(),
    });
    setBusy(false);
    toast(srv(res, res.ok ? 'r.done' : 'r.failed'), !res.ok);
    if (res.ok) onDone(res);
  }

  return (
    <Sheet
      title={`🤝 ${entry.item}`}
      subtitle={t('ali.creditSub', { s: entry.server, n: entry.people })}
      onClose={onClose}
    >
      <label className="fl" htmlFor="cam">
        {t('c.amount')} ({unit})
      </label>
      <input
        id="cam"
        type="text"
        inputMode="numeric"
        placeholder={t('dist.amountPh')}
        value={raw}
        autoFocus
        onChange={(e) => setRaw(e.target.value)}
      />

      <label className="fl" htmlFor="cpc" style={{ marginTop: 10 }}>
        {t('c.ratio')} (%)
      </label>
      <select id="cpc" value={pct} onChange={(e) => setPct(Number(e.target.value))}>
        {Array.from({ length: 100 }, (_, i) => 100 - i).map((n) => (
          <option key={n} value={n}>
            {n}%
          </option>
        ))}
      </select>

      {calc ? (
        <div className="calc">
          <div className="calc-line">
            <span>💎 {t('c.amount')}</span>
            <strong>
              {fmt(calc.amount)} {unit}
            </strong>
          </div>
          <div className="calc-line">
            <span>{t('ali.credited', { s: entry.server, pct: calc.pct })}</span>
            <strong>{fmt(calc.credited)}</strong>
          </div>
        </div>
      ) : (
        <p className="hint" style={{ marginTop: 10 }}>
          {t('dist.enterAmount')}
        </p>
      )}

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('c.cancel')}
        </button>
        <button className="btn warn" disabled={!valid} onClick={() => void submit()}>
          {t('ali.credit')}
        </button>
      </div>
    </Sheet>
  );
}
