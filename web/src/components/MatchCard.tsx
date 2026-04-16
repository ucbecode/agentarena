'use client'

import { useEffect, useState } from 'react'

interface Match {
  matchId: string
  agent1Id: number
  agent2Id: number
  tier: number
  status: string
  entryFee: number
  prizePool: number
  startedAt?: number
  agent1Pnl?: number
  agent2Pnl?: number
}

const TIER_NAMES = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Diamond']

export function MatchCard({ match, onClick }: { match: Match; onClick?: () => void }) {
  const [timeRemaining, setTimeRemaining] = useState(900)

  useEffect(() => {
    if (!match.startedAt) return
    const update = () => {
      const remaining = Math.max(0, 900 - (Date.now() / 1000 - match.startedAt!))
      setTimeRemaining(Math.floor(remaining))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [match.startedAt])

  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60
  const timeProgress = ((900 - timeRemaining) / 900) * 100
  const tierClass = `tier-${TIER_NAMES[match.tier].toLowerCase()}`

  const a1 = match.agent1Pnl || 0
  const a2 = match.agent2Pnl || 0
  const a1Leading = a1 > a2
  const a2Leading = a2 > a1

  return (
    <div
      onClick={onClick}
      className="brutal-card brutal-shadow card-hover cursor-pointer p-0 bg-paper"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      aria-label={`Match: Agent ${match.agent1Id} vs Agent ${match.agent2Id}`}
    >
      {/* HEADER STRIP */}
      <div className="bg-ink text-paper px-4 py-2 flex items-center justify-between font-mono text-xs uppercase tracking-widest">
        <span>MATCH//{match.matchId.slice(-6)}</span>
        <span className="text-accent">● LIVE</span>
      </div>

      <div className="p-5">
        {/* TAGS ROW */}
        <div className="flex items-center justify-between mb-4">
          <span className={`tier-badge ${tierClass}`}>{TIER_NAMES[match.tier]}</span>
          <span className="font-display text-xl tabular-nums">
            {minutes}:{seconds.toString().padStart(2, '0')}
          </span>
        </div>

        {/* TIME BAR */}
        <div className="progress-bar mb-6">
          <div className="progress-bar-fill" style={{ width: `${timeProgress}%` }} />
        </div>

        {/* DUEL */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mb-6">
          <Fighter id={match.agent1Id} pnl={a1} leading={a1Leading} align="left" />
          <div className="vs-divider"><span>VS</span></div>
          <Fighter id={match.agent2Id} pnl={a2} leading={a2Leading} align="right" />
        </div>

        {/* PRIZE */}
        <div className="border-t-[3px] border-ink pt-3 flex items-baseline justify-between">
          <span className="data-label">PRIZE POOL</span>
          <span className="font-display text-2xl">${(match.prizePool / 1000000).toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}

function Fighter({
  id, pnl, leading, align,
}: { id: number; pnl: number; leading: boolean; align: 'left' | 'right' }) {
  const positive = pnl >= 0
  return (
    <div className={`flex flex-col ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
      <div
        className={`w-16 h-16 border-[3px] border-ink flex items-center justify-center font-display text-xl mb-2 ${
          leading ? 'bg-accent text-paper brutal-shadow-sm' : 'bg-paper text-ink'
        }`}
      >
        #{id}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted">AGENT</div>
      <div className={`font-mono text-sm font-bold ${positive ? '' : ''}`}>
        {positive ? '+' : '−'}${Math.abs(pnl / 100).toFixed(2)}
      </div>
    </div>
  )
}
