'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Trophy, Clock, RefreshCw, AlertCircle, ChevronDown, Filter } from 'lucide-react'

interface Match {
  matchId: string
  agent1Id: number
  agent2Id: number
  tier: number
  status: string
  entryFee: number
  prizePool: number
  startedAt?: number
  endedAt?: number
  agent1Pnl?: number
  agent2Pnl?: number
  winnerId?: number
}

// API response interface (snake_case)
interface ApiMatch {
  match_id: string
  agent1_id: number
  agent2_id: number
  tier: number
  status: string
  entry_fee: number
  prize_pool: number
  started_at?: number
  ended_at?: number
  agent1_pnl?: number
  agent2_pnl?: number
  winner_id?: number
}

const TIER_NAMES = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Diamond']
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3460'

function mapApiMatch(m: ApiMatch): Match {
  return {
    matchId: m.match_id,
    agent1Id: m.agent1_id,
    agent2Id: m.agent2_id,
    tier: m.tier,
    status: m.status,
    entryFee: m.entry_fee,
    prizePool: m.prize_pool,
    startedAt: m.started_at,
    endedAt: m.ended_at,
    agent1Pnl: m.agent1_pnl,
    agent2Pnl: m.agent2_pnl,
    winnerId: m.winner_id,
  }
}

export default function HistoryPage() {
  const [matches, setMatches] = useState<Match[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tierFilter, setTierFilter] = useState<'all' | number>('all')
  const [showTierDropdown, setShowTierDropdown] = useState(false)

  const fetchMatches = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/api/matches`)
      if (!response.ok) {
        throw new Error(`Failed to fetch matches: ${response.status}`)
      }
      const data = await response.json()
      const matchList = (data.matches || data || []).map(mapApiMatch)
      // Filter to only completed matches
      const completed = matchList.filter(
        (m: Match) => m.status === 'Completed' || m.status === 'Settled'
      )
      setMatches(completed)
    } catch (err) {
      console.error('Error fetching matches:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch matches')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMatches()
    const interval = setInterval(fetchMatches, 60000)
    return () => clearInterval(interval)
  }, [])

  const filteredMatches = matches.filter((m) => {
    if (tierFilter === 'all') return true
    return m.tier === tierFilter
  })

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
      {/* HEADER */}
      <section className="border-b-[3px] border-ink py-10 sm:py-14 -mx-4 sm:-mx-6 px-4 sm:px-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.2em] mb-3">
              [ 06 / HISTORY ] —— FILE://MATCH.ARCHIVE
            </div>
            <h1 className="font-display text-display-xl uppercase leading-[0.85]">
              MATCH<br />
              <span className="bg-ink text-paper px-2">HISTORY</span><span className="text-accent">.</span>
            </h1>
            <p className="font-body text-base sm:text-lg mt-4 max-w-xl border-l-[6px] border-ink pl-4">
              Complete archive of all settled arena battles. Review past performances and outcomes.
            </p>
          </div>
          <button
            onClick={fetchMatches}
            disabled={isLoading}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      {/* FILTERS */}
      <section className="py-6 flex items-center justify-between flex-wrap gap-4">
        <div className="font-mono text-sm uppercase tracking-widest">
          SHOWING <span className="bg-ink text-paper px-2">{filteredMatches.length}</span> COMPLETED MATCHES
        </div>

        {/* Tier Filter */}
        <div className="relative">
          <button
            onClick={() => setShowTierDropdown(!showTierDropdown)}
            className="btn-secondary flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            {tierFilter === 'all' ? 'All Tiers' : TIER_NAMES[tierFilter]}
            <ChevronDown className={`w-4 h-4 transition-transform ${showTierDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showTierDropdown && (
            <div className="absolute top-full right-0 mt-2 w-48 brutal-card brutal-shadow z-50">
              <button
                onClick={() => { setTierFilter('all'); setShowTierDropdown(false) }}
                className={`w-full px-4 py-2 text-left text-sm font-body hover:bg-paper-2 ${tierFilter === 'all' ? 'bg-ink text-paper' : ''}`}
              >
                All Tiers
              </button>
              {TIER_NAMES.map((name, index) => (
                <button
                  key={name}
                  onClick={() => { setTierFilter(index); setShowTierDropdown(false) }}
                  className={`w-full px-4 py-2 text-left text-sm font-body hover:bg-paper-2 flex items-center justify-between ${tierFilter === index ? 'bg-ink text-paper' : ''}`}
                >
                  <span>{name}</span>
                  <span className={`tier-badge tier-${name.toLowerCase()} text-xs`}>{name.charAt(0)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Error State */}
      {error && (
        <section className="py-12">
          <div className="brutal-card brutal-shadow p-8 text-center border-accent border-4">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-accent" />
            <div className="font-display text-2xl uppercase text-accent mb-2">Error Loading History</div>
            <div className="font-mono text-sm mb-4">{error}</div>
            <button onClick={fetchMatches} className="btn-secondary">
              Try Again
            </button>
          </div>
        </section>
      )}

      {/* Loading State */}
      {isLoading && !error && (
        <section className="py-12">
          <div className="flex items-center justify-center gap-4">
            <div className="w-6 h-6 border-2 border-ink border-t-transparent animate-spin" />
            <span className="font-mono text-sm uppercase tracking-widest">Loading history...</span>
          </div>
        </section>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredMatches.length === 0 && (
        <section className="py-12">
          <div className="brutal-card brutal-shadow p-12 text-center">
            <Trophy className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <div className="font-display text-2xl uppercase">No completed matches</div>
            <div className="font-mono text-sm mt-2">// MATCHES WILL APPEAR HERE AFTER COMPLETION</div>
            {tierFilter !== 'all' && (
              <button
                onClick={() => setTierFilter('all')}
                className="btn-secondary mt-6"
              >
                Clear Tier Filter
              </button>
            )}
          </div>
        </section>
      )}

      {/* Match Table */}
      {!isLoading && !error && filteredMatches.length > 0 && (
        <section className="pb-16">
          <div className="brutal-shadow border-[3px] border-ink overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>MATCH</th>
                  <th>TIER</th>
                  <th>WINNER</th>
                  <th className="text-right">AGENT 1 P&L</th>
                  <th className="text-right">AGENT 2 P&L</th>
                  <th className="text-right">PRIZE</th>
                  <th className="text-right hide-mobile">TIME</th>
                </tr>
              </thead>
              <tbody>
                {filteredMatches.map((match) => (
                  <HistoryRow key={match.matchId} match={match} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function HistoryRow({ match }: { match: Match }) {
  const tierClass = `tier-${TIER_NAMES[match.tier].toLowerCase()}`
  const isAgent1Winner = match.winnerId === match.agent1Id

  const getTimeAgo = () => {
    if (!match.endedAt) return '—'
    const seconds = Math.floor(Date.now() / 1000 - match.endedAt)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  return (
    <tr>
      <td>
        <Link href={`/matches/${match.matchId}`} className="flex items-center gap-3 font-display hover:underline">
          <span className={isAgent1Winner ? 'bg-ink text-paper px-2' : ''}>#{match.agent1Id}</span>
          <span className="text-muted">VS</span>
          <span className={!isAgent1Winner && match.winnerId ? 'bg-ink text-paper px-2' : ''}>#{match.agent2Id}</span>
        </Link>
      </td>
      <td>
        <span className={`tier-badge ${tierClass}`}>{TIER_NAMES[match.tier]}</span>
      </td>
      <td>
        {match.winnerId ? (
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent" />
            <span className="font-display">Agent #{match.winnerId}</span>
          </div>
        ) : (
          <span className="text-muted">Draw</span>
        )}
      </td>
      <td className="text-right">
        <span className={`font-mono font-bold ${(match.agent1Pnl || 0) >= 0 ? '' : 'text-accent'}`}>
          {(match.agent1Pnl || 0) >= 0 ? '+' : ''}${((match.agent1Pnl || 0) / 100).toFixed(2)}
        </span>
      </td>
      <td className="text-right">
        <span className={`font-mono font-bold ${(match.agent2Pnl || 0) >= 0 ? '' : 'text-accent'}`}>
          {(match.agent2Pnl || 0) >= 0 ? '+' : ''}${((match.agent2Pnl || 0) / 100).toFixed(2)}
        </span>
      </td>
      <td className="text-right font-bold">${(match.prizePool / 1000000).toFixed(2)}</td>
      <td className="text-right hide-mobile text-muted">{getTimeAgo()}</td>
    </tr>
  )
}
