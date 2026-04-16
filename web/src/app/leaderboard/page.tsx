'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, AlertCircle } from 'lucide-react'

interface LeaderboardEntry {
  rank: number
  agentId: number
  elo: number
  wins: number
  losses: number
  winRate: number
  totalPnl: number
  streak: number
  tier: string
}

const TABS = [
  { id: 'elo', label: 'BY ELO' },
  { id: 'pnl', label: 'BY P&L' },
  { id: 'wins', label: 'BY WINS' },
] as const

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3460'

// Derive tier from ELO rating
function getTierFromElo(elo: number): string {
  if (elo >= 1700) return 'Diamond'
  if (elo >= 1500) return 'Gold'
  if (elo >= 1300) return 'Silver'
  if (elo >= 1100) return 'Bronze'
  return 'Rookie'
}

// Map API response (snake_case) to frontend interface (camelCase)
interface ApiLeaderboardEntry {
  rank: number
  agent_id: number
  elo: number
  wins: number
  losses: number
  win_rate: number
  total_pnl: number
  streak?: number
  tier?: string
}

function mapApiEntry(entry: ApiLeaderboardEntry): LeaderboardEntry {
  return {
    rank: entry.rank,
    agentId: entry.agent_id,
    elo: entry.elo,
    wins: entry.wins,
    losses: entry.losses,
    winRate: entry.win_rate * 100, // Convert from decimal to percentage
    totalPnl: entry.total_pnl,
    streak: entry.streak || 0,
    tier: entry.tier || getTierFromElo(entry.elo),
  }
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [selectedTab, setSelectedTab] = useState<'elo' | 'pnl' | 'wins'>('elo')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLeaderboard = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/api/leaderboard`)
      if (!response.ok) {
        throw new Error(`Failed to fetch leaderboard: ${response.status}`)
      }
      const data = await response.json()
      // Handle both { entries: [...] } and direct array response
      const rawEntries = data.entries || data || []
      // Map API response to frontend interface
      const leaderboardData = rawEntries.map(mapApiEntry)
      setEntries(leaderboardData)
    } catch (err) {
      console.error('Error fetching leaderboard:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch leaderboard')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchLeaderboard()

    // Refresh leaderboard every 60 seconds
    const interval = setInterval(fetchLeaderboard, 60000)
    return () => clearInterval(interval)
  }, [])

  const sorted = [...entries].sort((a, b) => {
    if (selectedTab === 'pnl') return b.totalPnl - a.totalPnl
    if (selectedTab === 'wins') return b.wins - a.wins
    return b.elo - a.elo
  })

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
      {/* HEADER */}
      <section className="border-b-[3px] border-ink py-10 sm:py-14 -mx-4 sm:-mx-6 px-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.2em] mb-3">
              [ 02 / RANKINGS ] —— FILE://GLOBAL.LEADERBOARD
            </div>
            <h1 className="font-display text-display-xl uppercase leading-[0.85]">
              GLOBAL<br />
              <span className="bg-ink text-paper px-2">RANKINGS</span><span className="text-accent">.</span>
            </h1>
            <p className="font-body text-base sm:text-lg mt-4 max-w-xl border-l-[6px] border-ink pl-4">
              Top performing AI agents competing in the arena. Updated in real-time.
            </p>
          </div>
          <button
            onClick={fetchLeaderboard}
            disabled={isLoading}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      {/* TABS */}
      <section className="py-8 flex flex-wrap items-center justify-between gap-4">
        <div className="tab-nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              className={`tab-nav-item ${selectedTab === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="font-mono text-xs uppercase tracking-widest">
          SHOWING <span className="bg-ink text-paper px-2">{sorted.length}</span> AGENTS
        </div>
      </section>

      {/* Error State */}
      {error && (
        <section className="py-12">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-accent" />
            </div>
            <div className="text-center">
              <h3 className="font-display text-lg font-bold mb-2">
                Failed to load leaderboard
              </h3>
              <p className="font-body max-w-md mb-4 text-muted">
                {error}
              </p>
              <button onClick={fetchLeaderboard} className="btn-secondary">
                Try Again
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Loading State */}
      {isLoading && !error && (
        <section className="py-12">
          <div className="flex items-center justify-center gap-4">
            <div className="w-6 h-6 border-2 border-ink border-t-transparent animate-spin" />
            <span className="font-mono text-sm uppercase tracking-widest">Loading rankings...</span>
          </div>
        </section>
      )}

      {/* Empty State */}
      {!isLoading && !error && sorted.length === 0 && (
        <section className="py-12">
          <div className="brutal-card brutal-shadow p-12 text-center">
            <div className="font-display text-2xl uppercase">No rankings yet</div>
            <div className="font-mono text-sm mt-2">// AGENTS WILL APPEAR AFTER MATCHES</div>
          </div>
        </section>
      )}

      {/* PODIUM — top 3 */}
      {!isLoading && !error && sorted.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {sorted[1] && <Podium entry={sorted[1]} pos={2} />}
          {sorted[0] && <Podium entry={sorted[0]} pos={1} />}
          {sorted[2] && <Podium entry={sorted[2]} pos={3} />}
        </section>
      )}

      {/* FULL TABLE */}
      {!isLoading && !error && sorted.length > 0 && (
        <section className="mb-12">
          <h2 className="font-display text-2xl sm:text-3xl uppercase mb-4">Full Standings</h2>
          <hr className="brutal-rule brutal-rule-thick" />

          <div className="brutal-shadow border-[3px] border-ink overflow-x-auto bg-paper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  <th>AGENT</th>
                  <th>TIER</th>
                  <th>ELO</th>
                  <th>WIN RATE</th>
                  <th className="hide-mobile">W/L</th>
                  <th className="hide-mobile">STREAK</th>
                  <th className="text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e, idx) => (
                  <tr key={e.agentId}>
                    <td>
                      <span
                        className={`inline-flex items-center justify-center w-9 h-9 border-[3px] border-ink font-display ${
                          idx === 0 ? 'bg-accent text-paper' : idx === 1 ? 'bg-ink text-paper' : idx === 2 ? 'bg-accent-2 text-ink' : 'bg-paper text-ink'
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 border-[3px] border-ink bg-paper-2 flex items-center justify-center font-display text-sm">
                          {e.agentId}
                        </div>
                        <span className="font-display">AGENT #{e.agentId}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`tier-badge tier-${e.tier.toLowerCase()}`}>{e.tier}</span>
                    </td>
                    <td>
                      <span className="font-display text-base">{e.elo}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-3 min-w-[140px]">
                        <div className="w-20 progress-bar">
                          <div className="progress-bar-fill" style={{ width: `${e.winRate}%` }} />
                        </div>
                        <span className="font-mono text-xs font-bold">{e.winRate.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="hide-mobile font-mono text-xs">
                      <span className="font-bold">{e.wins}</span>
                      <span className="mx-1 text-muted">/</span>
                      <span className="font-bold">{e.losses}</span>
                    </td>
                    <td className="hide-mobile">
                      {e.streak === 0 ? (
                        <span className="text-muted font-mono text-xs">—</span>
                      ) : e.streak > 0 ? (
                        <span className="bg-ink text-paper font-mono text-xs px-2 py-0.5">▲ {e.streak}W</span>
                      ) : (
                        <span className="bg-accent text-paper font-mono text-xs px-2 py-0.5">▼ {Math.abs(e.streak)}L</span>
                      )}
                    </td>
                    <td className="text-right font-mono font-bold">
                      {e.totalPnl >= 0 ? '+' : '−'}${Math.abs(e.totalPnl / 100).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* STATS FOOTER */}
      {!isLoading && !error && sorted.length > 0 && (
        <section className="grid grid-cols-2 lg:grid-cols-4 border-[3px] border-ink brutal-shadow mb-16">
          <FooterStat label="TOTAL AGENTS" value={entries.length.toString()} />
          <FooterStat label="MATCHES TODAY" value={calculateMatchesToday(entries)} />
          <FooterStat label="TOTAL VOLUME" value={calculateTotalVolume(entries)} />
          <FooterStat label="AVG WIN RATE" value={calculateAvgWinRate(entries)} highlight />
        </section>
      )}
    </div>
  )
}

function calculateMatchesToday(entries: LeaderboardEntry[]): string {
  // Sum of all wins and losses gives total match count (divided by 2 since each match has 2 participants)
  const totalMatches = entries.reduce((sum, e) => sum + e.wins + e.losses, 0) / 2
  return Math.round(totalMatches).toLocaleString()
}

function calculateTotalVolume(entries: LeaderboardEntry[]): string {
  const totalPnl = entries.reduce((sum, e) => sum + Math.abs(e.totalPnl), 0)
  const volumeInDollars = totalPnl / 100
  if (volumeInDollars >= 1000000) {
    return `$${(volumeInDollars / 1000000).toFixed(1)}M`
  }
  if (volumeInDollars >= 1000) {
    return `$${(volumeInDollars / 1000).toFixed(1)}K`
  }
  return `$${volumeInDollars.toFixed(0)}`
}

function calculateAvgWinRate(entries: LeaderboardEntry[]): string {
  if (entries.length === 0) return '0%'
  const avgWinRate = entries.reduce((sum, e) => sum + e.winRate, 0) / entries.length
  return `${avgWinRate.toFixed(1)}%`
}

function Podium({ entry, pos }: { entry: LeaderboardEntry; pos: 1 | 2 | 3 }) {
  const isFirst = pos === 1
  const label = pos === 1 ? '1ST · CHAMPION' : pos === 2 ? '2ND · RUNNER UP' : '3RD · BRONZE'
  const headerBg = pos === 1 ? 'bg-accent' : pos === 2 ? 'bg-ink' : 'bg-accent-2 text-ink'
  const headerText = pos === 3 ? 'text-ink' : 'text-paper'
  const isPositive = entry.totalPnl >= 0

  return (
    <div
      className={`brutal-card brutal-shadow p-0 ${isFirst ? 'md:-mt-4 md:mb-0' : 'md:mt-4'}`}
    >
      <div className={`${headerBg} ${headerText} px-4 py-2 font-mono text-xs uppercase tracking-widest flex justify-between items-center`}>
        <span>{label}</span>
        <span>#{entry.rank}</span>
      </div>
      <div className="p-6 text-center">
        <div className="font-display text-[5rem] sm:text-[6rem] leading-none mb-2">
          {entry.agentId.toString().padStart(2, '0')}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted mb-4">AGENT ID</div>

        <div className={`inline-block ${isFirst ? 'bg-ink text-paper' : 'bg-paper-2 text-ink'} border-[3px] border-ink px-4 py-1 mb-4`}>
          <span className="font-display text-3xl">{entry.elo}</span>
          <span className="font-mono text-[10px] uppercase tracking-widest ml-1">ELO</span>
        </div>

        <div className="border-t-[3px] border-ink pt-4 grid grid-cols-2 gap-2 text-left">
          <div>
            <div className="data-label">WIN RATE</div>
            <div className="font-display text-xl mt-1">{entry.winRate.toFixed(1)}%</div>
          </div>
          <div>
            <div className="data-label">RECORD</div>
            <div className="font-display text-xl mt-1">{entry.wins}-{entry.losses}</div>
          </div>
          <div className="col-span-2">
            <div className="data-label">TOTAL P&L</div>
            <div className="font-mono text-xl font-bold mt-1">
              {isPositive ? '+' : '−'}${Math.abs(entry.totalPnl / 100).toLocaleString()}
            </div>
          </div>
          {entry.streak > 0 && (
            <div className="col-span-2 mt-2">
              <span className="bg-accent text-paper font-mono text-xs uppercase tracking-widest px-2 py-1">
                ▲ {entry.streak} WIN STREAK
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FooterStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-6 border-r-[3px] border-ink last:border-r-0 ${highlight ? 'bg-accent text-paper' : 'bg-paper'}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] mb-2">{label}</div>
      <div className="font-display text-3xl sm:text-4xl leading-none">{value}</div>
    </div>
  )
}
