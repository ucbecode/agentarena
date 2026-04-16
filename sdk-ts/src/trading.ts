import type {
  MatchState,
  Position,
  PositionSide,
  TradeAction,
  TradeRequest,
  TradeSide,
} from './types';

/**
 * Trading strategy helper
 */
export class TradingStrategy {
  agentId: number;
  maxPositionSize: number;
  maxLeverage: number;
  riskPerTrade: number;

  constructor(agentId: number) {
    this.agentId = agentId;
    this.maxPositionSize = 5000;
    this.maxLeverage = 3;
    this.riskPerTrade = 0.1; // 10% of balance per trade
  }

  /**
   * Get current agent state from match state
   */
  private getAgentState(state: MatchState) {
    return state.agent1State.agentId === this.agentId
      ? state.agent1State
      : state.agent2State;
  }

  /**
   * Get opponent state from match state
   */
  private getOpponentState(state: MatchState) {
    return state.agent1State.agentId === this.agentId
      ? state.agent2State
      : state.agent1State;
  }

  /**
   * Calculate position size based on risk
   */
  calculateSize(balance: number, leverage: number): number {
    const riskAmount = balance * this.riskPerTrade;
    const size = riskAmount * leverage;
    return Math.min(size, this.maxPositionSize);
  }

  /**
   * Check if we have an open position in a symbol
   */
  hasPosition(state: MatchState, symbol: string): boolean {
    return this.getAgentState(state).positions.some((p) => p.symbol === symbol);
  }

  /**
   * Get current position for a symbol
   */
  getPosition(state: MatchState, symbol: string): Position | undefined {
    return this.getAgentState(state).positions.find((p) => p.symbol === symbol);
  }

  /**
   * Get current balance
   */
  getBalance(state: MatchState): number {
    return this.getAgentState(state).balance;
  }

  /**
   * Get current P&L
   */
  getPnl(state: MatchState): number {
    return this.getAgentState(state).pnl;
  }

  /**
   * Get opponent's P&L
   */
  getOpponentPnl(state: MatchState): number {
    return this.getOpponentState(state).pnl;
  }

  /**
   * Create a trade request to open a long position
   */
  openLong(symbol: string, size: number, leverage: number): TradeRequest {
    return {
      agentId: this.agentId,
      symbol,
      action: 'Open' as TradeAction,
      side: 'Long' as TradeSide,
      sizeUsd: Math.min(size, this.maxPositionSize),
      leverage: Math.min(leverage, this.maxLeverage),
    };
  }

  /**
   * Create a trade request to open a short position
   */
  openShort(symbol: string, size: number, leverage: number): TradeRequest {
    return {
      agentId: this.agentId,
      symbol,
      action: 'Open' as TradeAction,
      side: 'Short' as TradeSide,
      sizeUsd: Math.min(size, this.maxPositionSize),
      leverage: Math.min(leverage, this.maxLeverage),
    };
  }

  /**
   * Create a trade request to close a position
   */
  closePosition(symbol: string): TradeRequest {
    return {
      agentId: this.agentId,
      symbol,
      action: 'Close' as TradeAction,
      side: 'Long' as TradeSide, // Doesn't matter for close
      sizeUsd: 0,
    };
  }

  /**
   * Calculate total unrealized P&L
   */
  totalUnrealizedPnl(state: MatchState): number {
    return this.getAgentState(state).positions.reduce(
      (sum, p) => sum + p.unrealizedPnl,
      0
    );
  }

  /**
   * Check if we're winning
   */
  isWinning(state: MatchState): boolean {
    return this.getPnl(state) > this.getOpponentPnl(state);
  }

  /**
   * Get all open positions
   */
  getPositions(state: MatchState): Position[] {
    return this.getAgentState(state).positions;
  }
}

/**
 * Simple momentum signal calculator
 */
export function calculateMomentum(
  prices: Array<{ price: number; timestamp: number }>,
  lookback: number
): number {
  if (prices.length < lookback + 1) {
    return 0;
  }

  const current = prices[prices.length - 1].price;
  const past = prices[prices.length - lookback - 1].price;

  if (past === 0) {
    return 0;
  }

  return ((current - past) / past) * 100; // Return as percentage
}

/**
 * Simple moving average calculator
 */
export function calculateSMA(prices: number[], period: number): number | null {
  if (prices.length < period) {
    return null;
  }

  const slice = prices.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

/**
 * Exponential moving average calculator
 */
export function calculateEMA(prices: number[], period: number): number | null {
  if (prices.length < period) {
    return null;
  }

  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Relative Strength Index calculator
 */
export function calculateRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) {
    return null;
  }

  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  const recentChanges = changes.slice(-period);
  const gains = recentChanges.filter((c) => c > 0);
  const losses = recentChanges.filter((c) => c < 0).map((c) => Math.abs(c));

  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;

  if (avgLoss === 0) {
    return 100;
  }

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}
