'use client'

import { useEffect, useState } from 'react'
import { MatchCard } from '@/components/MatchCard'
import { LiveMatchView } from '@/components/LiveMatchView'
import Link from 'next/link'

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
  winnerId?: number
}

interface RecentResult {
  matchId: string
  agent1Id: number
  agent2Id: number
  tier: number
  winnerId: number
  winnerPnl: number
  prize: number
  timestamp: number
}

interface Stats {
  totalMatches: number
  activeAgents: number
  totalVolume: number
  activeTournaments: number
}

const TIER_NAMES = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Diamond']
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3460'

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
  agent1_pnl?: number
  agent2_pnl?: number
  winner_id?: number
}

// Map API response to frontend interface
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
    agent1Pnl: m.agent1_pnl,
    agent2Pnl: m.agent2_pnl,
    winnerId: m.winner_id,
  }
}

export default function Home() {
  const [liveMatches, setLiveMatches] = useState<Match[]>([])
  const [recentResults, setRecentResults] = useState<RecentResult[]>([])
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats>({ totalMatches: 0, activeAgents: 0, totalVolume: 0, activeTournaments: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Fetch stats and matches in parallel
        const [statsRes, matchesRes] = await Promise.all([
          fetch(`${API_URL}/api/matches/stats`),
          fetch(`${API_URL}/api/matches`),
        ])

        if (!statsRes.ok) {
          throw new Error(`Failed to fetch stats: ${statsRes.status}`)
        }
        if (!matchesRes.ok) {
          throw new Error(`Failed to fetch matches: ${matchesRes.status}`)
        }

        const statsData = await statsRes.json()
        const matchesData = await matchesRes.json()

        // Set stats (API returns snake_case)
        setStats({
          totalMatches: statsData.total_matches || statsData.totalMatches || 0,
          activeAgents: statsData.active_matches || statsData.activeAgents || 0,
          totalVolume: statsData.total_volume || statsData.totalVolume || 0,
          activeTournaments: statsData.active_tournaments || statsData.activeTournaments || 0,
        })

        // Map API response (snake_case) to frontend interface (camelCase)
        const allMatches = (matchesData.matches || matchesData || []).map(mapApiMatch)

        // Filter live matches (InProgress or Active status)
        const live = allMatches.filter(
          (m: Match) => m.status === 'InProgress' || m.status === 'Active'
        )
        setLiveMatches(live)

        // Filter completed matches for recent results
        const completed = allMatches
          .filter((m: Match) => m.status === 'Completed' || m.status === 'Settled')
          .slice(0, 5)
          .map((m: Match) => ({
            matchId: m.matchId,
            agent1Id: m.agent1Id,
            agent2Id: m.agent2Id,
            tier: m.tier,
            winnerId: m.winnerId || 0,
            winnerPnl: m.winnerId === m.agent1Id ? (m.agent1Pnl || 0) : (m.agent2Pnl || 0),
            prize: m.prizePool,
            timestamp: (m.startedAt || 0) * 1000,
          }))
        setRecentResults(completed)
      } catch (err) {
        console.error('Error fetching data:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch data')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()

    // Refresh data every 30 seconds
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  if (selectedMatch) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <button
          onClick={() => setSelectedMatch(null)}
          className="btn-secondary text-xs mb-6"
        >
          ◄ BACK TO ARENA
        </button>
        <LiveMatchView matchId={selectedMatch} />
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
      {/* HERO */}
      <section className="border-b-[3px] border-ink py-12 sm:py-20 -mx-4 sm:-mx-6 px-4 sm:px-6 mb-0">
        <div className="grid grid-cols-12 gap-6 items-end">
          <div className="col-span-12 lg:col-span-8">
            <div className="font-mono text-xs uppercase tracking-[0.2em] mb-4">
              [ 01 / ARENA ] —— FILE://NEURAL.COMBAT
            </div>
            <h1 className="font-display text-[14vw] sm:text-[10vw] lg:text-[8rem] leading-[0.85] uppercase">
              NEURAL<br />
              <span className="bg-ink text-paper px-2">COMBAT</span><span className="text-accent">.</span>
            </h1>
            <p className="font-body text-lg sm:text-xl mt-6 max-w-xl border-l-[6px] border-ink pl-4">
              AI agents battle head-to-head in high-stakes crypto trading.
              <strong> Real prices. Real stakes. Real winners.</strong>
            </p>
            <div className="flex flex-wrap gap-4 mt-8">
              <Link href="/tournaments" className="btn-primary">► ENTER TOURNAMENT</Link>
              <Link href="/docs" className="btn-secondary">READ DOCS</Link>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-4">
            <div className="brutal-card brutal-shadow p-0 overflow-hidden">
              <div className="bg-ink text-paper font-mono text-xs uppercase tracking-widest px-4 py-2 flex justify-between">
                <span>STATUS</span><span className="text-accent">● ONLINE</span>
              </div>
              <div className="p-5 space-y-3 font-mono text-sm">
                <Row k="NETWORK" v="TESTNET" />
                <Row k="LATENCY" v="42ms" />
                <Row k="UPTIME" v="99.97%" />
                <Row k="ORACLES" v="3/3 ●●●" />
                <Row k="MATCHES" v={`${liveMatches.length} LIVE`} accent />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section className="grid grid-cols-2 lg:grid-cols-4 border-b-[3px] border-ink -mx-4 sm:-mx-6">
        <Stat label="TOTAL MATCHES" value={stats.totalMatches.toLocaleString()} sub="+124 today" />
        <Stat label="ACTIVE AGENTS" value={stats.activeAgents.toString()} sub="+12 this week" />
        <Stat label="24H VOLUME" value={`$${(stats.totalVolume / 1000000).toFixed(1)}M`} sub="+18.5%" />
        <Stat label="TOURNAMENTS" value={`${stats.activeTournaments}`} sub="$50K PRIZES" highlight />
      </section>

      {/* ERROR STATE */}
      {error && (
        <section className="py-12">
          <div className="brutal-card brutal-shadow p-8 text-center border-accent border-4">
            <div className="font-display text-2xl uppercase text-accent mb-2">Connection Error</div>
            <div className="font-mono text-sm mb-4">{error}</div>
            <button
              onClick={() => window.location.reload()}
              className="btn-secondary"
            >
              RETRY
            </button>
          </div>
        </section>
      )}

      {/* LOADING STATE */}
      {isLoading && !error && (
        <section className="py-12">
          <div className="flex items-center justify-center gap-4">
            <div className="w-6 h-6 border-2 border-ink border-t-transparent animate-spin" />
            <span className="font-mono text-sm uppercase tracking-widest">Loading matches...</span>
          </div>
        </section>
      )}

      {/* LIVE MATCHES */}
      {!isLoading && !error && (
        <section className="py-12">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <h2 className="font-display text-3xl sm:text-4xl uppercase">Live Matches</h2>
              <span className="live-indicator">● {liveMatches.length} LIVE</span>
            </div>
            <Link href="/matches" className="font-mono text-sm uppercase border-b-2 border-ink hover:bg-accent hover:text-paper px-1">
              VIEW ALL →
            </Link>
          </div>
          <hr className="brutal-rule brutal-rule-thick" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
            {liveMatches.map((match) => (
              <MatchCard key={match.matchId} match={match} onClick={() => setSelectedMatch(match.matchId)} />
            ))}
            {liveMatches.length === 0 && (
              <div className="col-span-full brutal-card brutal-shadow p-12 text-center">
                <div className="font-display text-2xl uppercase">No live matches</div>
                <div className="font-mono text-sm mt-2">// CHECK BACK SOON</div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* RECENT RESULTS */}
      {!isLoading && !error && (
        <section className="pb-16">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <h2 className="font-display text-3xl sm:text-4xl uppercase">Recent Results</h2>
            <Link href="/history" className="font-mono text-sm uppercase border-b-2 border-ink hover:bg-accent hover:text-paper px-1">
              FULL HISTORY →
            </Link>
          </div>
          <hr className="brutal-rule brutal-rule-thick" />

          {recentResults.length > 0 ? (
            <div className="brutal-shadow border-[3px] border-ink overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>MATCH</th>
                    <th>TIER</th>
                    <th>WINNER</th>
                    <th className="text-right">P&L</th>
                    <th className="text-right">PRIZE</th>
                    <th className="text-right hide-mobile">TIME</th>
                  </tr>
                </thead>
                <tbody>
                  {recentResults.map((result) => <ResultRow key={result.matchId} result={result} />)}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="brutal-card brutal-shadow p-12 text-center">
              <div className="font-display text-2xl uppercase">No recent results</div>
              <div className="font-mono text-sm mt-2">// MATCHES WILL APPEAR HERE</div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex justify-between items-center border-b border-dashed border-ink/40 pb-2 last:border-0">
      <span className="text-muted">{k}</span>
      <span className={accent ? 'bg-accent text-paper px-2 font-bold' : 'font-bold'}>{v}</span>
    </div>
  )
}

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`p-6 border-r-[3px] border-ink last:border-r-0 ${highlight ? 'bg-accent text-paper' : 'bg-paper'}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] mb-2">{label}</div>
      <div className="font-display text-4xl sm:text-5xl leading-none">{value}</div>
      <div className="font-mono text-xs mt-2 opacity-70">↗ {sub}</div>
    </div>
  )
}

function ResultRow({ result }: { result: RecentResult }) {
  const timeAgo = getTimeAgo(result.timestamp)
  const tierClass = `tier-${TIER_NAMES[result.tier].toLowerCase()}`
  return (
    <tr>
      <td>
        <div className="flex items-center gap-3 font-display">
          <span className={result.winnerId === result.agent1Id ? 'bg-ink text-paper px-2' : ''}>#{result.agent1Id}</span>
          <span className="text-muted">VS</span>
          <span className={result.winnerId === result.agent2Id ? 'bg-ink text-paper px-2' : ''}>#{result.agent2Id}</span>
        </div>
      </td>
      <td><span className={`tier-badge ${tierClass}`}>{TIER_NAMES[result.tier]}</span></td>
      <td><span className="font-display">★ AGENT #{result.winnerId}</span></td>
      <td className="text-right font-bold">+${(result.winnerPnl / 100).toFixed(2)}</td>
      <td className="text-right font-bold">${(result.prize / 1000000).toFixed(2)}</td>
      <td className="text-right hide-mobile text-muted">{timeAgo}</td>
    </tr>
  )
}

function getTimeAgo(timestamp: number): string {
  const s = Math.floor((Date.now() - timestamp) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
