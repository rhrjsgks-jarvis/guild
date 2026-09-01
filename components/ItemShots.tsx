'use client';

import { useRef, useState } from 'react';
import Glyph from './Glyph';
import PhotoStrip from './PhotoStrip';
import ServerPicker from './ServerPicker';
import { api, prepPhoto } from '@/lib/client';
import type { PhotoResult } from '@/lib/types';
import { useT } from '@/lib/i18n';

/**
 * 아이템 인증샷 — **서버 줄마다** 붙인다 (v11.7).
 *
 * 연합(`AllianceTab` 의 `ServerRows` + `RowPhoto`)에 있던 것을 아이템 등록으로
 * 그대로 옮겨온 것이다. 옮긴 이유도 같다: 레이드 참여자가 한 화면에 다 안 들어가
 * 서버 파티별로 나눠 찍는데, 사진을 한 자루에 담아 두면 **어느 서버 파티의
 * 증거인지 영영 알 수 없다.**
 *
 * 연합과 다른 점은 두 가지다.
 *  · **인원수를 세지 않는다.** 아이템 참여자는 멤버DB에 있으므로 사진에서 셀 이유가
 *    없다 (연합 인원은 우리 명단에 없어서 세야 했다). 대신 OCR 로 찾아낸 사람을
 *    참여자 체크에 **더한다** — 덮어쓰지 않는다.
 *  · **서버를 안 골라도 된다.** 아직 서버를 나눠 쓰지 않는 길드가 있고, 손으로
 *    붙여넣은 주소에는 서버가 없다. 막으면 등록 자체가 막힌다.
 *
 * 이 컴포넌트는 등록 화면과 [인증샷 추가] 팝업이 **함께 쓴다.** 두 벌로 만들면
 * 한쪽만 고쳐져서 "등록에는 있는 버튼이 추가에는 없는" 상태가 된다.
 */

export type Shot = {
  /** 목록 안에서 이 장을 가리키는 값 — 분석이 끝나는 순서가 뒤섞여도 흔들리지 않는다 */
  id: string;
  preview: string;
  status: string;
  ocr: string;
  /** 드라이브에 저장된 원본 링크 — 등록할 때 이 목록을 그대로 보낸다 */
  url: string;
};

/** 서버 한 줄 — 그 서버 파티의 사진들 */
export type ShotRow = {
  server: string;
  photos: Shot[];
  /** 이미 시트에 저장돼 있는 사진 (추가 화면에서 보여주기만 한다) */
  saved?: string[];
};

/** 새 줄 하나 — 어디서 만들든 같은 모양이어야 한다 */
export function newShotRow(server = ''): ShotRow {
  return { server, photos: [] };
}

/** 화면의 줄 → 서버로 보낼 모양. 아직 분석이 안 끝난(주소가 없는) 장은 빠진다 */
export function toShotEntries(rows: ShotRow[]): { server: string; photos: string[] }[] {
  return rows
    .map((r) => ({ server: r.server, photos: r.photos.map((p) => p.url).filter(Boolean) }))
    .filter((r) => r.photos.length > 0);
}

/** 모든 줄의 사진 주소 (중복 없이) — 옛 시트도 알아듣는 평평한 목록이다 */
export function allShotUrls(rows: ShotRow[]): string[] {
  const out: string[] = [];
  rows.forEach((r) =>
    r.photos.forEach((p) => {
      if (p.url && !out.includes(p.url)) out.push(p.url);
    }),
  );
  return out;
}

