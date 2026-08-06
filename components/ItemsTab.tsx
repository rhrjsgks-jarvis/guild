'use client';

import { useMemo, useRef, useState } from 'react';
import type { GuildState, LedgerItem, PhotoResult } from '@/lib/types';
import { api, fitFont, fmt, getStoredEmail, prepPhoto, splitName } from '@/lib/client';
import type { ApiResult } from '@/lib/client';
import { useT } from '@/lib/i18n';
import LedgerCard from './LedgerCard';

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
  const fileRef = useRef<HTMLInputElement>(null);

  // 혈맹운영비 계정은 참여자가 될 수 없다
  const selectable = useMemo(
    () => state.members.filter((m) => m !== state.fundName),
    [state.members, state.fundName],
  );

  function toggle(name: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAll(on: boolean) {
    setPicked(on ? new Set(selectable) : new Set());
  }

  function resetForm() {
    setItemName('');
    setPhotoLink('');
    setPicked(new Set());
    setPhoto(null);
    setShowOcr(false);
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
      <div className="sect">{admin ? t('items.sectAdmin') : t('items.sect')}</div>
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
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button className="btn ghost" style={{ flex: 1 }} onClick={() => selectAll(true)}>
                  {t('items.selectAll')}
                </button>
                <button className="btn ghost" style={{ flex: 1 }} onClick={() => selectAll(false)}>
                  {t('items.clearAll')}
                </button>
              </div>
              <div className="mgrid">
                {selectable.map((m) => {
                  // 국문 위 · 한문 아래. 잘린 이름은 다른 사람으로 오인돼
                  // 엉뚱한 사람이 참여자로 체크되므로, 줄이더라도 끝까지 보여준다.
                  const { main, sub } = splitName(m);
                  return (
                    <label key={m} className={'mchip' + (picked.has(m) ? ' sel' : '')}>
                      <input type="checkbox" checked={picked.has(m)} onChange={() => toggle(m)} />
                      <span className="nm">
                        <b style={{ fontSize: fitFont(main, 14, 10) }}>{main}</b>
                        {sub ? <i style={{ fontSize: fitFont(`(${sub})`, 12, 9) }}>({sub})</i> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
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
  itemName,
  participants,
  onCancel,
  onConfirm,
}: {
  itemName: string;
  participants: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  const shown = participants.slice(0, 12);
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
