// Agent types

export interface AgentStats {
  agentId: number;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  totalPnlUsdc: number;
  tradingEndpoint: string;
  registered: boolean;
  registeredAt: number;
  lastMatchAt: number;
}

// Match types

export enum MatchStatus {
  Created = 'Created',
  Funded = 'Funded',
  InProgress = 'InProgress',
  Completed = 'Completed',
  Settled = 'Settled',
  Cancelled = 'Cancelled',
  Disputed = 'Disputed',
}

export interface Match {
  matchId: string;
  agent1Id: number;
  agent2Id: number;
  tier: number;
  entryFee: number;
  prizePool: number;
  agent1Funded: boolean;
  agent2Funded: boolean;
  status: MatchStatus;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  agent1Pnl?: number;
  agent2Pnl?: number;
  winnerId?: number;
}

export interface ChallengeResponse {
  matchId: string;
  entryFee: number;
  paymentRequired?: PaymentRequest;
}

export interface MatchState {
  matchId: string;
  status: MatchStatus;
  timeRemainingSecs: number;
  agent1State: AgentMatchState;
  agent2State: AgentMatchState;
  prices: Record<string, number>;
}

export interface AgentMatchState {
  agentId: number;
  balance: number;
  positions: Position[];
  pnl: number;
  tradesCount: number;
}

export interface Position {
  symbol: string;
  side: PositionSide;
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  leverage: number;
}

export enum PositionSide {
  Long = 'Long',
  Short = 'Short',
}

// Trade types

export enum TradeAction {
  Open = 'Open',
  Close = 'Close',
  Increase = 'Increase',
  Decrease = 'Decrease',
}

export enum TradeSide {
  Long = 'Long',
  Short = 'Short',
}

export interface TradeRequest {
  agentId: number;
  symbol: string;
  action: TradeAction;
  side: TradeSide;
  sizeUsd: number;
  leverage?: number;
}

export interface TradeResponse {
  success: boolean;
  tradeId: string;
  symbol: string;
  side: TradeSide;
  action: TradeAction;
  sizeUsd: number;
  price: number;
  realizedPnl?: number;
  newBalance: number;
  error?: string;
}

// Payment types

export interface PaymentRequest {
  network: string;
  token: string;
  amount: number;
  recipient: string;
  nonce: string;
  expires: number;
  description?: string;
}

export interface PaymentProof {
  nonce: string;
  txHash: string;
}

// Leaderboard types

export interface LeaderboardEntry {
  rank: number;
  agentId: number;
  elo: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
}

export interface Leaderboard {
  entries: LeaderboardEntry[];
  totalAgents: number;
}

// WebSocket message types

export type WsMessage =
  | { type: 'state'; data: MatchState }
  | { type: 'trade'; data: TradeEvent }
  | { type: 'started' }
  | { type: 'ended'; data: MatchEndEvent }
  | { type: 'error'; error: string };

export interface TradeEvent {
  agentId: number;
  symbol: string;
  side: string;
  size: number;
  price: number;
}

export interface MatchEndEvent {
  winnerId?: number;
  agent1Pnl: number;
  agent2Pnl: number;
}

// API response types

export interface ApiErrorResponse {
  error: string;
  details?: unknown;
}

// Convert snake_case API responses to camelCase
export function toCamelCase<T>(obj: any): T {
  if (Array.isArray(obj)) {
    return obj.map((v) => toCamelCase(v)) as unknown as T;
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((result: any, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      result[camelKey] = toCamelCase(obj[key]);
      return result;
    }, {}) as T;
  }
  return obj;
}

// Convert camelCase to snake_case for API requests
export function toSnakeCase<T>(obj: any): T {
  if (Array.isArray(obj)) {
    return obj.map((v) => toSnakeCase(v)) as unknown as T;
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((result: any, key) => {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      result[snakeKey] = toSnakeCase(obj[key]);
      return result;
    }, {}) as T;
  }
  return obj;
}
