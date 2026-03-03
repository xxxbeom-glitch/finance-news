'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import JSZip from 'jszip';

interface PdfFile {
  id: string;
  name: string;
  size: number;
  status: 'queued' | 'processing' | 'done' | 'error';
  error?: string;
  extracted?: string;
  sourceZip?: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function getToday() {
  return new Date()
    .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\. /g, '-')
    .replace('.', '');
}

function renderResult(text: string) {
  return text.split('\n').map((line, i) => {
    const t = line.trim();
    if (/^-{10,}$/.test(t))
      return <div key={i} style={{ height: '1px', background: 'var(--border)', opacity: 0.4, margin: '12px 0' }} />;
    const bold = t.match(/^\*\*(.+?)\*\*$/) ?? t.match(/^\*\*(.+)$/);
    if (bold)
      return <div key={i} style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text)', marginTop: 4, marginBottom: 5, lineHeight: 1.55 }}>{bold[1]}</div>;
    if (t.startsWith('- ') || t.startsWith('• '))
      return (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 5, paddingLeft: 6, lineHeight: 1.6 }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0 }}>–</span>
          <span style={{ color: 'var(--text)', fontSize: '0.78rem' }}>{t.slice(2)}</span>
        </div>
      );
    if (t === '') return <div key={i} style={{ height: 4 }} />;
    const isHeader = i === 0 || t.includes('한국경제 요약');
    return <div key={i} style={{ fontSize: isHeader ? '0.82rem' : '0.74rem', fontWeight: isHeader ? 700 : 400, color: isHeader ? 'var(--accent)' : 'var(--text-muted)', marginBottom: 4 }}>{line}</div>;
  });
}

const CONCURRENCY = 4;
const SK_FILES = 'hk_pdf_files';
const SK_RESULT = 'hk_pdf_result';

