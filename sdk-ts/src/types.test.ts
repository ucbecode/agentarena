import {
  MatchStatus,
  PositionSide,
  TradeAction,
  TradeSide,
  toCamelCase,
  toSnakeCase,
  type AgentStats,
  type Match,
  type TradeRequest,
  type PaymentRequest,
  type LeaderboardEntry,
  type WsMessage,
} from './types';

describe('MatchStatus enum', () => {
  it('should have all expected values', () => {
    expect(MatchStatus.Created).toBe('Created');
    expect(MatchStatus.Funded).toBe('Funded');
    expect(MatchStatus.InProgress).toBe('InProgress');
    expect(MatchStatus.Completed).toBe('Completed');
    expect(MatchStatus.Settled).toBe('Settled');
    expect(MatchStatus.Cancelled).toBe('Cancelled');
    expect(MatchStatus.Disputed).toBe('Disputed');
  });
});

describe('PositionSide enum', () => {
  it('should have Long and Short values', () => {
    expect(PositionSide.Long).toBe('Long');
    expect(PositionSide.Short).toBe('Short');
  });
});

describe('TradeAction enum', () => {
  it('should have all expected values', () => {
    expect(TradeAction.Open).toBe('Open');
    expect(TradeAction.Close).toBe('Close');
    expect(TradeAction.Increase).toBe('Increase');
    expect(TradeAction.Decrease).toBe('Decrease');
  });
});

describe('TradeSide enum', () => {
  it('should have Long and Short values', () => {
    expect(TradeSide.Long).toBe('Long');
    expect(TradeSide.Short).toBe('Short');
  });
});

describe('toCamelCase', () => {
  it('should convert snake_case keys to camelCase', () => {
    const input = {
      agent_id: 1,
      trading_endpoint: 'https://example.com',
      total_pnl_usdc: 5000,
    };

    const result = toCamelCase<{ agentId: number; tradingEndpoint: string; totalPnlUsdc: number }>(input);

    expect(result.agentId).toBe(1);
    expect(result.tradingEndpoint).toBe('https://example.com');
    expect(result.totalPnlUsdc).toBe(5000);
  });

  it('should handle nested objects', () => {
    const input = {
      match_id: 'test-1',
      agent_state: {
        agent_id: 1,
        current_balance: 10000,
      },
    };

    const result = toCamelCase<any>(input);

    expect(result.matchId).toBe('test-1');
    expect(result.agentState.agentId).toBe(1);
    expect(result.agentState.currentBalance).toBe(10000);
  });

  it('should handle arrays', () => {
    const input = [
      { agent_id: 1 },
      { agent_id: 2 },
    ];

    const result = toCamelCase<{ agentId: number }[]>(input);

    expect(result[0].agentId).toBe(1);
    expect(result[1].agentId).toBe(2);
  });

  it('should handle primitives', () => {
    expect(toCamelCase('hello')).toBe('hello');
    expect(toCamelCase(42)).toBe(42);
    expect(toCamelCase(true)).toBe(true);
    expect(toCamelCase(null)).toBe(null);
  });
});

describe('toSnakeCase', () => {
  it('should convert camelCase keys to snake_case', () => {
    const input = {
      agentId: 1,
      tradingEndpoint: 'https://example.com',
      totalPnlUsdc: 5000,
    };

    const result = toSnakeCase<any>(input);

    expect(result.agent_id).toBe(1);
    expect(result.trading_endpoint).toBe('https://example.com');
    expect(result.total_pnl_usdc).toBe(5000);
  });

  it('should handle nested objects', () => {
    const input = {
      matchId: 'test-1',
      agentState: {
        agentId: 1,
        currentBalance: 10000,
      },
    };

    const result = toSnakeCase<any>(input);

    expect(result.match_id).toBe('test-1');
    expect(result.agent_state.agent_id).toBe(1);
    expect(result.agent_state.current_balance).toBe(10000);
  });

  it('should handle arrays', () => {
    const input = [
      { agentId: 1 },
      { agentId: 2 },
    ];

    const result = toSnakeCase<any>(input);

    expect(result[0].agent_id).toBe(1);
    expect(result[1].agent_id).toBe(2);
  });

  it('should handle primitives', () => {
    expect(toSnakeCase('hello')).toBe('hello');
    expect(toSnakeCase(42)).toBe(42);
    expect(toSnakeCase(true)).toBe(true);
    expect(toSnakeCase(null)).toBe(null);
  });
});

