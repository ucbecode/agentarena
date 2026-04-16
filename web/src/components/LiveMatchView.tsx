'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Zap,
  WifiOff,
  Loader2,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Shield,
  AlertTriangle,
} from 'lucide-react'

interface Position {
  symbol: string
  side: string
  size: number
  entryPrice: number
  currentPrice: number
  unrealizedPnl: number
  leverage: number
}

interface AgentState {
  agentId: number
  balance: number
  positions: Position[]
  pnl: number
  tradesCount: number
}

interface MatchState {
  matchId: string
  status: string
  timeRemainingSecs: number
  agent1State: AgentState
  agent2State: AgentState
  prices: Record<string, number>
}

// Map API response (snake_case) to frontend interface (camelCase)
function mapApiMatchState(data: any): MatchState | null {
  if (!data) return null

  const mapPosition = (p: any): Position => ({
    symbol: p.symbol,
    side: p.side,
    size: p.size,
    entryPrice: p.entry_price ?? p.entryPrice ?? 0,
    currentPrice: p.current_price ?? p.currentPrice ?? 0,
    unrealizedPnl: p.unrealized_pnl ?? p.unrealizedPnl ?? 0,
    leverage: p.leverage ?? 1,
  })

  const mapAgentState = (agent: any): AgentState | null => {
    if (!agent) return null
    return {
      agentId: agent.agent_id ?? agent.agentId ?? 0,
      balance: agent.balance ?? 0,
      positions: (agent.positions || []).map(mapPosition),
      pnl: agent.pnl ?? 0,
      tradesCount: agent.trades_count ?? agent.tradesCount ?? 0,
    }
  }

  const agent1State = mapAgentState(data.agent1_state ?? data.agent1State)
  const agent2State = mapAgentState(data.agent2_state ?? data.agent2State)

  if (!agent1State || !agent2State) return null

  return {
    matchId: data.match_id ?? data.matchId ?? '',
    status: data.status ?? '',
    timeRemainingSecs: data.time_remaining_secs ?? data.timeRemainingSecs ?? 0,
    agent1State,
    agent2State,
    prices: data.prices ?? {},
  }
}

interface TradeEvent {
  agentId: number
  tradeId: string
  symbol: string
  action: string
  side: string
  size: number
  price: number
  leverage: number
  realizedPnl: number | null
  newBalance: number
  newPnl: number
  timestamp: number
}

// Calculate total P&L = realized + unrealized from open positions
function getTotalPnl(agent: AgentState): number {
  const unrealizedPnl = agent.positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0)
  return agent.pnl + unrealizedPnl
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3460'
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3460'

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'

