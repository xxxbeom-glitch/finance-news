'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import BriefingDisplay from '@/components/BriefingDisplay';

interface BriefingRecord {
  id: string;
  date: string;
  createdAt: string;
  briefing: string;
  hasManualInput: boolean;
}

interface NewspaperRecord {
  id: string;
  date: string;
  createdAt: string;
  content: string;
  fileCount: number;
}

type TabType = 'briefing' | 'newspaper';

function formatDateTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return isoStr;
  }
}

export default function ArchivePage() {
  const [tab, setTab] = useState<TabType>('briefing');

  // Briefing state
  const [briefingIds, setBriefingIds] = useState<string[]>([]);
  const [selectedBriefing, setSelectedBriefing] = useState<string | null>(null);
  const [briefingRecord, setBriefingRecord] = useState<BriefingRecord | null>(null);

  // Newspaper state
  const [newspaperIds, setNewspaperIds] = useState<string[]>([]);
  const [selectedNewspaper, setSelectedNewspaper] = useState<string | null>(null);
  const [newspaperRecord, setNewspaperRecord] = useState<NewspaperRecord | null>(null);

  const [loading, setLoading] = useState(false);
  const [kvError, setKvError] = useState(false);

  // Load IDs for both tabs on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/archive?type=briefing').then((r) => r.json()),
      fetch('/api/archive?type=newspaper').then((r) => r.json()),
    ])
      .then(([bd, nd]) => {
        if (bd.error || nd.error) setKvError(true);
        setBriefingIds(bd.ids || []);
        setNewspaperIds(nd.ids || []);
      })
      .catch(() => setKvError(true));
  }, []);

  const loadBriefing = useCallback(async (id: string) => {
    if (!id) return;
    setSelectedBriefing(id);
    setLoading(true);
    setBriefingRecord(null);
    try {
      const res = await fetch(`/api/archive?id=${encodeURIComponent(id)}&type=briefing`);
      const data = await res.json();
      if (!data.error) setBriefingRecord(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNewspaper = useCallback(async (id: string) => {
    if (!id) return;
    setSelectedNewspaper(id);
    setLoading(true);
    setNewspaperRecord(null);
    try {
      const res = await fetch(`/api/archive?id=${encodeURIComponent(id)}&type=newspaper`);
      const data = await res.json();
      if (!data.error) setNewspaperRecord(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDelete = useCallback(async () => {
    const isBriefingTab = tab === 'briefing';
    const id = isBriefingTab ? selectedBriefing : selectedNewspaper;
    if (!id) return;
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(
        `/api/archive?id=${encodeURIComponent(id)}&type=${tab}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        if (isBriefingTab) {
          setBriefingIds((prev) => prev.filter((i) => i !== id));
          setSelectedBriefing(null);
          setBriefingRecord(null);
        } else {
          setNewspaperIds((prev) => prev.filter((i) => i !== id));
          setSelectedNewspaper(null);
          setNewspaperRecord(null);
        }
      }
    } catch {
      // ignore
    }
  }, [tab, selectedBriefing, selectedNewspaper]);

  const ids = tab === 'briefing' ? briefingIds : newspaperIds;
  const selected = tab === 'briefing' ? selectedBriefing : selectedNewspaper;
  const onSelect = tab === 'briefing' ? loadBriefing : loadNewspaper;

  return (
    <div className="h-dvh flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Header />

      <div className="flex-1 overflow-y-auto">
        <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
              아카이브
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              날짜/시간별 브리핑 및 신문 요약 열람
            </p>
          </div>

          {/* Sub-tabs */}
          <div
            className="flex gap-1 p-1 rounded-lg w-fit"
            style={{ background: 'var(--surface)' }}
          >
            {([
              { key: 'briefing', label: '마켓 브리핑' },
              { key: 'newspaper', label: '뉴스페이퍼' },
            ] as { key: TabType; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="px-4 py-1.5 text-xs rounded tracking-wide transition-all"
                style={{
                  background: tab === key ? 'var(--accent)' : 'transparent',
                  color: tab === key ? '#000' : 'var(--text-muted)',
                  fontWeight: tab === key ? '700' : '400',
                }}
              >
                {label}
                {key === 'briefing' && briefingIds.length > 0 && (
                  <span className="ml-1.5 opacity-60">({briefingIds.length})</span>
                )}
                {key === 'newspaper' && newspaperIds.length > 0 && (
                  <span className="ml-1.5 opacity-60">({newspaperIds.length})</span>
                )}
              </button>
            ))}
          </div>

          {kvError && (
            <div
              className="rounded border px-4 py-3 text-xs"
              style={{
                borderColor: 'var(--yellow)',
                background: 'rgba(245,158,11,0.1)',
                color: 'var(--yellow)',
              }}
            >
              ⚠ KV 스토리지 미연결 — Vercel KV 환경변수를 설정하면 아카이브를 사용할 수 있습니다.
            </div>
          )}

          {/* Dropdown selector */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <select
                value={selected || ''}
                onChange={(e) => onSelect(e.target.value)}
                className="w-full appearance-none px-4 py-2.5 rounded-lg text-xs outline-none cursor-pointer"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: selected ? 'var(--text)' : 'var(--text-muted)',
                  paddingRight: '32px',
                }}
              >
                <option value="">
                  {ids.length > 0
                    ? `${tab === 'briefing' ? '브리핑' : '신문 요약'} 선택 (총 ${ids.length}개)`
                    : kvError
                    ? '스토리지 미연결'
                    : '저장된 항목 없음'}
                </option>
                {ids.map((id) => (
                  <option key={id} value={id} style={{ background: 'var(--surface)', color: 'var(--text)' }}>
                    {formatDateTime(id)}
                  </option>
                ))}
              </select>
              <svg
                className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ color: 'var(--text-muted)' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {selected && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs transition-all hover:opacity-80"
                style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.3)' }}
                title="선택한 항목 삭제"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                </svg>
                삭제
              </button>
            )}
          </div>

          {/* Content */}
          {loading ? (
            <BriefingDisplay briefing="" loading={true} />
          ) : tab === 'briefing' ? (
            briefingRecord ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span>{formatDateTime(briefingRecord.createdAt)}</span>
                  {briefingRecord.hasManualInput && (
                    <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(0,212,170,0.1)', color: 'var(--accent)' }}>
                      + 수동 자료 포함
                    </span>
                  )}
                </div>
                <BriefingDisplay briefing={briefingRecord.briefing} date={briefingRecord.date} />
              </div>
            ) : (
              !kvError && (
                <div className="rounded-lg border p-12 text-center scanline" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>위 드롭다운에서 브리핑을 선택하세요</p>
                </div>
              )
            )
          ) : (
            newspaperRecord ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span>{formatDateTime(newspaperRecord.createdAt)}</span>
                  <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(0,212,170,0.1)', color: 'var(--accent)' }}>
                    PDF {newspaperRecord.fileCount}페이지
                  </span>
                </div>
                <div
                  className="rounded-lg border p-5"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
                >
                  <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono" style={{ color: 'var(--text)' }}>
                    {newspaperRecord.content}
                  </pre>
                </div>
              </div>
            ) : (
              !kvError && (
                <div className="rounded-lg border p-12 text-center scanline" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>위 드롭다운에서 신문 요약을 선택하세요</p>
                </div>
              )
            )
          )}
        </main>
      </div>
    </div>
  );
}
