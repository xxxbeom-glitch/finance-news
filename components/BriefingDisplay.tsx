'use client';

interface BriefingDisplayProps {
  briefing: string;
  date?: string;
  loading?: boolean;
}

export default function BriefingDisplay({ briefing, date, loading }: BriefingDisplayProps) {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(briefing);
  };

  if (loading) {
    return (
      <div
        className="rounded-lg border p-6 scanline"
        style={{ borderColor: 'var(--accent)', background: 'var(--surface)' }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
          <span className="text-xs tracking-wider" style={{ color: 'var(--accent)' }}>
            AI 브리핑 생성 중...
          </span>
        </div>
        <div className="space-y-2">
          {[80, 65, 90, 55, 75, 70, 85].map((w, i) => (
            <div
              key={i}
              className="h-3 rounded animate-pulse"
              style={{ width: `${w}%`, background: 'var(--surface2)' }}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2" style={{ color: 'var(--accent)' }}>
          <span className="text-xs">RSS 수집 → Claude AI 분석 → 브리핑 생성</span>
          <span className="cursor-blink" />
        </div>
      </div>
    );
  }

  if (!briefing) return null;

  return (
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
            {date ? `briefing_${date}.md` : 'briefing.md'}
          </span>
        </div>
        <button
          onClick={copyToClipboard}
          className="text-xs px-2 py-1 rounded transition-all hover:opacity-80"
          style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}
        >
          복사
        </button>
      </div>

      {/* Content */}
      <div className="p-5 overflow-auto max-h-[75vh]">
        <pre className="briefing-content" style={{ color: 'var(--text)' }}>
          {briefing}
        </pre>
      </div>
    </div>
  );
}
