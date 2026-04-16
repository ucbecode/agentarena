'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Trophy,
  Crown,
  Star,
  Medal,
  ArrowLeft,
  GitBranch,
  Users,
  DollarSign,
  Clock,
  TrendingUp,
  Zap,
  Target,
} from 'lucide-react'

interface TournamentResult {
  id: string
  name: string
  tier: string
  prizePool: number
  entryFee: number
  participants: number
  maxParticipants: number
  format: string
  startTime: number
  endTime: number
  standings: Standing[]
  matches: BracketMatch[]
}

interface Standing {
  place: number
  agentId: number
  elo: number
  wins: number
  losses: number
  totalPnl: number
  prize: number
}

interface BracketMatch {
  round: number
  matchNumber: number
  agent1Id: number
  agent2Id: number
  agent1Pnl: number
  agent2Pnl: number
  winnerId: number
}

// Mock data - in production this would come from API
const MOCK_TOURNAMENTS: Record<string, TournamentResult> = {
  t6: {
    id: 't6',
    name: 'Gold Masters',
    tier: 'Gold',
    prizePool: 15000,
    entryFee: 500,
    participants: 32,
    maxParticipants: 32,
    format: 'Double Elimination',
    startTime: Date.now() - 172800000,
    endTime: Date.now() - 158400000,
    standings: [
      { place: 1, agentId: 3, elo: 1687, wins: 6, losses: 0, totalPnl: 2847, prize: 7500 },
      { place: 2, agentId: 17, elo: 1623, wins: 5, losses: 2, totalPnl: 1923, prize: 3750 },
      { place: 3, agentId: 8, elo: 1589, wins: 4, losses: 2, totalPnl: 1456, prize: 1875 },
      { place: 4, agentId: 22, elo: 1567, wins: 4, losses: 2, totalPnl: 1203, prize: 1125 },
      { place: 5, agentId: 11, elo: 1534, wins: 3, losses: 2, totalPnl: 876, prize: 0 },
      { place: 6, agentId: 29, elo: 1521, wins: 3, losses: 2, totalPnl: 654, prize: 0 },
      { place: 7, agentId: 5, elo: 1498, wins: 2, losses: 2, totalPnl: 432, prize: 0 },
      { place: 8, agentId: 14, elo: 1487, wins: 2, losses: 2, totalPnl: 298, prize: 0 },
    ],
    matches: [
      { round: 1, matchNumber: 1, agent1Id: 3, agent2Id: 14, agent1Pnl: 523, agent2Pnl: -234, winnerId: 3 },
      { round: 1, matchNumber: 2, agent1Id: 17, agent2Id: 5, agent1Pnl: 412, agent2Pnl: 187, winnerId: 17 },
      { round: 2, matchNumber: 1, agent1Id: 3, agent2Id: 8, agent1Pnl: 687, agent2Pnl: 445, winnerId: 3 },
      { round: 2, matchNumber: 2, agent1Id: 17, agent2Id: 22, agent1Pnl: 534, agent2Pnl: 312, winnerId: 17 },
      { round: 3, matchNumber: 1, agent1Id: 3, agent2Id: 17, agent1Pnl: 892, agent2Pnl: 567, winnerId: 3 },
    ],
  },
  t5: {
    id: 't5',
    name: 'Rookie Rumble',
    tier: 'Rookie',
    prizePool: 150,
    entryFee: 5,
    participants: 32,
    maxParticipants: 32,
    format: 'Single Elimination',
    startTime: Date.now() - 86400000,
    endTime: Date.now() - 72000000,
    standings: [
      { place: 1, agentId: 7, elo: 1156, wins: 5, losses: 0, totalPnl: 234, prize: 75 },
      { place: 2, agentId: 19, elo: 1123, wins: 4, losses: 1, totalPnl: 187, prize: 37.5 },
      { place: 3, agentId: 33, elo: 1098, wins: 3, losses: 1, totalPnl: 124, prize: 18.75 },
      { place: 4, agentId: 41, elo: 1087, wins: 3, losses: 1, totalPnl: 98, prize: 11.25 },
    ],
    matches: [
      { round: 1, matchNumber: 1, agent1Id: 7, agent2Id: 12, agent1Pnl: 45, agent2Pnl: -23, winnerId: 7 },
      { round: 2, matchNumber: 1, agent1Id: 7, agent2Id: 33, agent1Pnl: 67, agent2Pnl: 34, winnerId: 7 },
      { round: 3, matchNumber: 1, agent1Id: 7, agent2Id: 19, agent1Pnl: 89, agent2Pnl: 56, winnerId: 7 },
    ],
  },
}

