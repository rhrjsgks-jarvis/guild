'use client';

import { useMemo, useRef, useState } from 'react';
import type { GuildState, LedgerItem, PhotoResult } from '@/lib/types';
import { CHIP_NAME_PX, api, fitIn, fmt, getStoredEmail, nameParts, prepPhoto, serverOf } from '@/lib/client';
import type { ApiResult } from '@/lib/client';
import { useT } from '@/lib/i18n';
import LedgerCard from './LedgerCard';
import ServerFilter, { NO_SERVER } from './ServerFilter';
import ShareBtn from './ShareBtn';

type PhotoState = {
  preview: string;
  status: string;
  ocr: string;
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
  const { t, unit, srv } = useT();
  const [itemName, setItemName] = useState('');
  const [photoLink, setPhotoLink] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [photo, setPhoto] = useState<PhotoState | null>(null);
  const [showOcr, setShowOcr] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [svPick, setSvPick] = useState<string[]>([]);
  const [showRest, setShowRest] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 혈맹운영비 계정은 참여자가 될 수 없다
  const selectable = useMemo(
    () => state.members.filter((m) => m !== state.fundName),
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

  /**
   * 보이는 사람 = 고른 서버의 사람 **∪ 이미 체크된 사람**.
   *
   * ★ 두 번째 항이 핵심이다. 사진에서 자동으로 찾아낸 참여자가 다른 서버에
   *   속해 있다는 이유로 화면에서 사라지면, 관리자는 그 사람이 빠진 줄 알고
   *   등록한다 — 실제로는 들어가 있으므로 확인 화면과 결과가 어긋난다.
   *   체크된 사람은 서버와 무관하게 언제나 보인다.
   */
  const visible = useMemo(() => {
    if (svPick.length === 0) return selectable;
    return selectable.filter((m) => svPick.includes(svOf.get(m) ?? NO_SERVER) || picked.has(m));
  }, [selectable, svPick, svOf, picked]);

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
    setPhoto(null);
    setShowOcr(false);
    setSvPick([]);
    setShowRest(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  /** 사진을 보정(lib/client 의 prepPhoto)한 뒤 서버로 보내 OCR 결과를 받는다 */
  async function onPickPhoto(file: File) {
    const jpeg = await prepPhoto(file);
    if (!jpeg) {
      toast(t('items.formatFailed'), true);
      return;
    }

    setPhoto({ preview: jpeg, status: t('items.analyzing'), ocr: '' });
    setShowOcr(false);

    const res = await api('/api/admin/photo', { base64: jpeg.split(',')[1] });

    if (!res.ok) {
      setPhoto({ preview: jpeg, status: t('items.analyzeFailed', { v: srv(res) }), ocr: '' });
      return;
    }

    const r = res as unknown as PhotoResult;
    if (r.photoUrl) setPhotoLink(r.photoUrl);
    if (r.matched && r.matched.length > 0) {
      setPicked((prev) => {
        const next = new Set(prev);
        r.matched!.forEach((m) => next.add(m));
        return next;
      });
    }
    setPhoto({ preview: jpeg, status: srv(r, 'items.analyzeDone'), ocr: r.ocrPreview ?? '' });
  }

  async function submit() {
    setConfirming(false);
    setBusy(true);
    const res = await api('/api/admin/register', {
      itemName: itemName.trim(),
      participants: [...picked],
      photoLink: photoLink.trim(),
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
        <div className="sect">{admin ? t('items.sectAdmin') : t('items.sect')}</div>
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
                <div className="row-name">{it.item}</div>
                <div className="row-sub">
                  {it.date} · {t('c.joined')} {t('c.persons', { n: it.cnt })}
                </div>
              </div>
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
          <div className="sect">{t('items.newSect')}</div>
          <div className="card">
            <div className="field">
              <label className="fl" htmlFor="fItem">
                {t('items.name')}
              </label>
              <input
                id="fItem"
                type="text"
                placeholder={t('items.namePh')}
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="fl">{t('items.photoLabel')}</label>
              <label className="filebtn" htmlFor="fPhoto">
                {t('items.photoPick')}
              </label>
              <input
                id="fPhoto"
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPickPhoto(f);
                }}
              />

              {photo ? (
                <div className="photo-prev">
                  {/* 로컬 canvas 결과라 next/image 최적화 대상이 아니다 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.preview} alt={t('items.photoAlt')} />
                  <div className="hint">{photo.status}</div>
                  {photo.ocr ? (
                    <>
                      <button
                        className="btn ghost"
                        style={{ marginTop: 8, fontSize: 12, padding: '7px 11px' }}
                        onClick={() => setShowOcr((v) => !v)}
                      >
                        {showOcr ? t('items.ocrHide') : t('items.ocrShow')}
                      </button>
                      {showOcr ? <div className="ocr-raw">{photo.ocr}</div> : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="field">
              <label className="fl" htmlFor="fLink">
                {t('items.linkLabel')}
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
              {svPick.length > 0 ? (
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
                  return (
                    <label key={m} className={'mchip' + (picked.has(m) ? ' sel' : '')}>
                      <input type="checkbox" checked={picked.has(m)} onChange={() => toggle(m)} />
                      <span className="nm">
                        <b style={{ fontSize: fitIn(main, CHIP_NAME_PX, 14, 10) }}>{main}</b>
                        {sub ? <i style={{ fontSize: fitIn(sub, CHIP_NAME_PX, 19, 12) }}>{sub}</i> : null}
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
    </div>
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
  // 여기서 잘못 체크된 사람을 잡아내는 것이 이 창의 목적이다.
  // 한자만 아는 길드원도 자기 이름을 확인할 수 있어야 하므로 병기해서 보여준다.
  const label = (n: string) => {
    const { main, sub } = nameParts(state, n);
    return sub ? `${main} (${sub})` : main;
  };
  const shown = participants.slice(0, 12).map(label);
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
            {t('c.cancel')}
          </button>
          <button className="btn" onClick={onConfirm}>
            {t('items.confirmDo')}
          </button>
        </div>
      </div>
    </div>
  );
}
