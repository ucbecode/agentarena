'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { LiveMatchView } from '@/components/LiveMatchView'
import {
  ChevronLeft,
  Zap,
  AlertTriangle,
  RefreshCw,
  Home,
  Trophy,
  Swords,
} from 'lucide-react'

interface MatchMeta {
  matchId: string
  status: string
  agent1Id: number
  agent2Id: number
  tier: number
  prizePool: number
  winnerId?: number
  startedAt?: number
  endedAt?: number
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3460'

const TIER_NAMES = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Diamond']

type PageState = 'loading' | 'active' | 'completed' | 'error' | 'not_found'

export default function MatchDetailPage() {
  const params = useParams()
  const matchId = params.id as string

  const [pageState, setPageState] = useState<PageState>('loading')
  const [matchMeta, setMatchMeta] = useState<MatchMeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const fetchMatchState = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/matches/${matchId}/state`)

      if (response.status === 404) {
        setPageState('not_found')
        return
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch match: ${response.statusText}`)
      }

      const data = await response.json()

      setMatchMeta({
        matchId: data.matchId,
        status: data.status,
        agent1Id: data.agent1State?.agentId,
        agent2Id: data.agent2State?.agentId,
        tier: data.tier || 0,
        prizePool: data.prizePool || 0,
        winnerId: data.winnerId,
        startedAt: data.startedAt,
        endedAt: data.endedAt,
      })

      if (data.status === 'Completed' || data.status === 'Settled') {
        setPageState('completed')
      } else {
        setPageState('active')
      }

      setError(null)
    } catch (err) {
      console.error('Failed to fetch match state:', err)
      setError(err instanceof Error ? err.message : 'Failed to load match')
      setPageState('error')
    }
  }, [matchId])

  useEffect(() => {
    if (matchId) {
      fetchMatchState()
    }
  }, [matchId, fetchMatchState, retryCount])

  const handleRetry = () => {
    setPageState('loading')
    setError(null)
    setRetryCount((prev) => prev + 1)
  }

  // Loading State
  if (pageState === 'loading') {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <LoadingState />
      </div>
    )
  }

  // Not Found State
  if (pageState === 'not_found') {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <NotFoundState matchId={matchId} />
      </div>
    )
  }

  // Error State
  if (pageState === 'error') {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <ErrorState error={error} onRetry={handleRetry} />
      </div>
    )
  }

  // Completed Match State
  if (pageState === 'completed' && matchMeta) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <BackButton />
        <MatchCompletedBanner matchMeta={matchMeta} />
        <LiveMatchView matchId={matchId} />
      </div>
    )
  }

  // Active Match State
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <BackButton />
      {matchMeta && <MatchHeader matchMeta={matchMeta} />}
      <LiveMatchView matchId={matchId} />
    </div>
  )
}

function BackButton() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 text-text-secondary hover:text-cyan transition-colors mb-6 font-body group"
    >
      <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
      Back to Arena
    </Link>
  )
}

function MatchHeader({ matchMeta }: { matchMeta: MatchMeta }) {
  const tierClass = `tier-${TIER_NAMES[matchMeta.tier]?.toLowerCase() || 'rookie'}`

  return (
    <div className="flex flex-wrap items-center gap-4 mb-6">
      <div className="flex items-center gap-3">
        <Swords className="w-6 h-6 text-cyan" />
        <h1 className="font-display text-2xl font-bold text-white">
          Match #{matchMeta.matchId.slice(0, 8)}
        </h1>
      </div>
      <span className={`tier-badge ${tierClass}`}>
        {TIER_NAMES[matchMeta.tier] || 'Rookie'}
      </span>
      <div className="live-indicator">Live</div>
    </div>
  )
}

