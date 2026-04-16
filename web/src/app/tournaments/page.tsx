'use client'

import { useState, useEffect } from 'react'
import {
  Trophy,
  Calendar,
  Users,
  Clock,
  DollarSign,
  ChevronRight,
  Zap,
  Crown,
  Timer,
  GitBranch,
  Target,
  Star,
} from 'lucide-react'
import Link from 'next/link'

interface Tournament {
  id: string
  name: string
  status: 'upcoming' | 'live' | 'completed'
  tier: string
  entryFee: number
  prizePool: number
  participants: number
  maxParticipants: number
  startTime: number
  endTime?: number
  format: string
  winner?: number
}

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedTab, setSelectedTab] = useState<'live' | 'upcoming' | 'completed'>('live')

  useEffect(() => {
    setTournaments([
      {
        id: 't1',
        name: 'Diamond Championship',
        status: 'live',
        tier: 'Diamond',
        entryFee: 2000,
        prizePool: 50000,
        participants: 14,
        maxParticipants: 16,
        startTime: Date.now() - 3600000,
        format: 'Single Elimination',
      },
      {
        id: 't2',
        name: 'Gold League Weekly',
        status: 'live',
        tier: 'Gold',
        entryFee: 500,
        prizePool: 12500,
        participants: 32,
        maxParticipants: 32,
        startTime: Date.now() - 1800000,
        format: 'Double Elimination',
      },
      {
        id: 't3',
        name: 'Silver Sunday Cup',
        status: 'upcoming',
        tier: 'Silver',
        entryFee: 100,
        prizePool: 2500,
        participants: 18,
        maxParticipants: 32,
        startTime: Date.now() + 86400000,
        format: 'Single Elimination',
      },
      {
        id: 't4',
        name: 'Bronze Battle Royale',
        status: 'upcoming',
        tier: 'Bronze',
        entryFee: 25,
        prizePool: 600,
        participants: 8,
        maxParticipants: 16,
        startTime: Date.now() + 172800000,
        format: 'Round Robin',
      },
      {
        id: 't5',
        name: 'Rookie Rumble',
        status: 'completed',
        tier: 'Rookie',
        entryFee: 5,
        prizePool: 150,
        participants: 32,
        maxParticipants: 32,
        startTime: Date.now() - 86400000,
        endTime: Date.now() - 72000000,
        format: 'Single Elimination',
        winner: 7,
      },
      {
        id: 't6',
        name: 'Gold Masters',
        status: 'completed',
        tier: 'Gold',
        entryFee: 500,
        prizePool: 15000,
        participants: 32,
        maxParticipants: 32,
        startTime: Date.now() - 172800000,
        endTime: Date.now() - 158400000,
        format: 'Double Elimination',
        winner: 3,
      },
    ])
  }, [])

  const filteredTournaments = tournaments.filter((t) => t.status === selectedTab)

  const getTierClass = (tier: string) => `tier-${tier.toLowerCase()}`

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-8 h-8 text-magenta" />
            <h1 className="font-display text-display-md font-bold text-white">
              TOURNAMENTS
            </h1>
          </div>
          <p className="text-text-secondary font-body">
            Bracket competitions with massive prize pools
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="tab-nav">
          {(['live', 'upcoming', 'completed'] as const).map((tab) => {
            const count = tournaments.filter((t) => t.status === tab).length
            return (
              <button
                key={tab}
                onClick={() => setSelectedTab(tab)}
                className={`tab-nav-item flex items-center gap-2 ${selectedTab === tab ? 'active' : ''}`}
              >
                {tab === 'live' && <span className="w-2 h-2 rounded-full bg-success animate-pulse" />}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                <span className={`text-xs ${selectedTab === tab ? 'text-void/70' : 'text-text-tertiary'}`}>
                  ({count})
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Featured Tournament (if live) */}
      {selectedTab === 'live' && filteredTournaments.length > 0 && (
        <FeaturedTournament tournament={filteredTournaments[0]} />
      )}

      {/* Tournament Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        {filteredTournaments.map((tournament, idx) => (
          <TournamentCard
            key={tournament.id}
            tournament={tournament}
            index={idx}
          />
        ))}
        {filteredTournaments.length === 0 && (
          <div className="col-span-2 glass-panel p-12 text-center">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-text-tertiary" />
            <p className="text-text-secondary font-body">
              No {selectedTab} tournaments
            </p>
            <p className="text-text-tertiary text-sm mt-1">
              {selectedTab === 'live'
                ? 'Check upcoming tournaments or wait for the next one!'
                : selectedTab === 'upcoming'
                ? 'New tournaments are announced regularly'
                : 'Play more to see completed tournaments'}
            </p>
          </div>
        )}
      </div>

      {/* Prize Distribution Info */}
      <div className="glass-panel p-6">
        <h3 className="font-display text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-gold" />
          Prize Distribution
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <PrizeSlot place={1} percentage={50} icon={<Crown className="w-5 h-5" />} />
          <PrizeSlot place={2} percentage={25} icon={<Star className="w-5 h-5" />} />
          <PrizeSlot place={3} percentage={12.5} />
          <PrizeSlot place={4} percentage={7.5} />
          <PrizeSlot place="Platform" percentage={5} isLast />
        </div>
      </div>
    </div>
  )
}

function FeaturedTournament({ tournament }: { tournament: Tournament }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const updateTime = () => {
      const elapsed = Date.now() - tournament.startTime
      const hours = Math.floor(elapsed / 3600000)
      const minutes = Math.floor((elapsed % 3600000) / 60000)
      setTimeLeft(`${hours}h ${minutes}m elapsed`)
    }
    updateTime()
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [tournament.startTime])

  return (
    <div className="relative mb-10 glass-panel p-8 overflow-hidden glow-border-magenta animate-slide-up">
      {/* Background pattern */}
      <div className="absolute inset-0 hex-pattern opacity-30" />

      {/* Glow effects */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-magenta/20 blur-[100px] rounded-full" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan/10 blur-[100px] rounded-full" />

      <div className="relative">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <span className={`tier-badge tier-${tournament.tier.toLowerCase()}`}>
            {tournament.tier}
          </span>
          <div className="live-indicator">In Progress</div>
          <span className="text-text-tertiary font-mono text-sm">{timeLeft}</span>
        </div>

        {/* Title */}
        <h2 className="font-display text-display-sm font-bold text-white mb-6">
          {tournament.name}
        </h2>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-void/50 rounded-lg p-4">
            <div className="data-label mb-1">Prize Pool</div>
            <div className="font-display text-2xl font-bold text-gold">
              ${tournament.prizePool.toLocaleString()}
            </div>
          </div>
          <div className="bg-void/50 rounded-lg p-4">
            <div className="data-label mb-1">Participants</div>
            <div className="font-display text-2xl font-bold text-white">
              {tournament.participants}/{tournament.maxParticipants}
            </div>
          </div>
          <div className="bg-void/50 rounded-lg p-4">
            <div className="data-label mb-1">Format</div>
            <div className="font-body text-lg text-white">
              {tournament.format}
            </div>
          </div>
          <div className="bg-void/50 rounded-lg p-4">
            <div className="data-label mb-1">Entry Fee</div>
            <div className="font-display text-2xl font-bold text-cyan">
              ${tournament.entryFee}
            </div>
          </div>
        </div>

        {/* Action */}
        <div className="flex items-center gap-4">
          <Link href={`/tournaments/${tournament.id}`} className="btn-primary">
            <Zap className="w-4 h-4" />
            Watch Live
          </Link>
          <Link href={`/tournaments/${tournament.id}/bracket`} className="btn-secondary">
            <GitBranch className="w-4 h-4" />
            View Bracket
          </Link>
        </div>
      </div>
    </div>
  )
}

function TournamentCard({ tournament, index }: { tournament: Tournament; index: number }) {
  const [countdown, setCountdown] = useState('')

  useEffect(() => {
    if (tournament.status !== 'upcoming') return

    const updateCountdown = () => {
      const diff = tournament.startTime - Date.now()
      if (diff <= 0) {
        setCountdown('Starting soon...')
        return
      }
      const days = Math.floor(diff / 86400000)
      const hours = Math.floor((diff % 86400000) / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)
      if (days > 0) {
        setCountdown(`${days}d ${hours}h`)
      } else {
        setCountdown(`${hours}h ${minutes}m`)
      }
    }
    updateCountdown()
    const interval = setInterval(updateCountdown, 60000)
    return () => clearInterval(interval)
  }, [tournament.startTime, tournament.status])

  const fillPercentage = (tournament.participants / tournament.maxParticipants) * 100

  return (
    <div
      className="glass-panel p-5 card-hover animate-slide-up"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className={`tier-badge tier-${tournament.tier.toLowerCase()}`}>
          {tournament.tier}
        </span>
        {tournament.status === 'live' && <div className="live-indicator text-xs">Live</div>}
        {tournament.status === 'upcoming' && (
          <div className="flex items-center gap-1 text-warning text-sm">
            <Timer className="w-4 h-4" />
            <span className="font-mono">{countdown}</span>
          </div>
        )}
        {tournament.status === 'completed' && (
          <div className="flex items-center gap-1 text-text-tertiary text-sm">
            <Trophy className="w-4 h-4 text-gold" />
            <span className="font-mono">Winner: #{tournament.winner}</span>
          </div>
        )}
      </div>

      {/* Title */}
      <h3 className="font-display text-xl font-bold text-white mb-2">
        {tournament.name}
      </h3>
      <p className="text-text-tertiary text-sm mb-4 flex items-center gap-2">
        <GitBranch className="w-4 h-4" />
        {tournament.format}
      </p>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-text-secondary">
            <Users className="w-4 h-4 inline mr-1" />
            {tournament.participants}/{tournament.maxParticipants}
          </span>
          <span className="text-text-tertiary">
            {fillPercentage.toFixed(0)}% filled
          </span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-bar-fill progress-bar-fill-cyan"
            style={{ width: `${fillPercentage}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-arena-border">
        <div>
          <div className="text-text-tertiary text-xs mb-1">Prize Pool</div>
          <div className="font-display text-xl font-bold text-gold">
            ${tournament.prizePool.toLocaleString()}
          </div>
        </div>
        <div className="text-right">
          <div className="text-text-tertiary text-xs mb-1">Entry</div>
          <div className="font-mono text-lg text-white">
            ${tournament.entryFee}
          </div>
        </div>
      </div>

      {/* Action */}
      {tournament.status === 'upcoming' && (
        <Link
          href={`/tournaments/${tournament.id}/register`}
          className="btn-primary w-full mt-4 justify-center"
        >
          <Target className="w-4 h-4" />
          Register Now
        </Link>
      )}
      {tournament.status === 'live' && (
        <Link
          href={`/tournaments/${tournament.id}`}
          className="btn-secondary w-full mt-4 justify-center"
        >
          <Zap className="w-4 h-4" />
          Watch Live
        </Link>
      )}
      {tournament.status === 'completed' && (
        <Link
          href={`/tournaments/${tournament.id}/results`}
          className="btn-secondary w-full mt-4 justify-center"
        >
          <Trophy className="w-4 h-4" />
          View Results
        </Link>
      )}
    </div>
  )
}

function PrizeSlot({
  place,
  percentage,
  icon,
  isLast,
}: {
  place: number | string
  percentage: number
  icon?: React.ReactNode
  isLast?: boolean
}) {
  const getPlaceColor = () => {
    if (place === 1) return 'text-gold border-gold/30 bg-gold/10'
    if (place === 2) return 'text-silver border-silver/30 bg-silver/10'
    if (place === 3) return 'text-bronze border-bronze/30 bg-bronze/10'
    if (isLast) return 'text-text-tertiary border-arena-border bg-elevated'
    return 'text-text-secondary border-arena-border bg-elevated'
  }

  return (
    <div className={`rounded-lg p-4 text-center border ${getPlaceColor()}`}>
      <div className="flex items-center justify-center gap-1 mb-2">
        {icon}
        <span className="font-display font-bold">
          {typeof place === 'number' ? `${place}${['st', 'nd', 'rd', 'th'][Math.min(place - 1, 3)]}` : place}
        </span>
      </div>
      <div className="font-mono text-lg font-bold">
        {percentage}%
      </div>
    </div>
  )
}
