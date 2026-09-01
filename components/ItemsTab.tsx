'use client';

import { useMemo, useState } from 'react';
import Glyph from './Glyph';
import IconText from './IconText';
import type { DoneItem, GuildState, LedgerItem } from '@/lib/types';
import {
  CHIP_NAME_PX,
  CHIP_SVR_PX,
  api,
  byName,
  calcSplit,
  classLabel,
  classOf,
  fitIn,
  fmt,
  getStoredEmail,
  groupShots,
  nameParts,
  personLabel,
  raidDate,
  serverOf,
  tally,
  weightsOf,
} from '@/lib/client';
import type { ApiResult } from '@/lib/client';
import { useT } from '@/lib/i18n';
import { termDisplay, useTerms } from '@/lib/terms';
import ItemName from './ItemName';
import ItemNameInput from './ItemNameInput';
import LootEditSheet from './LootEditSheet';
import LootFields, { EMPTY_LOOT, type Loot } from './LootFields';
import LedgerCard from './LedgerCard';
import ServerFilter, { NO_SERVER } from './ServerFilter';
import ClassFilter, { ANY_CLASS } from './ClassFilter';
import ShareBtn from './ShareBtn';
import Sheet from './Sheet';
import PhotoStrip from './PhotoStrip';
import ItemShots, { allShotUrls, newShotRow, toShotEntries, type ShotRow } from './ItemShots';

/** 분배완료 목록을 한 번에 몇 건까지 펼쳐 둘 것인가 — 나머지는 접는다(숨기지 않는다) */
const DONE_FOLD = 8;

