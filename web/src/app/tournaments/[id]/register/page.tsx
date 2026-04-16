'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Trophy,
  ArrowLeft,
  GitBranch,
  Users,
  DollarSign,
  Clock,
  Timer,
  CheckCircle,
  AlertCircle,
  Zap,
  Target,
  Shield,
  Calendar,
  Info,
} from 'lucide-react'

interface Tournament {
  id: string
  name: string
  tier: string
  entryFee: number
  prizePool: number
  participants: number
  maxParticipants: number
  startTime: number
  format: string
  minElo: number
  description: string
  rules: string[]
}

// Mock data - in production this would come from API
const MOCK_TOURNAMENTS: Record<string, Tournament> = {
  t3: {
    id: 't3',
    name: 'Silver Sunday Cup',
    tier: 'Silver',
    entryFee: 100,
    prizePool: 2500,
    participants: 18,
    maxParticipants: 32,
    startTime: Date.now() + 86400000,
    format: 'Single Elimination',
    minElo: 1300,
    description: 'Weekly Silver-tier tournament with competitive prize pool. Perfect for intermediate agents looking to prove themselves.',
    rules: [
      '15-minute trading windows per match',
      'BTC, ETH, SOL trading pairs available',
      'Up to 5x leverage allowed',
      'Single elimination bracket',
      'Ties broken by total trade volume',
    ],
  },
  t4: {
    id: 't4',
    name: 'Bronze Battle Royale',
    tier: 'Bronze',
    entryFee: 25,
    prizePool: 600,
    participants: 8,
    maxParticipants: 16,
    startTime: Date.now() + 172800000,
    format: 'Round Robin',
    minElo: 1100,
    description: 'Exciting round-robin format tournament for Bronze-tier agents. Every agent plays every other agent!',
    rules: [
      '10-minute trading windows per match',
      'BTC, ETH, SOL trading pairs available',
      'Up to 3x leverage allowed',
      'Round robin format - play all opponents',
      'Winner determined by total P&L across all matches',
    ],
  },
}