function MatchCompletedBanner({ matchMeta }: { matchMeta: MatchMeta }) {
  const tierClass = `tier-${TIER_NAMES[matchMeta.tier]?.toLowerCase() || 'rookie'}`
  const isAgent1Winner = matchMeta.winnerId === matchMeta.agent1Id

  return (
    <div className="glass-panel glow-border-gold p-6 mb-6 animate-slide-up">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        {/* Left: Match Info */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gold/20 flex items-center justify-center">
            <Trophy className="w-8 h-8 text-gold" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-display text-2xl font-bold text-white">
                Match Complete
              </h1>
              <span className={`tier-badge ${tierClass}`}>
                {TIER_NAMES[matchMeta.tier] || 'Rookie'}
              </span>
            </div>
            <p className="text-text-secondary font-body">
              Match #{matchMeta.matchId.slice(0, 8)} has concluded
            </p>
          </div>
        </div>

        {/* Right: Winner Display */}
        {matchMeta.winnerId && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-text-tertiary text-sm font-body mb-1">Winner</div>
              <div
                className={`
                  font-display text-3xl font-bold
                  ${isAgent1Winner ? 'text-cyan text-glow-cyan' : 'text-magenta text-glow-magenta'}
                `}
              >
                Agent #{matchMeta.winnerId}
              </div>
            </div>
            <div
              className={`
                relative w-20 h-20 rounded-2xl flex items-center justify-center
                font-display text-3xl font-bold
                ${isAgent1Winner
                  ? 'bg-cyan/20 text-cyan border border-cyan/30 shadow-glow-cyan'
                  : 'bg-magenta/20 text-magenta border border-magenta/30 shadow-glow-magenta'
                }
              `}
            >
              #{matchMeta.winnerId}
              <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gold flex items-center justify-center shadow-glow-gold">
                <Trophy className="w-5 h-5 text-void" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Prize Info */}
      {matchMeta.prizePool > 0 && (
        <div className="mt-6 pt-6 border-t border-gold/20 flex items-center justify-center gap-2">
          <span className="text-text-secondary font-body">Prize Awarded:</span>
          <span className="font-display text-xl font-bold text-gold">
            ${(matchMeta.prizePool / 1000000).toFixed(2)}
          </span>
        </div>
      )}
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      {/* Animated loader */}
      <div className="relative">
        <div className="w-24 h-24 rounded-full border-2 border-border">
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
            style={{
              borderTopColor: '#00F5FF',
              borderRightColor: '#FF006E',
              animationDuration: '1s',
            }}
          />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Zap className="w-10 h-10 text-cyan animate-pulse" />
        </div>
      </div>

      {/* Loading text */}
      <div className="text-center">
        <h2 className="font-display text-xl font-bold text-white mb-2">
          Loading Match
        </h2>
        <p className="text-text-secondary font-body">
          Connecting to neural combat terminal...
        </p>
      </div>

      {/* Terminal effect */}
      <div className="glass-panel p-4 max-w-md w-full">
        <div className="font-mono text-sm space-y-1">
          <div className="text-cyan">&gt; Initializing connection...</div>
          <div className="text-text-secondary">&gt; Fetching match data...</div>
          <div className="text-text-tertiary terminal-text">&gt; </div>
        </div>
      </div>
    </div>
  )
}

function NotFoundState({ matchId }: { matchId: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      {/* Icon */}
      <div className="w-24 h-24 rounded-2xl bg-warning/20 flex items-center justify-center">
        <AlertTriangle className="w-12 h-12 text-warning" />
      </div>

      {/* Message */}
      <div className="text-center max-w-md">
        <h2 className="font-display text-2xl font-bold text-white mb-3">
          Match Not Found
        </h2>
        <p className="text-text-secondary font-body mb-2">
          The match you're looking for doesn't exist or has been removed.
        </p>
        <p className="text-text-tertiary font-mono text-sm">
          Match ID: {matchId}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 mt-4">
        <Link href="/" className="btn-primary">
          <Home className="w-4 h-4" />
          Back to Arena
        </Link>
        <Link href="/matches" className="btn-secondary">
          <Swords className="w-4 h-4" />
          Browse Matches
        </Link>
      </div>
    </div>
  )
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string | null
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      {/* Icon */}
      <div className="w-24 h-24 rounded-2xl bg-danger/20 flex items-center justify-center">
        <AlertTriangle className="w-12 h-12 text-danger" />
      </div>

      {/* Message */}
      <div className="text-center max-w-md">
        <h2 className="font-display text-2xl font-bold text-white mb-3">
          Connection Error
        </h2>
        <p className="text-text-secondary font-body mb-4">
          Failed to connect to the neural combat terminal. The arena servers may be temporarily unavailable.
        </p>

        {/* Error details */}
        {error && (
          <div className="glass-panel p-4 mb-4">
            <div className="font-mono text-sm text-danger">{error}</div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button onClick={onRetry} className="btn-primary">
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
        <Link href="/" className="btn-secondary">
          <Home className="w-4 h-4" />
          Back to Arena
        </Link>
      </div>

      {/* Help text */}
      <p className="text-text-tertiary text-sm font-body mt-4">
        If the problem persists, please check your connection or try again later.
      </p>
    </div>
  )
}
