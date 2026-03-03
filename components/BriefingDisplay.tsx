'use client';

import React from 'react';

interface BriefingDisplayProps {
  briefing: string;
  date?: string;
  loading?: boolean;
}

// Render source citation line: 출처: Bloomberg (https://...), CNBC (https://...)
function renderCitationLine(line: string, key: number) {
  const prefix = '출처:';
  const rest = line.slice(prefix.length);
  // Match: 소스명 (URL) patterns
  const pattern = /([\w\s가-힣/&·]+?)\s*\((https?:\/\/[^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(rest)) !== null) {
    if (match.index > last) {
      parts.push(<span key={`t${last}`}>{rest.slice(last, match.index)}</span>);
    }
    parts.push(
      <a
        key={`l${match.index}`}
        href={match[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:opacity-70 transition-opacity"
        style={{ color: 'var(--accent)' }}
      >
        {match[1].trim()}
      </a>
    );
    last = match.index + match[0].length;
  }
  if (last < rest.length) {
    parts.push(<span key={`t${last}`}>{rest.slice(last)}</span>);
  }

  return (
    <div
      key={key}
      className="text-xs mt-2 mb-1"
      style={{ color: 'var(--text-muted)', opacity: 0.75 }}
    >
      <span style={{ color: 'var(--text-muted)' }}>출처: </span>
      {parts.length > 0 ? parts : <span>{rest}</span>}
    </div>
  );
}

/**
 * Parse numbered list content for company+ticker format:
 * "{기업명} ({티커}) / ±N.XX% : {설명}"
 * Renders name+ticker in bold with accent/green/red color.
 */
function renderCompanyLine(content: string): React.ReactNode {
  // Match: {기업명} ({티커}) / {±등락률}% : {설명}
  const m = content.match(
    /^(.*?)\s*\(([A-Z0-9^.=\-]{1,10})\)\s*(\/\s*[+-]?[\d.]+%\s*:)(.*)/
  );
  if (!m) return content;

  const companyName = m[1].trim();
  const ticker = m[2];
  const rateAndColon = m[3]; // e.g. "/ +5.2% :"
  const description = m[4];

  const isPositive = rateAndColon.includes('+');
  const isNegative = rateAndColon.includes('-');
  const rateColor = isPositive ? 'var(--green)' : isNegative ? 'var(--red)' : 'var(--text-muted)';

  return (
    <>
      <span style={{ fontWeight: '700', color: 'var(--text)' }}>{companyName}</span>
      {' '}
      <span style={{ fontWeight: '700', color: 'var(--accent)' }}>({ticker})</span>
      {' '}
      <span style={{ color: rateColor, fontWeight: '600' }}>{rateAndColon.trim()}</span>
      <span>{description}</span>
    </>
  );
}

function renderBriefing(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Divider
    if (/^-{3,}$/.test(line.trim())) {
      return (
        <hr key={i} style={{ borderColor: 'var(--border)', margin: '16px 0', opacity: 0.5 }} />
      );
    }

    // Section header (## prefix) — 2pt larger: 0.8rem → 0.95rem
    if (line.startsWith('## ')) {
      const content = line.slice(3);
      return (
        <div
          key={i}
          style={{
            fontWeight: '700',
            fontSize: '0.95rem',
            letterSpacing: '0.05em',
            marginTop: i === 0 ? 0 : '14px',
            marginBottom: '6px',
            color: 'var(--accent)',
          }}
        >
          {content}
        </div>
      );
    }

    // Source citation line
    if (line.startsWith('출처:')) {
      return renderCitationLine(line, i);
    }

    // Numbered list items (1. 2. 3.)
    if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        return (
          <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '4px', paddingLeft: '4px' }}>
            <span style={{ color: 'var(--accent)', flexShrink: 0, minWidth: '16px' }}>{match[1]}.</span>
            <span>{renderCompanyLine(match[2])}</span>
          </div>
        );
      }
    }

    // Sub-section labels (상승 기업 / 하락 기업 / 주요 지수 / 섹터별 등 — indented plain labels)
    if (
      /^(상승 기업|하락 기업|주요 지수|섹터별 주요 뉴스|주요 기업)$/.test(line.trim())
    ) {
      return (
        <div
          key={i}
          style={{
            fontWeight: '600',
            fontSize: '0.72rem',
            marginTop: '10px',
            marginBottom: '4px',
            color: 'var(--text)',
            opacity: 0.85,
          }}
        >
          {line.trim()}
        </div>
      );
    }

    // Bullet items
    if (line.startsWith('- ') || line.startsWith('• ')) {
      const content = line.slice(2);
      return (
        <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '4px', paddingLeft: '4px' }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0 }}>–</span>
          <span>{content}</span>
        </div>
      );
    }

    // Empty line
    if (line.trim() === '') {
      return <div key={i} style={{ height: '4px' }} />;
    }

    // Default text (date header, plain content)
    return (
      <div
        key={i}
        style={{
          marginBottom: '2px',
          fontWeight: i === 0 ? '700' : undefined,
          fontSize: i === 0 ? '0.85rem' : undefined,
          color: i === 0 ? 'var(--text)' : undefined,
        }}
      >
        {line}
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
      <div className="p-5 overflow-auto" style={{ maxHeight: '70vh' }}>
        <div className="briefing-content text-xs leading-relaxed" style={{ color: 'var(--text)' }}>
          {renderBriefing(briefing)}
        </div>
      </div>
    </div>
  );
}