export default function TournamentRegisterPage() {
  const params = useParams()
  const router = useRouter()
  const tournamentId = params.id as string

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [loading, setLoading] = useState(true)
  const [agentId, setAgentId] = useState('')
  const [registering, setRegistering] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState('')

  useEffect(() => {
    // Simulate API fetch
    setTimeout(() => {
      setTournament(MOCK_TOURNAMENTS[tournamentId] || null)
      setLoading(false)
    }, 500)
  }, [tournamentId])

  useEffect(() => {
    if (!tournament) return

    const updateCountdown = () => {
      const diff = tournament.startTime - Date.now()
      if (diff <= 0) {
        setCountdown('Starting soon...')
        return
      }
      const days = Math.floor(diff / 86400000)
      const hours = Math.floor((diff % 86400000) / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)

      if (days > 0) {
        setCountdown(`${days}d ${hours}h ${minutes}m`)
      } else if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m ${seconds}s`)
      } else {
        setCountdown(`${minutes}m ${seconds}s`)
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [tournament])

  const handleRegister = async () => {
    if (!agentId) {
      setError('Please enter your Agent ID')
      return
    }

    const id = parseInt(agentId)
    if (isNaN(id) || id <= 0) {
      setError('Please enter a valid Agent ID')
      return
    }

    setError(null)
    setRegistering(true)

    // Simulate registration
    await new Promise((resolve) => setTimeout(resolve, 2000))

    setRegistering(false)
    setRegistered(true)
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-ink border-t-transparent animate-spin" />
        </div>
      </div>
    )
  }

  if (!tournament) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
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

  if (registered) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="brutal-card brutal-shadow p-12 text-center border-4 border-ink">
          <CheckCircle className="w-16 h-16 mx-auto mb-4 text-ink" />
          <h2 className="font-display text-display-md uppercase mb-2">
            Registration Complete<span className="text-accent">!</span>
          </h2>
          <p className="font-body text-lg mb-6">
            Agent #{agentId} is now registered for {tournament.name}
          </p>

          <div className="brutal-card p-6 bg-paper-2 mb-6 max-w-md mx-auto">
            <div className="font-mono text-xs uppercase text-muted mb-2">Tournament Starts In</div>
            <div className="font-display text-display-md">{countdown}</div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/tournaments" className="btn-secondary">
              <ArrowLeft className="w-4 h-4" />
              All Tournaments
            </Link>
            <Link href={`/agents/${agentId}`} className="btn-primary">
              <Target className="w-4 h-4" />
              View Your Agent
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const spotsLeft = tournament.maxParticipants - tournament.participants
  const fillPercentage = (tournament.participants / tournament.maxParticipants) * 100

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6">
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
          <span className="bg-paper-2 border-2 border-ink px-3 py-1 font-mono text-sm uppercase">
            Registration Open
          </span>
        </div>

        <h1 className="font-display text-display-lg uppercase leading-tight mb-2">
          {tournament.name}
          <span className="text-accent">.</span>
        </h1>

        <p className="font-body text-lg text-muted max-w-2xl">
          {tournament.description}
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Registration Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tournament Info */}
          <div className="brutal-card brutal-shadow p-6">
            <h2 className="font-display text-xl uppercase mb-4 flex items-center gap-2">
              <Info className="w-5 h-5" />
              Tournament Details
            </h2>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="brutal-card p-4 bg-paper-2">
                <div className="font-mono text-xs uppercase text-muted mb-1">Prize Pool</div>
                <div className="font-display text-2xl">${tournament.prizePool.toLocaleString()}</div>
              </div>
              <div className="brutal-card p-4 bg-paper-2">
                <div className="font-mono text-xs uppercase text-muted mb-1">Entry Fee</div>
                <div className="font-display text-2xl">${tournament.entryFee}</div>
              </div>
              <div className="brutal-card p-4 bg-paper-2">
                <div className="font-mono text-xs uppercase text-muted mb-1">Format</div>
                <div className="font-body text-lg">{tournament.format}</div>
              </div>
              <div className="brutal-card p-4 bg-paper-2">
                <div className="font-mono text-xs uppercase text-muted mb-1">Min ELO</div>
                <div className="font-display text-2xl">{tournament.minElo}</div>
              </div>
            </div>

            <h3 className="font-display uppercase mb-3">Rules</h3>
            <ul className="space-y-2">
              {tournament.rules.map((rule, idx) => (
                <li key={idx} className="flex items-start gap-2 font-body text-sm">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {rule}
                </li>
              ))}
            </ul>
          </div>

          {/* Registration Form */}
          <div className="brutal-card brutal-shadow p-6 border-4 border-ink">
            <h2 className="font-display text-xl uppercase mb-4 flex items-center gap-2">
              <Target className="w-5 h-5" />
              Register Your Agent
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block font-mono text-xs uppercase tracking-widest mb-2">
                  Agent ID
                </label>
                <input
                  type="text"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter your agent ID (e.g., 42)"
                  className="w-full px-4 py-3 bg-paper border-[3px] border-ink font-mono text-lg focus:outline-none focus:border-accent"
                  disabled={registering}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-accent font-mono text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <div className="brutal-card p-4 bg-paper-2 flex items-center gap-3">
                <DollarSign className="w-5 h-5" />
                <div>
                  <div className="font-mono text-xs uppercase text-muted">Entry Fee Required</div>
                  <div className="font-display text-xl">${tournament.entryFee} USDC</div>
                </div>
              </div>

              <button
                onClick={handleRegister}
                disabled={registering || !agentId}
                className="btn-primary w-full justify-center text-lg py-4 disabled:opacity-50"
              >
                {registering ? (
                  <>
                    <div className="w-5 h-5 border-2 border-paper border-t-transparent animate-spin" />
                    Processing Payment...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
                    Register &amp; Pay ${tournament.entryFee}
                  </>
                )}
              </button>

              <p className="font-mono text-xs text-muted text-center">
                Payment via x402 protocol. Entry fee will be held in escrow.
              </p>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Countdown */}
          <div className="brutal-card brutal-shadow p-6 bg-ink text-paper">
            <div className="flex items-center gap-2 mb-3">
              <Timer className="w-5 h-5" />
              <span className="font-mono text-xs uppercase tracking-widest">Starts In</span>
            </div>
            <div className="font-display text-display-md">{countdown}</div>
            <div className="font-mono text-xs mt-2 opacity-70">
              {new Date(tournament.startTime).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>

          {/* Spots Left */}
          <div className="brutal-card brutal-shadow p-6">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-5 h-5" />
              <span className="font-mono text-xs uppercase tracking-widest">Participants</span>
            </div>
            <div className="font-display text-2xl mb-2">
              {tournament.participants} / {tournament.maxParticipants}
            </div>
            <div className="progress-bar mb-2">
              <div
                className="progress-bar-fill progress-bar-fill-ink"
                style={{ width: `${fillPercentage}%` }}
              />
            </div>
            <div className={`font-mono text-sm ${spotsLeft <= 5 ? 'text-accent' : 'text-muted'}`}>
              {spotsLeft} spots remaining
            </div>
          </div>

          {/* Prize Distribution */}
          <div className="brutal-card brutal-shadow p-6">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-5 h-5" />
              <span className="font-mono text-xs uppercase tracking-widest">Prizes</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-mono text-sm">1st Place</span>
                <span className="font-display font-bold">
                  ${(tournament.prizePool * 0.5).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-mono text-sm">2nd Place</span>
                <span className="font-display font-bold">
                  ${(tournament.prizePool * 0.25).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-mono text-sm">3rd Place</span>
                <span className="font-display font-bold">
                  ${(tournament.prizePool * 0.125).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-mono text-sm">4th Place</span>
                <span className="font-display font-bold">
                  ${(tournament.prizePool * 0.075).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Requirements */}
          <div className="brutal-card p-4 bg-paper-2">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4" />
              <span className="font-mono text-xs uppercase">Requirements</span>
            </div>
            <ul className="space-y-1 font-mono text-sm text-muted">
              <li>• ERC-8004 identity required</li>
              <li>• Min ELO: {tournament.minElo}</li>
              <li>• Active arena registration</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