export function LiveMatchView({ matchId }: { matchId: string }) {
  const [matchState, setMatchState] = useState<MatchState | null>(null)
  const [pnlHistory, setPnlHistory] = useState<Array<{ time: number; agent1: number; agent2: number }>>([])
  const [tradeActivity, setTradeActivity] = useState<TradeEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptRef = useRef(0)
  const maxReconnectAttempts = 5

  const fetchInitialState = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/matches/${matchId}/state`)
      if (!response.ok) throw new Error('Failed to fetch match state')
      const data = await response.json()
      const mapped = mapApiMatchState(data)
      if (mapped) {
        setMatchState(mapped)
        setError(null)
      } else {
        setError('Invalid match state data')
      }
    } catch (err) {
      console.error('Failed to fetch initial state:', err)
      setError('Failed to load match data')
    }
  }, [matchId])

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setConnectionState('connecting')
    const ws = new WebSocket(`${WS_URL}/ws/matches/${matchId}`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnectionState('connected')
      setError(null)
      reconnectAttemptRef.current = 0
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'state') {
          const mapped = mapApiMatchState(data.data)
          if (mapped) {
            setMatchState(mapped)
            // Update PnL history
            setPnlHistory((prev) => {
              const newPoint = {
                time: prev.length,
                agent1: getTotalPnl(mapped.agent1State),
                agent2: getTotalPnl(mapped.agent2State),
              }
              return [...prev, newPoint].slice(-120) // 2 minutes of data
            })
          }
        } else if (data.type === 'trade') {
          const trade: TradeEvent = {
            agentId: data.data.agent_id,
            tradeId: data.data.trade_id,
            symbol: data.data.symbol,
            action: data.data.action,
            side: data.data.side,
            size: data.data.size,
            price: data.data.price,
            leverage: data.data.leverage || 1,
            realizedPnl: data.data.realized_pnl,
            newBalance: data.data.new_balance,
            newPnl: data.data.new_pnl,
            timestamp: data.data.timestamp || Date.now() / 1000,
          }
          setTradeActivity((prev) => [trade, ...prev].slice(0, 50))
        } else if (data.type === 'ended') {
          setConnectionState('disconnected')
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err)
      }
    }

    ws.onerror = () => {
      setError('WebSocket connection error')
    }

    ws.onclose = () => {
      wsRef.current = null

      if (matchState?.status === 'Completed' || matchState?.status === 'Settled') {
        setConnectionState('disconnected')
        return
      }

      if (reconnectAttemptRef.current < maxReconnectAttempts) {
        setConnectionState('reconnecting')
        reconnectAttemptRef.current += 1
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000)
        setTimeout(() => connectWebSocket(), delay)
      } else {
        setConnectionState('error')
        setError('Connection lost. Please refresh the page.')
      }
    }
  }, [matchId, matchState?.status])

  useEffect(() => {
    fetchInitialState()
    connectWebSocket()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [matchId, fetchInitialState, connectWebSocket])

  if (!matchState || !matchState.agent1State || !matchState.agent2State) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-cyan/30 animate-spin" style={{ borderTopColor: '#00F5FF' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <Zap className="w-6 h-6 text-cyan" />
          </div>
        </div>
        <p className="text-text-secondary font-body">Loading match data...</p>
        {error && <p className="text-danger text-sm">{error}</p>}
      </div>
    )
  }

  const minutes = Math.floor(matchState.timeRemainingSecs / 60)
  const seconds = matchState.timeRemainingSecs % 60
  const timeProgress = ((900 - matchState.timeRemainingSecs) / 900) * 100

  const agent1Pnl = getTotalPnl(matchState.agent1State)
  const agent2Pnl = getTotalPnl(matchState.agent2State)
  const agent1Leading = agent1Pnl > agent2Pnl
  const pnlDiff = Math.abs(agent1Pnl - agent2Pnl)

  return (
    <div className="space-y-6">
      {/* Match Header */}
      <div className="glass-panel p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Timer */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <svg className="w-20 h-20 -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  className="text-elevated"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  stroke="url(#timerGradient)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${226 * (1 - timeProgress / 100)} 226`}
                />
                <defs>
                  <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#00F5FF" />
                    <stop offset="100%" stopColor="#FF006E" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-2xl font-bold text-white">
                  {minutes}:{seconds.toString().padStart(2, '0')}
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <ConnectionStatus state={connectionState} />
              </div>
              <p className="text-text-tertiary text-sm font-body">Time Remaining</p>
            </div>
          </div>

          {/* Score */}
          <div className="flex items-center gap-8">
            <AgentScore
              agent={matchState.agent1State}
              side="cyan"
              isLeading={agent1Leading}
            />

            <div className="text-center">
              <div className="vs-divider w-16 h-16">
                <span className="text-sm">VS</span>
              </div>
              <div className="mt-2 font-mono text-xs text-text-tertiary">
                ${(pnlDiff / 100).toFixed(2)} diff
              </div>
            </div>

            <AgentScore
              agent={matchState.agent2State}
              side="magenta"
              isLeading={!agent1Leading && agent2Pnl !== agent1Pnl}
            />
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* P&L Chart */}
        <div className="lg:col-span-7 glass-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-bold text-white">P&L Performance</h3>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2 font-mono uppercase">
                <div className="w-4 h-4 bg-ink border-2 border-ink" />
                <span>#{matchState.agent1State.agentId}</span>
              </div>
              <div className="flex items-center gap-2 font-mono uppercase">
                <div className="w-4 h-4 bg-accent border-2 border-ink" />
                <span>#{matchState.agent2State.agentId}</span>
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={pnlHistory}>
              <CartesianGrid strokeDasharray="0" stroke="#0a0a0a" strokeOpacity={0.15} vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#0a0a0a"
                tick={{ fill: '#0a0a0a', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                tickLine={false}
                axisLine={{ stroke: '#0a0a0a', strokeWidth: 2 }}
              />
              <YAxis
                stroke="#0a0a0a"
                tick={{ fill: '#0a0a0a', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                tickLine={false}
                axisLine={{ stroke: '#0a0a0a', strokeWidth: 2 }}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  background: '#f5f5f0',
                  border: '3px solid #0a0a0a',
                  borderRadius: '0',
                  fontFamily: 'JetBrains Mono',
                  fontSize: '12px',
                  boxShadow: '4px 4px 0 0 #0a0a0a',
                }}
                labelStyle={{ color: '#0a0a0a', fontWeight: 700 }}
              />
              <ReferenceLine y={0} stroke="#0a0a0a" strokeDasharray="4 4" />
              <Line
                type="stepAfter"
                dataKey="agent1"
                stroke="#0a0a0a"
                strokeWidth={3}
                dot={false}
                name={`Agent #${matchState.agent1State.agentId}`}
              />
              <Line
                type="stepAfter"
                dataKey="agent2"
                stroke="#ff3b00"
                strokeWidth={3}
                dot={false}
                name={`Agent #${matchState.agent2State.agentId}`}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Trade Activity */}
        <div className="lg:col-span-5 glass-panel p-5 flex flex-col max-h-[420px]">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-cyan" />
            <h3 className="font-display text-lg font-bold text-white">Trade Activity</h3>
            <span className="ml-auto text-text-tertiary text-sm font-mono">
              {tradeActivity.length} trades
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {tradeActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <Target className="w-10 h-10 text-text-tertiary mb-3" />
                <p className="text-text-secondary font-body">Waiting for trades...</p>
                <p className="text-text-tertiary text-sm mt-1">Agents are analyzing the market</p>
              </div>
            ) : (
              tradeActivity.map((trade, idx) => (
                <TradeActivityItem
                  key={trade.tradeId || idx}
                  trade={trade}
                  agent1Id={matchState.agent1State.agentId}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Agent Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AgentPanel
          agent={matchState.agent1State}
          side="cyan"
          prices={matchState.prices}
          isLeading={agent1Leading}
        />
        <AgentPanel
          agent={matchState.agent2State}
          side="magenta"
          prices={matchState.prices}
          isLeading={!agent1Leading && agent2Pnl !== agent1Pnl}
        />
      </div>

      {/* Live Prices */}
      <div className="glass-panel p-5">
        <h3 className="font-display text-lg font-bold text-white mb-4">Live Prices</h3>
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(matchState.prices).map(([symbol, price]) => (
            <PriceCard key={symbol} symbol={symbol} price={price} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ConnectionStatus({ state }: { state: ConnectionState }) {
  switch (state) {
    case 'connected':
      return <div className="live-indicator">Connected</div>
    case 'reconnecting':
      return (
        <div className="flex items-center gap-2 text-warning text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="font-mono">Reconnecting...</span>
        </div>
      )
    case 'error':
    case 'disconnected':
      return (
        <div className="flex items-center gap-2 text-danger text-sm">
          <WifiOff className="w-4 h-4" />
          <span className="font-mono">Disconnected</span>
        </div>
      )
    default:
      return (
        <div className="flex items-center gap-2 text-text-secondary text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="font-mono">Connecting...</span>
        </div>
      )
  }
}

function AgentScore({
  agent,
  side,
  isLeading,
}: {
  agent: AgentState
  side: 'cyan' | 'magenta'
  isLeading: boolean
}) {
  const totalPnl = getTotalPnl(agent)
  const isPositive = totalPnl >= 0

  return (
    <div className={`text-center ${side === 'magenta' ? 'order-last' : ''}`}>
      <div
        className={`
          relative w-20 h-20 rounded-2xl flex items-center justify-center
          font-display text-3xl font-bold
          ${side === 'cyan'
            ? 'bg-cyan/10 text-cyan border border-cyan/30'
            : 'bg-magenta/10 text-magenta border border-magenta/30'
          }
          ${isLeading
            ? side === 'cyan'
              ? 'shadow-glow-cyan'
              : 'shadow-glow-magenta'
            : ''
          }
        `}
      >
        #{agent.agentId}
        {isLeading && (
          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gold flex items-center justify-center shadow-glow-gold">
            <Zap className="w-4 h-4 text-void" />
          </div>
        )}
      </div>
      <div
        className={`
          mt-3 font-mono text-2xl font-bold
          ${isPositive ? 'text-success' : 'text-danger'}
        `}
      >
        {isPositive ? '+' : ''}${totalPnl.toFixed(2)}
      </div>
      <div className="text-text-tertiary text-sm font-body mt-1">
        {agent.tradesCount} trades
      </div>
    </div>
  )
}

function AgentPanel({
  agent,
  side,
  prices,
  isLeading,
}: {
  agent: AgentState
  side: 'cyan' | 'magenta'
  prices: Record<string, number>
  isLeading: boolean
}) {
  const totalPnl = getTotalPnl(agent)
  const isPositive = totalPnl >= 0

  return (
    <div className={`glass-panel p-5 ${side === 'cyan' ? 'glow-border-cyan' : 'glow-border-magenta'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div
            className={`
              w-12 h-12 rounded-xl flex items-center justify-center
              font-display text-xl font-bold
              ${side === 'cyan'
                ? 'bg-cyan/20 text-cyan'
                : 'bg-magenta/20 text-magenta'
              }
            `}
          >
            #{agent.agentId}
          </div>
          <div>
            <div className="font-display font-bold text-white">Agent #{agent.agentId}</div>
            <div className="text-text-tertiary text-sm font-body">
              {isLeading ? 'Leading' : 'Trailing'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-text-secondary text-sm">
          <Zap className="w-4 h-4" />
          {agent.tradesCount} trades
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-elevated rounded-lg p-3">
          <div className="data-label mb-1">Total P&L</div>
          <div
            className={`font-mono text-xl font-bold flex items-center gap-1 ${
              isPositive ? 'text-success' : 'text-danger'
            }`}
          >
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {isPositive ? '+' : ''}${totalPnl.toFixed(2)}
          </div>
        </div>
        <div className="bg-elevated rounded-lg p-3">
          <div className="data-label mb-1">Balance</div>
          <div className="font-mono text-xl font-bold text-white">
            ${agent.balance.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Positions */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-text-tertiary" />
          <span className="data-label">Open Positions</span>
          <span className="ml-auto text-text-tertiary text-sm">{agent.positions.length}</span>
        </div>

        {agent.positions.length === 0 ? (
          <div className="text-center py-4 text-text-tertiary text-sm">
            No open positions
          </div>
        ) : (
          <div className="space-y-2">
            {agent.positions.map((pos, i) => (
              <PositionRow key={i} position={pos} side={side} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PositionRow({ position, side }: { position: Position; side: 'cyan' | 'magenta' }) {
  const isLong = position.side === 'Long'
  const isPositive = position.unrealizedPnl >= 0

  return (
    <div className="flex items-center justify-between py-2 px-3 bg-elevated rounded-lg">
      <div className="flex items-center gap-3">
        <div
          className={`
            w-8 h-8 rounded flex items-center justify-center text-xs font-bold
            ${isLong ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}
          `}
        >
          {isLong ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
        </div>
        <div>
          <div className="font-mono text-sm text-white">{position.symbol}</div>
          <div className="text-text-tertiary text-xs">
            {position.leverage}x {position.side}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className={`font-mono text-sm ${isPositive ? 'text-success' : 'text-danger'}`}>
          {isPositive ? '+' : ''}${position.unrealizedPnl.toFixed(2)}
        </div>
        <div className="text-text-tertiary text-xs font-mono">
          ${position.size.toFixed(0)}
        </div>
      </div>
    </div>
  )
}

function TradeActivityItem({ trade, agent1Id }: { trade: TradeEvent; agent1Id: number }) {
  const isAgent1 = trade.agentId === agent1Id
  const isLong = trade.side === 'Long'
  const isOpen = trade.action === 'Open'
  const isProfitable = trade.realizedPnl !== null && trade.realizedPnl > 0

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div
      className={`
        relative p-3 rounded-lg border animate-slide-in-right
        ${isAgent1
          ? 'bg-cyan/5 border-cyan/20'
          : 'bg-magenta/5 border-magenta/20'
        }
      `}
    >
      {/* Action indicator */}
      <div
        className={`
          absolute left-0 top-0 bottom-0 w-1 rounded-l-lg
          ${isAgent1 ? 'bg-cyan' : 'bg-magenta'}
        `}
      />

      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`font-display text-sm font-bold ${isAgent1 ? 'text-cyan' : 'text-magenta'}`}>
            #{trade.agentId}
          </span>
          <span className="text-text-tertiary text-xs font-mono">{formatTime(trade.timestamp)}</span>
        </div>
        <div
          className={`
            flex items-center gap-1 text-xs font-medium
            ${isLong ? 'text-success' : 'text-danger'}
          `}
        >
          {isLong ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {trade.side}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span
            className={`
              px-1.5 py-0.5 rounded text-xs font-medium mr-2
              ${isOpen ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}
            `}
          >
            {trade.action}
          </span>
          <span className="text-text-secondary font-mono">
            {trade.symbol} ${trade.size.toFixed(0)} @ {trade.leverage}x
          </span>
        </div>
        <div className="text-right">
          <div className="text-text-tertiary text-xs font-mono">
            ${trade.price.toLocaleString()}
          </div>
          {trade.realizedPnl !== null && (
            <div className={`text-xs font-mono font-medium ${isProfitable ? 'text-success' : 'text-danger'}`}>
              {isProfitable ? '+' : ''}${trade.realizedPnl.toFixed(2)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PriceCard({ symbol, price }: { symbol: string; price: number }) {
  return (
    <div className="bg-elevated rounded-lg p-4 text-center">
      <div className="text-text-tertiary text-sm font-body mb-1">{symbol}/USD</div>
      <div className="font-mono text-xl font-bold text-white">
        ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  )
}
