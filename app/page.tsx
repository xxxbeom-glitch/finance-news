'use client';

import { useState, useCallback } from 'react';
import Header from '@/components/Header';
import BriefingDisplay from '@/components/BriefingDisplay';
import { RSS_SOURCES } from '@/lib/rss-sources';

const FOREIGN_SOURCES = RSS_SOURCES.filter((s) => s.lang === 'en');
const FOREIGN_SOURCE_NAMES = FOREIGN_SOURCES.map((s) => s.name);

function getToday() {
  return new Date()
    .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\. /g, '-')
    .replace('.', '');
}

// 한경 요약 결과 렌더러
function renderHankyung(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const trimmed = line.trim();

    if (/^-{10,}$/.test(trimmed)) {
      return (
        <div key={i} style={{ margin: '16px 0' }}>
          <div style={{ height: '1px', background: 'var(--border)', opacity: 0.5 }} />
        </div>
      );
    }

    const boldMatch = trimmed.match(/^\*\*(.+?)\*\*$/) ?? trimmed.match(/^\*\*(.+)$/);
    if (boldMatch) {
      return (
        <div
          key={i}
          style={{
            fontWeight: '700',
            fontSize: '0.82rem',
            color: 'var(--text)',
            marginTop: '4px',
            marginBottom: '6px',
            lineHeight: '1.55',
          }}
        >
          {boldMatch[1]}
        </div>
      );
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      const content = trimmed.slice(2);
      return (
        <div
          key={i}
          style={{ display: 'flex', gap: '8px', marginBottom: '6px', paddingLeft: '8px', lineHeight: '1.6' }}
        >
          <span style={{ color: 'var(--accent)', flexShrink: 0 }}>–</span>
          <span style={{ color: 'var(--text)', fontSize: '0.8rem' }}>{content}</span>
        </div>
      );
    }

    if (trimmed === '') return <div key={i} style={{ height: '4px' }} />;

    return (
      <div key={i} style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: '1.6' }}>
        {line}
      </div>
    );
  });
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

  // ── 한국경제 상태 ─────────────────────────────────
  const [urlInput, setUrlInput] = useState('');
  const [hankyungDate, setHankyungDate] = useState(today);
  const [hankyungLoading, setHankyungLoading] = useState(false);
  const [hankyungStep, setHankyungStep] = useState('');
  const [hankyungResult, setHankyungResult] = useState('');
  const [hankyungError, setHankyungError] = useState('');
  const [hankyungSaved, setHankyungSaved] = useState<boolean | null>(null);

  // ── 마켓 브리핑 생성 ──────────────────────────────
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

  // ── 한경 요약 생성 ────────────────────────────────
  const generateHankyung = useCallback(async () => {
    const urls = urlInput.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!urls.length) return;

    setHankyungLoading(true);
    setHankyungStep(`URL ${urls.length}개 수집 중...`);
    setHankyungError('');
    setHankyungResult('');
    setHankyungSaved(null);

    try {
      // Step 1: 기사 본문 크롤링
      const fetchRes = await fetch('/api/fetch-articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      if (!fetchRes.ok) throw new Error('기사 수집 실패');
      const { articles } = await fetchRes.json();

      const success = (
        articles as { title: string; content: string; error?: string }[]
      ).filter((a) => !a.error && a.content.length > 50);

      if (!success.length) throw new Error('수집된 기사 본문이 없습니다');

      setHankyungStep(`${success.length}개 기사 AI 요약 중...`);

      // Step 2: Claude 요약
      const genRes = await fetch('/api/generate-newspaper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extractedTexts: success.map((a) => `[${a.title}]\n${a.content}`),
          date: hankyungDate,
          fileCount: success.length,
          provider: 'claude',
        }),
      });
      const data = await genRes.json();
      if (data.error) throw new Error(data.error);

      setHankyungResult(data.content);
      setHankyungSaved(data.savedToArchive ?? false);
      setHankyungStep('완료');
    } catch (err) {
      setHankyungError(err instanceof Error ? err.message : '오류 발생');
      setHankyungStep('');
    } finally {
      setHankyungLoading(false);
    }
  }, [urlInput, hankyungDate]);

  const urlCount = urlInput.split('\n').map((s) => s.trim()).filter(Boolean).length;

  return (
    <div className="h-dvh flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Header />

      <div className="flex-1 overflow-hidden flex" style={{ minHeight: 0 }}>
        {/* ── 왼쪽: 마켓 브리핑 ─────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4 min-w-0">
          <div className="space-y-0.5">
            <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
              미국 및 세계 경제
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              RSS + Yahoo Finance → Claude AI 분석
            </p>
          </div>

          {briefError && (
            <div
              className="rounded border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--red)', background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}
            >
              ✕ {briefError}
            </div>
          )}

          <BriefingDisplay briefing={briefing} date={today} loading={briefLoading} />

          {!briefing && !briefLoading && (
            <div
              className="rounded-lg border p-10 text-center scanline"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>소스 선택 후 브리핑 생성</p>
              <p className="text-xs mt-1 opacity-50" style={{ color: 'var(--text-muted)' }}>약 20~40초 소요</p>
            </div>
          )}

          {/* 소스 선택 */}
          <div
            className="rounded-lg border px-4 py-3"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
                뉴스 소스
              </span>
              {rssCount !== null && (
                <span className="text-xs ml-auto" style={{ color: 'var(--accent)' }}>
                  {rssCount}개 수집됨
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {FOREIGN_SOURCE_NAMES.map((name) => (
                <label key={name} className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedSources.has(name)}
                    onChange={() => toggleSource(name)}
                    className="accent-[var(--accent)] w-3 h-3"
                  />
                  <span
                    className="text-xs"
                    style={{ color: selectedSources.has(name) ? 'var(--text)' : 'var(--text-muted)' }}
                  >
                    {name}
                  </span>
                </label>
              ))}
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
                  <span
                    className="cursor-blink"
                    style={{ width: '6px', height: '14px', background: '#000', display: 'inline-block' }}
                  />
                  {briefStep || '처리 중...'}
                </>
              ) : (
                '브리핑 생성'
              )}
            </button>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{today}</span>
          </div>
        </div>

        {/* ── 구분선 ──────────────────────────────────── */}
        <div className="w-px shrink-0 self-stretch" style={{ background: 'var(--border)' }} />

        {/* ── 오른쪽: 한국경제 ──────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4 min-w-0">
          <div className="space-y-0.5">
            <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
              한국경제
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              기사 URL 붙여넣기 → 자동 수집 → Claude AI 요약
            </p>
          </div>

          {hankyungError && (
            <div
              className="rounded border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--red)', background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}
            >
              ✕ {hankyungError}
            </div>
          )}

          {/* 결과 */}
          {hankyungResult && (
            <div
              className="rounded-lg border p-4"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <div
                className="flex items-center gap-2 mb-3 pb-2"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <span className="text-xs font-bold tracking-wider" style={{ color: 'var(--accent)' }}>
                  {hankyungDate} 한국경제 요약
                </span>
                {hankyungSaved === true && (
                  <span className="text-xs ml-auto" style={{ color: 'var(--green)' }}>
                    아카이브 저장됨
                  </span>
                )}
                {hankyungSaved === false && (
                  <span className="text-xs ml-auto" style={{ color: 'var(--yellow, #f59e0b)' }}>
                    KV 미연결
                  </span>
                )}
              </div>
              <div className="font-mono text-xs leading-relaxed">
                {renderHankyung(hankyungResult)}
              </div>
            </div>
          )}

          {!hankyungResult && !hankyungLoading && (
            <div
              className="rounded-lg border p-10 text-center scanline"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>URL 입력 후 요약 생성</p>
              <p className="text-xs mt-1 opacity-50" style={{ color: 'var(--text-muted)' }}>
                최대 20개 · 약 20~30초 소요
              </p>
            </div>
          )}

          {/* URL 입력 */}
          <div
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <div
              className="px-3 py-2 flex items-center gap-2"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <span className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
                기사 URL
              </span>
              {urlCount > 0 && (
                <span className="text-xs" style={{ color: 'var(--accent)' }}>
                  {urlCount}개
                </span>
              )}
            </div>
            <textarea
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={`https://www.hankyung.com/article/...\nhttps://www.hankyung.com/article/...\n한 줄에 URL 하나씩 붙여넣기`}
              rows={6}
              className="w-full px-3 py-2.5 text-xs font-mono outline-none resize-none"
              style={{
                background: 'transparent',
                color: 'var(--text)',
                lineHeight: '1.7',
              }}
            />
          </div>

          {/* 날짜 + 버튼 */}
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={hankyungDate}
              onChange={(e) => setHankyungDate(e.target.value)}
              className="px-3 py-2 rounded-lg text-xs outline-none"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                colorScheme: 'dark',
              }}
            />
            <button
              onClick={generateHankyung}
              disabled={hankyungLoading || urlCount === 0}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              {hankyungLoading ? (
                <>
                  <span
                    className="cursor-blink"
                    style={{ width: '6px', height: '14px', background: '#000', display: 'inline-block' }}
                  />
                  {hankyungStep || '처리 중...'}
                </>
              ) : (
                '한경 요약 생성'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
