'use client';

import { useState, useCallback, useRef } from 'react';

interface ManualInputProps {
  onSummaryReady: (summary: string) => void;
}

export default function ManualInput({ onSummaryReady }: ManualInputProps) {
  const [tab, setTab] = useState<'text' | 'file'>('text');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Send all files as a single batch request and return combined summary */
  const processFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setLoading(true);
      setStatus(
        files.length > 1
          ? `${files.length}개 파일 처리 중...`
          : `처리 중: ${files[0].name}`
      );

      try {
        const form = new FormData();
        const isPdf = files[0].type === 'application/pdf';
        form.append('type', isPdf ? 'pdf' : 'image');

        if (files.length === 1) {
          form.append('file', files[0]);
        } else {
          files.forEach((file, i) => form.append(`file_${i}`, file));
        }

        const res = await fetch('/api/process-manual', { method: 'POST', body: form });
        const data = await res.json();
        if (data.summary) {
          onSummaryReady(data.summary);
          setStatus('완료');
        } else {
          setStatus('오류: ' + (data.error || 'unknown'));
        }
      } catch (e) {
        setStatus('오류: ' + (e instanceof Error ? e.message : 'unknown'));
      } finally {
        setLoading(false);
      }
    },
    [onSummaryReady]
  );

  const processText = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setStatus('텍스트 요약 중...');
    const form = new FormData();
    form.append('type', 'text');
    form.append('text', text);

    try {
      const res = await fetch('/api/process-manual', { method: 'POST', body: form });
      const data = await res.json();
      if (data.summary) {
        onSummaryReady(data.summary);
        setStatus('완료');
        setText('');
      } else {
        setStatus('오류: ' + (data.error || 'unknown'));
      }
    } catch {
      setStatus('요청 실패');
    } finally {
      setLoading(false);
    }
  };

  // Ctrl+V image paste
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      if (imageItem) {
        e.preventDefault();
        const file = imageItem.getAsFile();
        if (file) await processFiles([file]);
      }
    },
    [processFiles]
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

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      onPaste={handlePaste}
    >
      {/* Section title */}
      <div className="flex items-center gap-2 mb-4">
        <span style={{ color: 'var(--accent)' }}>📄</span>
        <span className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
          수동 자료 입력
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          (한경 신문 / 증권사 리포트)
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3">
        {(['text', 'file'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-1 text-xs rounded transition-all"
            style={{
              background: tab === t ? 'var(--accent)' : 'var(--surface2)',
              color: tab === t ? '#000' : 'var(--text-muted)',
              fontWeight: tab === t ? '700' : '400',
            }}
          >
            {t === 'text' ? '텍스트 붙여넣기' : 'PDF / 이미지'}
          </button>
        ))}
      </div>

      {tab === 'text' ? (
        <div className="space-y-2">
          <textarea
            className="w-full rounded p-3 text-xs resize-none outline-none transition-colors"
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              minHeight: '120px',
            }}
            placeholder="뉴스 기사, 리포트 내용을 붙여넣으세요..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
          <button
            onClick={processText}
            disabled={loading || !text.trim()}
            className="px-4 py-2 rounded text-xs font-bold tracking-wider transition-all disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            {loading ? '처리 중...' : 'AI 요약'}
          </button>
        </div>
      ) : (
        <div
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all"
          style={{
            borderColor: isDragOver ? 'var(--accent)' : 'var(--border)',
            background: isDragOver ? 'rgba(0,212,170,0.05)' : 'var(--surface2)',
          }}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,image/*"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) processFiles(files);
              // reset so same files can be re-selected
              e.target.value = '';
            }}
          />
          <div className="text-3xl mb-2">📎</div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            PDF / 이미지를 드래그하거나 클릭하여 업로드
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            여러 파일 동시 선택 가능 · 파일 개수/용량 제한 없음
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            또는{' '}
            <kbd className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--border)' }}>
              Ctrl+V
            </kbd>
            로 스크린샷 붙여넣기
          </p>
        </div>
      )}

      {status && (
        <p
          className="text-xs mt-2"
          style={{
            color:
              status === '완료'
                ? 'var(--green)'
                : status.includes('오류')
                ? 'var(--red)'
                : 'var(--accent)',
          }}
        >
          ▶ {status}
        </p>
      )}
    </div>
  );
}
