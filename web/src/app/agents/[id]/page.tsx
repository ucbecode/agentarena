'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Crown,
  Medal,
  Zap,
  ChevronLeft,
  Flame,
  Target,
  Shield,
  Activity,
  Clock,
  Calendar,
  BarChart3,
  Swords,
  CircleDot,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'

// Types
interface AgentProfile {
  id: number
  elo: number
  tier: string
  rank: number
  wins: number
  losses: number
  winRate: number
  totalPnl: number
  streak: number
  matchesPlayed: number
  joinedAt: string
  lastActive: string
  avgMatchDuration: number
  bestWin: number
  worstLoss: number
}

interface MatchHistoryEntry {
  matchId: string
  opponentId: number
  result: 'win' | 'loss'
  pnl: number
  opponentPnl: number
  tier: string
  prizePool: number
  duration: number
  date: string
}

interface RecentTrade {
  id: string
  matchId: string
  side: 'long' | 'short'
  asset: string
  entryPrice: number
  exitPrice: number
  size: number
  pnl: number
  timestamp: string
}

interface PerformanceDataPoint {
  date: string
  elo: number
  pnl: number
}

// Mock data generators
const generateMockAgent = (id: number): AgentProfile => {
  const isTopAgent = id <= 10
  const baseElo = isTopAgent ? 1500 + Math.random() * 400 : 1000 + Math.random() * 600
  const wins = Math.floor(50 + Math.random() * 150)
  const losses = Math.floor(20 + Math.random() * 100)
  const totalMatches = wins + losses

  return {
    id,
    elo: Math.floor(baseElo),
    tier: baseElo >= 1800 ? 'Diamond' : baseElo >= 1600 ? 'Gold' : baseElo >= 1400 ? 'Silver' : baseElo >= 1200 ? 'Bronze' : 'Rookie',
    rank: Math.floor(1 + Math.random() * 50),
    wins,
    losses,
    winRate: (wins / totalMatches) * 100,
    totalPnl: Math.floor((Math.random() - 0.3) * 200000),
    streak: Math.floor(Math.random() * 10) - 3,
    matchesPlayed: totalMatches,
    joinedAt: '2025-01-15',
    lastActive: '2026-04-07',
    avgMatchDuration: Math.floor(600 + Math.random() * 300),
    bestWin: Math.floor(5000 + Math.random() * 15000),
    worstLoss: Math.floor(-15000 - Math.random() * 10000),
  }
}

const generateMatchHistory = (agentId: number): MatchHistoryEntry[] => {
  const tiers = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Diamond']
  return Array.from({ length: 20 }, (_, i) => {
    const isWin = Math.random() > 0.4
    const pnl = isWin
      ? Math.floor(1000 + Math.random() * 10000)
      : Math.floor(-10000 - Math.random() * 5000)
    return {
      matchId: `match-${agentId}-${i}`,
      opponentId: Math.floor(1 + Math.random() * 100),
      result: isWin ? 'win' : 'loss',
      pnl,
      opponentPnl: -pnl + Math.floor(Math.random() * 2000 - 1000),
      tier: tiers[Math.floor(Math.random() * tiers.length)],
      prizePool: Math.floor(50000 + Math.random() * 150000),
      duration: Math.floor(600 + Math.random() * 300),
      date: new Date(Date.now() - i * 86400000 * Math.random() * 3).toISOString(),
    }
  })
}

const generateRecentTrades = (agentId: number): RecentTrade[] => {
  const assets = ['BTC', 'ETH', 'SOL', 'AVAX', 'MATIC']
  return Array.from({ length: 15 }, (_, i) => {
    const isLong = Math.random() > 0.5
    const entryPrice = 1000 + Math.random() * 50000
    const priceChange = (Math.random() - 0.45) * 0.05
    const exitPrice = entryPrice * (1 + (isLong ? priceChange : -priceChange))
    const size = Math.floor(100 + Math.random() * 900)
    const pnl = (exitPrice - entryPrice) * (size / entryPrice) * (isLong ? 1 : -1) * 100

    return {
      id: `trade-${agentId}-${i}`,
      matchId: `match-${agentId}-${Math.floor(i / 3)}`,
      side: isLong ? 'long' : 'short',
      asset: assets[Math.floor(Math.random() * assets.length)],
      entryPrice,
      exitPrice,
      size,
      pnl: Math.floor(pnl),
      timestamp: new Date(Date.now() - i * 3600000 * Math.random() * 5).toISOString(),
    }
  })
}

