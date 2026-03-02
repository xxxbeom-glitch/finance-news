'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Header() {
  const pathname = usePathname();

  return (
    <header
      className="border-b sticky top-0 z-50"
      style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
    >
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: 'var(--accent)' }}
          />
          <span className="font-bold text-sm tracking-widest uppercase" style={{ color: 'var(--accent)' }}>
            Finance Terminal
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            v1.0
          </span>
        </div>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {[
            { href: '/', label: 'BRIEFING' },
            { href: '/archive', label: 'ARCHIVE' },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-1.5 text-xs tracking-wider rounded transition-all duration-200"
              style={{
                background: pathname === href ? 'var(--accent)' : 'transparent',
                color: pathname === href ? '#000' : 'var(--text-muted)',
                fontWeight: pathname === href ? '700' : '400',
              }}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Status */}
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {new Date().toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            weekday: 'short',
          })}
        </div>
      </div>
    </header>
  );
}
