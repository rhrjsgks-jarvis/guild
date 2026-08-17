import type { Metadata, Viewport } from 'next';
import { Gothic_A1 } from 'next/font/google';
import './globals.css';

/**
 * 제목·금액용 글꼴 (v11.7) — 굵은 고딕.
 *
 * ★ **리니지W 가 실제로 쓰는 글꼴은 실을 수 없다.** NC소프트 소유물이다.
 *   대신 라이선스가 열린(OFL) 고딕 중 무게가 가장 게임 UI 에 가까운 것을 고른다.
 * ★ 처음에는 명조(바탕체)로 갔다가 되돌렸다 — 게임의 인게임 UI 는 명조가 아니라
 *   굵은 고딕이고, 기기 기본 바탕체는 옛날 문서처럼 읽혔다.
 * ★ next/font 가 **우리 서버에 같이 실어** 내보낸다. 구글 서버를 직접 부르지
 *   않으므로 남의 사이트에 접속 기록이 남지 않고, 폰트가 늦게 와서 글자가
 *   깜빡이는 일도 없다(swap 로 본문 글꼴이 먼저 보인다).
 */
const display = Gothic_A1({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-display-loaded',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '길드정산',
  description: '길드 다이아 분배·정산 — 잔액 조회, 아이템 등록, 분배, 지급을 폰에서 바로',
  manifest: '/manifest.webmanifest',
  applicationName: '길드정산',
  appleWebApp: {
    capable: true,
    title: '길드정산',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  // 잔액 정보가 검색엔진에 올라갈 이유가 없다
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // 노치 영역까지 헤더 배경이 이어지게 한다
  viewportFit: 'cover',
  // 헤더 배경(밤의 돌바닥)과 같은 색 — 상태표시줄까지 이어져 보인다
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#12313f' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1016' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={display.variable}>
      <body>{children}</body>
    </html>
  );
}