export default function HankyungPdfPanel() {
  const today = getToday();
  const [files, setFiles] = useState<PdfFile[]>([]);
  const fileObjectsRef = useRef<Map<string, File>>(new Map());
  const [isDragOver, setIsDragOver] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState('');
  const [genError, setGenError] = useState('');
  const [saved, setSaved] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [date, setDate] = useState(today);
  const fileRef = useRef<HTMLInputElement>(null);

  // sessionStorage 복원
  useEffect(() => {
    try {
      const sf = sessionStorage.getItem(SK_FILES);
      if (sf) {
        const parsed: PdfFile[] = JSON.parse(sf);
        setFiles(parsed.map((f) =>
          f.status === 'processing' || f.status === 'queued'
            ? { ...f, status: 'error', error: '업로드 중단됨' }
            : f
        ));
      }
      const sr = sessionStorage.getItem(SK_RESULT);
      if (sr) setResult(sr);
    } catch {}
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(SK_FILES, JSON.stringify(files)); } catch {}
  }, [files]);

  useEffect(() => {
    try { if (result) sessionStorage.setItem(SK_RESULT, result); } catch {}
  }, [result]);

  const updateFile = useCallback((id: string, patch: Partial<PdfFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const processOne = useCallback(async (entry: PdfFile, file: File) => {
    updateFile(entry.id, { status: 'processing' });
    try {
      const form = new FormData();
      form.append('type', file.type === 'application/pdf' ? 'pdf' : 'image');
      form.append('file', file);
      const res = await fetch('/api/process-newspaper', { method: 'POST', body: form });
      const data = await res.json();
      if (data.error) updateFile(entry.id, { status: 'error', error: data.error });
      else updateFile(entry.id, { status: 'done', extracted: data.extracted || '' });
    } catch (e) {
      updateFile(entry.id, { status: 'error', error: e instanceof Error ? e.message : '오류' });
    }
  }, [updateFile]);

  const handleFiles = useCallback(async (selected: File[]) => {
    const allPdfs: Array<{ file: File; sourceZip?: string }> = [];

    for (const f of selected) {
      const isZip = f.name.toLowerCase().endsWith('.zip') || f.type.includes('zip');
      if (isZip) {
        try {
          const zip = await JSZip.loadAsync(f);
          const extracted: File[] = [];
          for (const [name, entry] of Object.entries(zip.files)) {
            if (!entry.dir && name.toLowerCase().endsWith('.pdf')) {
              const blob = await entry.async('blob');
              extracted.push(new File([blob], name.split('/').pop() || name, { type: 'application/pdf' }));
            }
          }
          extracted.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
          extracted.forEach((p) => allPdfs.push({ file: p, sourceZip: f.name }));
        } catch { /* invalid zip */ }
      } else if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        allPdfs.push({ file: f });
      }
    }

    if (!allPdfs.length) return;

    const entries: PdfFile[] = allPdfs.map(({ file: f, sourceZip }) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: f.name, size: f.size, status: 'queued', sourceZip,
    }));
    setFiles((prev) => [...prev, ...entries]);

    const pairs = allPdfs.map(({ file: f }, i) => ({ file: f, entry: entries[i] }));
    pairs.forEach(({ file, entry }) => fileObjectsRef.current.set(entry.id, file));

    for (let i = 0; i < pairs.length; i += CONCURRENCY) {
      await Promise.allSettled(
        pairs.slice(i, i + CONCURRENCY).map(({ file, entry }) => processOne(entry, file))
      );
    }
  }, [processOne]);

  const retryFile = useCallback(async (id: string) => {
    const f = files.find((x) => x.id === id);
    const local = fileObjectsRef.current.get(id);
    if (!f || !local) return;
    updateFile(id, { status: 'queued', error: undefined });
    await processOne(f, local);
  }, [files, processOne, updateFile]);

  const removeFile = useCallback((id: string) => {
    fileObjectsRef.current.delete(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    fileObjectsRef.current.clear();
    setFiles([]);
    setResult('');
    setGenError('');
    setSaved(null);
    try { sessionStorage.removeItem(SK_FILES); sessionStorage.removeItem(SK_RESULT); } catch {}
  }, []);

  const generateSummary = useCallback(async () => {
    const done = files.filter((f) => f.status === 'done' && f.extracted);
    if (!done.length) return;
    setGenerating(true);
    setGenError('');
    setResult('');
    setSaved(null);
    try {
      const res = await fetch('/api/generate-newspaper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extractedTexts: done.map((f) => f.extracted!), date, fileCount: done.length, provider: 'claude' }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data.content);
      setSaved(data.savedToArchive ?? false);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : '생성 실패');
    } finally {
      setGenerating(false);
    }
  }, [files, date]);

  const doneCount = files.filter((f) => f.status === 'done').length;
  const errCount = files.filter((f) => f.status === 'error').length;
  const busyCount = files.filter((f) => f.status === 'processing' || f.status === 'queued').length;
  const hasExtracted = files.some((f) => f.status === 'done' && f.extracted);

  return (
    <div className="flex flex-col gap-4">
      {/* 섹션 헤더 */}
      <div className="space-y-0.5">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
          한국경제
        </h2>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          신문 PDF 업로드 → Claude AI 요약
        </p>
      </div>

      {/* 에러 */}
      {genError && (
        <div className="rounded border px-3 py-2 text-xs" style={{ borderColor: 'var(--red)', background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}>
          ✕ {genError}
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div className="rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="text-xs font-bold tracking-wider" style={{ color: 'var(--accent)' }}>
              {date} 요약
            </span>
            <div className="flex items-center gap-2">
              {saved === true && <span className="text-xs" style={{ color: 'var(--green)' }}>저장됨</span>}
              <button
                onClick={() => { navigator.clipboard.writeText(result).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
                className="text-xs px-2 py-0.5 rounded"
                style={{ background: 'var(--surface2)', color: copied ? 'var(--green)' : 'var(--text-muted)' }}
              >
                {copied ? '복사됨' : '복사'}
              </button>
            </div>
          </div>
          <div className="p-3 overflow-y-auto font-mono text-xs leading-relaxed" style={{ maxHeight: '50vh' }}>
            {renderResult(result)}
          </div>
        </div>
      )}

      {/* 업로드 영역 */}
      <div
        className="rounded-lg border-2 border-dashed transition-colors"
        style={{
          borderColor: isDragOver ? 'var(--accent)' : 'var(--border)',
          background: isDragOver ? 'rgba(0,212,170,0.04)' : 'var(--surface)',
        }}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFiles(Array.from(e.dataTransfer.files)); }}
      >
        {/* 파일 목록 */}
        {files.length > 0 && (
          <div className="px-3 pt-3">
            {/* 진행바 */}
            {files.length > 1 && busyCount > 0 && (
              <div className="flex items-center gap-2 text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--accent)' }}>{doneCount}/{files.length}</span>
                <div className="flex-1 rounded-full h-1" style={{ background: 'var(--border)' }}>
                  <div className="h-1 rounded-full transition-all" style={{ width: `${(doneCount / files.length) * 100}%`, background: 'var(--accent)' }} />
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1.5 mb-3">
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-1.5 px-2 py-1 rounded text-xs" style={{
                  background: 'var(--surface2)',
                  border: `1px solid ${f.status === 'done' ? 'var(--green)' : f.status === 'error' ? 'var(--red)' : f.status === 'processing' ? 'var(--accent)' : 'var(--border)'}`,
                  opacity: f.status === 'queued' ? 0.5 : 1,
                }}>
                  <span className="shrink-0" style={{ color: f.status === 'done' ? 'var(--green)' : f.status === 'error' ? 'var(--red)' : f.status === 'processing' ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 600, minWidth: 28 }}>
                    {f.status === 'processing' ? '…' : f.status === 'done' ? '✓' : f.status === 'error' ? '✕' : '·'}
                  </span>
                  <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }} title={f.name}>{f.name}</span>
                  <span className="shrink-0 opacity-50" style={{ color: 'var(--text-muted)' }}>{formatSize(f.size)}</span>
                  {f.status === 'error' && fileObjectsRef.current.has(f.id) && (
                    <button onClick={() => retryFile(f.id)} title="재시도" style={{ color: 'var(--accent)' }}>↺</button>
                  )}
                  {f.status !== 'processing' && (
                    <button onClick={() => removeFile(f.id)} style={{ color: 'var(--text-muted)', opacity: 0.5 }}>✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 툴바 */}
        <div className="flex items-center justify-between px-3 py-2.5" style={{ borderTop: files.length > 0 ? '1px solid var(--border)' : 'none' }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              PDF / ZIP
            </button>
            {files.length === 0 && (
              <span className="text-xs opacity-30" style={{ color: 'var(--text-muted)' }}>드래그&드롭 가능</span>
            )}
            {files.length > 0 && (
              <button onClick={clearAll} className="text-xs opacity-40 hover:opacity-80 transition-opacity" style={{ color: 'var(--red)' }}>
                전체 삭제
              </button>
            )}
          </div>
          {files.length > 0 && (
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {errCount > 0 && <span style={{ color: 'var(--red)' }}>실패 {errCount} · </span>}
              <span style={{ color: 'var(--accent)' }}>{doneCount}</span>/{files.length}
            </div>
          )}
        </div>
      </div>

      {/* 날짜 + 버튼 */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 rounded-lg text-xs outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', colorScheme: 'dark' }}
        />
        <button
          onClick={generateSummary}
          disabled={!hasExtracted || generating || busyCount > 0}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg font-bold text-sm tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
          style={{ background: 'var(--accent)', color: '#000' }}
        >
          {generating ? (
            <>
              <span className="cursor-blink" style={{ width: 6, height: 14, background: '#000', display: 'inline-block' }} />
              요약 중...
            </>
          ) : '한경 요약 생성'}
        </button>
      </div>

      <input ref={fileRef} type="file" className="hidden" accept=".pdf,application/pdf,.zip" multiple
        onChange={(e) => { const s = Array.from(e.target.files ?? []); if (s.length) handleFiles(s); e.target.value = ''; }}
      />
    </div>
  );
}
