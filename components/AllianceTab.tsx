'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Sheet from './Sheet';
import ServerPicker from './ServerPicker';
import type { AllianceGroup, AllianceState } from '@/lib/types';
import { api, calcAlliance, fmt, getStoredEmail, prepPhoto } from '@/lib/client';
import type { ApiResult } from '@/lib/client';
import { useT } from '@/lib/i18n';
import ShareBtn from './ShareBtn';

/**
 * 연합 정산 — 혈맹 내부 분배와 완전히 분리된 장부다.
 *
 * v10.3 부터 혈맹 아이템과 **같은 순서**로 두 단계다:
 *   ① 등록 — 아이템명 + 참여 서버별 인원 + 인증샷(선택, 여러 장)
 *   ② 정산 — 나중에 판매금액을 넣으면 혈비를 떼고 인원수 비례로 서버에 나눈다
 * 레이드 직후엔 아직 안 팔려서 금액을 모르는 것이 정상이다. 그때 금액을
 * 요구하면 등록 자체가 미뤄지고, 그 사이에 인증샷을 잃어버린다.
 *
 * v11.0 부터 **아이템 하나 = 여러 서버**다. 시트에는 서버마다 한 줄이지만
 * 같은 '묶음' 값으로 이어져 있고, 화면은 언제나 묶음(=아이템) 단위로 보여준다.
 *
 * · 인증샷은 "몇 명인지"만 센다. 누가 찍혔는지는 판별하지 않는다
 *   (연합 인원은 우리 멤버DB에 없으므로 이름을 맞출 근거가 없다).
 * · 잔액현황에서 손대는 것은 **혈맹운영비 한 계정뿐**이다 (혈비 10% + 원단위 잔여).
 *   개인 잔액은 어느 단계에서도 건드리지 않는다.
 */
