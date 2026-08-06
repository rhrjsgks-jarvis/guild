'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';

/**
 * 길드원에게 앱 링크를 뿌리는 카드.
 *
 * 이 앱의 배포 경로는 결국 "링크 공유"라서, 세 가지 길을 다 열어둔다.
 *  - QR: 옆사람 폰으로 바로 (PC에서 띄워놓고 스캔시키기 좋다)
 *  - 공유하기: 폰 기본 공유 시트 → 카톡·디스코드로 바로 전송
 *  - 링크 복사: 그 외 전부
 */
export default function ShareCard({
  appName,
  toast,
}: {
  appName: string;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t } = useT();
  const [url, setUrl] = useState('');
  const [qrSvg, setQrSvg] = useState('');
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    const here = window.location.origin;
    setUrl(here);
    setCanShare(typeof navigator.share === 'function');

    // QR 생성기는 이 카드를 볼 때만 받아오면 된다
    void import('qrcode-generator').then(({ default: qrcode }) => {
      const qr = qrcode(0, 'M');
      qr.addData(here);
      qr.make();
      setQrSvg(qr.createSvgTag({ cellSize: 1, margin: 1, scalable: true }));
    });
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast(t('share.copied'));
    } catch {
      toast(t('share.copyFailed'), true);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: appName, text: t('share.shareText'), url });
    } catch {
      /* 사용자가 공유 시트를 닫은 것 — 알릴 필요 없다 */
    }
  }

  return (
    <>
      <div className="sect">{t('share.sect')}</div>
      <div className="card">
        <div className="field" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div
            style={{
              width: 92,
              height: 92,
              flex: 'none',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#fff',
              border: '1px solid var(--line)',
            }}
            aria-label={t('share.qrAlt')}
            // qrcode-generator가 만든 정적 SVG 문자열 (외부 입력이 섞이지 않는다)
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginBottom: 2 }}>{t('share.caption')}</p>
            <p
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                marginBottom: 10,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {url.replace(/^https?:\/\//, '')}
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              {canShare ? (
                <button className="btn" style={{ flex: 1, padding: '10px 8px' }} onClick={share}>
                  {t('share.share')}
                </button>
              ) : null}
              <button className="btn ghost" style={{ flex: 1, padding: '10px 8px' }} onClick={copy}>
                {t('share.copy')}
              </button>
            </div>
          </div>
        </div>
        <div className="field">
          <p className="hint">{t('share.hint')}</p>
        </div>
      </div>
    </>
  );
}
