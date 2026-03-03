'use client';

import { useState, useCallback } from 'react';
import Header from '@/components/Header';
import ManualInput from '@/components/ManualInput';
import BriefingDisplay from '@/components/BriefingDisplay';
import { RSS_SOURCES } from '@/lib/rss-sources';

const ALL_RSS_SOURCE_NAMES = RSS_SOURCES.map((s) => s.name);

export default function HomePage() {
  const [briefing, setBriefing] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [manualSummary, setManualSummary] = useState('');
  const [rssCount, setRssCount] = useState<number | null>(null);
  const [step, setStep] = useState('');
  const [selectedSources, setSelectedSources] = useState<Set<string>>(
    new Set(ALL_RSS_SOURCE_NAMES)
  );
  const [useYahooFinance, setUseYahooFinance] = useState(true);

  const today = new Date()
    .toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    .replace(/\. /g, '-')
    .replace('.', '');

  const toggleSource = useCallback((name: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const generateBriefing = useCallback(async () => {
    setLoading(true);
    setError('');
    setBriefing('');
    setRssCount(null);

    try {
      setStep('뉴스 수집 중...');
      const sourcesParam =
        selectedSources.size > 0 ? [...selectedSources].join(',') : '';

      const [rssRes, marketRes] = await Promise.all([
        fetch(
          sourcesParam
            ? `/api/fetch-rss?sources=${encodeURIComponent(sourcesParam)}`
            : '/api/fetch-rss'
        ),
        useYahooFinance ? fetch('/api/market-data') : Promise.resolve(null),
      ]);

      if (!rssRes.ok) throw new Error('RSS 수집 실패');
      const { items, count } = await rssRes.json();
      setRssCount(count);

      const marketData = marketRes && marketRes.ok ? await marketRes.json() : null;

      setStep(`${count}개 기사 AI 분석 중...`);
      const briefRes = await fetch('/api/generate-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsItems: items,
          manualContent: manualSummary || undefined,
          date: today,
          marketData: marketData || undefined,
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
  }, [manualSummary, today, selectedSources, useYahooFinance]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Header />

      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-5">
        {/* Hero */}
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
            경제 뉴스 자동 브리핑
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            RSS 자동 수집 → Yahoo Finance 시장 데이터 → Claude AI 분석 → 날짜별 아카이빙
          </p>
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

        {/* Briefing display — full width */}
        <div>
          <BriefingDisplay briefing={briefing} date={today} loading={loading} />

          {!briefing && !loading && (
            <div
              className="rounded-lg border p-12 text-center scanline"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                아래 소스를 선택하고 브리핑 생성 버튼을 누르세요
              </p>
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                약 20~40초 소요
              </p>
            </div>
          )}
        </div>

        {/* Source selection */}
        <div
          className="rounded-lg border px-4 py-3"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
              뉴스 소스
            </span>
            {rssCount !== null && (
              <span className="text-xs ml-auto" style={{ color: 'var(--accent)' }}>
                {rssCount}개 기사 수집됨
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {ALL_RSS_SOURCE_NAMES.map((name) => (
              <label key={name} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedSources.has(name)}
                  onChange={() => toggleSource(name)}
                  className="accent-[var(--accent)] w-3 h-3"
                />
                <span className="text-xs" style={{ color: selectedSources.has(name) ? 'var(--text)' : 'var(--text-muted)' }}>
                  {name}
                </span>
              </label>
            ))}
            {/* Yahoo Finance toggle */}
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useYahooFinance}
                onChange={() => setUseYahooFinance((v) => !v)}
                className="accent-[var(--accent)] w-3 h-3"
              />
              <span className="text-xs" style={{ color: useYahooFinance ? 'var(--text)' : 'var(--text-muted)' }}>
                Yahoo Finance
              </span>
              <span className="text-xs opacity-50" style={{ color: 'var(--text-muted)' }}>
                (시장 지수)
              </span>
            </label>
            {/* Manual input indicator */}
            {manualSummary && (
              <span
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                style={{ background: 'rgba(0,212,170,0.12)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
              >
                수동 자료 첨부됨
                <button
                  onClick={() => {
                    setManualSummary('');
                  }}
                  className="opacity-60 hover:opacity-100 ml-0.5"
                >
                  ✕
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Bottom: input area + generate button */}
        <div className="flex gap-3 items-end">
          <ManualInput
            onSummaryReady={setManualSummary}
            onSummaryClear={() => setManualSummary('')}
          />

          <div className="flex flex-col items-end gap-1 shrink-0">
            <button
              onClick={generateBriefing}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-3 rounded-lg font-bold text-sm tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 whitespace-nowrap"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              {loading ? (
                <>
                  <span
                    className="cursor-blink"
                    style={{ width: '6px', height: '14px', background: '#000', display: 'inline-block' }}
                  />
                  {step || '처리 중...'}
                </>
              ) : (
                '오늘 브리핑 생성'
              )}
            </button>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {today} 기준
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
