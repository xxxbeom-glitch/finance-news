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

/** Format an ISO timestamp as KST datetime string */
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
  const [ids, setIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [record, setRecord] = useState<BriefingRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [kvError, setKvError] = useState(false);

  useEffect(() => {
    fetch('/api/archive')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setKvError(true);
        } else {
          setIds(d.ids || []);
        }
      })
      .catch(() => setKvError(true));
  }, []);

  const loadBriefing = useCallback(async (id: string) => {
    if (!id) return;
    setSelected(id);
    setLoading(true);
    setRecord(null);
    try {
      const res = await fetch(`/api/archive?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!data.error) setRecord(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selected) return;
    if (!confirm('이 브리핑을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/archive?id=${encodeURIComponent(selected)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setIds((prev) => prev.filter((i) => i !== selected));
        setSelected(null);
        setRecord(null);
      }
    } catch {
      // ignore
    }
  }, [selected]);

  return (
    <div className="h-dvh flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Header />

      <div className="flex-1 overflow-y-auto">
        <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
              브리핑 아카이브
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              날짜/시간별 경제 브리핑 열람
            </p>
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
                onChange={(e) => loadBriefing(e.target.value)}
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
                    ? `브리핑 선택 (총 ${ids.length}개 저장됨)`
                    : kvError
                    ? '스토리지 미연결'
                    : '저장된 브리핑 없음'}
                </option>
                {ids.map((id) => (
                  <option key={id} value={id} style={{ background: 'var(--surface)', color: 'var(--text)' }}>
                    {formatDateTime(id)}
                  </option>
                ))}
              </select>
              {/* Chevron icon */}
              <svg
                className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
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
                title="선택한 브리핑 삭제"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                </svg>
                삭제
              </button>
            )}
          </div>

          {/* Briefing content */}
          {loading ? (
            <BriefingDisplay briefing="" loading={true} />
          ) : record ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>{formatDateTime(record.createdAt)}</span>
                {record.hasManualInput && (
                  <span
                    className="px-2 py-0.5 rounded"
                    style={{ background: 'rgba(0,212,170,0.1)', color: 'var(--accent)' }}
                  >
                    + 수동 자료 포함
                  </span>
                )}
              </div>
              <BriefingDisplay briefing={record.briefing} date={record.date} />
            </div>
          ) : (
            !kvError && (
              <div
                className="rounded-lg border p-12 text-center scanline"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                <div className="text-4xl mb-3 opacity-30">🗂</div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  위 드롭다운에서 브리핑을 선택하세요
                </p>
              </div>
            )
          )}
        </main>
      </div>
    </div>
  );
}
