'use client';

import { useState } from 'react';
import IconText from './IconText';
import { photoView } from '@/lib/client';
import { useT } from '@/lib/i18n';
import { useBackClose } from '@/lib/back';

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

      {open >= 0 ? <Lightbox urls={urls} at={open} onClose={() => setOpen(-1)} /> : null}
    </>
  );
}

/**
 * 크게 보기 (v11.2.1) — 폰 뒤로가기로도 닫힌다.
 *
 * 팝업(`Sheet`)과 달리 배경을 눌러도 닫는다. 여기엔 잃을 입력이 없고,
 * 사진만 화면을 덮고 있을 때 어디를 눌러도 안 닫히면 갇힌 느낌이 든다 (규칙 5-9 는
 * "입력하던 내용이 사라지는 것"을 막는 규칙이지 모든 겹침을 막는 규칙이 아니다).
 *
 * 조건부로 그려지는 컴포넌트라서 `useBackClose` 가 열릴 때 history 를 쌓고
 * 닫힐 때 걷어낸다 — 훅을 조건 안에서 부르지 않으려고 별도 컴포넌트로 뺐다.
 */
function Lightbox({ urls, at, onClose }: { urls: string[]; at: number; onClose: () => void }) {
  const { t } = useT();
  useBackClose(onClose);

  return (
    <div className="lightbox" role="dialog" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoView(urls[at], 1600)} alt={t('shot.alt', { n: at + 1 })} />
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <a className="btn ghost" href={urls[at]} target="_blank" rel="noreferrer">
          {t('shot.origin')}
        </a>
        <span className="hint">
          {at + 1} / {urls.length}
        </span>
        <button className="btn ghost" onClick={onClose}>
            <IconText text={t('c.close')} />
          </button>
      </div>
    </div>
  );
}
