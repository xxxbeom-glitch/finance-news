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

  const processFile = useCallback(async (file: File) => {
    setLoading(true);
    setStatus(`처리 중: ${file.name}`);
    const form = new FormData();
    form.append('file', file);
    form.append('type', file.type === 'application/pdf' ? 'pdf' : 'image');

    try {
      const res = await fetch('/api/process-manual', { method: 'POST', body: form });
      const data = await res.json();
      if (data.summary) {
        onSummaryReady(data.summary);
        setStatus('완료');
      } else {
        setStatus('오류: ' + (data.error || 'unknown'));
      }
    } catch {
      setStatus('요청 실패');
    } finally {
      setLoading(false);
    }
  }, [onSummaryReady]);

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
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) await processFile(file);
    }
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

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
            onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
          />
          <div className="text-3xl mb-2">📎</div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            PDF / 이미지를 드래그하거나 클릭하여 업로드
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            또는 <kbd className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--border)' }}>Ctrl+V</kbd>로 스크린샷 붙여넣기
          </p>
        </div>
      )}

      {status && (
        <p
          className="text-xs mt-2"
          style={{ color: status === '완료' ? 'var(--green)' : status.includes('오류') ? 'var(--red)' : 'var(--accent)' }}
        >
          ▶ {status}
        </p>
      )}
    </div>
  );
}
