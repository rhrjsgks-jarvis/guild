'use client';

import { useMemo, useRef, useState } from 'react';
import Glyph from './Glyph';
import IconText from './IconText';
import type { GuildState, LedgerItem, PhotoResult } from '@/lib/types';
import {
  CHIP_NAME_PX,
  CHIP_SVR_PX,
  api,
  byName,
  classLabel,
  classOf,
  fitIn,
  fmt,
  getStoredEmail,
  nameParts,
  personLabel,
  prepPhoto,
  serverOf,
  tally,
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

type PhotoState = {
  /** 목록 안에서 이 장을 가리키는 값 — 분석이 끝나는 순서가 뒤섞여도 흔들리지 않는다 */
  id: string;
  preview: string;
  status: string;
  ocr: string;
  /** 드라이브에 저장된 원본 링크 — 등록할 때 이 목록을 그대로 보낸다 */
  url: string;
};

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
  // v11.0 — 한 아이템에 인증샷 여러 장. 레이드 참여자가 한 화면에 다 안 들어가서
  // 두세 장으로 나눠 찍는 일이 흔한데, 예전에는 마지막 한 장만 남았다.
  const [photos, setPhotos] = useState<PhotoState[]>([]);
  const [showOcr, setShowOcr] = useState('');
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
  const fileRef = useRef<HTMLInputElement>(null);

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
    setPhotos([]);
    setShowOcr('');
    setSvPick([]);
    setShowRest(false);
    setLoot(EMPTY_LOOT);
    if (fileRef.current) fileRef.current.value = '';
  }

  /**
   * 사진을 보정(lib/client 의 prepPhoto)한 뒤 서버로 보내 OCR 결과를 받는다.
   *
   * 여러 장을 넣으면 **한 장씩** 처리하고 매칭된 사람을 계속 더한다.
   * 한 번에 묶어 보내지 않는 이유: 한 장이 실패해도 나머지는 살아야 하고,
   * 어느 사진에서 못 읽었는지 사용자가 보고 그 장만 다시 찍을 수 있어야 한다.
   */
  async function onPickPhoto(file: File) {
    const jpeg = await prepPhoto(file);
    if (!jpeg) {
      toast(t('items.formatFailed'), true);
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const put = (next: Partial<PhotoState>) =>
      setPhotos((cur) => cur.map((p) => (p.id === id ? { ...p, ...next } : p)));

    setPhotos((cur) => [
      ...cur,
      { id, preview: jpeg, status: t('items.analyzing'), ocr: '', url: '' },
    ]);

    const res = await api('/api/admin/photo', { base64: jpeg.split(',')[1] });

    if (!res.ok) {
      put({ status: t('items.analyzeFailed', { v: srv(res) }) });
      return;
    }

    // 매칭된 사람은 장마다 **더한다.** 덮어쓰면 앞 장에서 찾은 사람이 사라진다
    const r = res as unknown as PhotoResult;
    if (r.matched && r.matched.length > 0) {
      setPicked((prev) => {
        const next = new Set(prev);
        r.matched!.forEach((m) => next.add(m));
        return next;
      });
    }
    put({ status: srv(r, 'items.analyzeDone'), ocr: r.ocrPreview ?? '', url: r.photoUrl ?? '' });
  }

  async function submit() {
    setConfirming(false);
    setBusy(true);
    // 업로드된 사진 + 손으로 붙여넣은 링크. 같은 URL 이 두 번 들어가지 않게 거른다
    const links: string[] = [];
    for (const u of [...photos.map((p) => p.url), photoLink.trim()]) {
      if (u && !links.includes(u)) links.push(u);
    }
    const res = await api('/api/admin/register', {
      itemName: itemName.trim(),
      participants: [...picked],
      photoLink: photoLink.trim(),
      photoLinks: links,
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
                  {[it.raid, termDisplay(terms, it.boss ?? '', lang)].map((x) => String(x ?? '').trim()).filter(Boolean).map((v) => (
                    <span className="lootpart" key={v}>
                      {v}
                    </span>
                  ))}
                  <ItemName name={it.item} />
                  {[it.lootSv, it.lootCh].map((x) => String(x ?? '').trim()).filter(Boolean).map((v) => (
                    <span className="lootpart" key={v}>
                      {v}
                    </span>
                  ))}
                </button>
                <button type="button" className="row-sub linkish" onClick={() => setViewing(it)}>
                  {it.date} · {t('c.joined')} {t('c.persons', { n: it.cnt })}
                  {it.photos && it.photos.length > 0
                    ? ` · ${t('ali.photoN', { n: it.photos.length })}`
                    : ''}
                </button>
              </div>
              {/* 아직 분배 전이라 되돌릴 것이 없다. 그래도 참여자를 고치면 참여횟수가
                  다시 계산되므로 마스터관리자에게 둔다 (분배 후는 [정정]이 담당). */}
              {master ? (
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
              <label className="filebtn" htmlFor="fPhoto">
                {t('items.photoPick')}
              </label>
              <input
                id="fPhoto"
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  // 여러 장을 한꺼번에 고를 수 있다 (v11.0). 한 장씩 차례로 분석한다 —
                  // 동시에 던지면 Apps Script 실행이 겹쳐 서로 대기하다 타임아웃이 난다.
                  const list = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  void (async () => {
                    for (const f of list) await onPickPhoto(f);
                  })();
                }}
              />
              <p className="hint">{t('items.photoMulti')}</p>

              {photos.map((p, i) => (
                <div className="photo-prev" key={p.id}>
                  {/* 로컬 canvas 결과라 next/image 최적화 대상이 아니다 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt={t('items.photoAlt')} />
                  <div className="photo-foot">
                    <span className="hint">
                      <Glyph name="photo" size={16} /> {i + 1} · {p.status}
                    </span>
                    <button
                      className="btn ghost"
                      style={{ fontSize: 12, padding: '7px 11px' }}
                      onClick={() => setPhotos((cur) => cur.filter((x) => x.id !== p.id))}
                    >
                      {t('ali.remove')}
                    </button>
                  </div>
                  {p.ocr ? (
                    <>
                      <button
                        className="btn ghost"
                        style={{ marginTop: 8, fontSize: 12, padding: '7px 11px' }}
                        onClick={() => setShowOcr((v) => (v === p.id ? '' : p.id))}
                      >
                        {showOcr === p.id ? t('items.ocrHide') : t('items.ocrShow')}
                      </button>
                      {showOcr === p.id ? <div className="ocr-raw">{p.ocr}</div> : null}
                    </>
                  ) : null}
                </div>
              ))}
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
              <label className="fl">{t('items.membersLabel', { n: pickedList.length })}</label>

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
        <ItemDetailSheet state={state} entry={viewing} onClose={() => setViewing(null)} />
      ) : null}

      {editing ? (
        <EditItemSheet
          state={state}
          entry={editing}
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
 * 아이템 상세 (v11.1) — 아이템명을 누르면 열린다.
 *
 * 등록할 때 체크한 참여자와 붙인 인증샷을 그대로 보여준다.
 * 분배 전에 "이 사람이 정말 왔었나" 를 확인하는 자리이므로,
 * 인증샷은 새 탭으로 내보내지 않고 **앱 안에서** 본다.
 */
function ItemDetailSheet({
  state,
  entry,
  onClose,
}: {
  state: GuildState;
  entry: LedgerItem;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const names = [...entry.names].sort((a, b) => byName(a, b));
  return (
    <Sheet title={`📦 ${entry.item}`} subtitle={t('items.detailSub')} onClose={onClose}>
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
      {entry.photos && entry.photos.length > 0 ? (
        <PhotoStrip urls={entry.photos} />
      ) : (
        <p className="hint">{t('shot.none')}</p>
      )}

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
            <IconText text={t('c.close')} />
          </button>
      </div>
    </Sheet>
  );
}

/**
 * ✏️ 미분배 아이템 수정 (v11.0) — 마스터관리자 전용.
 *
 * 아이템명과 참여자만 고친다. 이미 분배된 아이템은 시트가 거부한다 —
 * 그쪽은 금액을 회수했다가 다시 나눠줘야 해서 [정정]이 담당한다.
 */
function EditItemSheet({
  state,
  entry,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  state: GuildState;
  entry: LedgerItem;
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, srv } = useT();
  const [name, setName] = useState(entry.item);
  const [picked, setPicked] = useState<Set<string>>(new Set(entry.names));

  // 이름순(ㄱ~ㅎ). 이미 참여로 잡혀 있는 사람은 명단에서 빠졌더라도 계속 보여야 한다 —
  // 안 보이면 체크를 풀 수도, 그대로 둘 수도 없어 저장 자체가 막힌다.
  const selectable = useMemo(() => {
    const all = new Set(state.members.filter((m) => m !== state.fundName));
    entry.names.forEach((n) => all.add(n));
    return [...all].sort((a, b) => byName(a, b));
  }, [state.members, state.fundName, entry.names]);

  const valid = name.trim().length > 0 && picked.size > 0;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    const res = await api('/api/master/item', {
      row: entry.row,
      itemName: name.trim(),
      participants: [...picked],
      email: getStoredEmail(),
    });
    setBusy(false);
    toast(srv(res, res.ok ? 'r.done' : 'r.failed'), !res.ok);
    if (res.ok) onDone(res);
  }

  return (
    <Sheet title={`✏️ ${t('items.edit')}`} subtitle={t('items.editSub')} onClose={onClose}>
      <label className="fl" htmlFor="eIt">
        <IconText text={t('items.name')} />
      </label>
      <input id="eIt" type="text" value={name} onChange={(e) => setName(e.target.value)} />

      <label className="fl" style={{ marginTop: 12 }}>
        {t('items.membersLabel', { n: picked.size })}
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

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
            <IconText text={t('c.cancel')} />
          </button>
        <button className="btn" disabled={!valid} onClick={() => void submit()}>
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
