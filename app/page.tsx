'use client';

import { useState, useCallback } from 'react';
import Header from '@/components/Header';
import BriefingDisplay from '@/components/BriefingDisplay';
import HankyungPdfPanel from '@/components/HankyungPdfPanel';
import { RSS_SOURCES } from '@/lib/rss-sources';

const FOREIGN_SOURCES = RSS_SOURCES.filter((s) => s.lang === 'en');
const FOREIGN_SOURCE_NAMES = FOREIGN_SOURCES.map((s) => s.name);

function getToday() {
  return new Date()
    .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\. /g, '-')
    .replace('.', '');
}

export default function HomePage() {
  const today = getToday();

  // ── 마켓 브리핑 상태 ──────────────────────────────
  const [briefing, setBriefing] = useState('');
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState('');
  const [rssCount, setRssCount] = useState<number | null>(null);
  const [briefStep, setBriefStep] = useState('');
  const [selectedSources, setSelectedSources] = useState<Set<string>>(
    new Set(FOREIGN_SOURCE_NAMES)
  );
  const [useYahooFinance, setUseYahooFinance] = useState(true);

  const generateBriefing = useCallback(async () => {
    setBriefLoading(true);
    setBriefError('');
    setBriefing('');
    setRssCount(null);

    try {
      const rssPromise =
        selectedSources.size > 0
          ? fetch(`/api/fetch-rss?sources=${encodeURIComponent([...selectedSources].join(','))}`)
          : Promise.resolve(new Response(JSON.stringify({ items: [], count: 0 })));

      setBriefStep('뉴스 수집 중...');
      const [rssRes, marketRes] = await Promise.all([
        rssPromise,
        useYahooFinance ? fetch('/api/market-data') : Promise.resolve(null),
      ]);

      if (!rssRes.ok) throw new Error('RSS 수집 실패');
      const { items, count } = await rssRes.json();
      setRssCount(count);
      const marketData = marketRes?.ok ? await marketRes.json() : null;

      setBriefStep(`${count}개 기사 AI 분석 중...`);
      const res = await fetch('/api/generate-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsItems: items,
          date: today,
          marketData: marketData || undefined,
          provider: 'claude',
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '브리핑 생성 실패');
      }
      const { briefing: text } = await res.json();
      setBriefing(text);
      setBriefStep('완료');
    } catch (err) {
      setBriefError(err instanceof Error ? err.message : '알 수 없는 오류');
      setBriefStep('');
    } finally {
      setBriefLoading(false);
    }
  }, [today, selectedSources, useYahooFinance]);

  const toggleSource = useCallback((name: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }, []);

  return (
    <div className="h-dvh flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Header />

      <div className="flex-1 overflow-hidden flex justify-center" style={{ minHeight: 0 }}>
        <div className="w-full max-w-[960px] flex min-h-0">

          {/* ── 왼쪽: 마켓 브리핑 ─────────────────────── */}
          <div className="overflow-y-auto px-5 py-5 flex flex-col gap-4 min-w-0" style={{ flex: 7 }}>
            <div className="space-y-0.5">
              <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
                미국 및 세계 경제
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                RSS + Yahoo Finance → Claude AI 분석
              </p>
            </div>

            {briefError && (
              <div className="rounded border px-3 py-2 text-xs" style={{ borderColor: 'var(--red)', background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}>
                ✕ {briefError}
              </div>
            )}

            <BriefingDisplay briefing={briefing} date={today} loading={briefLoading} />

            {!briefing && !briefLoading && (
              <div className="rounded-lg border p-10 text-center scanline" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>소스 선택 후 브리핑 생성</p>
                <p className="text-xs mt-1 opacity-50" style={{ color: 'var(--text-muted)' }}>약 20~40초 소요</p>
              </div>
            )}

            {/* 소스 선택 */}
            <div className="rounded-lg border px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>뉴스 소스</span>
                {rssCount !== null && (
                  <span className="text-xs ml-auto" style={{ color: 'var(--accent)' }}>{rssCount}개 수집됨</span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {FOREIGN_SOURCE_NAMES.map((name) => (
                  <label key={name} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={selectedSources.has(name)} onChange={() => toggleSource(name)} className="accent-[var(--accent)] w-3 h-3" />
                    <span className="text-xs" style={{ color: selectedSources.has(name) ? 'var(--text)' : 'var(--text-muted)' }}>{name}</span>
                  </label>
                ))}
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={useYahooFinance} onChange={() => setUseYahooFinance((v) => !v)} className="accent-[var(--accent)] w-3 h-3" />
                  <span className="text-xs" style={{ color: useYahooFinance ? 'var(--text)' : 'var(--text-muted)' }}>Yahoo Finance</span>
                  <span className="text-xs opacity-50" style={{ color: 'var(--text-muted)' }}>(시장 지수)</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end items-center gap-3">
              <button
                onClick={generateBriefing}
                disabled={briefLoading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                {briefLoading ? (
                  <>
                    <span className="cursor-blink" style={{ width: '6px', height: '14px', background: '#000', display: 'inline-block' }} />
                    {briefStep || '처리 중...'}
                  </>
                ) : '브리핑 생성'}
              </button>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{today}</span>
            </div>
          </div>

          {/* ── 구분선 ──────────────────────────────────── */}
          <div className="w-px shrink-0 self-stretch" style={{ background: 'var(--border)' }} />

          {/* ── 오른쪽: 한국경제 PDF ──────────────────── */}
          <div className="overflow-y-auto px-5 py-5 min-w-0" style={{ flex: 3 }}>
            <HankyungPdfPanel />
          </div>

        </div>
      </div>
    </div>
  );
}
