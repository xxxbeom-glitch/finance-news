'use client';

import { useState, useCallback } from 'react';
import Header from '@/components/Header';
import ManualInput from '@/components/ManualInput';
import BriefingDisplay from '@/components/BriefingDisplay';

export default function HomePage() {
  const [briefing, setBriefing] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [manualSummary, setManualSummary] = useState('');
  const [rssCount, setRssCount] = useState<number | null>(null);
  const [step, setStep] = useState('');

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\. /g, '-').replace('.', '');

  const generateBriefing = useCallback(async () => {
    setLoading(true);
    setError('');
    setBriefing('');
    setRssCount(null);

    try {
      // Step 1: Fetch RSS
      setStep('RSS 뉴스 수집 중...');
      const rssRes = await fetch('/api/fetch-rss');
      if (!rssRes.ok) throw new Error('RSS 수집 실패');
      const { items, count } = await rssRes.json();
      setRssCount(count);

      // Step 2: Generate briefing via Claude
      setStep(`${count}개 기사 AI 분석 중...`);
      const briefRes = await fetch('/api/generate-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsItems: items,
          manualContent: manualSummary || undefined,
          date: today,
        }),
      });

      if (!briefRes.ok) {
        const err = await briefRes.json();
        throw new Error(err.error || '브리핑 생성 실패');
      }
      const { briefing: text } = await briefRes.json();
      setBriefing(text);
      setStep('완료');
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
      setStep('');
    } finally {
      setLoading(false);
    }
  }, [manualSummary, today]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Hero */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
            경제 뉴스 자동 브리핑
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            7개 RSS 소스 자동 수집 → Claude AI 필터링/요약 → 날짜별 아카이빙
          </p>
        </div>

        {/* RSS sources status bar */}
        <div
          className="rounded border px-4 py-2 flex items-center gap-4 text-xs flex-wrap"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <span style={{ color: 'var(--text-muted)' }}>소스:</span>
          {['CNBC', 'Reuters', 'MarketWatch', 'Bloomberg', '한국경제', '매일경제', '연합인포맥스'].map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--green)' }} />
              <span style={{ color: 'var(--text-muted)' }}>{s}</span>
            </span>
          ))}
          {rssCount !== null && (
            <span className="ml-auto" style={{ color: 'var(--accent)' }}>
              {rssCount}개 수집됨
            </span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={generateBriefing}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            {loading ? (
              <>
                <span
                  className="cursor-blink"
                  style={{ width: '6px', height: '14px', background: '#000' }}
                />
                {step || '처리 중...'}
              </>
            ) : (
              '▶ 오늘 브리핑 생성'
            )}
          </button>

          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {today} 기준
          </div>

          {manualSummary && (
            <div
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded"
              style={{
                background: 'rgba(0,212,170,0.1)',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
              }}
            >
              <span>📄 수동 자료 첨부됨</span>
              <button onClick={() => setManualSummary('')} className="opacity-60 hover:opacity-100">
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            className="rounded border px-4 py-3 text-xs"
            style={{
              borderColor: 'var(--red)',
              background: 'rgba(239,68,68,0.1)',
              color: 'var(--red)',
            }}
          >
            ✕ 오류: {error}
          </div>
        )}

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Briefing output */}
          <div className="lg:col-span-2 space-y-4">
            <BriefingDisplay briefing={briefing} date={today} loading={loading} />

            {!briefing && !loading && (
              <div
                className="rounded-lg border p-12 text-center scanline"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                <div className="text-4xl mb-3 opacity-30">📊</div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  브리핑을 생성하려면 &quot;오늘 브리핑 생성&quot; 버튼을 누르세요
                </p>
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                  RSS 수집 → AI 필터링 → 요약까지 약 20~40초 소요
                </p>
              </div>
            )}
          </div>

          {/* Right: Manual input + guide */}
          <div className="space-y-4">
            <ManualInput onSummaryReady={setManualSummary} />

            <div
              className="rounded border p-4 text-xs space-y-2"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <p className="font-bold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
                사용 방법
              </p>
              <div className="space-y-1.5" style={{ color: 'var(--text-muted)' }}>
                <p>1. (선택) PDF/이미지 업로드 또는 텍스트 붙여넣기 후 AI 요약</p>
                <p>2. &quot;오늘 브리핑 생성&quot; 클릭</p>
                <p>3. 브리핑이 아카이브에 자동 저장됨</p>
                <p
                  className="mt-2 px-2 py-1 rounded"
                  style={{ background: 'var(--surface2)' }}
                >
                  <kbd>Ctrl+V</kbd> 스크린샷 붙여넣기 지원
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
