'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Sheet from './Sheet';
import ServerPicker from './ServerPicker';
import ServerFilter from './ServerFilter';
import PhotoStrip from './PhotoStrip';
import ItemName from './ItemName';
import ItemNameInput from './ItemNameInput';
import LootFields, { EMPTY_LOOT, type Loot } from './LootFields';
import LootEditSheet from './LootEditSheet';
import type { AllianceGroup, AllianceState } from '@/lib/types';
import { api, calcAlliance, fmt, getStoredEmail, prepPhoto } from '@/lib/client';
import { termDisplay, useTerms } from '@/lib/terms';
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
  members,
  toast,
  setBusy,
  onWrote,
}: {
  admin: boolean;
  /** 마스터관리자만 등록된 항목을 고칠 수 있다 */
  master: boolean;
  /** 혈맹운영비 계정 이름 — 미리보기에서 어디로 가는 돈인지 밝힌다 */
  fundName: string;
  /** 루팅캐릭터 제안용 (v11.6) — 명단에 없는 이름도 칠 수 있다 */
  members: string[];
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
  /** 혈맹운영비 잔액이 바뀌므로 잔액 탭도 함께 갱신한다 */
  onWrote?: (res?: ApiResult) => void;
}) {
  const { t, unit, srv, lang } = useT();
  const { terms } = useTerms();
  const [data, setData] = useState<AllianceState | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [crediting, setCrediting] = useState<AllianceGroup | null>(null);
  const [editing, setEditing] = useState<AllianceGroup | null>(null);
  const [addingSv, setAddingSv] = useState<AllianceGroup | null>(null);
  const [detail, setDetail] = useState<AllianceGroup | null>(null);
  /** 서버로 좁혀 보기 (v11.5) — 잔액·아이템 화면과 같은 칩 */
  const [svPick, setSvPick] = useState<string[]>([]);
  /** 레이드일·보스·루팅 고치기 (v11.6) — 관리자 이상 */
  const [metaOf, setMetaOf] = useState<AllianceGroup | null>(null);

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
  const allWaiting = data?.waiting ?? [];
  const allDone = data?.records ?? [];

  /**
   * 서버로 좁혀 보기 (v11.5) — 잔액·아이템 화면과 **같은 칩 한 벌**을 쓴다.
   *
   * ★ 한 건이 여러 서버에 걸쳐 있으므로, 고른 서버가 **하나라도** 들어 있으면 남긴다.
   *   교집합으로 하면 3서버 건은 세 칩을 모두 골라야 보여 아무도 못 찾는다.
   * ★ 아무것도 안 고르면 전원이다 (다른 화면과 같은 규칙).
   */
  const inPick = (g: AllianceGroup) =>
    svPick.length === 0 || g.servers.some((s) => svPick.includes(s.server));
  const waiting = allWaiting.filter(inPick);
  const done = allDone.filter(inPick);

  /**
   * 칩에 붙는 숫자 = 그 서버가 낀 **건수** (사람 수가 아니다).
   * 이 화면의 단위는 사람이 아니라 연합 건이므로, 인원을 세면 칩의 숫자와
   * 걸러진 목록의 길이가 어긋나 보인다.
   * ★ 거르기 전 목록으로 센다 — 걸러진 것으로 세면 고르는 순간 1이 된다.
   */
  const svCounts: Record<string, number> = {};
  [...allWaiting, ...allDone].forEach((g) => {
    new Set(g.servers.map((s) => s.server)).forEach((sv) => {
      svCounts[sv] = (svCounts[sv] ?? 0) + 1;
    });
  });
  // 인원이 실제로 있는 서버 — 서버 칩을 접는 기준 (12개를 매번 다 보여줄 필요는 없다).
  // 아직 정산 안 된 건도 "쓰는 서버" 다 — 누적이 0이라고 접어버리면 방금 넣은 서버가 숨는다
  // ★ 칩 목록은 **거르기 전** 자료로 만든다. 걸러진 목록으로 만들면
  //   서버 하나를 고르는 순간 나머지 칩이 사라져 되돌릴 길이 없어진다.
  const inUse = [
    ...new Set([
      ...(data?.totals ?? []).filter((s) => s.people > 0).map((s) => s.server),
      ...allWaiting.flatMap((g) => g.servers.map((s) => s.server)),
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
  allWaiting.forEach((g) =>
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

  /**
   * 묶음 한 건의 **윗줄** — 지금까지 아이템명 한 칸에 몰아 적던 그 순서 그대로다 (v11.6).
   *
   *   8/14 · 파푸리온 · [불변의 목걸이] · 01 · 차무식
   *   날짜   보스        아이템            루팅서버 루팅캐릭터
   *
   * ★ 순서는 **이 배열 하나**로 정한다. 화면 여기저기에 흩어 놓으면 순서를 바꿀 때
   *   한 곳만 고쳐져 목록마다 다른 순서로 보인다.
   * ★ 빈 칸은 건너뛴다 — 옛 기록은 아이템명만 나오고, 지금과 똑같이 보인다.
   * ★ 아이템명만 ItemName 으로 그린다 (등급 테두리·티어·아이콘이 붙는 자리다).
   *   나머지는 글자다 — 배지를 더 붙이면 한 줄이 배지로 뒤덮인다.
   */
  const groupLine = (g: AllianceGroup) => {
    // ★ 보스만 사전으로 번역한다 (v11.6). 날짜·서버번호·캐릭터명은 번역 대상이 아니다 —
    //   캐릭터명은 사람 이름이고, 사람 이름은 번역하지 않는다 (규칙 6-4).
    const before = [g.raid, termDisplay(terms, g.boss ?? '', lang)]
      .map((x) => String(x ?? '').trim()).filter(Boolean);
    const after = [g.lootSv, g.lootCh].map((x) => String(x ?? '').trim()).filter(Boolean);
    return (
      <button type="button" className="row-name linkish" onClick={() => setDetail(g)}>
        {before.map((v) => (
          <span className="lootpart" key={v}>
            {v}
          </span>
        ))}
        <ItemName name={g.item} />
        {after.map((v) => (
          <span className="lootpart" key={v}>
            {v}
          </span>
        ))}
      </button>
    );
  };

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

      {/* 서버로 좁혀 보기 — 잔액·아이템 화면과 같은 칩 한 벌 (v11.5) */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="field" style={{ paddingBottom: 0 }}>
          <label className="fl">{t('ali.filterServer')}</label>
          <ServerFilter
            servers={data?.serverList ?? []}
            counts={svCounts}
            noneCount={0}
            value={svPick}
            onChange={setSvPick}
          />
        </div>
      </div>

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
                    {/* 참여 서버는 아랫줄로 (v11.6) — 윗줄은 루팅 정보가 쓴다.
                        루팅서버와 참여서버가 같은 줄에 있으면 어느 쪽인지 알 수 없다 */}
                    {g.servers.map((sv) => (
                      <span className="svr" key={sv.server}>
                        {sv.server}
                      </span>
                    ))}
                    {g.date} · {t('c.people')} {g.people}
                    {g.photos.length > 0 ? ` · ${t('ali.photoN', { n: g.photos.length })}` : ''}
                  </button>
                </div>
                {!admin ? <span className="badge">{t('items.waiting')}</span> : null}
              </div>
              {admin ? (
                <div className="row-acts">
                  {/* ★ 아직 금액을 안 넣은 건은 **관리자도 고친다** (v11.3) —
                      다이아가 하나도 안 움직인 상태라 틀려도 고치면 그만이다.
                      정산된 건(아래 목록)은 그대로 마스터 전용이다. */}
                  <button className="btn ghost" onClick={() => setEditing(g)}>
                    {t('items.edit')}
                  </button>
                  <button className="btn ghost" onClick={() => setMetaOf(g)}>
                    🏷️ {t('loot.editTitle')}
                  </button>
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
                    {g.servers.map((sv) => (
                      <span className="svr" key={sv.server}>
                        {sv.server}
                      </span>
                    ))}
                    {g.date} · {fmt(g.amount)} · {t('c.people')} {g.people}
                    {g.photos.length > 0 ? ` · ${t('ali.photoN', { n: g.photos.length })}` : ''}
                  </button>
                </div>
                <div className="row-amt">{fmt(g.credited)}</div>
              </div>
              {admin ? (
                <div className="row-acts">
                  {/* 🏷️ 는 정산완료여도 관리자가 누를 수 있다 — 새 4칸은 돈을 안 움직인다 */}
                  <button className="btn ghost" onClick={() => setMetaOf(g)}>
                    🏷️ {t('loot.editTitle')}
                  </button>
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

      {metaOf && data ? (
        <LootEditSheet
          title={t('loot.editTitle')}
          source={metaOf.item}
          initial={{ item: metaOf.item, raid: metaOf.raid ?? '', boss: metaOf.boss ?? '', lootSv: metaOf.lootSv ?? '', lootCh: metaOf.lootCh ?? '' }}
          servers={data.serverList}
          members={members}
          target={{ kind: 'alliance', group: metaOf.group }}
          onClose={() => setMetaOf(null)}
          onDone={() => {
            setMetaOf(null);
            void load(true);
          }}
          toast={toast}
          setBusy={setBusy}
        />
      ) : null}

      {adding && data ? (
        <RegisterSheet
          servers={data.serverList}
          inUse={inUse}
          members={members}
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

/** 등록·정정에 쓰는 서버별 한 줄 — 인원과 **그 서버의 인증샷**을 함께 든다 (v11.3) */
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
  /** 이 줄에 새로 붙인 인증샷 — 그 서버의 사진이다 (v11.3) */
  photos: string[];
  /** 사진마다 몇 명으로 읽었는지 — **제안**일 뿐, 넣는 것은 사람이 한다 */
  reads: number[];
  /** 이미 시트에 저장돼 있는 사진 (정정 화면에서 보여주기만 한다) */
  saved?: string[];
};

/** 새 줄 하나 — 어디서 만들든 같은 모양이어야 한다 */
function newRow(server: string): Entry {
  return { server, people: '0', photos: [], reads: [] };
}

/**
 * 서버별 인원 편집기 — **등록과 정정이 같은 화면을 쓴다.**
 * 두 벌로 만들면 한쪽만 고쳐져서 "등록에는 있는 버튼이 정정에는 없는" 상태가 된다.
 */
function ServerRows({
  servers,
  inUse,
  rows,
  setRows,
  toast,
  setBusy,
}: {
  servers: string[];
  inUse: string[];
  rows: Entry[];
  setRows: (fn: (cur: Entry[]) => Entry[]) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
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
          {/* ★ 인증샷은 **이 서버의 것**이다 (v11.3) — 어느 서버 사진인지 사람이 고른다 */}
          <RowPhoto row={r} onChange={(next) => setRow(i, next)} toast={toast} setBusy={setBusy} />
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
              newRow(servers.find((sv) => !cur.some((c) => c.server === sv)) ?? ''),
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

/** 화면의 서버 줄 → 서버로 보낼 모양 (사진은 **새로 붙인 것만** 보낸다 — 시트가 잇는다) */
function toEntries(rows: Entry[]) {
  return rows
    .filter((r) => r.server)
    .map((r) => ({ server: r.server, people: Number(r.people) || 0, photos: r.photos }));
}

/**
 * 서버 줄 하나의 인증샷 (v11.3) — **등록·[＋]·정정이 같은 규칙을 쓴다.**
 *
 * ★ 예전에는 사진을 묶음 전체에 붙였다. 그래서 3서버 건에 사진 3장을 올려도
 *   어느 서버 것인지 알 수 없었고, 읽어낸 인원수를 어느 줄에 넣을지도 알 수 없어
 *   첫 줄에 넣다가 13·8·8 을 8·8·8 로 덮어쓴 사고까지 났다 (v11.0).
 *   이제 사진은 **줄마다** 붙으므로 읽은 인원수도 **그 줄에만** 채운다.
 * ★ 그래도 사람이 직접 고친 값(touched)은 절대 덮어쓰지 않는다 — 읽어낸 값은
 *   제안이지 정답이 아니다 (규칙 7).
 */
function RowPhoto({
  row,
  onChange,
  toast,
  setBusy,
}: {
  row: Entry;
  onChange: (next: Partial<Entry>) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, srv } = useT();
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File) {
    setBusy(true);
    // 원본을 그대로 보내면 요청이 비대해지고 OCR 도 더 못 읽는다.
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
    const n = Number(res.people ?? 0);

    onChange({
      photos: url && !row.photos.includes(url) ? [...row.photos, url] : row.photos,
      reads: n > 0 ? [...row.reads, n] : row.reads,
      // 아직 사람이 손대지 않은 줄에만 채운다 (0/빈칸일 때)
      people: n > 0 && !row.touched && (row.people === '' || row.people === '0') ? String(n) : row.people,
    });
    setMsg(srv(res));
  }

  const saved = row.saved ?? [];

  return (
    <div className="ali-row-photo">
      <button type="button" className="btn ghost block" onClick={() => fileRef.current?.click()}>
        {t('ali.photoAddServer', { s: row.server || '—' })}
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
            for (const f of list) await pick(f);
          })();
        }}
      />
      {saved.length > 0 ? (
        <>
          <p className="hint">{t('ali.photoSaved', { n: saved.length })}</p>
          <PhotoStrip urls={saved} />
        </>
      ) : null}
      {row.photos.length > 0 ? <PhotoStrip urls={row.photos} /> : null}
      {/* 사진마다 몇 명으로 읽었는지 보여준다 — 넣는 것은 사람이 한다 */}
      {row.reads.length > 0 ? (
        <p className="hint">{row.reads.map((n, i) => t('ali.photoRead', { i: i + 1, n })).join(' · ')}</p>
      ) : null}
      {msg ? <p className="hint">{msg}</p> : null}
    </div>
  );
}

/** ① 등록 — 아이템명 · 서버별 인원 · 인증샷(선택, 여러 장). 금액은 받지 않는다. */
function RegisterSheet({
  servers,
  inUse,
  members,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  servers: string[];
  inUse: string[];
  /** 루팅캐릭터 제안용 — 명단에 없는 이름도 칠 수 있다 */
  members: string[];
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, srv } = useT();
  const [item, setItem] = useState('');
  const [loot, setLoot] = useState<Loot>(EMPTY_LOOT);
  const [rows, setRows] = useState<Entry[]>([newRow(servers[0] ?? '01')]);

  const valid = Boolean(item.trim()) && rowsValid(rows);

  async function submit() {
    if (!valid) return;
    setBusy(true);
    const res = await api('/api/admin/alliance', {
      op: 'register',
      item: item.trim(),
      entries: toEntries(rows),
      meta: loot,
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
      {/* 용어 사전 자동완성 (v11.4) — 中文으로 쳐도 찾아지고, 저장은 국문이다 */}
      <ItemNameInput id="ait" value={item} onChange={setItem} />

      <LootFields value={loot} onChange={setLoot} servers={servers} members={members} idPrefix="areg" />

      <ServerRows
        servers={servers}
        inUse={inUse}
        rows={rows}
        setRows={setRows}
        toast={toast}
        setBusy={setBusy}
      />

      <p className="hint" style={{ marginTop: 10 }}>
        {t('ali.photoOptional')}
      </p>
      <p className="hint">{t('ali.registerHint')}</p>

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
  const [rows, setRows] = useState<Entry[]>([newRow(free[0] ?? '')]);

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
        <ServerRows
          servers={free}
          inUse={inUse.filter((sv) => free.includes(sv))}
          rows={rows}
          setRows={setRows}
          toast={toast}
          setBusy={setBusy}
        />
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
    // 이미 저장된 사진은 `saved` 로 보여주기만 한다 — 정정에서 지우는 길은 두지 않는다
    entry.servers.map((s) => ({
      server: s.server,
      people: String(s.people),
      photos: [],
      reads: [],
      saved: s.photos ?? [],
    })),
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
    /*
     * ★ 아직 금액을 안 넣은 건은 **관리자 경로**로 보낸다 (v11.3).
     *   돈이 하나도 안 움직이는 수정이라 관리자에게 열어둔 길이다.
     *   정산된 건은 마스터 경로로만 간다 — 혈맹운영비 잔액이 실제로 움직인다.
     *   어느 쪽이든 "정산된 건인가"는 **시트가** 다시 판정한다.
     */
    const res = entry.done
      ? await api('/api/master/alliance', {
          group: entry.group,
          item: item.trim(),
          entries: toEntries(rows),
          amount,
          email: getStoredEmail(),
          confirm,
        })
      : await api('/api/admin/alliance', {
          op: 'edit',
          group: entry.group,
          item: item.trim(),
          entries: toEntries(rows),
          email: getStoredEmail(),
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
      <ItemNameInput id="eai" value={item} onChange={setItem} />

      <ServerRows
        servers={servers}
        inUse={inUse}
        rows={rows}
        setRows={setRows}
        toast={toast}
        setBusy={setBusy}
      />

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
      {/* ★ 인증샷은 **서버마다 그 서버의 것**을 보여준다 (v11.3) —
          한데 모아 두면 어느 서버의 증거인지 알 수 없다 */}
      {entry.servers.map((s) => (
        <div key={s.server}>
          <div className="row">
            <div className="row-main">
              <div className="row-name">
                <span className="svr">{s.server}</span>
                {t('ali.serverN', { s: s.server })}
              </div>
              <div className="row-sub">
                {t('c.people')} {s.people}
                {(s.photos ?? []).length > 0 ? ` · ${t('ali.photoN', { n: (s.photos ?? []).length })}` : ''}
              </div>
            </div>
            <div className="row-amt">{entry.done ? `${fmt(s.credited)} ${unit}` : '—'}</div>
          </div>
          {(s.photos ?? []).length > 0 ? (
            <div className="ali-row-photo">
              <PhotoStrip urls={s.photos ?? []} />
            </div>
          ) : null}
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

      {/* 묶음 전체 인증샷 — 서버별로 나뉘기 전(v11.2 이하)에 붙인 사진이 여기 남는다.
          위에서 이미 보여준 것은 빼고, 남은 것만 보여준다 */}
      {(() => {
        const perServer = new Set(entry.servers.flatMap((s) => s.photos ?? []));
        const rest = entry.photos.filter((u) => !perServer.has(u));
        if (rest.length === 0 && perServer.size > 0) return null;
        return (
          <>
            <div className="fl" style={{ marginTop: 14 }}>
              {t('shot.sect')} {rest.length > 0 ? `(${rest.length})` : ''}
            </div>
            {rest.length > 0 ? <PhotoStrip urls={rest} /> : <p className="hint">{t('shot.none')}</p>}
          </>
        );
      })()}

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('c.close')}
        </button>
      </div>
    </Sheet>
  );
}
