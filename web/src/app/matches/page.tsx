'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MatchCard } from '@/components/MatchCard'
import {
  Swords,
  Clock,
  Trophy,
  Calendar,
  Filter,
  ChevronDown,
  Search,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'

interface Match {
  matchId: string
  agent1Id: number
  agent2Id: number
  tier: number
  status: string
  entryFee: number
  prizePool: number
  startedAt?: number
  scheduledAt?: number
  endedAt?: number
  agent1Pnl?: number
  agent2Pnl?: number
  winnerId?: number
}

type TabType = 'live' | 'upcoming' | 'completed'
type TierFilter = 'all' | 0 | 1 | 2 | 3 | 4

const TIER_NAMES = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Diamond']
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3460'

export default function MatchesPage() {
  const router = useRouter()
  const [matches, setMatches] = useState<Match[]>([])
  const [activeTab, setActiveTab] = useState<TabType>('live')
  const [tierFilter, setTierFilter] = useState<TierFilter>('all')
  const [showTierDropdown, setShowTierDropdown] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchMatches = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/api/matches`)
      if (!response.ok) {
        throw new Error(`Failed to fetch matches: ${response.status}`)
      }
      const data = await response.json()
      // Handle both { matches: [...] } and direct array response
      const matchList = data.matches || data || []
      setMatches(matchList)
    } catch (err) {
      console.error('Error fetching matches:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch matches')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMatches()

    // Refresh matches every 30 seconds
    const interval = setInterval(fetchMatches, 30000)
    return () => clearInterval(interval)
  }, [])

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      // Filter by tab (status)
      const isLive = match.status === 'Active' || match.status === 'InProgress'
      const isUpcoming = match.status === 'Scheduled' || match.status === 'Matchmaking'
      const isCompleted = match.status === 'Completed' || match.status === 'Settled'

      if (activeTab === 'live' && !isLive) return false
      if (activeTab === 'upcoming' && !isUpcoming) return false
      if (activeTab === 'completed' && !isCompleted) return false

      // Filter by tier
      if (tierFilter !== 'all' && match.tier !== tierFilter) return false

      // Filter by search (agent IDs)
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
          match.matchId.toLowerCase().includes(query) ||
          match.agent1Id.toString().includes(query) ||
          match.agent2Id.toString().includes(query)
        if (!matchesSearch) return false
      }

      return true
    })
  }, [matches, activeTab, tierFilter, searchQuery])

  const matchCounts = useMemo(() => {
    const counts = { live: 0, upcoming: 0, completed: 0 }
    matches.forEach((match) => {
      if (match.status === 'Active' || match.status === 'InProgress') counts.live++
      else if (match.status === 'Scheduled' || match.status === 'Matchmaking') counts.upcoming++
      else if (match.status === 'Completed' || match.status === 'Settled') counts.completed++
    })
    return counts
  }, [matches])

  const handleMatchClick = (matchId: string) => {
    router.push(`/matches/${matchId}`)
  }

  const handleRefresh = () => {
    fetchMatches()
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Swords className="w-8 h-8 text-cyan" />
            <h1 className="font-display text-display-md font-bold text-white">
              MATCH BROWSER
            </h1>
          </div>
          <p className="text-text-secondary font-body">
            Watch live battles or explore past arena encounters
          </p>
        </div>

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs and Filters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        {/* Tab Navigation */}
        <div className="tab-nav">
          <button
            onClick={() => setActiveTab('live')}
            className={`tab-nav-item flex items-center gap-2 ${activeTab === 'live' ? 'active' : ''}`}
          >
            <Swords className="w-4 h-4" />
            Live
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-mono ${
              activeTab === 'live' ? 'bg-void/30 text-cyan' : 'bg-elevated text-text-secondary'
            }`}>
              {matchCounts.live}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`tab-nav-item flex items-center gap-2 ${activeTab === 'upcoming' ? 'active' : ''}`}
          >
            <Clock className="w-4 h-4" />
            Upcoming
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-mono ${
              activeTab === 'upcoming' ? 'bg-void/30 text-cyan' : 'bg-elevated text-text-secondary'
            }`}>
              {matchCounts.upcoming}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`tab-nav-item flex items-center gap-2 ${activeTab === 'completed' ? 'active' : ''}`}
          >
            <Trophy className="w-4 h-4" />
            Completed
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-mono ${
              activeTab === 'completed' ? 'bg-void/30 text-cyan' : 'bg-elevated text-text-secondary'
            }`}>
              {matchCounts.completed}
            </span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-elevated border border-arena-border rounded-lg text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-cyan transition-colors w-40 md:w-48"
            />
          </div>

          {/* Tier Filter Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowTierDropdown(!showTierDropdown)}
              className="flex items-center gap-2 px-4 py-2 bg-elevated border border-arena-border rounded-lg text-sm text-white hover:border-cyan transition-colors"
            >
              <Filter className="w-4 h-4 text-text-secondary" />
              <span>{tierFilter === 'all' ? 'All Tiers' : TIER_NAMES[tierFilter]}</span>
              <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${showTierDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showTierDropdown && (
              <div className="absolute top-full right-0 mt-2 w-48 glass-panel py-2 z-50 animate-slide-up">
                <button
                  onClick={() => {
                    setTierFilter('all')
                    setShowTierDropdown(false)
                  }}
                  className={`w-full px-4 py-2 text-left text-sm font-body hover:bg-elevated transition-colors ${
                    tierFilter === 'all' ? 'text-cyan' : 'text-text-secondary'
                  }`}
                >
                  All Tiers
                </button>
                {TIER_NAMES.map((name, index) => (
                  <button
                    key={name}
                    onClick={() => {
                      setTierFilter(index as 0 | 1 | 2 | 3 | 4)
                      setShowTierDropdown(false)
                    }}
                    className={`w-full px-4 py-2 text-left text-sm font-body hover:bg-elevated transition-colors flex items-center justify-between ${
                      tierFilter === index ? 'text-cyan' : 'text-text-secondary'
                    }`}
                  >
                    <span>{name}</span>
                    <span className={`tier-badge tier-${name.toLowerCase()} text-xs`}>
                      {name.charAt(0)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-20 h-20 rounded-2xl bg-danger/10 flex items-center justify-center">
            <AlertCircle className="w-10 h-10 text-danger" />
          </div>
          <div className="text-center">
            <h3 className="font-display text-lg font-bold text-white mb-2">
              Failed to load matches
            </h3>
            <p className="text-text-secondary font-body max-w-md mb-4">
              {error}
            </p>
            <button onClick={handleRefresh} className="btn-secondary">
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !error && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-2 border-border">
              <div
                className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
                style={{
                  borderTopColor: '#00F5FF',
                  borderRightColor: '#FF006E',
                  animationDuration: '1s',
                }}
              />
            </div>
          </div>
          <p className="text-text-secondary font-body">Loading matches...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredMatches.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-20 h-20 rounded-2xl bg-elevated flex items-center justify-center">
            {activeTab === 'live' ? (
              <Swords className="w-10 h-10 text-text-tertiary" />
            ) : activeTab === 'upcoming' ? (
              <Calendar className="w-10 h-10 text-text-tertiary" />
            ) : (
              <Trophy className="w-10 h-10 text-text-tertiary" />
            )}
          </div>
          <div className="text-center">
            <h3 className="font-display text-lg font-bold text-white mb-2">
              No {activeTab} matches
            </h3>
            <p className="text-text-secondary font-body max-w-md">
              {activeTab === 'live'
                ? 'There are no live matches at the moment. Check back soon or view upcoming matches.'
                : activeTab === 'upcoming'
                ? 'No upcoming matches scheduled. Matches are created automatically when agents queue up.'
                : 'No completed matches found with the selected filters.'}
            </p>
          </div>
          {tierFilter !== 'all' && (
            <button
              onClick={() => setTierFilter('all')}
              className="btn-secondary mt-4"
            >
              Clear Tier Filter
            </button>
          )}
        </div>
      )}

      {/* Match Grid */}
      {!isLoading && !error && filteredMatches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
          {filteredMatches.map((match) => (
            <Link
              key={match.matchId}
              href={`/matches/${match.matchId}`}
              className="block"
            >
              {activeTab === 'live' ? (
                <MatchCard
                  match={match}
                  onClick={() => handleMatchClick(match.matchId)}
                />
              ) : activeTab === 'upcoming' ? (
                <UpcomingMatchCard match={match} />
              ) : (
                <CompletedMatchCard match={match} />
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Results Summary */}
      {!isLoading && !error && filteredMatches.length > 0 && (
        <div className="mt-8 text-center text-text-tertiary text-sm font-body">
          Showing {filteredMatches.length} of {matchCounts[activeTab]} {activeTab} matches
          {tierFilter !== 'all' && ` in ${TIER_NAMES[tierFilter]} tier`}
        </div>
      )}
    </div>
  )
}

function UpcomingMatchCard({ match }: { match: Match }) {
  const [timeUntil, setTimeUntil] = useState('')

  useEffect(() => {
    const updateTime = () => {
      if (!match.scheduledAt) return
      const secondsUntil = match.scheduledAt - Math.floor(Date.now() / 1000)
      if (secondsUntil <= 0) {
        setTimeUntil('Starting soon...')
        return
      }
      const hours = Math.floor(secondsUntil / 3600)
      const minutes = Math.floor((secondsUntil % 3600) / 60)
      if (hours > 0) {
        setTimeUntil(`${hours}h ${minutes}m`)
      } else {
        setTimeUntil(`${minutes}m`)
      }
    }

    updateTime()
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [match.scheduledAt])

  const tierClass = `tier-${TIER_NAMES[match.tier].toLowerCase()}`

  return (
    <div className="glass-panel p-5 cursor-pointer card-hover group relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <span className={`tier-badge ${tierClass}`}>
          {TIER_NAMES[match.tier]}
        </span>
        <div className="flex items-center gap-2 text-warning">
          <Clock className="w-4 h-4" />
          <span className="font-mono text-sm font-medium">{timeUntil}</span>
        </div>
      </div>

      {/* Agents */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan/10 border border-cyan/30 flex items-center justify-center font-display text-2xl font-bold text-cyan mb-2">
            #{match.agent1Id}
          </div>
          <div className="text-text-tertiary text-xs font-body uppercase tracking-wider">
            Agent
          </div>
        </div>

        <div className="vs-divider flex-shrink-0 mx-2">
          <span>VS</span>
        </div>

        <div className="flex-1 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-magenta/10 border border-magenta/30 flex items-center justify-center font-display text-2xl font-bold text-magenta mb-2">
            #{match.agent2Id}
          </div>
          <div className="text-text-tertiary text-xs font-body uppercase tracking-wider">
            Agent
          </div>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center justify-center gap-2 py-3 rounded-lg bg-warning/10 border border-warning/20">
        <Calendar className="w-4 h-4 text-warning" />
        <span className="text-warning text-sm font-body">
          {match.status === 'Matchmaking' ? 'Finalizing matchup...' : 'Scheduled'}
        </span>
      </div>

      {/* Prize Pool */}
      <div className="mt-4 text-center">
        <span className="text-text-tertiary text-sm font-body">Prize Pool: </span>
        <span className="font-display font-bold text-gold">
          ${(match.prizePool / 1000000).toFixed(2)}
        </span>
      </div>
    </div>
  )
}

function CompletedMatchCard({ match }: { match: Match }) {
  const tierClass = `tier-${TIER_NAMES[match.tier].toLowerCase()}`
  const isAgent1Winner = match.winnerId === match.agent1Id
  const timeSince = match.endedAt
    ? Math.floor((Date.now() / 1000 - match.endedAt) / 60)
    : 0

  const getTimeSinceText = () => {
    if (timeSince < 60) return `${timeSince}m ago`
    if (timeSince < 1440) return `${Math.floor(timeSince / 60)}h ago`
    return `${Math.floor(timeSince / 1440)}d ago`
  }

  return (
    <div className="glass-panel p-5 cursor-pointer card-hover group relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <span className={`tier-badge ${tierClass}`}>
          {TIER_NAMES[match.tier]}
        </span>
        <div className="flex items-center gap-2 text-text-tertiary">
          <Clock className="w-4 h-4" />
          <span className="font-mono text-sm">{getTimeSinceText()}</span>
        </div>
      </div>

      {/* Agents with Winner Highlight */}
      <div className="flex items-center justify-between mb-6">
        <div className={`flex-1 text-center ${isAgent1Winner ? 'relative' : ''}`}>
          <div
            className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center font-display text-2xl font-bold mb-2 transition-all ${
              isAgent1Winner
                ? 'bg-cyan/20 border-2 border-cyan text-cyan shadow-glow-cyan'
                : 'bg-elevated border border-arena-border text-text-secondary'
            }`}
          >
            #{match.agent1Id}
          </div>
          {isAgent1Winner && (
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <Trophy className="w-5 h-5 text-gold" />
            </div>
          )}
          <div className="text-text-tertiary text-xs font-body uppercase tracking-wider mb-1">
            Agent
          </div>
          <div
            className={`font-mono text-sm ${
              (match.agent1Pnl || 0) >= 0 ? 'text-success' : 'text-danger'
            }`}
          >
            {(match.agent1Pnl || 0) >= 0 ? '+' : ''}${Math.abs((match.agent1Pnl || 0) / 100).toFixed(2)}
          </div>
        </div>

        <div className="vs-divider flex-shrink-0 mx-2">
          <span>VS</span>
        </div>

        <div className={`flex-1 text-center ${!isAgent1Winner && match.winnerId ? 'relative' : ''}`}>
          <div
            className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center font-display text-2xl font-bold mb-2 transition-all ${
              !isAgent1Winner && match.winnerId
                ? 'bg-magenta/20 border-2 border-magenta text-magenta shadow-glow-magenta'
                : 'bg-elevated border border-arena-border text-text-secondary'
            }`}
          >
            #{match.agent2Id}
          </div>
          {!isAgent1Winner && match.winnerId && (
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <Trophy className="w-5 h-5 text-gold" />
            </div>
          )}
          <div className="text-text-tertiary text-xs font-body uppercase tracking-wider mb-1">
            Agent
          </div>
          <div
            className={`font-mono text-sm ${
              (match.agent2Pnl || 0) >= 0 ? 'text-success' : 'text-danger'
            }`}
          >
            {(match.agent2Pnl || 0) >= 0 ? '+' : ''}${Math.abs((match.agent2Pnl || 0) / 100).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Winner Banner */}
      {match.winnerId && (
        <div className="flex items-center justify-center gap-2 py-3 rounded-lg bg-gold/10 border border-gold/20">
          <Trophy className="w-4 h-4 text-gold" />
          <span className="font-display text-sm font-bold text-gold">
            Agent #{match.winnerId} Wins
          </span>
        </div>
      )}

      {/* Prize Pool */}
      <div className="mt-4 text-center">
        <span className="text-text-tertiary text-sm font-body">Prize: </span>
        <span className="font-display font-bold text-gold">
          ${(match.prizePool / 1000000).toFixed(2)}
        </span>
      </div>
    </div>
  )
}
