'use client';

import { useEffect } from 'react';
import type { AIProvider } from '@/lib/ai-providers';

const STORAGE_KEY = 'ai_provider';

const PROVIDERS: { key: AIProvider; label: string; sub: string }[] = [
  { key: 'claude',  label: 'Claude',  sub: 'Anthropic' },
  { key: 'openai',  label: 'GPT-4o',  sub: 'OpenAI'    },
  { key: 'gemini',  label: 'Gemini',  sub: 'Google'    },
];

interface AIProviderSelectorProps {
  value: AIProvider;
  onChange: (p: AIProvider) => void;
}

export function AIProviderSelector({ value, onChange }: AIProviderSelectorProps) {
  // Restore from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as AIProvider | null;
    if (saved && ['claude', 'openai', 'gemini'].includes(saved)) onChange(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (p: AIProvider) => {
    onChange(p);
    localStorage.setItem(STORAGE_KEY, p);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        AI 엔진
      </span>
      <div
        className="flex gap-0.5 p-0.5 rounded-lg"
        style={{ background: 'var(--surface)' }}
      >
        {PROVIDERS.map(({ key, label, sub }) => (
          <button
            key={key}
            onClick={() => select(key)}
            className="flex flex-col items-center px-3 py-1 rounded text-xs transition-all"
            style={{
              background: value === key ? 'var(--accent)' : 'transparent',
              color: value === key ? '#000' : 'var(--text-muted)',
              fontWeight: value === key ? '700' : '400',
              minWidth: '58px',
            }}
            title={sub}
          >
            <span>{label}</span>
            <span style={{ fontSize: '9px', opacity: 0.65 }}>{sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
