'use client';

import { useEffect, useState } from 'react';

/**
 * 길드원에게 앱 링크를 뿌리는 카드.
 *
 * 이 앱의 배포 경로는 결국 "링크 공유"라서, 세 가지 길을 다 열어둔다.
 *  - QR: 옆사람 폰으로 바로 (PC에서 띄워놓고 스캔시키기 좋다)
 *  - 공유하기: 폰 기본 공유 시트 → 카톡·디스코드로 바로 전송
 *  - 링크 복사: 그 외 전부
 */
export default function ShareCard({ toast }: { toast: (msg: string, isError?: boolean) => void }) {
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
      toast('🔗 링크를 복사했습니다.');
    } catch {
      toast('복사에 실패했습니다. 주소창의 주소를 직접 복사해주세요.', true);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: '길드정산', text: '길드 다이아 정산 현황 보기', url });
    } catch {
      /* 사용자가 공유 시트를 닫은 것 — 알릴 필요 없다 */
    }
  }

  return (
    <>
      <div className="sect">📤 길드원에게 공유하기</div>
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
            aria-label="앱 주소 QR 코드"
            // qrcode-generator가 만든 정적 SVG 문자열 (외부 입력이 섞이지 않는다)
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginBottom: 2 }}>길드 전용 정산 앱</p>
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
                  공유
                </button>
              ) : null}
              <button className="btn ghost" style={{ flex: 1, padding: '10px 8px' }} onClick={copy}>
                링크 복사
              </button>
            </div>
          </div>
        </div>
        <div className="field">
          <p className="hint">
            이 링크를 받은 사람은 <strong>조회만</strong> 할 수 있습니다. 등록·분배·지급은 PIN을 아는 관리자만
            가능하니 그대로 공유하셔도 됩니다.
          </p>
        </div>
      </div>
    </>
  );
}