describe('Type interfaces', () => {
  it('should validate AgentStats structure', () => {
    const stats: AgentStats = {
      agentId: 1,
      elo: 1200,
      wins: 10,
      losses: 5,
      draws: 2,
      totalPnlUsdc: 50000,
      tradingEndpoint: 'https://agent.example.com',
      registered: true,
      registeredAt: 12345,
      lastMatchAt: 12400,
    };

    expect(stats.agentId).toBe(1);
    expect(stats.elo).toBe(1200);
    expect(stats.registered).toBe(true);
  });

  it('should validate Match structure', () => {
    const match: Match = {
      matchId: 'test-match-1',
      agent1Id: 1,
      agent2Id: 2,
      tier: 0,
      entryFee: 5000000,
      prizePool: 10000000,
      agent1Funded: true,
      agent2Funded: true,
      status: MatchStatus.Funded,
      createdAt: 12345,
    };

    expect(match.matchId).toBe('test-match-1');
    expect(match.status).toBe(MatchStatus.Funded);
    expect(match.winnerId).toBeUndefined();
  });

  it('should validate TradeRequest structure', () => {
    const request: TradeRequest = {
      agentId: 1,
      symbol: 'BTC',
      action: TradeAction.Open,
      side: TradeSide.Long,
      sizeUsd: 1000,
      leverage: 2,
    };

    expect(request.symbol).toBe('BTC');
    expect(request.action).toBe(TradeAction.Open);
    expect(request.leverage).toBe(2);
  });

  it('should validate PaymentRequest structure', () => {
    const payment: PaymentRequest = {
      network: 'xlayer',
      token: 'USDC',
      amount: 5000000,
      recipient: '0x1234',
      nonce: 'abc123',
      expires: 12345,
      description: 'Entry fee',
    };

    expect(payment.network).toBe('xlayer');
    expect(payment.amount).toBe(5000000);
  });

  it('should validate LeaderboardEntry structure', () => {
    const entry: LeaderboardEntry = {
      rank: 1,
      agentId: 42,
      elo: 1500,
      wins: 20,
      losses: 5,
      winRate: 0.8,
      totalPnl: 100000,
    };

    expect(entry.rank).toBe(1);
    expect(entry.winRate).toBe(0.8);
  });
});

describe('WsMessage types', () => {
  it('should handle state message', () => {
    const msg: WsMessage = {
      type: 'state',
      data: {
        matchId: 'test',
        status: MatchStatus.InProgress,
        timeRemainingSecs: 600,
        agent1State: {
          agentId: 1,
          balance: 10000,
          positions: [],
          pnl: 0,
          tradesCount: 0,
        },
        agent2State: {
          agentId: 2,
          balance: 10000,
          positions: [],
          pnl: 0,
          tradesCount: 0,
        },
        prices: { BTC: 50000 },
      },
    };

    expect(msg.type).toBe('state');
    if (msg.type === 'state') {
      expect(msg.data.timeRemainingSecs).toBe(600);
    }
  });

  it('should handle trade message', () => {
    const msg: WsMessage = {
      type: 'trade',
      data: {
        agentId: 1,
        symbol: 'BTC',
        side: 'Long',
        size: 1000,
        price: 50000,
      },
    };

    expect(msg.type).toBe('trade');
  });

  it('should handle started message', () => {
    const msg: WsMessage = { type: 'started' };
    expect(msg.type).toBe('started');
  });

  it('should handle ended message', () => {
    const msg: WsMessage = {
      type: 'ended',
      data: {
        winnerId: 1,
        agent1Pnl: 5000,
        agent2Pnl: -5000,
      },
    };

    expect(msg.type).toBe('ended');
    if (msg.type === 'ended') {
      expect(msg.data.winnerId).toBe(1);
    }
  });

  it('should handle error message', () => {
    const msg: WsMessage = {
      type: 'error',
      error: 'Something went wrong',
    };

    expect(msg.type).toBe('error');
    if (msg.type === 'error') {
      expect(msg.error).toBe('Something went wrong');
    }
  });
});
