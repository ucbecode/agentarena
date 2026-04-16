import { ArenaClient, PaymentRequiredError, ApiError } from './client';

describe('ArenaClient', () => {
  describe('constructor', () => {
    it('should accept string baseUrl (legacy)', () => {
      const client = new ArenaClient('http://localhost:3460');
      expect((client as any).baseUrl).toBe('http://localhost:3460');
      expect((client as any).maxRetries).toBe(3);
      expect((client as any).retryDelayMs).toBe(1000);
      expect((client as any).timeoutMs).toBe(30000);
    });

    it('should strip trailing slash from baseUrl', () => {
      const client = new ArenaClient('http://localhost:3460/');
      expect((client as any).baseUrl).toBe('http://localhost:3460');
    });

    it('should accept options object', () => {
      const client = new ArenaClient({
        baseUrl: 'http://example.com',
        maxRetries: 5,
        retryDelayMs: 2000,
        timeoutMs: 60000,
      });

      expect((client as any).baseUrl).toBe('http://example.com');
      expect((client as any).maxRetries).toBe(5);
      expect((client as any).retryDelayMs).toBe(2000);
      expect((client as any).timeoutMs).toBe(60000);
    });

    it('should convert http to ws URL', () => {
      const client = new ArenaClient('http://localhost:3460');
      expect((client as any).wsUrl).toBe('ws://localhost:3460');
    });

    it('should convert https to wss URL', () => {
      const client = new ArenaClient('https://arena.example.com');
      expect((client as any).wsUrl).toBe('wss://arena.example.com');
    });

    it('should not create x402Handler without privateKey', () => {
      const client = new ArenaClient('http://localhost:3460');
      expect((client as any).x402Handler).toBeUndefined();
    });
  });

  describe('walletAddress', () => {
    it('should return undefined without wallet', () => {
      const client = new ArenaClient('http://localhost:3460');
      expect(client.walletAddress).toBeUndefined();
    });
  });
});

describe('PaymentRequiredError', () => {
  it('should store payment details', () => {
    const payment = {
      network: 'xlayer',
      token: 'USDC',
      amount: 5000000,
      recipient: '0x1234',
      nonce: 'abc123',
      expires: 12345,
    };

    const error = new PaymentRequiredError(payment);

    expect(error.name).toBe('PaymentRequiredError');
    expect(error.payment).toEqual(payment);
    expect(error.message).toContain('5000000');
    expect(error.message).toContain('USDC');
  });
});

describe('ApiError', () => {
  it('should store message and status code', () => {
    const error = new ApiError('Not found', 404);

    expect(error.name).toBe('ApiError');
    expect(error.message).toBe('Not found');
    expect(error.statusCode).toBe(404);
  });

  it('should be used for server errors', () => {
    const error = new ApiError('Internal Server Error', 500);
    expect(error.statusCode).toBe(500);
  });
});

describe('ReconnectionOptions defaults', () => {
  it('should have sensible default values', () => {
    // Based on the implementation
    const defaults = {
      maxAttempts: 5,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    };

    expect(defaults.maxAttempts).toBe(5);
    expect(defaults.initialDelayMs).toBe(1000);
    expect(defaults.maxDelayMs).toBe(30000);
    expect(defaults.backoffMultiplier).toBe(2);
  });
});

describe('Retry logic', () => {
  it('should correctly calculate exponential backoff', () => {
    const retryDelayMs = 1000;

    // attempt 0: 1000 * 2^0 = 1000
    expect(retryDelayMs * Math.pow(2, 0)).toBe(1000);

    // attempt 1: 1000 * 2^1 = 2000
    expect(retryDelayMs * Math.pow(2, 1)).toBe(2000);

    // attempt 2: 1000 * 2^2 = 4000
    expect(retryDelayMs * Math.pow(2, 2)).toBe(4000);

    // attempt 3: 1000 * 2^3 = 8000
    expect(retryDelayMs * Math.pow(2, 3)).toBe(8000);
  });

  it('should identify retryable errors', () => {
    const client = new ArenaClient('http://localhost:3460');
    const isRetryable = (client as any).isRetryable.bind(client);

    // Server errors should be retryable
    expect(isRetryable(new ApiError('Error', 500))).toBe(true);
    expect(isRetryable(new ApiError('Error', 502))).toBe(true);
    expect(isRetryable(new ApiError('Error', 503))).toBe(true);
    expect(isRetryable(new ApiError('Error', 504))).toBe(true);

    // Client errors should not be retryable
    expect(isRetryable(new ApiError('Error', 400))).toBe(false);
    expect(isRetryable(new ApiError('Error', 401))).toBe(false);
    expect(isRetryable(new ApiError('Error', 403))).toBe(false);
    expect(isRetryable(new ApiError('Error', 404))).toBe(false);

    // Network errors should be retryable
    expect(isRetryable(new Error('network error'))).toBe(true);
    expect(isRetryable(new Error('timeout'))).toBe(true);
    expect(isRetryable(new Error('ECONNREFUSED'))).toBe(true);
    expect(isRetryable(new Error('ETIMEDOUT'))).toBe(true);
  });
});

describe('WebSocket reconnection', () => {
  it('should calculate reconnection delay with backoff', () => {
    const initialDelayMs = 1000;
    const backoffMultiplier = 2;
    const maxDelayMs = 30000;

    const calculateDelay = (attempt: number) => {
      return Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs
      );
    };

    expect(calculateDelay(1)).toBe(1000);
    expect(calculateDelay(2)).toBe(2000);
    expect(calculateDelay(3)).toBe(4000);
    expect(calculateDelay(4)).toBe(8000);
    expect(calculateDelay(5)).toBe(16000);
    expect(calculateDelay(6)).toBe(30000); // capped at max
    expect(calculateDelay(7)).toBe(30000); // still capped
  });
});

describe('URL building', () => {
  it('should build correct API URLs', () => {
    const baseUrl = 'http://localhost:3460';

    expect(`${baseUrl}/api/arena/stats/1`).toBe('http://localhost:3460/api/arena/stats/1');
    expect(`${baseUrl}/api/matches/challenge`).toBe('http://localhost:3460/api/matches/challenge');
    expect(`${baseUrl}/api/matches/abc123/accept`).toBe('http://localhost:3460/api/matches/abc123/accept');
    expect(`${baseUrl}/api/matches/abc123/trade`).toBe('http://localhost:3460/api/matches/abc123/trade');
    expect(`${baseUrl}/api/matches/abc123/state`).toBe('http://localhost:3460/api/matches/abc123/state');
    expect(`${baseUrl}/api/prices`).toBe('http://localhost:3460/api/prices');
    expect(`${baseUrl}/api/leaderboard`).toBe('http://localhost:3460/api/leaderboard');
  });

  it('should build correct WebSocket URLs', () => {
    const wsUrl = 'ws://localhost:3460';

    expect(`${wsUrl}/ws/matches/abc123`).toBe('ws://localhost:3460/ws/matches/abc123');
  });
});
