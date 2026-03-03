'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import Header from '@/components/Header';

// Highlight numbers, percentages, and monetary amounts in accent/green/red
function highlightNumbers(text: string): React.ReactNode {
  const pattern = /([+-]?\d[\d,]*(?:\.\d+)?(?:%|억|조|만원|만|bp|달러|원|위안)?)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const val = match[1];
    const color = val.startsWith('+') ? 'var(--green)' : val.startsWith('-') ? 'var(--red)' : 'var(--accent)';
    parts.push(<span key={match.index} style={{ color, fontWeight: '600' }}>{val}</span>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 1 ? <>{parts}</> : text;
}

function renderNewspaper(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const trimmed = line.trim();

    // Long divider
    if (/^-{10,}$/.test(trimmed)) {
      return (
        <div key={i} style={{ margin: '20px 0' }}>
          <div style={{ height: '1px', background: 'var(--border)', opacity: 0.5 }} />
        </div>
      );
    }

    // Article title: **제목** or **제목 (unclosed)
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
            marginBottom: '8px',
            lineHeight: '1.55',
            letterSpacing: '-0.01em',
          }}
        >
          {boldMatch[1]}
        </div>
      );
    }

    // Bullet items
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      const content = trimmed.slice(2);
      return (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '7px',
            paddingLeft: '8px',
            lineHeight: '1.65',
          }}
        >
          <span style={{ color: 'var(--accent)', flexShrink: 0 }}>–</span>
          <span style={{ color: 'var(--text)' }}>{highlightNumbers(content)}</span>
        </div>
      );
    }

    // Empty line
    if (trimmed === '') return <div key={i} style={{ height: '6px' }} />;

    // Default (date header / plain text)
    const isHeader = i === 0 || trimmed.includes('한국경제 요약');
    return (
      <div
        key={i}
        style={{
          marginBottom: '6px',
          fontWeight: isHeader ? '700' : '400',
          fontSize: isHeader ? '0.85rem' : '0.75rem',
          color: isHeader ? 'var(--accent)' : 'var(--text-muted)',
        }}
      >
        {line}
      </div>
    );
  });
}

const UPLOAD_CONCURRENCY = 4;
const SESSION_KEY_FILES = 'newspaper_files';
const SESSION_KEY_RESULT = 'newspaper_result';

declare global {
  interface Window {
    Dropbox?: {
      choose: (options: {
        success: (files: Array<{ name: string; link: string; bytes: number; id: string }>) => void;
        cancel?: () => void;
        linkType?: 'preview' | 'direct';
        multiselect?: boolean;
        extensions?: string[];
      }) => void;
      isBrowserSupported?: () => boolean;
    };
  }
}

interface PdfFile {
  id: string;
  name: string;
  size: number;
  status: 'queued' | 'processing' | 'done' | 'error';
  error?: string;
  extracted?: string;
  // stored for retry (Dropbox files only)
  dropboxUrl?: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function NewspaperPage() {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const fileObjectsRef = useRef<Map<string, File>>(new Map());
  const [dropboxReady, setDropboxReady] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState('');
  const [genError, setGenError] = useState('');
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Restore state from sessionStorage on mount
  useEffect(() => {
    try {
      const savedFiles = sessionStorage.getItem(SESSION_KEY_FILES);
      if (savedFiles) {
        const parsed: PdfFile[] = JSON.parse(savedFiles);
        const restored = parsed.map((f) =>
          f.status === 'processing' || f.status === 'queued'
            ? { ...f, status: 'error' as const, error: '업로드 중단됨' }
            : f
        );
        setFiles(restored);
      }
      const savedResult = sessionStorage.getItem(SESSION_KEY_RESULT);
      if (savedResult) setResult(savedResult);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist files whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY_FILES, JSON.stringify(files));
    } catch {}
  }, [files]);

  // Persist result whenever it changes
  useEffect(() => {
    try {
      if (result) sessionStorage.setItem(SESSION_KEY_RESULT, result);
    } catch {}
  }, [result]);

