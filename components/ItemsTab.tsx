'use client';

import { useMemo, useRef, useState } from 'react';
import type { GuildState, LedgerItem, PhotoResult } from '@/lib/types';
import { api, fmt, getStoredEmail } from '@/lib/client';

type PhotoState = {
  preview: string;
  status: string;
  ocr: string;
};

export default function ItemsTab({
  state,
  admin,
  onDistribute,
  onDone,
  toast,
  setBusy,
}: {
  state: GuildState;
  admin: boolean;
  onDistribute: (item: LedgerItem) => void;
  onDone: () => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const [itemName, setItemName] = useState('');
  const [photoLink, setPhotoLink] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [photo, setPhoto] = useState<PhotoState | null>(null);
  const [showOcr, setShowOcr] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 혈비 계정은 참여자가 될 수 없다
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

  /** 사진을 줄이고 대비를 올린 뒤 서버로 보내 OCR 결과를 받는다 (v6.6 에서 검증된 보정값) */
  async function onPickPhoto(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('사진을 읽지 못했습니다.'));
      reader.readAsDataURL(file);
    }).catch((e: Error) => {
      toast(e.message, true);
      return '';
    });
    if (!dataUrl) return;

    const img = new Image();
    img.src = dataUrl;
    try {
      await img.decode();
    } catch {
      toast('사진 형식을 인식하지 못했습니다.', true);
      return;
    }

    const maxDim = 1600;
    let { width: w, height: h } = img;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      toast('이 브라우저에서는 사진 분석을 지원하지 않습니다.', true);
      return;
    }
    // 게임 스크린샷은 명암비가 낮아 이 보정 없이는 OCR이 줄을 통째로 놓친다
    try {
      ctx.filter = 'contrast(160%) brightness(112%) saturate(105%)';
    } catch {
      /* 미지원 브라우저는 원본 그대로 */
    }
    ctx.drawImage(img, 0, 0, w, h);
    const jpeg = canvas.toDataURL('image/jpeg', 0.82);

    setPhoto({ preview: jpeg, status: '분석 중… (드라이브 저장 + 글자 인식)', ocr: '' });
    setShowOcr(false);

    const res = await api('/api/admin/photo', { base64: jpeg.split(',')[1] });

    if (!res.ok) {
      setPhoto({ preview: jpeg, status: '분석 실패: ' + (res.msg ?? '알 수 없는 오류'), ocr: '' });
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
    setPhoto({ preview: jpeg, status: r.msg ?? '분석 완료', ocr: r.ocrPreview ?? '' });
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

    toast(res.msg ?? (res.ok ? '등록되었습니다.' : '등록에 실패했습니다.'), !res.ok);
    if (res.ok) {
      resetForm();
      onDone();
    }
  }

  const pickedList = [...picked];
  const canSubmit = itemName.trim().length > 0 && pickedList.length > 0;

  return (
    <div className="page">
      <div className="sect">⏳ 미분배 아이템 {admin ? '— [분배]를 눌러 판매금액을 입력하세요' : ''}</div>
      <div className="card">
        {state.items.length === 0 ? (
          <div className="empty">미분배 아이템이 없습니다.</div>
        ) : (
          state.items.map((it) => (
            <div className="row" key={it.row}>
              <div className="row-main">
                <div className="row-name">{it.item}</div>
                <div className="row-sub">
                  {it.date} · 참여 {it.cnt}명
                </div>
              </div>
              {admin ? (
                <button className="btn warn" onClick={() => onDistribute(it)}>
                  분배
                </button>
              ) : (
                <span className="badge">대기중</span>
              )}
            </div>
          ))
        )}
      </div>

      {!admin ? (
        <p className="hint" style={{ margin: '14px 4px' }}>
          아이템 등록·분배는 관리자만 할 수 있습니다. 하단 [관리] 탭에서 PIN을 입력하면 여기에 버튼이 나타납니다.
        </p>
      ) : (
        <>
          <div className="sect">📝 새 아이템 등록 (레이드 직후)</div>
          <div className="card">
            <div className="field">
              <label className="fl" htmlFor="fItem">
                📦 아이템명
              </label>
              <input
                id="fItem"
                type="text"
                placeholder="예: 기란 세금"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="fl">📷 인증샷 (사진에서 참여자를 자동으로 찾아 체크합니다)</label>
              <label className="filebtn" htmlFor="fPhoto">
                📎 사진 선택 / 촬영
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
                  <img src={photo.preview} alt="인증샷 미리보기" />
                  <div className="hint">{photo.status}</div>
                  {photo.ocr ? (
                    <>
                      <button
                        className="btn ghost"
                        style={{ marginTop: 8, fontSize: 12, padding: '7px 11px' }}
                        onClick={() => setShowOcr((v) => !v)}
                      >
                        🔍 인식된 텍스트 {showOcr ? '숨기기' : '보기'}
                      </button>
                      {showOcr ? <div className="ocr-raw">{photo.ocr}</div> : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="field">
              <label className="fl" htmlFor="fLink">
                🔗 인증샷 링크 (사진을 넣으면 자동으로 채워집니다)
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
              <label className="fl">
                👥 참여 멤버 — {pickedList.length}명 선택됨
              </label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button className="btn ghost" style={{ flex: 1 }} onClick={() => selectAll(true)}>
                  전체 선택
                </button>
                <button className="btn ghost" style={{ flex: 1 }} onClick={() => selectAll(false)}>
                  전체 해제
                </button>
              </div>
              <div className="mgrid">
                {selectable.map((m) => (
                  <label key={m} className={'mchip' + (picked.has(m) ? ' sel' : '')}>
                    <input type="checkbox" checked={picked.has(m)} onChange={() => toggle(m)} />
                    <span>{m}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="field">
              <div className="note">⚠️ 등록 전에 체크된 참여자가 맞는지 꼭 확인해주세요. 자동 감지는 참고용입니다.</div>
              <button
                className="btn block"
                style={{ marginTop: 12 }}
                disabled={!canSubmit}
                onClick={() => setConfirming(true)}
              >
                📝 아이템 등록
              </button>
            </div>
          </div>
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
  const shown = participants.slice(0, 12);
  const rest = participants.length - shown.length;

  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()} role="presentation">
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-grip" />
        <h2>⚠️ 참여자를 다시 확인해주세요</h2>
        <div className="sheet-sub">등록하면 {fmt(participants.length)}명의 참여횟수가 즉시 올라갑니다.</div>
        <div className="calc">
          <div className="calc-line">
            <span>📦 아이템</span>
            <strong>{itemName}</strong>
          </div>
          <div className="calc-line">
            <span>👥 참여</span>
            <strong>{participants.length}명</strong>
          </div>
        </div>
        <div className="hint" style={{ lineHeight: 1.6 }}>
          {shown.join(', ')}
          {rest > 0 ? ` 외 ${rest}명` : ''}
        </div>
        <div className="sheet-actions">
          <button className="btn ghost" onClick={onCancel}>
            취소
          </button>
          <button className="btn" onClick={onConfirm}>
            등록하기
          </button>
        </div>
      </div>
    </div>
  );
}
