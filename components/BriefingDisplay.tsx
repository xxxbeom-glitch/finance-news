'use client';

import React from 'react';

interface BriefingDisplayProps {
  briefing: string;
  date?: string;
  loading?: boolean;
}

// Render a single line, converting [🔗](URL) to clickable anchor tags
function renderLineWithLinks(line: string, key: number) {
  const linkPattern = /\[🔗\]\((https?:\/\/[^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(line)) !== null) {
    if (match.index > last) {
      parts.push(<span key={`t${last}`}>{line.slice(last, match.index)}</span>);
    }
    parts.push(
      <a
        key={`l${match.index}`}
        href={match[1]}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--accent)', textDecoration: 'none', marginLeft: '4px' }}
        onMouseEnter={(e) => ((e.target as HTMLElement).style.opacity = '0.7')}
        onMouseLeave={(e) => ((e.target as HTMLElement).style.opacity = '1')}
      >
        🔗
      </a>
    );
    last = match.index + match[0].length;
  }
  if (last < line.length) {
    parts.push(<span key={`t${last}`}>{line.slice(last)}</span>);
  }

  return <span key={key}>{parts}</span>;
}

function renderBriefing(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    if (line === '---') {
      return <hr key={i} style={{ borderColor: 'var(--border)', margin: '12px 0' }} />;
    }
    if (line.startsWith('- ') || line.startsWith('• ')) {
      const content = line.slice(2);
      return (
        <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px', paddingLeft: '4px' }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0 }}>–</span>
          <span>{renderLineWithLinks(content, i)}</span>
        </div>
      );
    }
    // Section header lines (contain emoji at start) or bold lines
    const isSectionHeader = /^[📅🇺🇸🤖🛢🌍🇰🇷]/.test(line);
    if (isSectionHeader) {
      return (
        <div
          key={i}
          style={{
            fontWeight: '700',
            marginTop: i === 0 ? 0 : '16px',
            marginBottom: '8px',
            color: 'var(--text)',
          }}
        >
          {line}
        </div>
      );
    }
    if (line.trim() === '') {
      return <div key={i} style={{ height: '4px' }} />;
    }
    return (
      <div key={i} style={{ marginBottom: '2px' }}>
        {renderLineWithLinks(line, i)}
      </div>
    );
  });
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
        <div className="briefing-content text-xs leading-relaxed" style={{ color: 'var(--text)' }}>
          {renderBriefing(briefing)}
        </div>
      </div>
    </div>
  );
}
