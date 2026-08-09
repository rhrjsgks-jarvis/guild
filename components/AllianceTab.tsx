'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Sheet from './Sheet';
import ServerPicker from './ServerPicker';
import PhotoStrip from './PhotoStrip';
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
 * v11.1 부터 마스터관리자는 **등록한 것도 정산한 것도** 고칠 수 있다
 * (아이템명 · 서버별 인원 · 판매금액). 정산된 건을 고치면 혈맹운영비 적립액이
 * 함께 조정되므로, 바뀔 숫자를 보여준 뒤에만 실행한다 (규칙 5).
 *
 * · 인증샷은 "몇 명인지"만 센다. 누가 찍혔는지는 판별하지 않는다
 *   (연합 인원은 우리 멤버DB에 없으므로 이름을 맞출 근거가 없다).
 * · 잔액현황에서 손대는 것은 **혈맹운영비 한 계정뿐**이다 (혈비 10% + 원단위 잔여).
 *   개인 잔액은 어느 단계에서도 건드리지 않는다.
 */
export default function AllianceTab({
  admin,
  master,
  fundName,
  toast,
  setBusy,
  onWrote,
}: {
  admin: boolean;
  /** 마스터관리자만 등록된 항목을 고칠 수 있다 */
  master: boolean;
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
  const [editing, setEditing] = useState<AllianceGroup | null>(null);
  const [addingSv, setAddingSv] = useState<AllianceGroup | null>(null);
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
  // 인원이 실제로 있는 서버 — 서버 칩을 접는 기준 (12개를 매번 다 보여줄 필요는 없다).
  // 아직 정산 안 된 건도 "쓰는 서버" 다 — 누적이 0이라고 접어버리면 방금 넣은 서버가 숨는다
  const inUse = [
    ...new Set([
      ...(data?.totals ?? []).filter((s) => s.people > 0).map((s) => s.server),
      ...waiting.flatMap((g) => g.servers.map((s) => s.server)),
    ]),
  ];

  /**
   * 서버별 "아직 금액이 안 정해진" 인원.
   *
   * 누적(totals)에는 정산된 건만 들어간다 — 0원짜리가 건수만 부풀리면 안 되기 때문이다.
   * 그런데 방금 8명을 넣고 나서 `인원 0` 만 보이면 **입력이 안 된 줄 안다.**
   * 그래서 대기 인원을 따로 보여준다. 누적 금액에는 섞지 않는다.
   */
  const pending = new Map<string, { people: number; count: number }>();
  waiting.forEach((g) =>
    g.servers.forEach((s) => {
      const cur = pending.get(s.server) ?? { people: 0, count: 0 };
      pending.set(s.server, { people: cur.people + s.people, count: cur.count + 1 });
    }),
  );

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
            // 버튼이 셋 넘게 붙는 줄이라 이름과 나란히 두면 이름이 잘린다.
            // 잘린 이름은 다른 아이템으로 오인되므로 버튼을 아랫줄로 내린다.
            <div className={'row' + (admin ? ' stack' : '')} key={g.group}>
              <div className="row-top">
                <div className="row-main">
                  {groupLine(g)}
                  <button type="button" className="row-sub linkish" onClick={() => setDetail(g)}>
                    {g.date} · {t('c.people')} {g.people}
                    {g.photos.length > 0 ? ` · ${t('ali.photoN', { n: g.photos.length })}` : ''}
                  </button>
                </div>
                {!admin ? <span className="badge">{t('items.waiting')}</span> : null}
              </div>
              {admin ? (
                <div className="row-acts">
                  {master ? (
                    <button className="btn ghost" onClick={() => setEditing(g)}>
                      {t('items.edit')}
                    </button>
                  ) : null}
                  {/* 레이드 뒤에 "우리 서버도 갔었다" 는 이야기가 늦게 온다.
                      그때마다 마스터를 부르면 등록이 미뤄지므로 관리자에게 연다.
                      더하기만 되고 이미 있는 줄은 못 고친다 (서버가 막는다). */}
                  <button
                    className="btn ghost"
                    aria-label={t('ali.addSv')}
                    title={t('ali.addSv')}
                    onClick={() => setAddingSv(g)}
                  >
                    ＋
                  </button>
                  <button className="btn warn" onClick={() => setCrediting(g)}>
                    {t('ali.credit')}
                  </button>
                  <button className="btn ghost" onClick={() => void remove(g.group)}>
                    {t('c.delete')}
                  </button>
                </div>
              ) : null}
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
        ) : data.totals.every(
            (s) => s.count === 0 && s.people === 0 && !(pending.get(s.server)?.people ?? 0),
          ) ? (
          <div className="empty">{t('ali.empty')}</div>
        ) : (
          data.totals
            // 아무 일도 없었던 서버는 접어둔다 — 12줄 중 열 줄이 0이면 읽을 것이 없다
            .filter((s) => s.count > 0 || s.people > 0 || (pending.get(s.server)?.people ?? 0) > 0)
            .map((s) => {
              const w = pending.get(s.server);
              return (
                <div className="row" key={s.server}>
                  <div className="row-main">
                    <div className="row-name">{t('ali.serverN', { s: s.server })}</div>
                    <div className="row-sub">
                      {t('c.cases', { n: s.count })} · {t('c.people')} {s.people}
                      {w ? ` · ${t('ali.pendingN', { n: w.people, k: w.count })}` : ''}
                    </div>
                  </div>
                  <div className="row-amt">
                    {fmt(s.credited)} {u}
                  </div>
                </div>
              );
            })
        )}
      </div>

      {/* ② 정산까지 끝난 건 — 마스터는 여기서도 고칠 수 있다 (금액 포함) */}
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
            <div className={'row' + (admin ? ' stack' : '')} key={g.group}>
              <div className="row-top">
                <div className="row-main">
                  {groupLine(g)}
                  <button type="button" className="row-sub linkish" onClick={() => setDetail(g)}>
                    {g.date} · {fmt(g.amount)} · {t('c.people')} {g.people}
                    {g.photos.length > 0 ? ` · ${t('ali.photoN', { n: g.photos.length })}` : ''}
                  </button>
                </div>
                <div className="row-amt">{fmt(g.credited)}</div>
              </div>
              {admin ? (
                <div className="row-acts">
                  {master ? (
                    <button className="btn ghost" onClick={() => setEditing(g)}>
                      {t('items.edit')}
                    </button>
                  ) : null}
                  <button className="btn ghost" onClick={() => void remove(g.group)}>
                    {t('c.delete')}
                  </button>
                </div>
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

      {editing && data ? (
        <EditSheet
          entry={editing}
          servers={data.serverList}
          inUse={inUse}
          unit={u}
          fundName={fundName}
          onClose={() => setEditing(null)}
          onDone={(res) => {
            setEditing(null);
            void load(true);
            onWrote?.(res);
          }}
          toast={toast}
          setBusy={setBusy}
        />
      ) : null}

      {addingSv && data ? (
        <AddServersSheet
          entry={addingSv}
          servers={data.serverList}
          inUse={inUse}
          onClose={() => setAddingSv(null)}
          onDone={() => {
            setAddingSv(null);
            void load(true);
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

/** 등록·정정에 쓰는 서버별 인원 한 줄 */
type Entry = {
  server: string;
  people: string;
  /**
   * 사람이 인원수를 직접 고쳤는가.
   *
   * ★ 이 표시가 있으면 사진 분석 결과가 **절대 덮어쓰지 않는다.**
   *   실제로 사진 3장을 붙이고 13·8·8 로 고쳐 넣었는데 마지막 사진이 읽은
   *   8 이 첫 줄을 덮어써 8·8·8 이 된 사고가 있었다 (v11.0).
   */
  touched?: boolean;
};

/**
 * 서버별 인원 편집기 — **등록과 정정이 같은 화면을 쓴다.**
 * 두 벌로 만들면 한쪽만 고쳐져서 "등록에는 있는 버튼이 정정에는 없는" 상태가 된다.
 */
function ServerRows({
  servers,
  inUse,
  rows,
  setRows,
}: {
  servers: string[];
  inUse: string[];
  rows: Entry[];
  setRows: (fn: (cur: Entry[]) => Entry[]) => void;
}) {
  const { t } = useT();
  const chosen = rows.map((r) => r.server).filter(Boolean);
  const dup = new Set(chosen).size !== chosen.length;
  const total = rows.reduce((a, r) => a + (Number(r.people) || 0), 0);

  const setRow = (i: number, next: Partial<Entry>) =>
    setRows((cur) => cur.map((r, k) => (k === i ? { ...r, ...next } : r)));

  return (
    <>
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
              onChange={(e) => setRow(i, { people: e.target.value.replace(/[^0-9]/g, ''), touched: true })}
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
        <button
          type="button"
          className="btn ghost block"
          style={{ marginTop: 8 }}
          onClick={() =>
            // 아직 안 고른 서버를 기본값으로 — 중복을 애초에 만들지 않는다
            setRows((cur) => [
              ...cur,
              { server: servers.find((sv) => !cur.some((c) => c.server === sv)) ?? '', people: '0' },
            ])
          }
        >
          {t('ali.addServer')}
        </button>
      ) : null}
      {dup ? <p className="hint err">{t('ali.dupServer')}</p> : null}
    </>
  );
}

/** 서버 줄이 쓸 만한가 — 등록·정정이 같은 기준을 쓴다 */
function rowsValid(rows: Entry[]): boolean {
  const chosen = rows.map((r) => r.server).filter(Boolean);
  return chosen.length > 0 && new Set(chosen).size === chosen.length;
}

/** 화면의 서버 줄 → 서버로 보낼 모양 */
function toEntries(rows: Entry[]) {
  return rows.filter((r) => r.server).map((r) => ({ server: r.server, people: Number(r.people) || 0 }));
}

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
  const [reads, setReads] = useState<number[]>([]);
  const [photoMsg, setPhotoMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const valid = Boolean(item.trim()) && rowsValid(rows);

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

    // ★ 읽어낸 인원수는 **제안**이지 정답이 아니다.
    //   어느 서버의 사진인지 시스템은 알 수 없고, 사진마다 인원도 다르다.
    //   그래서 자동으로 넣는 것은 "서버가 한 줄뿐이고 아직 아무도 손대지 않은"
    //   경우뿐이다. 그 밖에는 읽은 값을 **보여주기만** 하고 사람이 넣는다.
    //   (사진 3장을 붙이고 13·8·8 로 고쳐 넣었는데 마지막 사진의 8 이 첫 줄을
    //    덮어써 8·8·8 이 된 사고가 있었다 — v11.0)
    const n = Number(res.people ?? 0);
    if (n > 0) {
      setReads((cur) => [...cur, n]);
      setRows((cur) =>
        cur.length === 1 && !cur[0].touched && (cur[0].people === '' || cur[0].people === '0')
          ? [{ ...cur[0], people: String(n) }]
          : cur,
      );
    }
    setPhotoMsg(srv(res));
  }

  async function submit() {
    if (!valid) return;
    setBusy(true);
    const res = await api('/api/admin/alliance', {
      op: 'register',
      item: item.trim(),
      entries: toEntries(rows),
      photoLinks: photos,
      email: getStoredEmail(),
    });
    setBusy(false);
    toast(srv(res, res.ok ? 'r.registered' : 'r.registerFailed'), !res.ok);
    if (res.ok) onDone(res);
  }

  return (
    <Sheet title={`🤝 ${t('ali.register')}`} subtitle={t('ali.registerSub')} onClose={onClose}>
      <label className="fl" htmlFor="ait">
        {t('c.itemName')}
      </label>
      <input id="ait" type="text" maxLength={40} value={item} onChange={(e) => setItem(e.target.value)} />

      <ServerRows servers={servers} inUse={inUse} rows={rows} setRows={setRows} />

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
          setReads([]);
          void (async () => {
            for (const f of list) await pickPhoto(f);
          })();
        }}
      />
      {photos.length > 0 ? <PhotoStrip urls={photos} /> : null}
      {/* 사진마다 몇 명으로 읽었는지 보여준다 — 넣는 것은 사람이 한다 */}
      {reads.length > 0 ? (
        <p className="hint">
          {reads.map((n, i) => t('ali.photoRead', { i: i + 1, n })).join(' · ')}
          {rows.length > 1 ? ` — ${t('ali.photoManual')}` : ''}
        </p>
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

/**
 * ➕ 참여 서버 추가 (v11.1) — **관리자**도 할 수 있다.
 *
 * 이미 들어 있는 서버·인원은 보여주기만 하고 손대지 못한다. 값을 고치는 것은
 * 정정(마스터 전용)의 몫이고, 서버도 그렇게 막는다 — 화면을 고쳐도 뚫리지 않는다.
 */
function AddServersSheet({
  entry,
  servers,
  inUse,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  entry: AllianceGroup;
  servers: string[];
  inUse: string[];
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, srv } = useT();
  const have = entry.servers.map((s) => s.server);
  // 이미 들어 있는 서버는 고를 수 없다 — 두 줄이 되면 인원이 갈려 분배 비율이 틀어진다
  const free = servers.filter((sv) => !have.includes(sv));
  const [rows, setRows] = useState<Entry[]>([{ server: free[0] ?? '', people: '0' }]);

  const picked = rows.map((r) => r.server).filter(Boolean);
  const valid =
    rowsValid(rows) && picked.every((sv) => !have.includes(sv)) && free.length > 0;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    const res = await api('/api/admin/alliance', {
      op: 'addServers',
      group: entry.group,
      entries: toEntries(rows),
      email: getStoredEmail(),
    });
    setBusy(false);
    toast(srv(res, res.ok ? 'r.done' : 'r.failed'), !res.ok);
    if (res.ok) onDone(res);
  }

  return (
    <Sheet title={`＋ ${entry.item}`} subtitle={t('ali.addSvSub')} onClose={onClose}>
      <div className="fl">{t('ali.have')}</div>
      <div className="ali-photos">
        {entry.servers.map((s) => (
          <span className="badge" key={s.server}>
            {t('ali.serverLine', { s: s.server, n: s.people })}
          </span>
        ))}
      </div>

      {free.length === 0 ? (
        <p className="hint">{t('ali.allServers')}</p>
      ) : (
        <ServerRows servers={free} inUse={inUse.filter((sv) => free.includes(sv))} rows={rows} setRows={setRows} />
      )}

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('c.cancel')}
        </button>
        <button className="btn" disabled={!valid} onClick={() => void submit()}>
          {t('ali.addSv')}
        </button>
      </div>
    </Sheet>
  );
}

/**
 * ✏️ 정정 (v11.1) — 마스터관리자 전용. 아이템명 · 서버별 인원 · 판매금액.
 *
 * 정산까지 끝난 건도 고칠 수 있다. 그때는 서버별 몫이 다시 계산되고
 * 혈맹운영비 적립액도 **차액만큼** 조정된다. 돈이 움직이므로 바뀔 숫자를
 * 화면에 띄운 뒤에만 실행한다 — `confirm` 은 서버가 요구하고,
 * 앱이 임의로 채우지 않는다 (규칙 5-1).
 */
function EditSheet({
  entry,
  servers,
  inUse,
  unit,
  fundName,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  entry: AllianceGroup;
  servers: string[];
  inUse: string[];
  unit: string;
  fundName: string;
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, srv } = useT();
  const [item, setItem] = useState(entry.item);
  const [rows, setRows] = useState<Entry[]>(
    entry.servers.map((s) => ({ server: s.server, people: String(s.people) })),
  );
  const [raw, setRaw] = useState(entry.done ? String(entry.amount) : '');

  const amount = Number(raw.replace(/[,\s]/g, ''));
  const amountOk = !entry.done || (Number.isInteger(amount) && amount > 0);
  const valid = Boolean(item.trim()) && rowsValid(rows) && amountOk;

  // 정산된 건은 고치면 서버별 몫과 혈비가 함께 바뀐다 — 누르기 전에 보여준다
  const calc =
    entry.done && amountOk
      ? calcAlliance(amount, toEntries(rows).map((e) => e.people), 0.1)
      : null;

  async function submit(confirm: boolean) {
    if (!valid) return;
    setBusy(true);
    const res = await api('/api/master/alliance', {
      group: entry.group,
      item: item.trim(),
      entries: toEntries(rows),
      amount: entry.done ? amount : null,
      email: getStoredEmail(),
      confirm,
    });
    setBusy(false);

    // 서버가 되물으면 여기서 멈춘다. 숫자는 이미 화면에 떠 있다
    if (!res.ok && res.needsConfirm) {
      toast(srv(res), false);
      return;
    }
    toast(srv(res, res.ok ? 'r.done' : 'r.failed'), !res.ok);
    if (res.ok) onDone(res);
  }

  return (
    <Sheet
      title={`✏️ ${entry.item}`}
      subtitle={entry.done ? t('ali.editDoneSub', { fund: fundName }) : t('ali.editWaitSub')}
      onClose={onClose}
    >
      <label className="fl" htmlFor="eai">
        {t('c.itemName')}
      </label>
      <input id="eai" type="text" maxLength={40} value={item} onChange={(e) => setItem(e.target.value)} />

      <ServerRows servers={servers} inUse={inUse} rows={rows} setRows={setRows} />

      {entry.done ? (
        <>
          <label className="fl" htmlFor="eam" style={{ marginTop: 12 }}>
            {t('c.amount')} ({unit})
          </label>
          <input
            id="eam"
            type="text"
            inputMode="numeric"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </>
      ) : null}

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
            <strong>
              {fmt(entry.fund)} → {fmt(calc.fundTotal)}
            </strong>
          </div>
          {toEntries(rows).map((e, i) => (
            <div className="calc-line" key={e.server}>
              <span>{t('ali.serverLine', { s: e.server, n: e.people })}</span>
              <strong>{fmt(calc.shares[i] ?? 0)}</strong>
            </div>
          ))}
        </div>
      ) : null}

      {entry.done ? <p className="hint">{t('ali.editDoneHint', { fund: fundName })}</p> : null}

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('c.cancel')}
        </button>
        {/* 미분배 건은 돈이 안 움직이므로 바로 저장한다 */}
        <button
          className={entry.done ? 'btn warn' : 'btn'}
          disabled={!valid}
          onClick={() => void submit(entry.done)}
        >
          {t('c.save')}
        </button>
      </div>
    </Sheet>
  );
}

/** 아이템명을 누르면 열린다 — 어느 서버가 몇 명 참여했고 얼마를 받았는지 + 인증샷 */
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

      {/* 인증샷 — 앱 안에서 바로 본다. 새 탭으로 나가면 보던 자리를 잃는다 */}
      <div className="fl" style={{ marginTop: 14 }}>
        {t('shot.sect')} {entry.photos.length > 0 ? `(${entry.photos.length})` : ''}
      </div>
      {entry.photos.length > 0 ? (
        <PhotoStrip urls={entry.photos} />
      ) : (
        <p className="hint">{t('shot.none')}</p>
      )}

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('c.close')}
        </button>
      </div>
    </Sheet>
  );
}
