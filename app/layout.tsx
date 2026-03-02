import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '경제 뉴스 브리핑 | Finance Terminal',
  description: '매일 아침 경제 뉴스를 AI가 요약하는 자동 브리핑 서비스',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
