'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Sheet from './Sheet';
import type { AllianceState } from '@/lib/types';
import { api, calcAlliance, fmt, getStoredEmail } from '@/lib/client';
import { makeT, type Lang } from '@/lib/i18n';

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
  lang,
  toast,
  setBusy,
}: {
  admin: boolean;
  lang: Lang;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const t = makeT(lang);
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
    setError(res.msg ?? '연합 기록을 불러오지 못했습니다.');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(row: number) {
    setBusy(true);
    const res = await api('/api/admin/alliance', { row, email: getStoredEmail() }, 'DELETE');
    setBusy(false);
    toast(res.msg ?? (res.ok ? '삭제했습니다.' : '삭제하지 못했습니다.'), !res.ok);
    if (res.ok) void load();
  }

  const unit = data?.unit ?? '다이아';
  const grand = (data?.totals ?? []).reduce((a, b) => a + b.credited, 0);

  if (error) {
    return (
      <div className="page">
        <div className="sect">🤝 {t('alliance.title')}</div>
        <div className="card">
          <div className="field">
            <div className="note" style={{ whiteSpace: 'pre-wrap' }}>
              ⚠️ {error}
              {'\n\n'}
              구글시트 쪽 코드가 아직 v10.0 이 아니면 [연합] 기능이 없습니다. Apps Script 에 새
              코드를 붙여넣고 [배포 관리] → 새 버전으로 배포한 뒤 다시 열어주세요.
            </div>
            <button className="btn block" style={{ marginTop: 12 }} onClick={() => void load()}>
              {t('common.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="sect">🤝 {t('alliance.title')}</div>

      {admin ? (
        <button className="btn block" onClick={() => setAdding(true)}>
          ➕ {t('alliance.add')}
        </button>
      ) : null}

      <div className="sect" style={{ marginTop: 14 }}>
        📊 {t('alliance.byServer')} — {t('common.total')} {fmt(grand)} {unit}
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
                <div className="row-name">{s.server} 서버</div>
                <div className="row-sub">
                  {s.count}건 · {t('common.people')} {s.people}
                </div>
              </div>
              <div className="row-amt">
                {fmt(s.credited)} {unit}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="sect" style={{ marginTop: 14 }}>
        🧾 등록 내역
      </div>
      <div className="card">
        {!data ? (
          <div className="field">
            <div className="skeleton" style={{ width: '60%' }} />
          </div>
        ) : data.rows.length === 0 ? (
          <div className="empty">{t('alliance.empty')}</div>
        ) : (
          data.rows.map((r) => (
            <div className="row" key={r.row}>
              <div className="row-main">
                <div className="row-name">
                  [{r.server}] {r.item}
                </div>
                <div className="row-sub">
                  {r.date} · {fmt(r.amount)} × {r.pct}% · {t('common.people')} {r.people}
                </div>
              </div>
              <div className="row-amt">{fmt(r.credited)}</div>
              {admin ? (
                <button className="btn ghost" onClick={() => void remove(r.row)}>
                  {t('common.delete')}
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {adding && data ? (
        <AddSheet
          servers={data.serverList}
          unit={unit}
          lang={lang}
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
  lang,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  servers: string[];
  unit: string;
  lang: Lang;
  onClose: () => void;
  onDone: () => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const t = makeT(lang);
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
      toast(res.msg ?? '사진을 분석하지 못했습니다.', true);
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
    toast(res.msg ?? (res.ok ? '등록했습니다.' : '등록하지 못했습니다.'), !res.ok);
    if (res.ok) onDone();
  }

  return (
    <Sheet title={`🤝 ${t('alliance.add')}`} subtitle="인증샷은 인원수만 셉니다 (아이디 판별 없음)" onClose={onClose}>
      <label className="fl" htmlFor="asv">
        {t('common.server')}
      </label>
      <select id="asv" value={server} onChange={(e) => setServer(e.target.value)}>
        {servers.map((s) => (
          <option key={s} value={s}>
            {s} 서버
          </option>
        ))}
      </select>

      <label className="fl" htmlFor="ait" style={{ marginTop: 10 }}>
        {t('common.item')}
      </label>
      <input id="ait" type="text" maxLength={40} value={item} onChange={(e) => setItem(e.target.value)} />

      <label className="fl" htmlFor="aam" style={{ marginTop: 10 }}>
        {t('common.amount')} ({unit})
      </label>
      <input
        id="aam"
        type="text"
        inputMode="numeric"
        placeholder="예: 50000"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />

      <label className="fl" htmlFor="apc" style={{ marginTop: 10 }}>
        {t('common.ratio')} (%)
      </label>
      <select id="apc" value={pct} onChange={(e) => setPct(Number(e.target.value))}>
        {Array.from({ length: 100 }, (_, i) => 100 - i).map((n) => (
          <option key={n} value={n}>
            {n}%
          </option>
        ))}
      </select>

      <label className="fl" htmlFor="apl" style={{ marginTop: 10 }}>
        {t('common.people')}
      </label>
      <input
        id="apl"
        type="text"
        inputMode="numeric"
        value={people}
        onChange={(e) => setPeople(e.target.value.replace(/[^0-9]/g, ''))}
      />

      <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => fileRef.current?.click()}>
        📷 {t('alliance.photoCount')}
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
            <span>💎 {t('common.amount')}</span>
            <strong>
              {fmt(calc.amount)} {unit}
            </strong>
          </div>
          <div className="calc-line">
            <span>
              🎯 {server} 서버 × {calc.pct}%
            </span>
            <strong>{fmt(calc.credited)}</strong>
          </div>
        </div>
      ) : null}

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button className="btn" disabled={!valid} onClick={() => void submit()}>
          {t('alliance.add')}
        </button>
      </div>
    </Sheet>
  );
}