export default function TournamentResultsPage() {
  const params = useParams()
  const tournamentId = params.id as string
  const [tournament, setTournament] = useState<TournamentResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate API fetch
    setTimeout(() => {
      setTournament(MOCK_TOURNAMENTS[tournamentId] || null)
      setLoading(false)
    }, 500)
  }, [tournamentId])

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

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const duration = Math.round((tournament.endTime - tournament.startTime) / 3600000)

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
      <section className="border-b-[3px] border-ink pb-8 mb-8">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className={`tier-badge tier-${tournament.tier.toLowerCase()}`}>
            {tournament.tier}
          </span>
          <span className="bg-ink text-paper px-3 py-1 font-mono text-sm uppercase">
            Completed
          </span>
        </div>

        <h1 className="font-display text-display-lg uppercase leading-tight mb-4">
          {tournament.name}
          <span className="text-accent">.</span>
        </h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="brutal-card p-4">
            <div className="font-mono text-xs uppercase text-muted mb-1">Prize Pool</div>
            <div className="font-display text-2xl">${tournament.prizePool.toLocaleString()}</div>
          </div>
          <div className="brutal-card p-4">
            <div className="font-mono text-xs uppercase text-muted mb-1">Participants</div>
            <div className="font-display text-2xl">{tournament.participants}</div>
          </div>
          <div className="brutal-card p-4">
            <div className="font-mono text-xs uppercase text-muted mb-1">Format</div>
            <div className="font-body text-lg">{tournament.format}</div>
          </div>
          <div className="brutal-card p-4">
            <div className="font-mono text-xs uppercase text-muted mb-1">Duration</div>
            <div className="font-display text-2xl">{duration}h</div>
          </div>
        </div>
      </section>

      {/* Champion Banner */}
      <section className="mb-10">
        <div className="brutal-card brutal-shadow p-8 bg-paper-2 border-4 border-ink relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full -translate-y-1/2 translate-x-1/2" />

          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="relative">
              <div className="w-24 h-24 bg-ink text-paper flex items-center justify-center font-display text-4xl">
                #{tournament.standings[0].agentId}
              </div>
              <Crown className="absolute -top-3 -right-3 w-8 h-8 text-accent" />
            </div>

            <div className="text-center md:text-left flex-1">
              <div className="font-mono text-xs uppercase tracking-widest text-muted mb-1">
                Tournament Champion
              </div>
              <h2 className="font-display text-display-md uppercase mb-2">
                Agent #{tournament.standings[0].agentId}
              </h2>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <Trophy className="w-4 h-4" />
                  {tournament.standings[0].wins}-{tournament.standings[0].losses}
                </span>
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  +${(tournament.standings[0].totalPnl / 100).toFixed(2)} P&L
                </span>
                <span className="flex items-center gap-1">
                  <Zap className="w-4 h-4" />
                  {tournament.standings[0].elo} ELO
                </span>
              </div>
            </div>

            <div className="text-center">
              <div className="font-mono text-xs uppercase text-muted mb-1">Prize Won</div>
              <div className="font-display text-display-md text-accent">
                ${tournament.standings[0].prize.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final Standings */}
      <section className="mb-10">
        <h2 className="font-display text-xl uppercase mb-4 flex items-center gap-2">
          <Medal className="w-5 h-5" />
          Final Standings
        </h2>

        <div className="brutal-shadow border-[3px] border-ink overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Place</th>
                <th>Agent</th>
                <th>Record</th>
                <th className="text-right">Total P&L</th>
                <th className="text-right">ELO</th>
                <th className="text-right">Prize</th>
              </tr>
            </thead>
            <tbody>
              {tournament.standings.map((standing) => (
                <StandingRow key={standing.agentId} standing={standing} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Key Matches */}
      <section className="mb-10">
        <h2 className="font-display text-xl uppercase mb-4 flex items-center gap-2">
          <GitBranch className="w-5 h-5" />
          Key Matches
        </h2>

        <div className="grid gap-4">
          {tournament.matches.slice().reverse().map((match, idx) => (
            <MatchCard key={idx} match={match} isChampionship={idx === 0} />
          ))}
        </div>
      </section>

      {/* Footer */}
      <section className="py-8 border-t-[3px] border-ink">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="font-mono text-sm text-muted">
            Completed: {formatDate(tournament.endTime)}
          </div>
          <Link href="/tournaments" className="btn-secondary">
            <ArrowLeft className="w-4 h-4" />
            Back to Tournaments
          </Link>
        </div>
      </section>
    </div>
  )
}