  const today = new Date()
    .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\. /g, '-')
    .replace('.', '');

  // Poll for Dropbox SDK
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_DROPBOX_APP_KEY) return;
    if (typeof window !== 'undefined' && window.Dropbox) { setDropboxReady(true); return; }
    const id = setInterval(() => {
      if (typeof window !== 'undefined' && window.Dropbox) { setDropboxReady(true); clearInterval(id); }
    }, 300);
    return () => clearInterval(id);
  }, []);

  const updateFile = useCallback((id: string, patch: Partial<PdfFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const processOneUrl = useCallback(
    async (entry: PdfFile, url: string) => {
      updateFile(entry.id, { status: 'processing' });
      try {
        const form = new FormData();
        form.append('type', 'url');
        form.append('url', url);
        form.append('name', entry.name);
        const res = await fetch('/api/process-newspaper', { method: 'POST', body: form });
        const data = await res.json();
        if (data.error) {
          updateFile(entry.id, { status: 'error', error: data.error });
        } else {
          updateFile(entry.id, { status: 'done', extracted: data.extracted || '' });
        }
      } catch (e) {
        updateFile(entry.id, { status: 'error', error: e instanceof Error ? e.message : '오류' });
      }
    },
    [updateFile]
  );

  const processOneFile = useCallback(
    async (entry: PdfFile, file: File) => {
      updateFile(entry.id, { status: 'processing' });
      try {
        const form = new FormData();
        form.append('type', file.type === 'application/pdf' ? 'pdf' : 'image');
        form.append('file', file);
        const res = await fetch('/api/process-newspaper', { method: 'POST', body: form });
        const data = await res.json();
        if (data.error) {
          updateFile(entry.id, { status: 'error', error: data.error });
        } else {
          updateFile(entry.id, { status: 'done', extracted: data.extracted || '' });
        }
      } catch (e) {
        updateFile(entry.id, { status: 'error', error: e instanceof Error ? e.message : '오류' });
      }
    },
    [updateFile]
  );

  const handleDropboxChoose = useCallback(() => {
    if (typeof window === 'undefined' || !window.Dropbox) return;
    window.Dropbox.choose({
      success: async (chosen) => {
        const newEntries: PdfFile[] = chosen.map((f) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: f.name,
          size: f.bytes,
          status: 'queued' as const,
          dropboxUrl: f.link,
        }));
        setFiles((prev) => [...prev, ...newEntries]);

        // Process in chunks
        const pairs = chosen.map((f, i) => ({ file: f, entry: newEntries[i] }));
        for (let i = 0; i < pairs.length; i += UPLOAD_CONCURRENCY) {
          await Promise.allSettled(
            pairs.slice(i, i + UPLOAD_CONCURRENCY).map(({ file, entry }) =>
              processOneUrl(entry, file.link)
            )
          );
        }
      },
      cancel: () => {},
      linkType: 'direct',
      multiselect: true,
      extensions: ['.pdf'],
    });
  }, [processOneUrl]);

  const handleFiles = useCallback(
    async (selected: File[]) => {
      const allPdfs: File[] = [];

      for (const f of selected) {
        const isZip =
          f.name.toLowerCase().endsWith('.zip') ||
          f.type === 'application/zip' ||
          f.type === 'application/x-zip-compressed';

        if (isZip) {
          try {
            const zip = await JSZip.loadAsync(f);
            for (const [filename, entry] of Object.entries(zip.files)) {
              if (!entry.dir && filename.toLowerCase().endsWith('.pdf')) {
                const blob = await entry.async('blob');
                const baseName = filename.split('/').pop() || filename;
                allPdfs.push(new File([blob], baseName, { type: 'application/pdf' }));
              }
            }
          } catch {
            // skip invalid zip
          }
        } else if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
          allPdfs.push(f);
        }
      }

      if (allPdfs.length === 0) return;

      const newEntries: PdfFile[] = allPdfs.map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: f.name,
        size: f.size,
        status: 'queued' as const,
      }));
      setFiles((prev) => [...prev, ...newEntries]);

      const pairs = allPdfs.map((f, i) => ({ file: f, entry: newEntries[i] }));
      pairs.forEach(({ file, entry }) => fileObjectsRef.current.set(entry.id, file));
      for (let i = 0; i < pairs.length; i += UPLOAD_CONCURRENCY) {
        await Promise.allSettled(
          pairs.slice(i, i + UPLOAD_CONCURRENCY).map(({ file, entry }) =>
            processOneFile(entry, file)
          )
        );
      }
    },
    [processOneFile]
  );

  const retryFile = useCallback(
    async (fileId: string) => {
      const f = files.find((x) => x.id === fileId);
      if (!f) return;
      updateFile(fileId, { status: 'queued', error: undefined });
      if (f.dropboxUrl) {
        await processOneUrl(f, f.dropboxUrl);
      } else {
        const localFile = fileObjectsRef.current.get(fileId);
        if (localFile) await processOneFile(f, localFile);
      }
    },
    [files, processOneUrl, processOneFile, updateFile]
  );

  const removeFile = useCallback((id: string) => {
    fileObjectsRef.current.delete(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    fileObjectsRef.current.clear();
    setFiles([]);
    setResult('');
    setGenError('');
    try {
      sessionStorage.removeItem(SESSION_KEY_FILES);
      sessionStorage.removeItem(SESSION_KEY_RESULT);
    } catch {}
  }, []);

  const generateSummary = useCallback(async () => {
    const doneFiles = files.filter((f) => f.status === 'done' && f.extracted);
    if (doneFiles.length === 0) return;

    setGenerating(true);
    setGenError('');
    setResult('');

    try {
      const res = await fetch('/api/generate-newspaper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extractedTexts: doneFiles.map((f) => f.extracted!),
          date: today,
          fileCount: doneFiles.length,
          provider: 'claude',
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data.content);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : '생성 실패');
    } finally {
      setGenerating(false);
    }
  }, [files, today]);

  const copyResult = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(result).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result]);

  const doneCount = files.filter((f) => f.status === 'done').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const busyCount = files.filter((f) => f.status === 'processing' || f.status === 'queued').length;
  const totalCount = files.length;
  const hasExtracted = files.some((f) => f.status === 'done' && f.extracted);

  return (
    <div className="h-dvh flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Header />

      <div className="flex-1 overflow-y-auto">
        <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-5">
          {/* Hero */}
          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
              한국경제 신문
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              신문 PDF 업로드 → Claude AI 기사 추출 → 날짜별 요약 아카이빙
            </p>
          </div>

          {/* Result display */}
          {result && (
            <div
              className="rounded-lg border scanline"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              {/* Toolbar */}
              <div
                className="flex items-center justify-between px-4 py-2 border-b"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
                    <div className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
                    <div className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
                  </div>
                  <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
                    hankyung_{today}.md
                  </span>
                </div>
                <button
                  onClick={copyResult}
                  className="text-xs px-2 py-1 rounded transition-all hover:opacity-80"
                  style={{ background: 'var(--surface2)', color: copied ? 'var(--green)' : 'var(--text-muted)' }}
                >
                  {copied ? '복사됨' : '복사'}
                </button>
              </div>
              {/* Content */}
              <div className="p-5 overflow-auto" style={{ maxHeight: '70vh' }}>
                <div className="text-xs leading-relaxed" style={{ color: 'var(--text)' }}>
                  {renderNewspaper(result)}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {genError && (
            <div
              className="rounded border px-4 py-3 text-xs"
              style={{ borderColor: 'var(--red)', background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}
            >
              ✕ 오류: {genError}
            </div>
          )}

          {/* Upload area */}
          <div
            className="rounded-lg border-2 border-dashed transition-colors"
            style={{
              borderColor: isDragOver ? 'var(--accent)' : 'var(--border)',
              background: isDragOver ? 'rgba(0,212,170,0.04)' : 'var(--surface)',
            }}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              handleFiles(Array.from(e.dataTransfer.files));
            }}
          >
            {/* File list */}
            {files.length > 0 && (
              <div className="p-4 pb-0">
                {/* Progress bar */}
                {totalCount > 1 && busyCount > 0 && (
                  <div className="flex items-center gap-2 text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--accent)' }}>{doneCount}/{totalCount}</span> 처리 완료
                    <div className="flex-1 rounded-full h-1" style={{ background: 'var(--border)' }}>
                      <div
                        className="h-1 rounded-full transition-all duration-300"
                        style={{ width: `${(doneCount / totalCount) * 100}%`, background: 'var(--accent)' }}
                      />
                    </div>
                    <span style={{ color: 'var(--accent)', fontWeight: '600' }}>
                      {Math.round((doneCount / totalCount) * 100)}%
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mb-4">
                  {files.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 px-3 py-1.5 rounded text-xs"
                      style={{
                        background: 'var(--surface2)',
                        border: `1px solid ${
                          f.status === 'done' ? 'var(--green)'
                          : f.status === 'error' ? 'var(--red)'
                          : f.status === 'processing' ? 'var(--accent)'
                          : 'var(--border)'
                        }`,
                        opacity: f.status === 'queued' ? 0.5 : 1,
                        maxWidth: '280px',
                      }}
                      title={f.name}
                    >
                      <span
                        className="shrink-0 font-medium"
                        style={{
                          color:
                            f.status === 'done' ? 'var(--green)'
                            : f.status === 'error' ? 'var(--red)'
                            : f.status === 'processing' ? 'var(--accent)'
                            : 'var(--text-muted)',
                        }}
                      >
                        {f.status === 'processing' ? '처리중'
                          : f.status === 'done' ? '완료'
                          : f.status === 'queued' ? '대기'
                          : '실패'}
                      </span>
                      <span
                        className="truncate"
                        style={{ color: 'var(--text-muted)', maxWidth: '160px' }}
                      >
                        {f.name}
                      </span>
                      <span className="shrink-0 opacity-50" style={{ color: 'var(--text-muted)' }}>
                        {formatSize(f.size)}
                      </span>
                      {/* Retry button */}
                      {f.status === 'error' && (f.dropboxUrl || fileObjectsRef.current.has(f.id)) && (
                        <button
                          onClick={() => retryFile(f.id)}
                          className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
                          style={{ color: 'var(--accent)' }}
                          title="재전송"
                        >
                          ↺
                        </button>
                      )}
                      {f.status !== 'processing' && (
                        <button
                          onClick={() => removeFile(f.id)}
                          className="shrink-0 opacity-40 hover:opacity-100 transition-opacity"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Toolbar */}
            <div
              className="flex items-center justify-between px-4 py-3 rounded-b-lg"
              style={{ borderTop: files.length > 0 ? '1px solid var(--border)' : 'none' }}
            >
              <div className="flex items-center gap-4">
                {/* Direct file upload */}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--text-muted)' }}
                  title="PDF 또는 ZIP 파일 업로드"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                  </svg>
                  PDF / ZIP 업로드
                </button>
                {/* Dropbox */}
                {dropboxReady && (
                  <button
                    onClick={handleDropboxChoose}
                    className="flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--text-muted)' }}
                    title="Dropbox에서 PDF 선택"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4L6 2zm12 0l-6 4 6 4-6 4 6 4 6-4-6-4 6-4-6-4zM6 17.5L0 13.5l6 4 6-4-6 4zm12 0l-6-4 6 4 6-4-6 4z" />
                    </svg>
                    Dropbox
                  </button>
                )}
                {files.length === 0 && (
                  <span className="text-xs opacity-30" style={{ color: 'var(--text-muted)' }}>
                    PDF 또는 ZIP 드래그&드롭 가능
                  </span>
                )}
                {files.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="text-xs opacity-40 hover:opacity-80 transition-opacity"
                    style={{ color: 'var(--red)' }}
                  >
                    전체 삭제
                  </button>
                )}
              </div>

              {/* Stats */}
              {files.length > 0 && (
                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {errorCount > 0 && (
                    <span style={{ color: 'var(--red)' }}>실패 {errorCount}개</span>
                  )}
                  <span>
                    <span style={{ color: 'var(--accent)' }}>{doneCount}</span>/{totalCount} 완료
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Generate button */}
          <div className="flex justify-end items-center gap-3 flex-wrap">
            <button
              onClick={generateSummary}
              disabled={!hasExtracted || generating || busyCount > 0}
              className="flex items-center gap-2 px-5 py-3 rounded-lg font-bold text-sm tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              {generating ? (
                <>
                  <span
                    style={{ width: '6px', height: '14px', background: '#000', display: 'inline-block' }}
                    className="cursor-blink"
                  />
                  요약 생성 중...
                </>
              ) : (
                '한경 요약 생성'
              )}
            </button>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {today} · {doneCount}페이지 처리됨
            </span>
          </div>

          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,application/pdf,.zip,application/zip,application/x-zip-compressed"
            multiple
            onChange={(e) => {
              const selected = Array.from(e.target.files ?? []);
              if (selected.length > 0) handleFiles(selected);
              e.target.value = '';
            }}
          />
        </main>
      </div>
    </div>
  );
}
