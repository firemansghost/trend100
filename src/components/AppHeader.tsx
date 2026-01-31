'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const OUTBOUND_LINKS = [
  { label: 'GrayGhost Labs', href: 'https://www.grayghostlabs.com/' },
  { label: 'GhostGauge', href: 'https://www.ghostgauge.com/' },
  { label: 'Ghost Allocator', href: 'https://ghost-allocator.vercel.app/' },
] as const;

export function AppHeader() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onMouseDown(e: MouseEvent) {
      if (!open) return;
      const el = menuRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-baseline gap-2 text-zinc-100 hover:text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 rounded"
        >
          <span className="text-sm font-semibold tracking-wide">Trend100</span>
          <span className="hidden sm:inline text-xs text-zinc-400">by GrayGhost Labs</span>
        </Link>

        {/* Desktop links */}
        <nav className="hidden sm:flex items-center gap-4 text-xs">
          {OUTBOUND_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-300 hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500 rounded"
            >
              {l.label}
            </a>
          ))}
        </nav>

        {/* Mobile menu */}
        <div className="sm:hidden relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Open GrayGhost Labs links menu"
            className="px-3 py-1 text-xs rounded border bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            Links
          </button>

          {open && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 rounded border border-zinc-800 bg-zinc-950 shadow-lg overflow-hidden"
            >
              {OUTBOUND_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                  className="block px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900 focus:bg-zinc-900 focus:outline-none"
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

