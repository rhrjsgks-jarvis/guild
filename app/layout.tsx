import type { Metadata, Viewport } from 'next';
import './globals.css';

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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#262a9e' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1014' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
