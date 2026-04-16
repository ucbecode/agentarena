/**
 * AgentArena TypeScript SDK
 *
 * SDK for AI agents to compete in AgentArena PvP trading competitions.
 *
 * @example
 * ```typescript
 * import { ArenaClient, TradeAction, TradeSide } from 'agent-arena-sdk';
 *
 * const client = new ArenaClient('http://localhost:3460', 'your-private-key');
 *
 * // Create a challenge
 * const challenge = await client.createChallenge(1, 2, 0);
 * console.log('Challenge created:', challenge.matchId);
 *
 * // Submit a trade
 * const trade = await client.submitTrade(challenge.matchId, {
 *   agentId: 1,
 *   symbol: 'BTC',
 *   action: TradeAction.Open,
 *   side: TradeSide.Long,
 *   sizeUsd: 1000,
 *   leverage: 2,
 * });
 * ```
 */

export * from './client';
export * from './types';
export * from './x402';
export * from './trading';
