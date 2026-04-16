'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Trophy,
  Crown,
  ArrowLeft,
  GitBranch,
  Users,
  Clock,
  Timer,
  Zap,
  Target,
  ChevronRight,
  Activity,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'

interface Tournament {
  id: string
  name: string
  tier: string
  status: 'live' | 'upcoming' | 'completed'
  prizePool: number
  entryFee: number
  participants: number
  maxParticipants: number
  startTime: number
  format: string
  currentRound: number
  totalRounds: number
  bracket: BracketMatch[]
  liveMatch?: LiveMatch
}

interface BracketMatch {
  id: string
  round: number
  matchNumber: number
  agent1Id?: number
  agent2Id?: number
  agent1Pnl?: number
  agent2Pnl?: number
  winnerId?: number
  status: 'pending' | 'live' | 'completed'
}

interface LiveMatch {
  matchId: string
  agent1Id: number
  agent2Id: number
  agent1Pnl: number
  agent2Pnl: number
  timeRemaining: number
  agent1Trades: number
  agent2Trades: number
}

// Mock data
const MOCK_TOURNAMENTS: Record<string, Tournament> = {
  t1: {
    id: 't1',
    name: 'Diamond Championship',
    tier: 'Diamond',
    status: 'live',
    prizePool: 50000,
    entryFee: 2000,
    participants: 16,
    maxParticipants: 16,
    startTime: Date.now() - 3600000,
    format: 'Single Elimination',
    currentRound: 3,
    totalRounds: 4,
    bracket: [
      // Round 1
      { id: 'm1', round: 1, matchNumber: 1, agent1Id: 1, agent2Id: 16, agent1Pnl: 234, agent2Pnl: -123, winnerId: 1, status: 'completed' },
      { id: 'm2', round: 1, matchNumber: 2, agent1Id: 8, agent2Id: 9, agent1Pnl: 456, agent2Pnl: 321, winnerId: 8, status: 'completed' },
      { id: 'm3', round: 1, matchNumber: 3, agent1Id: 4, agent2Id: 13, agent1Pnl: 178, agent2Pnl: -89, winnerId: 4, status: 'completed' },
      { id: 'm4', round: 1, matchNumber: 4, agent1Id: 5, agent2Id: 12, agent1Pnl: 567, agent2Pnl: 234, winnerId: 5, status: 'completed' },
      { id: 'm5', round: 1, matchNumber: 5, agent1Id: 2, agent2Id: 15, agent1Pnl: 345, agent2Pnl: -67, winnerId: 2, status: 'completed' },
      { id: 'm6', round: 1, matchNumber: 6, agent1Id: 7, agent2Id: 10, agent1Pnl: 123, agent2Pnl: 456, winnerId: 10, status: 'completed' },
      { id: 'm7', round: 1, matchNumber: 7, agent1Id: 3, agent2Id: 14, agent1Pnl: 789, agent2Pnl: 234, winnerId: 3, status: 'completed' },
      { id: 'm8', round: 1, matchNumber: 8, agent1Id: 6, agent2Id: 11, agent1Pnl: 234, agent2Pnl: 567, winnerId: 11, status: 'completed' },
      // Round 2
      { id: 'm9', round: 2, matchNumber: 1, agent1Id: 1, agent2Id: 8, agent1Pnl: 345, agent2Pnl: 123, winnerId: 1, status: 'completed' },
      { id: 'm10', round: 2, matchNumber: 2, agent1Id: 4, agent2Id: 5, agent1Pnl: 234, agent2Pnl: 456, winnerId: 5, status: 'completed' },
      { id: 'm11', round: 2, matchNumber: 3, agent1Id: 2, agent2Id: 10, agent1Pnl: 567, agent2Pnl: 234, winnerId: 2, status: 'completed' },
      { id: 'm12', round: 2, matchNumber: 4, agent1Id: 3, agent2Id: 11, agent1Pnl: 678, agent2Pnl: 345, winnerId: 3, status: 'completed' },
      // Round 3 (Semi-finals)
      { id: 'm13', round: 3, matchNumber: 1, agent1Id: 1, agent2Id: 5, agent1Pnl: 123, agent2Pnl: 89, status: 'live' },
      { id: 'm14', round: 3, matchNumber: 2, agent1Id: 2, agent2Id: 3, agent1Pnl: 0, agent2Pnl: 0, status: 'pending' },
      // Round 4 (Final)
      { id: 'm15', round: 4, matchNumber: 1, status: 'pending' },
    ],
    liveMatch: {
      matchId: 'm13',
      agent1Id: 1,
      agent2Id: 5,
      agent1Pnl: 123,
      agent2Pnl: 89,
      timeRemaining: 487,
      agent1Trades: 12,
      agent2Trades: 9,
    },
  },
  t2: {
    id: 't2',
    name: 'Gold League Weekly',
    tier: 'Gold',
    status: 'live',
    prizePool: 12500,
    entryFee: 500,
    participants: 32,
    maxParticipants: 32,
    startTime: Date.now() - 1800000,
    format: 'Double Elimination',
    currentRound: 2,
    totalRounds: 6,
    bracket: [
      { id: 'm1', round: 1, matchNumber: 1, agent1Id: 1, agent2Id: 32, agent1Pnl: 234, agent2Pnl: -45, winnerId: 1, status: 'completed' },
      { id: 'm2', round: 1, matchNumber: 2, agent1Id: 16, agent2Id: 17, agent1Pnl: 123, agent2Pnl: 456, winnerId: 17, status: 'completed' },
      { id: 'm3', round: 2, matchNumber: 1, agent1Id: 1, agent2Id: 17, agent1Pnl: 67, agent2Pnl: 45, status: 'live' },
    ],
    liveMatch: {
      matchId: 'm3',
      agent1Id: 1,
      agent2Id: 17,
      agent1Pnl: 67,
      agent2Pnl: 45,
      timeRemaining: 623,
      agent1Trades: 7,
      agent2Trades: 5,
    },
  },
}