export default function ItemShots({
  rows,
  setRows,
  servers,
  inUse,
  onMatched,
  toast,
  setBusy,
}: {
  rows: ShotRow[];
  setRows: (fn: (cur: ShotRow[]) => ShotRow[]) => void;
  servers: string[];
  /** 실제로 사람이 있는 서버 — 나머지 칩은 접힌다 */
  inUse?: string[];
  /**
   * 사진에서 찾아낸 사람. 등록 화면만 쓴다 (참여자 체크에 **더한다**).
   * 이미 등록된 건에 사진만 붙일 때는 참여자를 건드리면 안 되므로 넘기지 않는다.
   */
  onMatched?: (names: string[]) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t } = useT();
  const [showOcr, setShowOcr] = useState('');

  const total = rows.reduce((a, r) => a + r.photos.length, 0);

  return (
    <>
      <label className="fl">
        {t('items.shotSect')} — {t('ali.photoN', { n: total })}
      </label>
      {rows.map((r, i) => (
        <div className="shot-entry" key={i}>
          <div className="shot-entry-head">
            <ServerPicker
              servers={servers}
              value={r.server}
              allowNone
              inUse={inUse}
              onChange={(next) =>
                setRows((cur) => cur.map((x, k) => (k === i ? { ...x, server: next } : x)))
              }
            />
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
          <RowShots
            index={i}
            row={r}
            setRows={setRows}
            onMatched={onMatched}
            showOcr={showOcr}
            setShowOcr={setShowOcr}
            toast={toast}
            setBusy={setBusy}
          />
        </div>
      ))}
      <button
        type="button"
        className="btn ghost block"
        style={{ marginTop: 8 }}
        onClick={() =>
          // 아직 안 고른 서버를 기본값으로 — 같은 서버를 두 줄로 만들 이유가 없다
          setRows((cur) => [
            ...cur,
            newShotRow(servers.find((sv) => !cur.some((c) => c.server === sv)) ?? ''),
          ])
        }
      >
        {t('items.shotAddRow')}
      </button>
      <p className="hint">{t('items.shotHint')}</p>
    </>
  );
}

/**
 * 한 줄의 사진들 — 고르고, 분석하고, 미리 본다.
 *
 * ★ 여러 장을 한꺼번에 고를 수 있지만 **한 장씩 차례로** 보낸다. 동시에 던지면
 *   Apps Script 실행이 겹쳐 서로 대기하다 타임아웃이 난다. 한 장이 실패해도
 *   나머지는 살아야 하고, 어느 사진에서 못 읽었는지 보고 그 장만 다시 찍을 수
 *   있어야 한다.
 * ★ 목록은 **언제나 함수형으로** 고친다. 여러 장을 차례로 올리는 동안 앞 장의
 *   분석이 늦게 끝나는데, 그때 낡은 목록을 통째로 덮어쓰면 나중 장이 사라진다.
 */
function RowShots({
  index,
  row,
  setRows,
  onMatched,
  showOcr,
  setShowOcr,
  toast,
  setBusy,
}: {
  index: number;
  row: ShotRow;
  setRows: (fn: (cur: ShotRow[]) => ShotRow[]) => void;
  onMatched?: (names: string[]) => void;
  showOcr: string;
  setShowOcr: (v: string) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, srv } = useT();
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = (fn: (cur: Shot[]) => Shot[]) =>
    setRows((cur) => cur.map((r, k) => (k === index ? { ...r, photos: fn(r.photos) } : r)));

  async function pick(file: File) {
    const jpeg = await prepPhoto(file);
    if (!jpeg) {
      toast(t('items.formatFailed'), true);
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const put = (next: Partial<Shot>) =>
      patch((cur) => cur.map((p) => (p.id === id ? { ...p, ...next } : p)));

    // 분석을 기다리는 동안에도 자리가 보이게 먼저 올린다
    patch((cur) => [...cur, { id, preview: jpeg, status: t('items.analyzing'), ocr: '', url: '' }]);

    setBusy(true);
    const res = await api('/api/admin/photo', { base64: jpeg.split(',')[1] });
    setBusy(false);

    if (!res.ok) {
      put({ status: t('items.analyzeFailed', { v: srv(res) }) });
      return;
    }

    // 매칭된 사람은 장마다 **더한다.** 덮어쓰면 앞 장에서 찾은 사람이 사라진다
    const r = res as unknown as PhotoResult;
    if (onMatched && r.matched && r.matched.length > 0) onMatched(r.matched);
    put({ status: srv(r, 'items.analyzeDone'), ocr: r.ocrPreview ?? '', url: r.photoUrl ?? '' });
  }

  const saved = row.saved ?? [];

  return (
    <div className="shot-row-photo">
      <button type="button" className="btn ghost block" onClick={() => fileRef.current?.click()}>
        {row.server ? t('ali.photoAddServer', { s: row.server }) : t('items.shotAddAny')}
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

      {row.photos.map((p, i) => (
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
              onClick={() => patch((cur) => cur.filter((x) => x.id !== p.id))}
            >
              {t('ali.remove')}
            </button>
          </div>
          {p.ocr ? (
            <>
              <button
                className="btn ghost"
                style={{ marginTop: 8, fontSize: 12, padding: '7px 11px' }}
                onClick={() => setShowOcr(showOcr === p.id ? '' : p.id)}
              >
                {showOcr === p.id ? t('items.ocrHide') : t('items.ocrShow')}
              </button>
              {showOcr === p.id ? <div className="ocr-raw">{p.ocr}</div> : null}
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}