export default function ItemsTab({
  state,
  admin,
  master,
  onDistribute,
  onDone,
  toast,
  setBusy,
}: {
  state: GuildState;
  admin: boolean;
  master: boolean;
  onDistribute: (item: LedgerItem) => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, unit, srv, lang } = useT();
  const { terms } = useTerms();
  const [itemName, setItemName] = useState('');
  const [photoLink, setPhotoLink] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /*
   * 인증샷 (v11.0 여러 장 → v11.7 **서버 줄마다**).
   *
   * 레이드 참여자가 한 화면에 다 안 들어가 서버 파티별로 나눠 찍는다. 예전에는
   * 그 사진들이 한 자루에 담겨서 어느 서버 파티의 증거인지 알 수 없었다 —
   * 연합에서 먼저 겪고 v11.3 에 고친 것과 같은 문제다.
   */
  const [shotRows, setShotRows] = useState<ShotRow[]>([newShotRow()]);
  /** 분배완료 목록을 다 펼칠 것인가 */
  const [showAllDone, setShowAllDone] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState<LedgerItem | null>(null);
  const [viewing, setViewing] = useState<LedgerItem | null>(null);
  const [svPick, setSvPick] = useState<string[]>([]);
  /** 클래스로 좁혀 보기 (v11.6.1) — 서버와 AND. 체크된 사람은 여기서도 안 숨는다 */
  const [clsPick, setClsPick] = useState<string>(ANY_CLASS);
  const [showRest, setShowRest] = useState(false);
  /** 레이드일·보스·루팅 (v11.6) — 연합 등록과 같은 한 벌 */
  const [loot, setLoot] = useState<Loot>(EMPTY_LOOT);
  /** 레이드일·보스·루팅 고치기 (v11.6) — 관리자 이상 */
  const [metaOf, setMetaOf] = useState<LedgerItem | null>(null);

  // 혈맹운영비 계정은 참여자가 될 수 없다
  const selectable = useMemo(
    // 이름순(ㄱ~ㅎ) — 시트 순서대로 두면 40개 칩에서 한 사람을 찾을 수가 없다 (v10.9.2)
    () => state.members.filter((m) => m !== state.fundName).sort((a, b) => byName(a, b)),
    [state.members, state.fundName],
  );

  // 이름 → 서버. 한 번만 만들어 두고 아래 세 곳에서 쓴다
  const svOf = useMemo(() => {
    const map = new Map<string, string>();
    selectable.forEach((m) => map.set(m, serverOf(state, m)));
    return map;
  }, [selectable, state]);

  const { counts, noneCount } = useMemo(() => {
    const c: Record<string, number> = {};
    let none = 0;
    svOf.forEach((sv) => {
      if (sv) c[sv] = (c[sv] ?? 0) + 1;
      else none += 1;
    });
    return { counts: c, noneCount: none };
  }, [svOf]);

  // 클래스별 인원 — 잔액·관리와 같은 세는 규칙 한 벌 (lib/client 의 tally)
  const { counts: clsCounts, none: clsNone } = useMemo(
    () => tally(selectable.map((m) => classOf(state, m))),
    [selectable, state],
  );

  /**
   * 보이는 사람 = 고른 서버의 사람 **∪ 이미 체크된 사람**.
   *
   * ★ 두 번째 항이 핵심이다. 사진에서 자동으로 찾아낸 참여자가 다른 서버에
   *   속해 있다는 이유로 화면에서 사라지면, 관리자는 그 사람이 빠진 줄 알고
   *   등록한다 — 실제로는 들어가 있으므로 확인 화면과 결과가 어긋난다.
   *   체크된 사람은 서버와 무관하게 언제나 보인다.
   */
  const visible = useMemo(() => {
    if (svPick.length === 0 && clsPick === ANY_CLASS) return selectable;
    return selectable.filter(
      (m) =>
        picked.has(m) ||
        ((svPick.length === 0 || svPick.includes(svOf.get(m) ?? NO_SERVER)) &&
          (clsPick === ANY_CLASS || classOf(state, m) === clsPick)),
    );
  }, [selectable, svPick, clsPick, svOf, picked, state]);

  // 접어둔 나머지 — 숨기지 않는다. 예외 상황에서 아무나 고를 수 있어야 한다
  const folded = useMemo(() => selectable.filter((m) => !visible.includes(m)), [selectable, visible]);
  const shown = showRest ? selectable : visible;

  function toggle(name: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // 전체 선택·해제는 **지금 보이는 사람**에게만 적용된다.
  // 서버로 좁혀 놓고 눌렀는데 안 보이는 사람까지 딸려 들어가면 좁힌 의미가 없다.
  function selectAll(on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      shown.forEach((m) => (on ? next.add(m) : next.delete(m)));
      return next;
    });
  }

  function resetForm() {
    setItemName('');
    setPhotoLink('');
    setPicked(new Set());
    setShotRows([newShotRow()]);
    setSvPick([]);
    setShowRest(false);
    setLoot(EMPTY_LOOT);
  }

  async function submit() {
    setConfirming(false);
    setBusy(true);
    // 업로드된 사진 + 손으로 붙여넣은 링크. 같은 URL 이 두 번 들어가지 않게 거른다
    const links: string[] = [];
    for (const u of [...allShotUrls(shotRows), photoLink.trim()]) {
      if (u && !links.includes(u)) links.push(u);
    }
    /*
     * 서버별 묶음 (v11.7) — 어느 서버 파티의 사진인지까지 함께 보낸다.
     * 손으로 붙여넣은 링크는 서버를 알 길이 없으므로 **미지정**으로 넣는다.
     * 평평한 photoLinks 도 계속 보낸다 — 시트가 아직 v11.6 이면 그쪽이 사진을 살린다.
     */
    const photoEntries = toShotEntries(shotRows);
    if (photoLink.trim()) photoEntries.push({ server: '', photos: [photoLink.trim()] });
    const res = await api('/api/admin/register', {
      itemName: itemName.trim(),
      participants: [...picked],
      photoLink: photoLink.trim(),
      photoLinks: links,
      photoEntries,
      meta: loot,
      email: getStoredEmail(),
    });
    setBusy(false);

    toast(srv(res, res.ok ? 'r.registered' : 'r.registerFailed'), !res.ok);
    if (res.ok) {
      resetForm();
      onDone(res);
    }
  }

  /**
   * 목록 한 줄의 **윗줄** — 연합 탭과 같은 순서다 (v11.6).
   *
   *   8/14 · 파푸리온 · [불변의 목걸이] · 01 · 차무식
   *   날짜   보스        아이템            루팅서버 루팅캐릭터
   *
   * ★ 미분배와 분배완료가 **같은 함수**를 쓴다. 두 곳에 흩어 놓으면 한쪽만 고쳐져
   *   같은 기록이 목록마다 다르게 보인다 (연합 탭의 groupLine 과 같은 이유).
   */
  const lootLine = (it: LedgerItem) => (
    <>
      {[raidDate(it.raid), termDisplay(terms, it.boss ?? '', lang)]
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
        .map((v) => (
          <span className="lootpart" key={v}>
            {v}
          </span>
        ))}
      <ItemName name={it.item} />
      {[it.lootSv, it.lootCh]
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
        .map((v) => (
          <span className="lootpart" key={v}>
            {v}
          </span>
        ))}
    </>
  );

  /*
   * 분배완료 — 최근 것이 위로 온다 (시트가 그 순서로 내려준다).
   *
   * ★ 옛 시트(v11.6 이하)는 이 값을 **아예 안 내려준다.** 그때 "분배한 아이템이
   *   없습니다" 라고 쓰면 거짓말이 된다 — 실제로는 못 읽은 것이다 (규칙 7).
   *   빈 배열과 못 받은 것을 구별해서, 후자는 시트를 올려야 한다고 말해준다.
   */
  const doneUnknown = state.done === undefined;
  const done = state.done ?? [];
  const shownDone = showAllDone ? done : done.slice(0, DONE_FOLD);

  const pickedList = [...picked];
  const canSubmit = itemName.trim().length > 0 && pickedList.length > 0;

  return (
    <div className="page">
      <div className="sect-row">
        <div className="sect"><IconText text={admin ? t('items.sectAdmin') : t('items.sect')} /></div>
        <ShareBtn
          title={t('tab.items')}
          build={() =>
            [
              `📦 ${t('items.sect')} (${t('c.cases', { n: state.items.length })})`,
              ...state.items.map((it) => `· ${it.item} — ${it.date} · ${t('c.persons', { n: it.cnt })}`),
            ].join('\n')
          }
          toast={toast}
        />
      </div>
      <div className="card">
        {state.items.length === 0 ? (
          <div className="empty">{t('items.empty')}</div>
        ) : (
          state.items.map((it) => (
            <div className="row" key={it.row}>
              <div className="row-main">
                {/* 아이템명을 누르면 참여자 명단과 인증샷이 열린다 (v11.1) */}
                {/* 연합 탭과 **같은 순서**로 (v11.6): 날짜 · 보스 · 아이템 · 루팅서버 · 루팅캐릭터.
                    두 화면이 다르게 보이면 같은 기록을 두 가지로 기억하게 된다 */}
                <button type="button" className="row-name linkish" onClick={() => setViewing(it)}>
                  {lootLine(it)}
                </button>
                <button type="button" className="row-sub linkish" onClick={() => setViewing(it)}>
                  {it.date} · {t('c.joined')} {t('c.persons', { n: it.cnt })}
                  {it.photos && it.photos.length > 0 ? (
                    <>
                      {' · '}
                      <IconText text={t('ali.photoN', { n: it.photos.length })} size={13} />
                    </>
                  ) : null}
                </button>
              </div>
              {/* 수정은 **관리자 이상**이다 (v11.7). 분배 전이라 되돌릴 것이 없고,
                  분배된 건까지 관리자가 고칠 수 있게 된 마당에 그 전 단계를 막을 이유가 없다.
                  참여자를 고치면 참여횟수는 시트가 전면 재계산한다 (규칙 3). */}
              {admin ? (
                <button className="btn ghost" onClick={() => setEditing(it)}>
                  {t('items.edit')}
                </button>
              ) : null}
              {/* 🏷️ 는 관리자도 누른다 — 새 4칸은 다이아를 움직이지 않는다.
                  ★ 글자 없이 그림만 있는 버튼이다. 이모지 시절에는 그 글자가 이름을
                    대신했지만 글리프는 aria-hidden 이라 이름이 통째로 없어진다 —
                    낭독기에 읽힐 이름을 aria-label 로 붙인다 (v11.7). */}
              {admin ? (
                <button className="btn ghost" aria-label={t('loot.editTitle')} onClick={() => setMetaOf(it)}>
                  <Glyph name="tag" size={17} />
                </button>
              ) : null}
              {admin ? (
                <button className="btn warn" onClick={() => onDistribute(it)}>
                  {t('items.distribute')}
                </button>
              ) : (
                <span className="badge">{t('items.waiting')}</span>
              )}
            </div>
          ))
        )}
      </div>

      {/*
        ✅ 분배 완료 — **어떤 아이템이 얼마에 팔렸는지** (v11.7).

        지금까지 판매금액은 마스터 전용 [정정] 화면에서만 볼 수 있었다. 조회는 원래
        누구에게나 열려 있는 것이고(잔액·참여횟수와 같은 성격), 판 금액을 아무도 못 보면
        분배 결과를 검증할 길이 없다 — "내 몫이 왜 이건가" 를 스스로 확인하지 못한다.
        연합 탭의 [🧾 정산 완료] 와 같은 모양으로 둔다.
      */}
      <div className="sect-row" style={{ marginTop: 14 }}>
        <div className="sect"><IconText text={t('items.doneSect')} /></div>
        <ShareBtn
          title={t('items.doneSect')}
          build={() =>
            [
              `${t('items.doneSect')} (${t('c.cases', { n: done.length })})`,
              ...done.map(
                (it) =>
                  `· ${it.item} — ${it.soldAt || it.date} · ${fmt(it.amount)} ${unit(state.unit)} · ` +
                  `${t('c.persons', { n: it.cnt })}`,
              ),
            ].join('\n')
          }
          toast={toast}
        />
      </div>
      <div className="card">
        {doneUnknown ? (
          <div className="empty">{t('items.doneNeedSheet')}</div>
        ) : done.length === 0 ? (
          <div className="empty">{t('items.doneEmpty')}</div>
        ) : (
          <>
            {shownDone.map((it) => (
              <div className={'row' + (admin ? ' stack' : '')} key={it.row}>
                <div className="row-top">
                  <div className="row-main">
                    <button type="button" className="row-name linkish" onClick={() => setViewing(it)}>
                      {lootLine(it)}
                    </button>
                    <button type="button" className="row-sub linkish" onClick={() => setViewing(it)}>
                      {it.soldAt || it.date} · {t('c.persons', { n: it.cnt })} ·{' '}
                      {t('items.perOne', { v: fmt(it.per) })} · {t('items.fundGot', { v: fmt(it.fund) })}
                      {it.photos && it.photos.length > 0 ? (
                        <>
                          {' · '}
                          <IconText text={t('ali.photoN', { n: it.photos.length })} size={13} />
                        </>
                      ) : null}
                    </button>
                  </div>
                  {/* 판매금액이 이 목록의 주인공이다 — 오른쪽 큰 숫자 자리에 둔다 */}
                  <div className="row-amt">{fmt(it.amount)}</div>
                </div>
                {admin ? (
                  <div className="row-acts">
                    {/* 🏷️ 는 분배완료여도 관리자가 누른다 — 새 4칸은 돈을 안 움직인다 */}
                    <button className="btn ghost" aria-label={t('loot.editTitle')} onClick={() => setMetaOf(it)}>
                      <Glyph name="tag" size={16} />
                    </button>
                    {/* v11.7 — 분배완료 건은 **삭제 대신 수정**이다. 지우면 "누가 얼마를
                        받았다" 는 사실까지 사라지지만, 수정은 스냅샷으로 회수한 뒤 다시
                        나누므로 결과는 같으면서 기록이 남는다 (규칙 2-1). */}
                    <button className="btn ghost" onClick={() => setEditing(it)}>
                      {t('items.edit')}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {/* 나머지는 **감추는 것이 아니라 접어두는 것**이다 */}
            {done.length > DONE_FOLD ? (
              <button
                className="btn ghost block"
                style={{ margin: '10px 12px 12px' }}
                onClick={() => setShowAllDone((v) => !v)}
              >
                {showAllDone ? t('items.doneFold') : t('items.doneMore', { n: done.length - DONE_FOLD })}
              </button>
            ) : null}
          </>
        )}
      </div>

      {!admin ? (
        <p className="hint" style={{ margin: '14px 4px' }}>
          {t('items.viewerHint')}
        </p>
      ) : (
        <>
          <div className="sect"><IconText text={t('items.newSect')} /></div>
          <div className="card">
            <div className="field">
              <label className="fl" htmlFor="fItem">
                <IconText text={t('items.name')} />
              </label>
              {/* 용어 사전 자동완성 (v11.4) — 세 언어로 찾아 고르면 국문이 들어간다 */}
              <ItemNameInput id="fItem" value={itemName} onChange={setItemName} />

              <LootFields value={loot} onChange={setLoot} servers={state.serverList ?? []} members={state.members} idPrefix="ireg" item={itemName} />
            </div>

            <div className="field">
              <label className="fl"><IconText text={t('items.photoLabel')} /></label>
              <p className="hint">{t('items.photoMulti')}</p>
              {/*
                인증샷은 **서버 줄마다** 붙인다 (v11.7) — 연합과 같은 규칙이다.
                사진에서 찾아낸 사람은 참여자 체크에 **더한다**(덮어쓰지 않는다):
                앞 장에서 찾은 사람이 뒷 장 때문에 사라지면 안 된다.
              */}
              <ItemShots
                rows={shotRows}
                setRows={setShotRows}
                servers={state.serverList ?? []}
                inUse={Object.keys(counts)}
                onMatched={(names) =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    names.forEach((m) => next.add(m));
                    return next;
                  })
                }
                toast={toast}
                setBusy={setBusy}
              />
            </div>
            <div className="field">
              <label className="fl" htmlFor="fLink">
                <IconText text={t('items.linkLabel')} />
              </label>
              <input
                id="fLink"
                type="url"
                inputMode="url"
                placeholder="https://..."
                value={photoLink}
                onChange={(e) => setPhotoLink(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="fl"><IconText text={t('items.membersLabel', { n: pickedList.length })} /></label>

              {/* 서버로 좁히기 (v10.8.6). 아무것도 안 고르면 예전처럼 전원이 나온다 —
                  서버 칸이 아직 비어 있어도 등록이 막히지 않아야 한다. */}
              <div className="note" style={{ marginBottom: 8 }}>
                {svPick.length === 0 ? t('items.svAsk') : t('items.svMore')}
              </div>
              <ServerFilter
                servers={state.serverList}
                counts={counts}
                noneCount={noneCount}
                value={svPick}
                onChange={setSvPick}
              />
              {/* 클래스는 드롭다운 하나 — 서버 칩 아래에 13개를 더 깔 자리가 없다 */}
              <div style={{ marginTop: 8 }}>
                <ClassFilter counts={clsCounts} noneCount={clsNone} value={clsPick} onChange={setClsPick} />
              </div>
              {svPick.length > 0 || clsPick !== ANY_CLASS ? (
                <p className="hint" style={{ marginTop: 6 }}>
                  {t('items.svShowing', { n: visible.length, total: selectable.length })}
                </p>
              ) : null}

              <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
                <button className="btn ghost" style={{ flex: 1 }} onClick={() => selectAll(true)}>
                  {t('items.selectAll')}
                </button>
                <button className="btn ghost" style={{ flex: 1 }} onClick={() => selectAll(false)}>
                  {t('items.clearAll')}
                </button>
              </div>
              <div className="mgrid">
                {shown.map((m) => {
                  // 국문 위 · 한문 아래. 잘린 이름은 다른 사람으로 오인돼
                  // 엉뚱한 사람이 참여자로 체크되므로, 줄이더라도 끝까지 보여준다.
                  //
                  // ★ 한자를 국문보다 **크게** 잡는다 (v10.8). 중국 길드원에게는
                  //   이쪽이 본명이라 여기가 안 읽히면 자기 칸을 못 찾는다.
                  //   괄호는 붙이지 않는다 — 폭을 20% 넘게 먹는데, 두 줄로 나뉜
                  //   자리와 색만으로도 한자 표기인 것은 이미 드러난다.
                  const { main, sub } = nameParts(state, m);
                  // 서버 번호를 이름 앞에 (v10.8.8). [잔액]과 같은 배지다 —
                  // 서버가 갈리면서 비슷한 이름이 서버마다 생겨, 이름만으로는
                  // 누구인지 가릴 수 없다. 배지가 먹는 폭은 예산에서 뺀다.
                  const sv = svOf.get(m) ?? '';
                  const budget = CHIP_NAME_PX - (sv ? CHIP_SVR_PX : 0);
                  /**
                   * 둘째 줄 = 한자, 셋째 줄 = 클래스 (v11.6.1).
                   *
                   * 🐛 v11.5 에서 `한자 · 클래스` 를 **한 문자열로 합쳐** 크기를 정했다.
                   *    글자가 길어진 만큼 fitIn 이 줄여서, 클래스를 넣은 순간 한자가
                   *    12px 로 쪼그라들어 국문(14px)보다 작아졌다 — 중국 혈맹원에게는
                   *    한자가 본명이라 v10.8 부터 "한자가 더 커야 한다"가 규칙이었는데
                   *    그게 조용히 깨져 있었다. 칩 폭은 64px 이라 큰 한자와 클래스를
                   *    한 줄에 같이 담을 수는 없다. 줄을 나누고 크기도 따로 정한다.
                   * ★ 이름 옆(첫 줄)에는 여전히 붙이지 않는다 — 서버 배지가 이미 예산을
                   *   먹고 있어 하나 더 얹으면 이름이 잘린다.
                   */
                  const cl = classLabel(classOf(state, m), lang);
                  return (
                    <label key={m} className={'mchip' + (picked.has(m) ? ' sel' : '')}>
                      <input type="checkbox" checked={picked.has(m)} onChange={() => toggle(m)} />
                      <span className="nm">
                        <b style={{ fontSize: fitIn(main, budget, 14, 10) }}>
                          {sv ? <span className="svr">{sv}</span> : null}
                          {main}
                        </b>
                        {sub ? <i style={{ fontSize: fitIn(sub, CHIP_NAME_PX, 19, 12) }}>{sub}</i> : null}
                        {/* 클래스는 부가 정보다 — 한자를 밀어내지 않게 작은 고정 크기로 둔다 */}
                        {cl ? <em style={{ fontSize: fitIn(cl, CHIP_NAME_PX, 11, 8.5) }}>{cl}</em> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
              {/* 좁혀둔 나머지는 **감추는 것이 아니라 접어두는 것**이다.
                  갑자기 다른 서버 사람이 낀 레이드에서 고를 길이 없으면 안 된다. */}
              {folded.length > 0 ? (
                <button
                  className="btn ghost block"
                  style={{ marginTop: 8 }}
                  onClick={() => setShowRest((v) => !v)}
                >
                  {showRest ? t('items.svFold') : t('items.svUnfold', { n: folded.length })}
                </button>
              ) : null}
            </div>

            <div className="field">
              <div className="note">{t('items.checkNote')}</div>
              <button
                className="btn block"
                style={{ marginTop: 12 }}
                disabled={!canSubmit}
                onClick={() => setConfirming(true)}
              >
                {t('items.submit')}
              </button>
            </div>
          </div>

          {/* 정정·삭제는 마스터관리자 몫이라 관리자에게는 카드째로 보이지 않는다 */}
          {master ? (
            <LedgerCard
              state={state}
              unit={unit(state.unit)}
              fundRate={state.fundRate}
              fundName={state.fundName}
              onChanged={onDone}
              toast={toast}
            />
          ) : null}
        </>
      )}

      {confirming ? (
        <ConfirmRegister
          state={state}
          itemName={itemName.trim()}
          participants={pickedList}
          onCancel={() => setConfirming(false)}
          onConfirm={submit}
        />
      ) : null}

      {metaOf ? (
        <LootEditSheet
          title={t('loot.editTitle')}
          source={metaOf.item}
          initial={{ item: metaOf.item, raid: metaOf.raid ?? '', boss: metaOf.boss ?? '', lootSv: metaOf.lootSv ?? '', lootCh: metaOf.lootCh ?? '' }}
          servers={state.serverList ?? []}
          members={state.members}
          target={{ kind: 'item', row: metaOf.row }}
          onClose={() => setMetaOf(null)}
          onDone={(res) => {
            setMetaOf(null);
            onDone(res);
          }}
          toast={toast}
          setBusy={setBusy}
        />
      ) : null}

      {viewing ? (
        <ItemDetailSheet
          state={state}
          entry={viewing}
          sold={done.find((d) => d.row === viewing.row) ?? null}
          admin={admin}
          onClose={() => setViewing(null)}
          onDone={onDone}
          toast={toast}
          setBusy={setBusy}
        />
      ) : null}

      {editing ? (
        <EditItemSheet
          state={state}
          entry={editing}
          /* 분배완료 건이면 판매금액까지 고친다 (v11.7) — 시트가 스냅샷으로 회수한 뒤 다시 나눈다 */
          sold={done.find((d) => d.row === editing.row) ?? null}
          onClose={() => setEditing(null)}
          onDone={(res) => {
            setEditing(null);
            onDone(res);
          }}
          toast={toast}
          setBusy={setBusy}
        />
      ) : null}
    </div>
  );
}

/**
 * 아이템 상세 (v11.1 → v11.7) — 아이템명을 누르면 열린다.
 *
 * 등록할 때 체크한 참여자와 붙인 인증샷을 그대로 보여준다. 분배 전에 "이 사람이
 * 정말 왔었나" 를 확인하는 자리이므로, 인증샷은 새 탭으로 내보내지 않고
 * **앱 안에서** 본다 (규칙 5-10).
 *
 * v11.7 에서 둘이 늘었다.
 *  · 인증샷을 **서버별로 묶어** 보여준다. 3서버가 낀 건에서 "01서버 사람이 빠졌다"는
 *    말이 나왔을 때, 사진 다섯 장을 늘어놓기만 해서는 확인할 방법이 없었다.
 *  · 분배가 끝난 건이면 **얼마에 팔렸는지**를 함께 보여준다.
 */
function ItemDetailSheet({
  state,
  entry,
  sold,
  admin,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  state: GuildState;
  entry: LedgerItem;
  /** 분배가 끝난 건이면 그 기록 (판매금액·혈비·1인당) */
  sold: DoneItem | null;
  admin: boolean;
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, unit, srv, lang } = useT();
  const names = [...entry.names].sort((a, b) => byName(a, b));
  const groups = groupShots(entry.shots, entry.photos);
  const u = unit(state.unit);

  /*
   * 인증샷 더 붙이기 (v11.7) — **관리자 이상**.
   *
   * 레이드 직후에는 사진을 다 못 모은다. 다른 서버 파티가 나중에 보내주는 일이 흔한데,
   * 그때마다 등록을 지웠다 다시 하면 참여횟수가 통째로 흔들린다 (규칙 3).
   * 시트는 **잇기만** 한다 — 지우는 길은 두지 않는다.
   */
  const [adding, setAdding] = useState(false);
  const [rows, setRows] = useState<ShotRow[]>([newShotRow()]);

  async function saveShots() {
    const entries = toShotEntries(rows);
    if (entries.length === 0) return;
    setBusy(true);
    const res = await api('/api/admin/item-photos', {
      row: entry.row,
      entries,
      email: getStoredEmail(),
    });
    setBusy(false);
    toast(srv(res, res.ok ? 'r.done' : 'r.failed'), !res.ok);
    if (res.ok) {
      onDone(res);
      onClose();
    }
  }

  return (
    <Sheet title={`📦 ${entry.item}`} subtitle={t('items.detailSub')} onClose={onClose}>
      {/* 얼마에 팔렸는가 — 분배가 끝난 건에만 있다 */}
      {sold ? (
        <div className="calc">
          <div className="calc-line">
            <span>{t('items.soldFor')}</span>
            <strong>
              {fmt(sold.amount)} {u}
            </strong>
          </div>
          <div className="calc-line">
            <span>{t('ali.fundShare', { fund: state.fundName })}</span>
            <strong>{fmt(sold.fund)}</strong>
          </div>
          <div className="calc-line">
            <span>{t('led.newBase', { n: sold.cnt })}</span>
            <strong>{fmt(sold.per)}</strong>
          </div>
          {sold.soldAt ? (
            <div className="calc-line">
              <span>{t('items.soldAt')}</span>
              <strong>{sold.soldAt}</strong>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="fl">{t('items.membersLabel', { n: names.length })}</div>
      <div className="mgrid">
        {names.map((m) => {
          const sv = serverOf(state, m);
          // 클래스는 둘째 줄에 (v11.5) — 이 목록은 한자 줄을 쓰지 않아 자리가 비어 있다.
          // 이름 옆에 붙이면 서버 배지와 겹쳐 이름이 잘린다.
          const cl = classLabel(classOf(state, m), lang);
          return (
            <div className="mchip" key={m}>
              <span className="nm">
                <b>
                  {sv ? <span className="svr">{sv}</span> : null}
                  {m}
                </b>
                {cl ? <i>{cl}</i> : null}
              </span>
            </div>
          );
        })}
      </div>

      <div className="fl" style={{ marginTop: 14 }}>
        {t('shot.sect')} {entry.photos && entry.photos.length > 0 ? `(${entry.photos.length})` : ''}
      </div>
      {/*
        서버별로 나눠 보여준다 (v11.7). 서버를 안 고른 사진은 groupShots 가 맨 뒤로
        모아 준다 — 옛 기록은 전부 여기 들어온다.
      */}
      {groups.length > 0 ? (
        groups.map((g) => (
          <div key={g.server || 'none'} style={{ marginTop: 8 }}>
            <p className="hint">
              {g.server ? t('ali.serverN', { s: g.server }) : t('items.shotNoServer')} ·{' '}
              {t('ali.photoN', { n: g.urls.length })}
            </p>
            <PhotoStrip urls={g.urls} />
          </div>
        ))
      ) : (
        <p className="hint">{t('shot.none')}</p>
      )}

      {admin && adding ? (
        <div style={{ marginTop: 12 }}>
          <ItemShots
            rows={rows}
            setRows={setRows}
            servers={state.serverList ?? []}
            toast={toast}
            setBusy={setBusy}
          />
          <p className="hint">{t('items.shotAddNote')}</p>
        </div>
      ) : null}

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          <IconText text={t('c.close')} />
        </button>
        {admin ? (
          adding ? (
            <button
              className="btn"
              disabled={toShotEntries(rows).length === 0}
              onClick={() => void saveShots()}
            >
              {t('c.save')}
            </button>
          ) : (
            <button className="btn" onClick={() => setAdding(true)}>
              {t('items.shotAdd')}
            </button>
          )
        ) : null}
      </div>
    </Sheet>
  );
}

/**
 * ✏️ 아이템 수정 (v11.0 → v11.7) — **관리자 이상**.
 *
   ⏳미분배 — 아이템명·참여자. 아직 아무 돈도 움직이지 않았다
   ✅분배완료 — 여기에 **판매금액**이 더해진다. 시트가 분배 시점 스냅샷(O열)으로
                먼저 회수한 뒤 새 명단·새 금액으로 다시 나눈다 (규칙 2-1)
 *
 * v11.6 까지 이 화면은 마스터 전용이었고, 분배된 건을 되돌리는 길은 [삭제]뿐이었다.
 * v11.7 에서 **분배완료 건의 삭제를 없앴다** — 지우면 "그때 누가 얼마를 받았다"는
 * 사실까지 사라진다. 대신 이 수정이 그 자리를 대신하고, 관리자에게 열려 있다.
 * 수정은 기록을 지우지 않으므로 잘못 고쳤으면 다시 고치면 된다.
 */
function EditItemSheet({
  state,
  entry,
  sold,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  state: GuildState;
  entry: LedgerItem;
  sold: DoneItem | null;
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, unit, srv } = useT();
  const [name, setName] = useState(entry.item);
  const [picked, setPicked] = useState<Set<string>>(new Set(entry.names));
  const [amt, setAmt] = useState(sold ? String(sold.amount) : '');

  // 이름순(ㄱ~ㅎ). 이미 참여로 잡혀 있는 사람은 명단에서 빠졌더라도 계속 보여야 한다 —
  // 안 보이면 체크를 풀 수도, 그대로 둘 수도 없어 저장 자체가 막힌다.
  const selectable = useMemo(() => {
    const all = new Set(state.members.filter((m) => m !== state.fundName));
    entry.names.forEach((n) => all.add(n));
    return [...all].sort((a, b) => byName(a, b));
  }, [state.members, state.fundName, entry.names]);

  const amount = Number(amt.replace(/[,\s]/g, ''));
  const amtValid = !sold || (Number.isInteger(amount) && amount > 0);
  const valid = name.trim().length > 0 && picked.size > 0 && amtValid;

  /*
   * 확인 화면 숫자는 **시트와 같은 산식**으로 만든다 (규칙 1).
   * 여기서 보여준 숫자와 실제 결과가 다르면 아무도 이 화면을 믿지 않게 된다.
   */
  const split =
    sold && amtValid && picked.size > 0
      ? calcSplit(amount, weightsOf(state, [...picked]), state.fundRate)
      : null;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    const res = await api('/api/admin/item', {
      row: entry.row,
      itemName: name.trim(),
      participants: [...picked],
      // 미분배 건에는 금액 자체가 없다 — 안 보내면 시트가 지금 값을 그대로 둔다
      amount: sold ? amount : '',
      email: getStoredEmail(),
      // ★ 바뀔 숫자를 위에서 보여준 뒤에 누른 버튼이다 (규칙 5-1)
      confirm: true,
    });
    setBusy(false);
    if (!res.ok && res.needsConfirm) {
      toast(srv(res), false);
      return;
    }
    toast(srv(res, res.ok ? 'r.done' : 'r.failed'), !res.ok);
    if (res.ok) onDone(res);
  }

  return (
    <Sheet
      title={`✏️ ${t('items.edit')}`}
      subtitle={sold ? t('items.editDoneSub') : t('items.editSub')}
      onClose={onClose}
    >
      <label className="fl" htmlFor="eIt">
        <IconText text={t('items.name')} />
      </label>
      <input id="eIt" type="text" value={name} onChange={(e) => setName(e.target.value)} />

      {sold ? (
        <>
          <label className="fl" htmlFor="eAmt" style={{ marginTop: 12 }}>
            <IconText text={t('led.newAmount', { unit: unit(state.unit) })} />
          </label>
          <input
            id="eAmt"
            type="text"
            inputMode="numeric"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
          />
        </>
      ) : null}

      <label className="fl" style={{ marginTop: 12 }}>
        <IconText text={t('items.membersLabel', { n: picked.size })} />
      </label>
      <div className="mgrid">
        {selectable.map((m) => {
          const sv = serverOf(state, m);
          const on = picked.has(m);
          return (
            <button
              key={m}
              type="button"
              className={'mchip' + (on ? ' sel' : '')}
              aria-pressed={on}
              onClick={() =>
                setPicked((prev) => {
                  const next = new Set(prev);
                  if (next.has(m)) next.delete(m);
                  else next.add(m);
                  return next;
                })
              }
            >
              <span className="nm">
                <b>
                  {sv ? <span className="svr">{sv}</span> : null}
                  {m}
                </b>
              </span>
            </button>
          );
        })}
      </div>

      {/* 바뀔 숫자를 먼저 보여준다 — 돈이 실제로 움직이는 건이기 때문이다 */}
      {sold ? (
        split ? (
          <div className="calc">
            <div className="calc-line">
              <span>{t('led.currentAmount')}</span>
              <strong>
                {fmt(sold.amount)} → {fmt(amount)} {unit(state.unit)}
              </strong>
            </div>
            <div className="calc-line">
              <span>{t('led.newFund', { fund: state.fundName })}</span>
              <strong>{fmt(split.fundTotal)}</strong>
            </div>
            <div className="calc-line">
              <span>{t('led.newBase', { n: picked.size })}</span>
              <strong>{fmt(split.perPerson)}</strong>
            </div>
          </div>
        ) : (
          <p className="hint">{t('dist.needInt')}</p>
        )
      ) : null}
      {sold ? <p className="hint">{t('led.editNote', { fund: state.fundName })}</p> : null}

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          <IconText text={t('c.cancel')} />
        </button>
        <button className={sold ? 'btn warn' : 'btn'} disabled={!valid} onClick={() => void submit()}>
          {t('c.save')}
        </button>
      </div>
    </Sheet>
  );
}
function ConfirmRegister({
  state,
  itemName,
  participants,
  onCancel,
  onConfirm,
}: {
  state: GuildState;
  itemName: string;
  participants: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  // 여기서 잘못 체크된 사람을 잡아내는 것이 이 창의 목적이다. 그래서 서버까지
  // 붙인다 — 비슷한 이름이 서버마다 있어 이름만으로는 가릴 수 없다 (v10.8.8).
  const shown = participants.slice(0, 12).map((n) => personLabel(state, n));
  const rest = participants.length - shown.length;

  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()} role="presentation">
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-grip" />
        <h2>{t('items.confirmTitle')}</h2>
        <div className="sheet-sub">{t('items.confirmSub', { n: fmt(participants.length) })}</div>
        <div className="calc">
          <div className="calc-line">
            <span>{t('items.confirmItem')}</span>
            <strong>{itemName}</strong>
          </div>
          <div className="calc-line">
            <span>{t('items.confirmJoin')}</span>
            <strong>{t('c.persons', { n: participants.length })}</strong>
          </div>
        </div>
        <div className="hint" style={{ lineHeight: 1.6 }}>
          {shown.join(', ')}
          {rest > 0 ? t('items.andMore', { n: rest }) : ''}
        </div>
        <div className="sheet-actions">
          <button className="btn ghost" onClick={onCancel}>
            <IconText text={t('c.cancel')} />
          </button>
          <button className="btn" onClick={onConfirm}>
            <IconText text={t('items.confirmDo')} />
          </button>
        </div>
      </div>
    </div>
  );
}