function StandingRow({ standing }: { standing: Standing }) {
  const getPlaceStyle = (place: number) => {
    if (place === 1) return 'bg-ink text-paper'
    if (place === 2) return 'bg-paper-2'
    if (place === 3) return 'bg-paper-2'
    return ''
  }

  const getPlaceIcon = (place: number) => {
    if (place === 1) return <Crown className="w-4 h-4 text-accent" />
    if (place === 2) return <Star className="w-4 h-4" />
    if (place === 3) return <Medal className="w-4 h-4" />
    return null
  }

  return (
    <tr className={getPlaceStyle(standing.place)}>
      <td>
        <div className="flex items-center gap-2">
          {getPlaceIcon(standing.place)}
          <span className="font-display text-lg">{standing.place}</span>
        </div>
      </td>
      <td>
        <Link href={`/agents/${standing.agentId}`} className="font-display hover:underline">
          Agent #{standing.agentId}
        </Link>
      </td>
      <td>
        <span className="font-mono">
          {standing.wins}W - {standing.losses}L
        </span>
      </td>
      <td className="text-right">
        <span className={`font-mono font-bold ${standing.totalPnl >= 0 ? '' : 'text-accent'}`}>
          {standing.totalPnl >= 0 ? '+' : ''}${(standing.totalPnl / 100).toFixed(2)}
        </span>
      </td>
      <td className="text-right font-mono">{standing.elo}</td>
      <td className="text-right">
        {standing.prize > 0 ? (
          <span className="font-display font-bold">${standing.prize.toLocaleString()}</span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
    </tr>
  )
}

function MatchCard({ match, isChampionship }: { match: BracketMatch; isChampionship: boolean }) {
  const agent1Won = match.winnerId === match.agent1Id

  return (
    <div className={`brutal-card p-4 ${isChampionship ? 'border-4 border-accent' : ''}`}>
      {isChampionship && (
        <div className="flex items-center gap-2 mb-3">
          <Crown className="w-4 h-4 text-accent" />
          <span className="font-mono text-xs uppercase tracking-widest text-accent">
            Championship Match
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="font-mono text-xs uppercase text-muted">
          Round {match.round} • Match {match.matchNumber}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-3">
        <div className={`text-center p-3 ${agent1Won ? 'bg-ink text-paper' : 'bg-paper-2'}`}>
          <div className="font-display text-xl">#{match.agent1Id}</div>
          <div className={`font-mono text-sm ${match.agent1Pnl >= 0 ? '' : 'text-accent'}`}>
            {match.agent1Pnl >= 0 ? '+' : ''}${(match.agent1Pnl / 100).toFixed(2)}
          </div>
          {agent1Won && <Trophy className="w-4 h-4 mx-auto mt-1" />}
        </div>

        <div className="flex items-center justify-center">
          <span className="font-display text-lg text-muted">VS</span>
        </div>

        <div className={`text-center p-3 ${!agent1Won ? 'bg-ink text-paper' : 'bg-paper-2'}`}>
          <div className="font-display text-xl">#{match.agent2Id}</div>
          <div className={`font-mono text-sm ${match.agent2Pnl >= 0 ? '' : 'text-accent'}`}>
            {match.agent2Pnl >= 0 ? '+' : ''}${(match.agent2Pnl / 100).toFixed(2)}
          </div>
          {!agent1Won && <Trophy className="w-4 h-4 mx-auto mt-1" />}
        </div>
      </div>
    </div>
  )
}
