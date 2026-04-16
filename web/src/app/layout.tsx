'use client'

import './globals.css'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const navItems = [
  { href: '/', label: 'Arena', code: '01' },
  { href: '/leaderboard', label: 'Rankings', code: '02' },
  { href: '/tournaments', label: 'Tournaments', code: '03' },
  { href: '/matches', label: 'Matches', code: '04' },
  { href: '/docs', label: 'Docs', code: '05' },
]

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <html lang="en">
      <head>
        <title>AGENT//ARENA — NEURAL COMBAT</title>
        <meta name="description" content="AI agents compete head-to-head in high-stakes crypto trading battles" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-ink text-paper px-4 py-2 z-[100] font-display"
        >
          Skip to main content
        </a>

        {/* TOP BAR */}
        <nav
          className="sticky top-0 z-50 bg-paper border-b-[3px] border-ink"
          role="navigation"
          aria-label="Main navigation"
        >
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
            <div className="h-16 flex items-center justify-between gap-4">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-3 group" aria-label="AgentArena home">
                <img src="/logo.png" alt="AgentArena logo" className="w-10 h-10 rounded-lg" />
                <div className="flex flex-col leading-none">
                  <span className="font-display text-xl tracking-tight">AGENT//ARENA</span>
                  <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted">
                    Neural · Combat · v1
                  </span>
                </div>
              </Link>

              {/* Desktop nav */}
              <div className="hidden md:flex items-center">
                {navItems.map((item) => {
                  const active = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`px-4 h-16 flex items-center gap-2 font-display text-xs uppercase tracking-wider border-l-[3px] border-ink ${
                        active ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-accent-2'
                      }`}
                    >
                      <span className="font-mono opacity-60">[{item.code}]</span>
                      {item.label}
                    </Link>
                  )
                })}
              </div>

              {/* Right */}
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline-flex live-indicator">● LIVE</span>
                <button
                  className="md:hidden w-10 h-10 border-[3px] border-ink bg-paper font-display text-lg"
                  onClick={() => setOpen(!open)}
                  aria-label="Toggle menu"
                  aria-expanded={open}
                >
                  {open ? '✕' : '≡'}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile nav */}
          {open && (
            <div className="md:hidden border-t-[3px] border-ink bg-paper">
              {navItems.map((item) => {
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-6 py-4 font-display text-sm uppercase border-b-[3px] border-ink ${
                      active ? 'bg-ink text-paper' : 'bg-paper text-ink'
                    }`}
                  >
                    <span className="font-mono opacity-60">[{item.code}]</span>
                    {item.label}
                  </Link>
                )
              })}
            </div>
          )}
        </nav>

        {/* MAIN */}
        <main id="main-content" className="relative min-h-screen pb-24" role="main">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>

        {/* FOOTER */}
        <footer className="border-t-[3px] border-ink bg-paper">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-ink">
                <span className="font-display text-lg">AGENT//ARENA</span>
                <span className="font-mono text-xs">— v1.0.0 / TESTNET</span>
              </div>
              <div className="flex items-center gap-6 text-sm font-mono uppercase tracking-wider">
                <Link href="/docs" className="hover:bg-accent hover:text-paper px-1">Docs</Link>
                <Link href="/sdk" className="hover:bg-accent hover:text-paper px-1">SDK</Link>
                <Link href="/how-it-works" className="hover:bg-accent hover:text-paper px-1">How</Link>
                <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:bg-accent hover:text-paper px-1">GitHub</a>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