export default function AllianceTab({
  admin,
  fundName,
  toast,
  setBusy,
  onWrote,
}: {
  admin: boolean;
  /** 혈맹운영비 계정 이름 — 미리보기에서 어디로 가는 돈인지 밝힌다 */
  fundName: string;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
  /** 혈맹운영비 잔액이 바뀌므로 잔액 탭도 함께 갱신한다 */
  onWrote?: (res?: ApiResult) => void;
}) {
  const { t, unit, srv } = useT();
  const [data, setData] = useState<AllianceState | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [crediting, setCrediting] = useState<AllianceGroup | null>(null);
  const [detail, setDetail] = useState<AllianceGroup | null>(null);

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

  async function remove(group: string) {
    setBusy(true);
    const res = await api('/api/admin/alliance', { group, email: getStoredEmail() }, 'DELETE');
    setBusy(false);
    toast(srv(res, res.ok ? 'r.deleted' : 'r.deleteFailed'), !res.ok);
    if (res.ok) {
      void load(true);
      onWrote?.(res);
    }
  }

  const u = unit(data?.unit ?? '다이아');
  const grand = (data?.totals ?? []).reduce((a, b) => a + b.credited, 0);
  const waiting = data?.waiting ?? [];
  const done = data?.records ?? [];
  // 인원이 실제로 있는 서버 — 서버 칩을 접는 기준 (12개를 매번 다 보여줄 필요는 없다)
  const inUse = (data?.totals ?? []).filter((s) => s.people > 0).map((s) => s.server);

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

  /** 묶음 한 건을 한 줄로 — 서버 배지를 참여 순서대로 늘어놓는다 */
  const groupLine = (g: AllianceGroup) => (
    <button type="button" className="row-name linkish" onClick={() => setDetail(g)}>
      {g.servers.map((s) => (
        <span className="svr" key={s.server}>
          {s.server}
        </span>
      ))}
      {g.item}
    </button>
  );

  return (
    <div className="page">
      <div className="sect-row">
        <div className="sect">🤝 {t('ali.title')}</div>
        <ShareBtn
          title={t('tab.alliance')}
          build={() =>
            [
              `🤝 ${t('ali.title')} — ${t('c.total')} ${fmt(grand)} ${u}`,
              ...(data?.totals ?? []).map(
                (s) => `· ${t('ali.serverN', { s: s.server })}  ${fmt(s.credited)} ${u} (${t('c.cases', { n: s.count })})`,
              ),
            ].join('\n')
          }
          toast={toast}
        />
      </div>

      {admin ? (
        <button className="btn block" onClick={() => setAdding(true)}>
          🤝 {t('ali.register')}
        </button>
      ) : null}

      {/* ① 등록만 된 건 — 금액을 넣으면 서버에 나뉜다 */}
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
          waiting.map((g) => (
            <div className="row" key={g.group}>
              <div className="row-main">
                {groupLine(g)}
                <div className="row-sub">
                  {g.date} · {t('c.people')} {g.people}
                  {g.photos.length > 0 ? ` · ${t('ali.photoN', { n: g.photos.length })}` : ''}
                </div>
              </div>
              {admin ? (
                <>
                  <button className="btn warn" onClick={() => setCrediting(g)}>
                    {t('ali.credit')}
                  </button>
                  <button className="btn ghost" onClick={() => void remove(g.group)}>
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
          done.map((g) => (
            <div className="row" key={g.group}>
              <div className="row-main">
                {groupLine(g)}
                <div className="row-sub">
                  {g.date} · {fmt(g.amount)} · {t('c.people')} {g.people}
                </div>
              </div>
              <div className="row-amt">{fmt(g.credited)}</div>
              {admin ? (
                <button className="btn ghost" onClick={() => void remove(g.group)}>
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
          inUse={inUse}
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
          fundName={fundName}
          onClose={() => setCrediting(null)}
          onDone={(res) => {
            setCrediting(null);
            void load(true);
            onWrote?.(res);
          }}
          toast={toast}
          setBusy={setBusy}
        />
      ) : null}

      {detail ? (
        <DetailSheet entry={detail} unit={u} fundName={fundName} onClose={() => setDetail(null)} />
      ) : null}
    </div>
  );
}

/** 등록·정산에 쓰는 서버별 인원 한 줄 */
type Entry = { server: string; people: string };

/** ① 등록 — 아이템명 · 서버별 인원 · 인증샷(선택, 여러 장). 금액은 받지 않는다. */
function RegisterSheet({
  servers,
  inUse,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  servers: string[];
  inUse: string[];
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, srv } = useT();
  const [item, setItem] = useState('');
  const [rows, setRows] = useState<Entry[]>([{ server: servers[0] ?? '01', people: '0' }]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoMsg, setPhotoMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const chosen = rows.map((r) => r.server).filter(Boolean);
  const dup = new Set(chosen).size !== chosen.length;
  const valid = Boolean(item.trim()) && chosen.length > 0 && !dup;

  function setRow(i: number, next: Partial<Entry>) {
    setRows((cur) => cur.map((r, k) => (k === i ? { ...r, ...next } : r)));
  }

  function addRow() {
    // 아직 안 고른 서버를 기본값으로 — 중복을 애초에 만들지 않는다
    const free = servers.find((s) => !chosen.includes(s)) ?? '';
    setRows((cur) => [...cur, { server: free, people: '0' }]);
  }

  async function pickPhoto(file: File) {
    setBusy(true);
    setPhotoMsg('');
    // 원본을 그대로 보내면 요청이 비대해지고 OCR 도 더 못 읽는다
    // 여기는 인원수만 센다 — 이름을 읽지 않으므로 강한 보정이 유리하다
    const jpeg = await prepPhoto(file, 'count');
    if (!jpeg) {
      setBusy(false);
      toast(t('items.formatFailed'), true);
      return;
    }
    const res = await api('/api/admin/alliance-photo', { base64: jpeg.split(',')[1] ?? '' });
    setBusy(false);
    if (!res.ok) {
      toast(srv(res, 'ali.photoFailed'), true);
      return;
    }
    const url = String(res.photoUrl ?? '');
    if (url) setPhotos((cur) => (cur.includes(url) ? cur : [...cur, url]));
    // 읽어낸 인원수는 **지금 편집 중인 첫 줄**에만 넣어준다. 어느 서버의 사진인지는
    // 시스템이 알 수 없으므로, 여러 줄에 자동으로 흩뿌리면 오히려 틀린 값이 박힌다.
    const n = Number(res.people ?? 0);
    if (n > 0) setRow(0, { people: String(n) });
    setPhotoMsg(srv(res));
  }

  async function submit() {
    if (!valid) return;
    setBusy(true);
    const res = await api('/api/admin/alliance', {
      op: 'register',
      item: item.trim(),
      entries: rows
        .filter((r) => r.server)
        .map((r) => ({ server: r.server, people: Number(r.people) || 0 })),
      photoLinks: photos,
      email: getStoredEmail(),
    });
    setBusy(false);
    toast(srv(res, res.ok ? 'r.registered' : 'r.registerFailed'), !res.ok);
    if (res.ok) onDone(res);
  }

  const total = rows.reduce((a, r) => a + (Number(r.people) || 0), 0);

  return (
    <Sheet title={`🤝 ${t('ali.register')}`} subtitle={t('ali.registerSub')} onClose={onClose}>
      <label className="fl" htmlFor="ait">
        {t('c.itemName')}
      </label>
      <input id="ait" type="text" maxLength={40} value={item} onChange={(e) => setItem(e.target.value)} />

      <label className="fl" style={{ marginTop: 12 }}>
        {t('ali.serversLabel')} — {t('c.total')} {total}
      </label>
      {rows.map((r, i) => (
        <div className="ali-entry" key={i}>
          <ServerPicker
            servers={servers}
            value={r.server}
            allowNone={false}
            inUse={inUse}
            onChange={(next) => setRow(i, { server: next })}
          />
          <div className="ali-entry-foot">
            <input
              type="text"
              inputMode="numeric"
              aria-label={t('c.people')}
              value={r.people}
              onChange={(e) => setRow(i, { people: e.target.value.replace(/[^0-9]/g, '') })}
            />
            <span className="hint">{t('c.people')}</span>
            {rows.length > 1 ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() => setRows((cur) => cur.filter((_, k) => k !== i))}
              >
                {t('ali.remove')}
              </button>
            ) : null}
          </div>
        </div>
      ))}
      {rows.length < servers.length ? (
        <button type="button" className="btn ghost block" style={{ marginTop: 8 }} onClick={addRow}>
          {t('ali.addServer')}
        </button>
      ) : null}
      {dup ? <p className="hint err">{t('ali.dupServer')}</p> : null}

      <label className="fl" style={{ marginTop: 12 }}>
        {t('ali.photosLabel')}
      </label>
      <button className="btn ghost block" onClick={() => fileRef.current?.click()}>
        {t('ali.photoAdd')}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          e.target.value = '';
          void (async () => {
            for (const f of list) await pickPhoto(f);
          })();
        }}
      />
      {photos.length > 0 ? (
        <div className="ali-photos">
          {photos.map((url, i) => (
            <span className="badge" key={url}>
              📷 {i + 1}
              <button
                type="button"
                className="x"
                aria-label={t('ali.remove')}
                onClick={() => setPhotos((cur) => cur.filter((u) => u !== url))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {photoMsg ? <p className="hint">{photoMsg}</p> : null}
      <p className="hint">{t('ali.photoOptional')}</p>

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

/**
 * ② 정산 — 등록해둔 묶음에 판매금액을 넣는다.
 *
 * 미리보기 숫자는 `calcAlliance` 로 만든다. 시트의 `_calcAlliance` 와 같은 산식이며,
 * `npm run verify:gs` 가 무작위 대조로 한 다이아도 어긋나지 않는지 확인한다 (규칙 1).
 */
function CreditSheet({
  entry,
  unit,
  fundName,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  entry: AllianceGroup;
  unit: string;
  fundName: string;
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, srv } = useT();
  const [raw, setRaw] = useState('');

  const amount = Number(raw.replace(/[,\s]/g, ''));
  const valid = Number.isInteger(amount) && amount > 0;
  const calc = valid ? calcAlliance(amount, entry.servers.map((s) => s.people), 0.1) : null;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    const res = await api('/api/admin/alliance', {
      op: 'credit',
      group: entry.group,
      amount,
      email: getStoredEmail(),
    });
    setBusy(false);
    toast(srv(res, res.ok ? 'r.done' : 'r.failed'), !res.ok);
    if (res.ok) onDone(res);
  }

  return (
    <Sheet
      title={`🤝 ${entry.item}`}
      subtitle={t('ali.creditSub', { sv: entry.servers.length, n: entry.people })}
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

      {calc ? (
        <div className="calc">
          <div className="calc-line">
            <span>💎 {t('c.amount')}</span>
            <strong>
              {fmt(calc.amount)} {unit}
            </strong>
          </div>
          <div className="calc-line">
            <span>{t('ali.fundShare', { fund: fundName })}</span>
            <strong>{fmt(calc.fundTotal)}</strong>
          </div>
          {entry.servers.map((s, i) => (
            <div className="calc-line" key={s.server}>
              <span>{t('ali.serverLine', { s: s.server, n: s.people })}</span>
              <strong>{fmt(calc.shares[i] ?? 0)}</strong>
            </div>
          ))}
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

/** 아이템명을 누르면 열린다 — 어느 서버가 몇 명 참여했고 얼마를 받았는지 */
function DetailSheet({
  entry,
  unit,
  fundName,
  onClose,
}: {
  entry: AllianceGroup;
  unit: string;
  fundName: string;
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <Sheet
      title={`🤝 ${entry.item}`}
      subtitle={t('ali.creditSub', { sv: entry.servers.length, n: entry.people })}
      onClose={onClose}
    >
      {entry.servers.map((s) => (
        <div className="row" key={s.server}>
          <div className="row-main">
            <div className="row-name">
              <span className="svr">{s.server}</span>
              {t('ali.serverN', { s: s.server })}
            </div>
            <div className="row-sub">
              {t('c.people')} {s.people}
            </div>
          </div>
          <div className="row-amt">{entry.done ? `${fmt(s.credited)} ${unit}` : '—'}</div>
        </div>
      ))}
      {entry.done ? (
        <div className="row">
          <div className="row-main">
            <div className="row-name">{t('ali.fundShare', { fund: fundName })}</div>
          </div>
          <div className="row-amt">
            {fmt(entry.fund)} {unit}
          </div>
        </div>
      ) : null}

      {entry.photos.length > 0 ? (
        <div className="ali-photos" style={{ marginTop: 12 }}>
          {entry.photos.map((url, i) => (
            <a className="badge" key={url} href={url} target="_blank" rel="noreferrer">
              📷 {i + 1}
            </a>
          ))}
        </div>
      ) : null}

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('c.close')}
        </button>
      </div>
    </Sheet>
  );
}
