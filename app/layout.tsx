import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '경제 뉴스 브리핑 | Finance Terminal',
  description: '매일 아침 경제 뉴스를 AI가 요약하는 자동 브리핑 서비스',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          href="https://cdn.jsdelivr.net/gh/sunn-us/SUIT@latest/fonts/static/woff2/SUIT.css"
          rel="stylesheet"
        />
      </head>
      <body className="h-dvh overflow-hidden antialiased">{children}</body>
    </html>
  );
}
