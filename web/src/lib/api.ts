const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3460'
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3460'

// Request timeout in ms
const REQUEST_TIMEOUT = 10000

// Custom error class for API errors
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// Helper to make fetch requests with timeout and error handling
async function fetchWithTimeout<T>(
  url: string,
  options: RequestInit = {},
  timeout: number = REQUEST_TIMEOUT
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      let errorMessage = `Request failed with status ${response.status}`
      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorMessage
      } catch {
        // Ignore JSON parse errors
      }
      throw new ApiError(errorMessage, response.status)
    }

    return response.json()
  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof ApiError) {
      throw error
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new ApiError('Request timed out', 408)
      }
      throw new ApiError(error.message, 500)
    }

    throw new ApiError('Unknown error occurred', 500)
  }
}

export interface Match {
  matchId: string
  agent1Id: number
  agent2Id: number
  tier: number
  status: string
  entryFee: number
  prizePool: number
  agent1Funded: boolean
  agent2Funded: boolean
  startedAt?: number
  endedAt?: number
  agent1Pnl?: number
  agent2Pnl?: number
  winnerId?: number
}

export interface MatchState {
  matchId: string
  status: string
  timeRemainingSecs: number
  agent1State: AgentMatchState
  agent2State: AgentMatchState
  prices: Record<string, number>
}

export interface AgentMatchState {
  agentId: number
  balance: number
  positions: Position[]
  pnl: number
  tradesCount: number
}

export interface Position {
  symbol: string
  side: string
  size: number
  entryPrice: number
  currentPrice: number
  unrealizedPnl: number
  leverage: number
}

export interface LeaderboardEntry {
  rank: number
  agentId: number
  elo: number
  wins: number
  losses: number
  winRate: number
  totalPnl: number
}

export interface Leaderboard {
  entries: LeaderboardEntry[]
  totalAgents: number
}

// API Functions

export async function getMatches(): Promise<Match[]> {
  return fetchWithTimeout<Match[]>(`${API_URL}/api/matches`)
}

export async function getMatch(matchId: string): Promise<Match> {
  return fetchWithTimeout<Match>(`${API_URL}/api/matches/${matchId}`)
}

export async function getMatchState(matchId: string): Promise<MatchState> {
  return fetchWithTimeout<MatchState>(`${API_URL}/api/matches/${matchId}/state`)
}

export async function getLeaderboard(): Promise<Leaderboard> {
  return fetchWithTimeout<Leaderboard>(`${API_URL}/api/leaderboard`)
}

export async function getPrices(): Promise<Record<string, number>> {
  const data = await fetchWithTimeout<{ prices: Record<string, number> }>(`${API_URL}/api/prices`)
  return data.prices
}

// WebSocket

export function subscribeToMatch(
  matchId: string,
  onMessage: (data: any) => void,
  onError?: (error: Event) => void,
  onClose?: () => void
): WebSocket {
  const ws = new WebSocket(`${WS_URL}/ws/matches/${matchId}`)

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      onMessage(data)
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e)
    }
  }

  ws.onerror = (event) => {
    onError?.(event)
  }

  ws.onclose = () => {
    onClose?.()
  }

  return ws
}

// Helper functions

export function formatUSDC(amount: number): string {
  return `$${(amount / 1_000_000).toFixed(2)}`
}

export function formatPnL(amount: number): string {
  const formatted = formatUSDC(Math.abs(amount))
  return amount >= 0 ? `+${formatted}` : `-${formatted}`
}

export const TIER_NAMES = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Diamond']

export const TIER_ENTRY_FEES = [5, 25, 100, 500, 2000]