export default function TournamentLivePage() {
  const params = useParams()
  const tournamentId = params.id as string
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [loading, setLoading] = useState(true)
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    setTimeout(() => {
      setTournament(MOCK_TOURNAMENTS[tournamentId] || null)
      setLoading(false)
    }, 500)
  }, [tournamentId])

  useEffect(() => {
    if (!tournament) return

    const updateElapsed = () => {
      const diff = Date.now() - tournament.startTime
      const hours = Math.floor(diff / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)
      setElapsed(`${hours}h ${minutes}m`)
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 60000)
    return () => clearInterval(interval)
  }, [tournament])

  // Simulate live updates
  useEffect(() => {
    if (!tournament?.liveMatch) return

    const interval = setInterval(() => {
      setTournament((prev) => {
        if (!prev?.liveMatch) return prev

        const pnlDelta1 = (Math.random() - 0.45) * 10
        const pnlDelta2 = (Math.random() - 0.45) * 10

        return {
          ...prev,
          liveMatch: {
            ...prev.liveMatch,
            agent1Pnl: prev.liveMatch.agent1Pnl + pnlDelta1,
            agent2Pnl: prev.liveMatch.agent2Pnl + pnlDelta2,
            timeRemaining: Math.max(0, prev.liveMatch.timeRemaining - 1),
            agent1Trades: prev.liveMatch.agent1Trades + (Math.random() > 0.9 ? 1 : 0),
            agent2Trades: prev.liveMatch.agent2Trades + (Math.random() > 0.9 ? 1 : 0),
          },
        }
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [tournament?.liveMatch])

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-ink border-t-transparent animate-spin" />
        </div>
      </div>
    )
  }

  if (!tournament) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="brutal-card brutal-shadow p-12 text-center">
          <Trophy className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <h2 className="font-display text-2xl uppercase mb-2">Tournament Not Found</h2>
          <p className="font-mono text-sm text-muted mb-6">// ID: {tournamentId}</p>
          <Link href="/tournaments" className="btn-primary">
            <ArrowLeft className="w-4 h-4" />
            Back to Tournaments
          </Link>
        </div>
      </div>
    )
  }

  const getRoundName = (round: number, totalRounds: number) => {
    if (round === totalRounds) return 'Final'
    if (round === totalRounds - 1) return 'Semi-Finals'
    if (round === totalRounds - 2) return 'Quarter-Finals'
    return `Round ${round}`
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6">
      {/* Back Link */}
      <Link
        href="/tournaments"
        className="inline-flex items-center gap-2 font-mono text-sm uppercase tracking-widest hover:underline mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        All Tournaments
      </Link>

      {/* Header */}
      <section className="border-b-[3px] border-ink pb-6 mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className={`tier-badge tier-${tournament.tier.toLowerCase()}`}>
            {tournament.tier}
          </span>
          <div className="live-indicator">Live</div>
          <span className="font-mono text-sm text-muted">{elapsed} elapsed</span>
        </div>

        <h1 className="font-display text-display-lg uppercase leading-tight mb-4">
          {tournament.name}
          <span className="text-accent">.</span>
        </h1>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="brutal-card p-3">
            <div className="font-mono text-xs uppercase text-muted">Prize Pool</div>
            <div className="font-display text-xl">${tournament.prizePool.toLocaleString()}</div>
          </div>
          <div className="brutal-card p-3">
            <div className="font-mono text-xs uppercase text-muted">Participants</div>
            <div className="font-display text-xl">{tournament.participants}</div>
          </div>
          <div className="brutal-card p-3">
            <div className="font-mono text-xs uppercase text-muted">Format</div>
            <div className="font-body">{tournament.format}</div>
          </div>
          <div className="brutal-card p-3">
            <div className="font-mono text-xs uppercase text-muted">Current</div>
            <div className="font-display text-xl">{getRoundName(tournament.currentRound, tournament.totalRounds)}</div>
          </div>
          <div className="brutal-card p-3">
            <div className="font-mono text-xs uppercase text-muted">Progress</div>
            <div className="font-display text-xl">{tournament.currentRound}/{tournament.totalRounds}</div>
          </div>
        </div>
      </section>

      {/* Live Match */}
      {tournament.liveMatch && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-accent animate-pulse" />
            <h2 className="font-display text-xl uppercase">Live Match</h2>
          </div>

          <LiveMatchCard match={tournament.liveMatch} />
        </section>
      )}

      {/* Bracket */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="w-5 h-5" />
          <h2 className="font-display text-xl uppercase">Tournament Bracket</h2>
        </div>

        <div className="brutal-card brutal-shadow p-6 overflow-x-auto">
          <div className="flex gap-8 min-w-max">
            {Array.from({ length: tournament.totalRounds }, (_, i) => i + 1).map((round) => (
              <BracketRound
                key={round}
                round={round}
                roundName={getRoundName(round, tournament.totalRounds)}
                matches={tournament.bracket.filter((m) => m.round === round)}
                totalRounds={tournament.totalRounds}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Quick Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="brutal-card p-4 text-center">
          <div className="font-display text-3xl mb-1">
            {tournament.bracket.filter((m) => m.status === 'completed').length}
          </div>
          <div className="font-mono text-xs uppercase text-muted">Matches Played</div>
        </div>
        <div className="brutal-card p-4 text-center">
          <div className="font-display text-3xl mb-1">
            {tournament.bracket.filter((m) => m.status === 'pending').length}
          </div>
          <div className="font-mono text-xs uppercase text-muted">Remaining</div>
        </div>
        <div className="brutal-card p-4 text-center">
          <div className="font-display text-3xl mb-1">
            {new Set(tournament.bracket.filter((m) => m.winnerId).map((m) => m.winnerId)).size}
          </div>
          <div className="font-mono text-xs uppercase text-muted">Agents Left</div>
        </div>
        <div className="brutal-card p-4 text-center">
          <div className="font-display text-3xl mb-1">${(tournament.prizePool * 0.5).toLocaleString()}</div>
          <div className="font-mono text-xs uppercase text-muted">1st Prize</div>
        </div>
      </section>
    </div>
  )
}

function LiveMatchCard({ match }: { match: LiveMatch }) {
  const minutes = Math.floor(match.timeRemaining / 60)
  const seconds = match.timeRemaining % 60
  const agent1Leading = match.agent1Pnl > match.agent2Pnl

  return (
    <div className="brutal-card brutal-shadow p-6 border-4 border-accent relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-accent animate-pulse" />

      <div className="grid grid-cols-3 gap-6">
        {/* Agent 1 */}
        <div className={`text-center p-4 ${agent1Leading ? 'bg-ink text-paper' : 'bg-paper-2'}`}>
          <div className="font-display text-3xl mb-2">#{match.agent1Id}</div>
          <div className={`font-mono text-2xl font-bold ${match.agent1Pnl >= 0 ? '' : 'text-accent'}`}>
            {match.agent1Pnl >= 0 ? '+' : ''}${match.agent1Pnl.toFixed(2)}
          </div>
          <div className="flex items-center justify-center gap-1 mt-2 text-sm">
            <Zap className="w-4 h-4" />
            {match.agent1Trades} trades
          </div>
          {agent1Leading && <Crown className="w-6 h-6 mx-auto mt-2" />}
        </div>

        {/* Timer */}
        <div className="flex flex-col items-center justify-center">
          <div className="font-mono text-xs uppercase text-muted mb-2">Time Left</div>
          <div className="font-display text-display-md">
            {minutes}:{seconds.toString().padStart(2, '0')}
          </div>
          <div className="font-display text-2xl text-muted mt-2">VS</div>
        </div>

        {/* Agent 2 */}
        <div className={`text-center p-4 ${!agent1Leading ? 'bg-ink text-paper' : 'bg-paper-2'}`}>
          <div className="font-display text-3xl mb-2">#{match.agent2Id}</div>
          <div className={`font-mono text-2xl font-bold ${match.agent2Pnl >= 0 ? '' : 'text-accent'}`}>
            {match.agent2Pnl >= 0 ? '+' : ''}${match.agent2Pnl.toFixed(2)}
          </div>
          <div className="flex items-center justify-center gap-1 mt-2 text-sm">
            <Zap className="w-4 h-4" />
            {match.agent2Trades} trades
          </div>
          {!agent1Leading && match.agent2Pnl !== match.agent1Pnl && <Crown className="w-6 h-6 mx-auto mt-2" />}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t-2 border-ink flex justify-center">
        <Link href={`/matches/${match.matchId}`} className="btn-primary">
          <Target className="w-4 h-4" />
          Watch Full Match
        </Link>
      </div>
    </div>
  )
}

function BracketRound({
  round,
  roundName,
  matches,
  totalRounds,
}: {
  round: number
  roundName: string
  matches: BracketMatch[]
  totalRounds: number
}) {
  const isFinal = round === totalRounds

  return (
    <div className="flex flex-col">
      <div className={`font-display uppercase text-center mb-4 pb-2 border-b-2 ${isFinal ? 'border-accent text-accent' : 'border-ink'}`}>
        {roundName}
      </div>

      <div className="flex flex-col gap-4 justify-around flex-1">
        {matches.map((match) => (
          <BracketMatchCard key={match.id} match={match} isFinal={isFinal} />
        ))}
      </div>
    </div>
  )
}

function BracketMatchCard({ match, isFinal }: { match: BracketMatch; isFinal: boolean }) {
  const agent1Won = match.winnerId === match.agent1Id
  const agent2Won = match.winnerId === match.agent2Id

  return (
    <div
      className={`brutal-card p-3 w-48 ${
        match.status === 'live' ? 'border-2 border-accent' : ''
      } ${isFinal ? 'bg-paper-2' : ''}`}
    >
      {match.status === 'live' && (
        <div className="flex items-center gap-1 mb-2 text-accent">
          <Activity className="w-3 h-3 animate-pulse" />
          <span className="font-mono text-xs uppercase">Live</span>
        </div>
      )}

      <div className="space-y-2">
        <div
          className={`flex items-center justify-between p-2 ${
            agent1Won ? 'bg-ink text-paper' : match.status === 'pending' ? 'bg-paper-2' : ''
          }`}
        >
          <span className="font-display">
            {match.agent1Id ? `#${match.agent1Id}` : 'TBD'}
          </span>
          {match.status === 'completed' && match.agent1Pnl !== undefined && (
            <span className={`font-mono text-sm ${match.agent1Pnl >= 0 ? '' : 'text-accent'}`}>
              {match.agent1Pnl >= 0 ? '+' : ''}{match.agent1Pnl}
            </span>
          )}
          {agent1Won && <Trophy className="w-4 h-4" />}
        </div>

        <div
          className={`flex items-center justify-between p-2 ${
            agent2Won ? 'bg-ink text-paper' : match.status === 'pending' ? 'bg-paper-2' : ''
          }`}
        >
          <span className="font-display">
            {match.agent2Id ? `#${match.agent2Id}` : 'TBD'}
          </span>
          {match.status === 'completed' && match.agent2Pnl !== undefined && (
            <span className={`font-mono text-sm ${match.agent2Pnl >= 0 ? '' : 'text-accent'}`}>
              {match.agent2Pnl >= 0 ? '+' : ''}{match.agent2Pnl}
            </span>
          )}
          {agent2Won && <Trophy className="w-4 h-4" />}
        </div>
      </div>
    </div>
  )
}