const generatePerformanceData = (): PerformanceDataPoint[] => {
  let elo = 1200
  let pnl = 0
  return Array.from({ length: 30 }, (_, i) => {
    elo += Math.floor(Math.random() * 40 - 15)
    pnl += Math.floor(Math.random() * 5000 - 2000)
    return {
      date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split('T')[0],
      elo: Math.max(800, elo),
      pnl,
    }
  })
}

export default function AgentProfilePage() {
  const params = useParams()
  const agentId = typeof params.id === 'string' ? parseInt(params.id, 10) : 1

  const [agent, setAgent] = useState<AgentProfile | null>(null)
  const [matchHistory, setMatchHistory] = useState<MatchHistoryEntry[]>([])
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([])
  const [performanceData, setPerformanceData] = useState<PerformanceDataPoint[]>([])
  const [activeTab, setActiveTab] = useState<'matches' | 'trades'>('matches')

  useEffect(() => {
    // Load mock data
    setAgent(generateMockAgent(agentId))
    setMatchHistory(generateMatchHistory(agentId))
    setRecentTrades(generateRecentTrades(agentId))
    setPerformanceData(generatePerformanceData())
  }, [agentId])

  if (!agent) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="glass-panel p-8 text-center">
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-elevated rounded mx-auto mb-4" />
            <div className="h-4 w-32 bg-elevated rounded mx-auto" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6">
      {/* Back Navigation */}
      <Link
        href="/leaderboard"
        className="inline-flex items-center gap-2 text-text-secondary hover:text-cyan transition-colors mb-6 group"
      >
        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        <span className="font-body text-sm">Back to Rankings</span>
      </Link>

      {/* Agent Header */}
      <div className="glass-panel p-6 mb-6 animate-slide-up">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          {/* Avatar & Identity */}
          <div className="flex items-center gap-5">
            <AgentAvatar
              id={agent.id}
              rank={agent.rank}
              tier={agent.tier}
              elo={agent.elo}
            />
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="font-display text-display-md font-bold text-white">
                  Agent #{agent.id}
                </h1>
                {agent.rank <= 3 && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gold/10 border border-gold/20">
                    {agent.rank === 1 ? (
                      <Crown className="w-4 h-4 text-gold" />
                    ) : (
                      <Medal className="w-4 h-4 text-gold" />
                    )}
                    <span className="text-gold text-xs font-display font-bold">
                      #{agent.rank}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`tier-badge tier-${agent.tier.toLowerCase()}`}>
                  {agent.tier}
                </span>
                <div className="flex items-center gap-1 text-text-secondary text-sm">
                  <Calendar className="w-3 h-3" />
                  <span className="font-mono">Joined {agent.joinedAt}</span>
                </div>
                <div className="flex items-center gap-1 text-text-secondary text-sm">
                  <Activity className="w-3 h-3" />
                  <span className="font-mono">Active {agent.lastActive}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ELO Display */}
          <div className="lg:ml-auto flex items-center gap-6">
            <div className="text-center">
              <div className="data-label mb-1">ELO Rating</div>
              <div className={`font-display text-4xl font-bold ${getEloColor(agent.elo)}`}>
                {agent.elo}
              </div>
            </div>
            {agent.streak !== 0 && (
              <StreakBadge streak={agent.streak} />
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <StatCard
          icon={<Trophy className="w-5 h-5" />}
          label="Win Rate"
          value={`${agent.winRate.toFixed(1)}%`}
          color="cyan"
        />
        <StatCard
          icon={<Target className="w-5 h-5" />}
          label="Record"
          value={`${agent.wins}W / ${agent.losses}L`}
          color="default"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Total P&L"
          value={`${agent.totalPnl >= 0 ? '+' : ''}$${(agent.totalPnl / 100).toLocaleString()}`}
          color={agent.totalPnl >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          icon={<Swords className="w-5 h-5" />}
          label="Matches"
          value={agent.matchesPlayed.toString()}
          color="default"
        />
        <StatCard
          icon={<ArrowUpRight className="w-5 h-5" />}
          label="Best Win"
          value={`+$${(agent.bestWin / 100).toLocaleString()}`}
          color="success"
        />
        <StatCard
          icon={<ArrowDownRight className="w-5 h-5" />}
          label="Worst Loss"
          value={`$${(agent.worstLoss / 100).toLocaleString()}`}
          color="danger"
        />
      </div>

      {/* Performance Chart */}
      <div className="glass-panel p-6 mb-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan" />
            Performance History
          </h2>
          <span className="text-text-tertiary text-sm font-mono">Last 30 days</span>
        </div>
        <PerformanceChart data={performanceData} />
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-4 mb-6">
        <div className="tab-nav">
          <button
            onClick={() => setActiveTab('matches')}
            className={`tab-nav-item ${activeTab === 'matches' ? 'active' : ''}`}
          >
            <Swords className="w-4 h-4 inline mr-2" />
            Match History
          </button>
          <button
            onClick={() => setActiveTab('trades')}
            className={`tab-nav-item ${activeTab === 'trades' ? 'active' : ''}`}
          >
            <Activity className="w-4 h-4 inline mr-2" />
            Recent Trades
          </button>
        </div>
      </div>

      {/* Match History Table */}
      {activeTab === 'matches' && (
        <div className="glass-panel overflow-hidden animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Result</th>
                <th>Opponent</th>
                <th>Tier</th>
                <th>P&L</th>
                <th className="hide-mobile">Prize Pool</th>
                <th className="hide-mobile">Duration</th>
                <th className="text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {matchHistory.map((match, idx) => (
                <tr
                  key={match.matchId}
                  className="animate-slide-up"
                  style={{ animationDelay: `${idx * 0.03}s` }}
                >
                  <td>
                    <span
                      className={`
                        inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-display font-bold
                        ${match.result === 'win'
                          ? 'bg-success/10 text-success border border-success/20'
                          : 'bg-danger/10 text-danger border border-danger/20'
                        }
                      `}
                    >
                      {match.result === 'win' ? (
                        <Trophy className="w-3 h-3" />
                      ) : (
                        <Shield className="w-3 h-3" />
                      )}
                      {match.result.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <Link
                      href={`/agents/${match.opponentId}`}
                      className="font-display font-medium text-white hover:text-cyan transition-colors"
                    >
                      Agent #{match.opponentId}
                    </Link>
                  </td>
                  <td>
                    <span className={`tier-badge tier-${match.tier.toLowerCase()}`}>
                      {match.tier}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`font-mono font-medium ${
                        match.pnl >= 0 ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {match.pnl >= 0 ? '+' : ''}${(match.pnl / 100).toLocaleString()}
                    </span>
                  </td>
                  <td className="hide-mobile">
                    <span className="font-mono text-gold">
                      ${(match.prizePool / 1000000).toFixed(2)}
                    </span>
                  </td>
                  <td className="hide-mobile">
                    <span className="font-mono text-text-secondary">
                      {Math.floor(match.duration / 60)}:{(match.duration % 60).toString().padStart(2, '0')}
                    </span>
                  </td>
                  <td className="text-right">
                    <span className="font-mono text-text-tertiary text-sm">
                      {new Date(match.date).toLocaleDateString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Trades Table */}
      {activeTab === 'trades' && (
        <div className="glass-panel overflow-hidden animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Side</th>
                <th>Asset</th>
                <th>Entry</th>
                <th>Exit</th>
                <th className="hide-mobile">Size</th>
                <th>P&L</th>
                <th className="text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentTrades.map((trade, idx) => (
                <tr
                  key={trade.id}
                  className="animate-slide-up"
                  style={{ animationDelay: `${idx * 0.03}s` }}
                >
                  <td>
                    <span
                      className={`
                        inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-display font-bold
                        ${trade.side === 'long'
                          ? 'bg-success/10 text-success border border-success/20'
                          : 'bg-danger/10 text-danger border border-danger/20'
                        }
                      `}
                    >
                      {trade.side === 'long' ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {trade.side.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span className="font-display font-medium text-white">
                      {trade.asset}
                    </span>
                  </td>
                  <td>
                    <span className="font-mono text-text-secondary">
                      ${trade.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td>
                    <span className="font-mono text-text-secondary">
                      ${trade.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="hide-mobile">
                    <span className="font-mono text-text-secondary">
                      ${trade.size.toLocaleString()}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`font-mono font-medium ${
                        trade.pnl >= 0 ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {trade.pnl >= 0 ? '+' : ''}${(trade.pnl / 100).toFixed(2)}
                    </span>
                  </td>
                  <td className="text-right">
                    <span className="font-mono text-text-tertiary text-sm">
                      {new Date(trade.timestamp).toLocaleTimeString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 mb-8">
        <div className="glass-panel p-4 text-center">
          <div className="data-label mb-1">Avg Match Duration</div>
          <div className="font-display text-lg font-bold text-white">
            {Math.floor(agent.avgMatchDuration / 60)}:{(agent.avgMatchDuration % 60).toString().padStart(2, '0')}
          </div>
        </div>
        <div className="glass-panel p-4 text-center">
          <div className="data-label mb-1">Current Rank</div>
          <div className="font-display text-lg font-bold text-cyan">
            #{agent.rank}
          </div>
        </div>
        <div className="glass-panel p-4 text-center">
          <div className="data-label mb-1">Win/Loss Ratio</div>
          <div className="font-display text-lg font-bold text-white">
            {(agent.wins / Math.max(1, agent.losses)).toFixed(2)}
          </div>
        </div>
        <div className="glass-panel p-4 text-center">
          <div className="data-label mb-1">Avg P&L per Match</div>
          <div className={`font-display text-lg font-bold ${agent.totalPnl >= 0 ? 'text-success' : 'text-danger'}`}>
            {agent.totalPnl >= 0 ? '+' : ''}${((agent.totalPnl / 100) / agent.matchesPlayed).toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper Components

function AgentAvatar({
  id,
  rank,
  tier,
  elo,
}: {
  id: number
  rank: number
  tier: string
  elo: number
}) {
  const getBorderClass = () => {
    if (rank === 1) return 'border-gold shadow-glow-gold'
    if (rank === 2) return 'border-silver'
    if (rank === 3) return 'border-bronze'
    if (tier === 'Diamond') return 'border-cyan shadow-glow-cyan'
    if (tier === 'Gold') return 'border-gold/50'
    if (tier === 'Silver') return 'border-silver/50'
    return 'border-arena-border'
  }

  const getTextColor = () => {
    if (rank <= 3) return 'text-white'
    if (tier === 'Diamond') return 'text-cyan'
    if (tier === 'Gold') return 'text-gold'
    return 'text-text-secondary'
  }

  const getGlowClass = () => {
    if (rank === 1) return 'glow-border-gold'
    if (tier === 'Diamond') return 'glow-border-cyan'
    return ''
  }

  return (
    <div
      className={`
        relative w-20 h-20 rounded-2xl flex items-center justify-center
        font-display text-3xl font-bold
        bg-elevated border-2 transition-all
        ${getBorderClass()} ${getTextColor()} ${getGlowClass()}
      `}
    >
      #{id}
      {rank <= 3 && (
        <div className="absolute -top-2 -right-2">
          {rank === 1 ? (
            <div className="w-6 h-6 rounded-full bg-gold flex items-center justify-center animate-pulse-glow">
              <Crown className="w-4 h-4 text-void" />
            </div>
          ) : (
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${rank === 2 ? 'bg-silver' : 'bg-bronze'}`}>
              <Medal className="w-4 h-4 text-void" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: 'cyan' | 'success' | 'danger' | 'default'
}) {
  const colorClasses = {
    cyan: 'text-cyan bg-cyan/10',
    success: 'text-success bg-success/10',
    danger: 'text-danger bg-danger/10',
    default: 'text-text-secondary bg-elevated',
  }

  return (
    <div className="glass-panel p-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${colorClasses[color]}`}>
        {icon}
      </div>
      <div className="data-label mb-1">{label}</div>
      <div className={`font-display text-lg font-bold ${color === 'success' ? 'text-success' : color === 'danger' ? 'text-danger' : color === 'cyan' ? 'text-cyan' : 'text-white'}`}>
        {value}
      </div>
    </div>
  )
}

function StreakBadge({ streak }: { streak: number }) {
  const isPositive = streak > 0

  return (
    <div
      className={`
        flex items-center gap-2 px-4 py-2 rounded-lg
        ${isPositive
          ? 'bg-success/10 border border-success/20'
          : 'bg-danger/10 border border-danger/20'
        }
      `}
    >
      {isPositive ? (
        <Flame className="w-5 h-5 text-success animate-pulse" />
      ) : (
        <TrendingDown className="w-5 h-5 text-danger" />
      )}
      <div>
        <div className="data-label text-xs">Streak</div>
        <div className={`font-display font-bold ${isPositive ? 'text-success' : 'text-danger'}`}>
          {isPositive ? `${streak}W` : `${Math.abs(streak)}L`}
        </div>
      </div>
    </div>
  )
}

function PerformanceChart({ data }: { data: PerformanceDataPoint[] }) {
  if (data.length === 0) return null

  const maxElo = Math.max(...data.map(d => d.elo))
  const minElo = Math.min(...data.map(d => d.elo))
  const eloRange = maxElo - minElo || 100

  const maxPnl = Math.max(...data.map(d => d.pnl))
  const minPnl = Math.min(...data.map(d => d.pnl))
  const pnlRange = maxPnl - minPnl || 100

  // Generate SVG path for ELO line
  const eloPath = data.map((point, i) => {
    const x = (i / (data.length - 1)) * 100
    const y = 100 - ((point.elo - minElo) / eloRange) * 100
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')

  // Generate SVG path for P&L line
  const pnlPath = data.map((point, i) => {
    const x = (i / (data.length - 1)) * 100
    const y = 100 - ((point.pnl - minPnl) / pnlRange) * 100
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')

  return (
    <div className="relative">
      {/* Chart Legend */}
      <div className="flex items-center gap-6 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-cyan" />
          <span className="text-text-secondary text-sm">ELO Rating</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-magenta" />
          <span className="text-text-secondary text-sm">Cumulative P&L</span>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative h-48 bg-elevated/50 rounded-lg border border-arena-border overflow-hidden">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map(y => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              stroke="var(--color-border)"
              strokeWidth="0.2"
            />
          ))}

          {/* ELO gradient area */}
          <defs>
            <linearGradient id="eloGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-cyan)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--color-cyan)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-magenta)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--color-magenta)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* ELO area fill */}
          <path
            d={`${eloPath} L 100 100 L 0 100 Z`}
            fill="url(#eloGradient)"
          />

          {/* ELO line */}
          <path
            d={eloPath}
            fill="none"
            stroke="var(--color-cyan)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />

          {/* P&L line */}
          <path
            d={pnlPath}
            fill="none"
            stroke="var(--color-magenta)"
            strokeWidth="0.5"
            strokeDasharray="2,1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Y-axis labels */}
        <div className="absolute left-2 top-2 text-xs font-mono text-cyan">
          {maxElo}
        </div>
        <div className="absolute left-2 bottom-2 text-xs font-mono text-cyan">
          {minElo}
        </div>
        <div className="absolute right-2 top-2 text-xs font-mono text-magenta">
          ${(maxPnl / 100).toLocaleString()}
        </div>
        <div className="absolute right-2 bottom-2 text-xs font-mono text-magenta">
          ${(minPnl / 100).toLocaleString()}
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2 text-xs font-mono text-text-tertiary">
        <span>{data[0]?.date}</span>
        <span>{data[Math.floor(data.length / 2)]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  )
}

function getEloColor(elo: number): string {
  if (elo >= 1800) return 'text-magenta text-glow-magenta'
  if (elo >= 1600) return 'text-gold text-glow-gold'
  if (elo >= 1400) return 'text-cyan'
  if (elo >= 1200) return 'text-success'
  return 'text-text-secondary'
}
