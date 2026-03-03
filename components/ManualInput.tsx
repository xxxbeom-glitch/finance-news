'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

const MAX_FILE_SIZE_MB = 3;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_FILES_PER_BATCH = 30;
const MAX_CLIPBOARD_IMAGES = 10;
const UPLOAD_CONCURRENCY = 5;
const SESSION_KEY_FILES = 'manualInput_files';
const SESSION_KEY_SUMMARY = 'manualInput_summary';

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

interface AttachedFile {
  id: string;
  name: string;
  size: number;
  status: 'queued' | 'processing' | 'done' | 'error';
  error?: string;
}

interface ManualInputProps {
  onSummaryReady: (summary: string) => void;
  onSummaryClear: () => void;
}

export default function ManualInput({ onSummaryReady, onSummaryClear }: ManualInputProps) {
  const [text, setText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [clipboardCount, setClipboardCount] = useState(0);
  const [dropboxReady, setDropboxReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const accumulatedSummary = useRef<string[]>([]);

  // Poll for Dropbox SDK readiness (lazyOnload fires after hydration)
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_DROPBOX_APP_KEY) return;
    if (typeof window !== 'undefined' && window.Dropbox) {
      setDropboxReady(true);
      return;
    }
    const id = setInterval(() => {
      if (typeof window !== 'undefined' && window.Dropbox) {
        setDropboxReady(true);
        clearInterval(id);
      }
    }, 300);
    return () => clearInterval(id);
  }, []);

  // Restore state from sessionStorage on mount
  useEffect(() => {
    try {
      const savedFiles = sessionStorage.getItem(SESSION_KEY_FILES);
      if (savedFiles) {
        const files: AttachedFile[] = JSON.parse(savedFiles);
        // Files that were mid-upload can't be resumed — mark as interrupted
        const restored = files.map((f) =>
          f.status === 'processing' || f.status === 'queued'
            ? { ...f, status: 'error' as const, error: '업로드 중단됨' }
            : f
        );
        setAttachedFiles(restored);
      }

      const savedSummary = sessionStorage.getItem(SESSION_KEY_SUMMARY);
      if (savedSummary) {
        const summaries: string[] = JSON.parse(savedSummary);
        accumulatedSummary.current = summaries;
        if (summaries.length > 0) {
          onSummaryReady(summaries.join('\n\n---\n\n'));
        }
      }
    } catch {
      // sessionStorage unavailable or corrupt — start fresh
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist attachedFiles whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY_FILES, JSON.stringify(attachedFiles));
    } catch {}
  }, [attachedFiles]);

  const addSummary = useCallback(
    (summary: string) => {
      accumulatedSummary.current.push(summary);
      const joined = accumulatedSummary.current.join('\n\n---\n\n');
      try {
        sessionStorage.setItem(SESSION_KEY_SUMMARY, JSON.stringify(accumulatedSummary.current));
      } catch {}
      onSummaryReady(joined);
    },
    [onSummaryReady]
  );

  const removeFile = useCallback(
    (id: string) => {
      setAttachedFiles((prev) => {
        const next = prev.filter((f) => f.id !== id);
        if (next.length === 0 && text.trim() === '') {
          accumulatedSummary.current = [];
          try {
            sessionStorage.removeItem(SESSION_KEY_FILES);
            sessionStorage.removeItem(SESSION_KEY_SUMMARY);
          } catch {}
          onSummaryClear();
        }
        return next;
      });
    },
    [text, onSummaryClear]
  );

  const processFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      // Validate sizes
      const oversized = files.filter((f) => f.size > MAX_FILE_SIZE_BYTES);
      if (oversized.length > 0) {
        alert(`파일 크기 초과: ${oversized.map((f) => f.name).join(', ')}\n최대 ${MAX_FILE_SIZE_MB}MB까지 허용됩니다.`);
        return;
      }

      if (files.length > MAX_FILES_PER_BATCH) {
        alert(`한 번에 최대 ${MAX_FILES_PER_BATCH}개까지 첨부 가능합니다.`);
        return;
      }

      const newEntries: AttachedFile[] = files.map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: f.name || `이미지_${Date.now()}`,
        size: f.size,
        status: 'queued' as AttachedFile['status'],
      }));

      setAttachedFiles((prev) => [...prev, ...newEntries]);

      // Process files with concurrency limit (UPLOAD_CONCURRENCY at a time)
      const processOne = async (file: File, entry: AttachedFile) => {
        setAttachedFiles((prev) =>
          prev.map((f) => (f.id === entry.id ? { ...f, status: 'processing' } : f))
        );
        try {
          const form = new FormData();
          form.append('type', file.type === 'application/pdf' ? 'pdf' : 'image');
          form.append('file', file);

          const res = await fetch('/api/process-manual', { method: 'POST', body: form });
          const data = await res.json();

          if (data.summary) {
            addSummary(data.summary);
            setAttachedFiles((prev) =>
              prev.map((f) => (f.id === entry.id ? { ...f, status: 'done' } : f))
            );
          } else {
            setAttachedFiles((prev) =>
              prev.map((f) =>
                f.id === entry.id
                  ? { ...f, status: 'error', error: data.error || '처리 실패' }
                  : f
              )
            );
          }
        } catch (e) {
          setAttachedFiles((prev) =>
            prev.map((f) =>
              f.id === entry.id
                ? { ...f, status: 'error', error: e instanceof Error ? e.message : '오류' }
                : f
            )
          );
        }
      };

      // Run in chunks of UPLOAD_CONCURRENCY
      const pairs = files.map((file, i) => ({ file, entry: newEntries[i] }));
      for (let i = 0; i < pairs.length; i += UPLOAD_CONCURRENCY) {
        await Promise.allSettled(
          pairs.slice(i, i + UPLOAD_CONCURRENCY).map(({ file, entry }) => processOne(file, entry))
        );
      }
    },
    [addSummary]
  );

  const processDropboxFiles = useCallback(
    async (files: Array<{ name: string; link: string; bytes: number }>) => {
      if (files.length === 0) return;

      const newEntries: AttachedFile[] = files.map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: f.name,
        size: f.bytes,
        status: 'queued' as AttachedFile['status'],
      }));

      setAttachedFiles((prev) => [...prev, ...newEntries]);

      const processOne = async (file: { name: string; link: string; bytes: number }, entry: AttachedFile) => {
        setAttachedFiles((prev) =>
          prev.map((f) => (f.id === entry.id ? { ...f, status: 'processing' } : f))
        );
        try {
          const form = new FormData();
          form.append('type', 'url');
          form.append('url', file.link);
          form.append('name', file.name);

          const res = await fetch('/api/process-manual', { method: 'POST', body: form });
          const data = await res.json();

          if (data.summary) {
            addSummary(data.summary);
            setAttachedFiles((prev) =>
              prev.map((f) => (f.id === entry.id ? { ...f, status: 'done' } : f))
            );
          } else {
            setAttachedFiles((prev) =>
              prev.map((f) =>
                f.id === entry.id
                  ? { ...f, status: 'error', error: data.error || '처리 실패' }
                  : f
              )
            );
          }
        } catch (e) {
          setAttachedFiles((prev) =>
            prev.map((f) =>
              f.id === entry.id
                ? { ...f, status: 'error', error: e instanceof Error ? e.message : '오류' }
                : f
            )
          );
        }
      };

      const pairs = files.map((file, i) => ({ file, entry: newEntries[i] }));
      for (let i = 0; i < pairs.length; i += UPLOAD_CONCURRENCY) {
        await Promise.allSettled(
          pairs.slice(i, i + UPLOAD_CONCURRENCY).map(({ file, entry }) => processOne(file, entry))
        );
      }
    },
    [addSummary]
  );

  const handleDropboxChoose = useCallback(() => {
    if (typeof window === 'undefined' || !window.Dropbox) return;
    window.Dropbox.choose({
      success: (files) => {
        processDropboxFiles(files.map((f) => ({ name: f.name, link: f.link, bytes: f.bytes })));
      },
      cancel: () => {},
      linkType: 'direct',
      multiselect: true,
      extensions: ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'],
    });
  }, [processDropboxFiles]);

  const processText = useCallback(async () => {
    if (!text.trim()) return;
    const form = new FormData();
    form.append('type', 'text');
    form.append('text', text);

    const textEntry: AttachedFile = {
      id: `text-${Date.now()}`,
      name: '텍스트 입력',
      size: new Blob([text]).size,
      status: 'processing',
    };
    setAttachedFiles((prev) => [...prev, textEntry]);
    setText('');

    try {
      const res = await fetch('/api/process-manual', { method: 'POST', body: form });
      const data = await res.json();
      if (data.summary) {
        addSummary(data.summary);
        setAttachedFiles((prev) =>
          prev.map((f) => (f.id === textEntry.id ? { ...f, status: 'done' } : f))
        );
      } else {
        setAttachedFiles((prev) =>
          prev.map((f) =>
            f.id === textEntry.id
              ? { ...f, status: 'error', error: data.error || '처리 실패' }
              : f
          )
        );
      }
    } catch {
      setAttachedFiles((prev) =>
        prev.map((f) =>
          f.id === textEntry.id ? { ...f, status: 'error', error: '요청 실패' } : f
        )
      );
    }
  }, [text, addSummary]);

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const imageItems = items.filter((item) => item.type.startsWith('image/'));

      if (imageItems.length > 0) {
        e.preventDefault();
        if (clipboardCount >= MAX_CLIPBOARD_IMAGES) {
          alert(`클립보드 이미지는 최대 ${MAX_CLIPBOARD_IMAGES}개까지 붙여넣기 가능합니다.`);
          return;
        }
        const files = imageItems
          .slice(0, MAX_CLIPBOARD_IMAGES - clipboardCount)
          .map((item) => item.getAsFile())
          .filter(Boolean) as File[];

        setClipboardCount((c) => c + files.length);
        await processFiles(files);
      }
    },
    [clipboardCount, processFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) processFiles(files);
    },
    [processFiles]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        processText();
      }
    },
    [processText]
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  return (
    <div className="flex-1 flex flex-col gap-2">
      {/* File list */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(() => {
            const done = attachedFiles.filter((f) => f.status === 'done').length;
            const total = attachedFiles.length;
            const hasActive = attachedFiles.some((f) => f.status === 'processing' || f.status === 'queued');
            if (total > 1 && hasActive) {
              const pct = Math.round((done / total) * 100);
              return (
                <div className="w-full flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  <span style={{ color: 'var(--accent)' }}>{done}/{total}</span> 처리 완료
                  <div className="flex-1 rounded-full h-1" style={{ background: 'var(--border)' }}>
                    <div
                      className="h-1 rounded-full transition-all duration-300"
                      style={{ width: `${(done / total) * 100}%`, background: 'var(--accent)' }}
                    />
                  </div>
                  <span style={{ color: 'var(--accent)', fontWeight: '600', minWidth: '32px', textAlign: 'right' }}>
                    {pct}%
                  </span>
                </div>
              );
            }
            return null;
          })()}
          {attachedFiles.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-xs"
              style={{
                background: 'var(--surface2)',
                border: `1px solid ${
                  f.status === 'done'
                    ? 'var(--green)'
                    : f.status === 'error'
                    ? 'var(--red)'
                    : f.status === 'processing'
                    ? 'var(--accent)'
                    : 'var(--border)'
                }`,
                opacity: f.status === 'queued' ? 0.45 : 1,
              }}
            >
              <span
                style={{
                  color:
                    f.status === 'done'
                      ? 'var(--green)'
                      : f.status === 'error'
                      ? 'var(--red)'
                      : f.status === 'processing'
                      ? 'var(--accent)'
                      : 'var(--text-muted)',
                }}
              >
                {f.status === 'processing' ? '처리중' : f.status === 'done' ? '완료' : f.status === 'queued' ? '대기' : '실패'}
              </span>
              <span style={{ color: 'var(--text-muted)' }} className="max-w-[120px] truncate">
                {f.name}
              </span>
              <span style={{ color: 'var(--text-muted)', opacity: 0.6 }}>{formatSize(f.size)}</span>
              {f.status !== 'processing' && (
                <button
                  onClick={() => removeFile(f.id)}
                  className="opacity-50 hover:opacity-100 ml-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div
        className="relative rounded-lg border transition-colors"
        style={{
          borderColor: isDragOver ? 'var(--accent)' : 'var(--border)',
          background: isDragOver ? 'rgba(0,212,170,0.04)' : 'var(--surface)',
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        <textarea
          className="w-full rounded-lg px-4 pt-3 pb-10 text-xs resize-none outline-none bg-transparent"
          style={{
            color: 'var(--text)',
            minHeight: '80px',
            maxHeight: '160px',
          }}
          placeholder="신문 기사, 리포트 내용 붙여넣기... (Ctrl+Enter로 제출 / Ctrl+V로 스크린샷 첨부 / 파일 드래그&드롭)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        {/* Bottom toolbar */}
        <div
          className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2 rounded-b-lg"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}
        >
          <div className="flex items-center gap-3">
            {/* File attach button */}
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
              title="파일 첨부 (PDF, 이미지 / 파일당 최대 3MB / 한번에 최대 30개)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
              파일 첨부
            </button>
            {/* Dropbox Chooser button */}
            {dropboxReady && (
              <button
                onClick={handleDropboxChoose}
                className="flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--text-muted)' }}
                title="Dropbox에서 파일 선택"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4L6 2zm12 0l-6 4 6 4-6 4 6 4 6-4-6-4 6-4-6-4zM6 17.5L0 13.5l6 4 6-4-6 4zm12 0l-6-4 6 4 6-4-6 4z" />
                </svg>
                Dropbox
              </button>
            )}
            <span className="text-xs opacity-30" style={{ color: 'var(--text-muted)' }}>
              파일당 최대 3MB · 최대 30개
            </span>
          </div>

          {text.trim() && (
            <button
              onClick={processText}
              className="text-xs px-3 py-1 rounded font-bold transition-all hover:opacity-80"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              제출
            </button>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,image/*"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) processFiles(files);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
