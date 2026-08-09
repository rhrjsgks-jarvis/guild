'use client';

import { useState } from 'react';
import { photoView } from '@/lib/client';
import { useT } from '@/lib/i18n';

/**
 * 인증샷 보기 (v11.1) — 등록해둔 사진을 앱 안에서 바로 본다.
 *
 * 예전에는 `📷 1` 링크뿐이라 누르면 구글 드라이브가 새 탭으로 열렸다.
 * 폰에서는 앱이 통째로 가려지고, 돌아오면 보던 자리를 잃는다.
 * 이제 목록 안에 썸네일로 깔고, 누르면 화면 가득 띄운다.
 *
 * ★ 못 불러온 사진을 조용히 숨기지 않는다 — 자리와 함께 "안 열림"을 보여주고
 *   원본 링크를 남긴다. 숨기면 관리자는 사진을 안 붙인 줄로 안다 (규칙 7).
 */
export default function PhotoStrip({ urls }: { urls: string[] }) {
  const { t } = useT();
  const [open, setOpen] = useState(-1);
  const [broken, setBroken] = useState<Set<number>>(new Set());

  if (!urls || urls.length === 0) return null;

  return (
    <>
      <div className="shots">
        {urls.map((u, i) =>
          broken.has(i) ? (
            <a key={u} className="shot bad" href={u} target="_blank" rel="noreferrer">
              <span>⚠️</span>
              {t('shot.failed')}
            </a>
          ) : (
            <button key={u} type="button" className="shot" onClick={() => setOpen(i)}>
              {/* 드라이브 썸네일이라 next/image 최적화 대상이 아니다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoView(u, 400)}
                alt={t('shot.alt', { n: i + 1 })}
                loading="lazy"
                onError={() => setBroken((cur) => new Set(cur).add(i))}
              />
              <span className="no">{i + 1}</span>
            </button>
          ),
        )}
      </div>

      {open >= 0 ? (
        <div className="lightbox" role="dialog" onClick={() => setOpen(-1)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoView(urls[open], 1600)} alt={t('shot.alt', { n: open + 1 })} />
          <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <a className="btn ghost" href={urls[open]} target="_blank" rel="noreferrer">
              {t('shot.origin')}
            </a>
            <span className="hint">
              {open + 1} / {urls.length}
            </span>
            <button className="btn ghost" onClick={() => setOpen(-1)}>
              {t('c.close')}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
