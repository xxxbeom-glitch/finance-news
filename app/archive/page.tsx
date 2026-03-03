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

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm('이 브리핑을 삭제하시겠습니까?')) return;
      try {
        const res = await fetch(`/api/archive?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setIds((prev) => prev.filter((i) => i !== id));
          if (selected === id) {
            setSelected(null);
            setRecord(null);
          }
        }
      } catch {
        // ignore
      }
    },
    [selected]
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
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

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* ID list */}
          <div
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <div
              className="px-4 py-2 border-b text-xs font-bold tracking-wider uppercase"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              저장된 브리핑 ({ids.length})
            </div>
            <div className="overflow-auto max-h-[70vh]">
              {ids.length === 0 && !kvError ? (
                <div className="p-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                  저장된 브리핑이 없습니다
                </div>
              ) : (
                ids.map((id) => (
                  <div
                    key={id}
                    className="flex items-center border-b"
                    style={{
                      borderColor: 'var(--border)',
                      background: selected === id ? 'var(--surface2)' : 'transparent',
                      borderLeft:
                        selected === id ? '2px solid var(--accent)' : '2px solid transparent',
                    }}
                  >
                    <button
                      onClick={() => loadBriefing(id)}
                      className="flex-1 text-left px-4 py-3 text-xs transition-all"
                      style={{ color: selected === id ? 'var(--accent)' : 'var(--text)' }}
                    >
                      {formatDateTime(id)}
                    </button>
                    <button
                      onClick={(e) => handleDelete(id, e)}
                      className="px-3 py-3 text-xs transition-all hover:opacity-100 opacity-30"
                      style={{ color: 'var(--red)' }}
                      title="삭제"
                    >
                      🗑
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Briefing content */}
          <div className="lg:col-span-3">
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
              <div
                className="rounded-lg border p-12 text-center scanline"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                <div className="text-4xl mb-3 opacity-30">🗂</div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  날짜를 선택하면 브리핑을 볼 수 있습니다
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
