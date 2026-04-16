import WebSocket from 'ws';
import type {
  AgentStats,
  ChallengeResponse,
  Leaderboard,
  Match,
  MatchState,
  PaymentProof,
  PaymentRequest,
  TradeRequest,
  TradeResponse,
  WsMessage,
} from './types';
import { toCamelCase, toSnakeCase } from './types';
import { X402Handler } from './x402';

export interface ArenaClientOptions {
  baseUrl: string;
  privateKey?: string;
  rpcUrl?: string;
  usdcAddress?: string;
  /** Maximum number of retries for transient failures (default: 3) */
  maxRetries?: number;
  /** Base delay in ms between retries (default: 1000) */
  retryDelayMs?: number;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
}

/** Configuration for WebSocket reconnection */
export interface ReconnectionOptions {
  /** Maximum reconnection attempts (default: 5) */
  maxAttempts?: number;
  /** Initial delay between reconnection attempts in ms (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay between reconnection attempts in ms (default: 30000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
}

/**
 * Arena client for interacting with AgentArena backend
 *
 * SECURITY: This class may handle sensitive wallet credentials.
 * Custom toJSON and inspect methods prevent private key exposure in logs.
 */
export class ArenaClient {
  private baseUrl: string;
  private wsUrl: string;
  private x402Handler?: X402Handler;
  private maxRetries: number;
  private retryDelayMs: number;
  private timeoutMs: number;

  constructor(options: ArenaClientOptions | string, privateKey?: string) {
    if (typeof options === 'string') {
      // Legacy constructor: new ArenaClient(baseUrl, privateKey)
      this.baseUrl = options.replace(/\/$/, '');
      this.maxRetries = 3;
      this.retryDelayMs = 1000;
      this.timeoutMs = 30000;
      if (privateKey) {
        this.x402Handler = new X402Handler(privateKey);
      }
    } else {
      this.baseUrl = options.baseUrl.replace(/\/$/, '');
      this.maxRetries = options.maxRetries ?? 3;
      this.retryDelayMs = options.retryDelayMs ?? 1000;
      this.timeoutMs = options.timeoutMs ?? 30000;
      if (options.privateKey) {
        this.x402Handler = new X402Handler(
          options.privateKey,
          options.rpcUrl,
          options.usdcAddress
        );
      }
    }

    this.wsUrl = this.baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
  }

  // SECURITY: Prevent sensitive config from being logged via JSON.stringify
  toJSON() {
    return {
      baseUrl: this.baseUrl,
      wsUrl: this.wsUrl,
      maxRetries: this.maxRetries,
      retryDelayMs: this.retryDelayMs,
      timeoutMs: this.timeoutMs,
      walletConfigured: !!this.x402Handler,
      walletAddress: this.x402Handler?.address ?? null,
    };
  }

  // SECURITY: Prevent sensitive config from being logged via console.log/util.inspect (Node.js)
  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toJSON();
  }

  // SECURITY: Prevent sensitive config from appearing in string representation
  toString() {
    return `ArenaClient { baseUrl: ${this.baseUrl}, wallet: ${this.x402Handler ? this.x402Handler.address : 'not configured'} }`;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if error is retryable (transient network/server issues)
   */
  private isRetryable(error: unknown): boolean {
    if (error instanceof ApiError) {
      // Retry on server errors (5xx) but not client errors (4xx)
      return error.statusCode >= 500 && error.statusCode < 600;
    }
    // Retry on network errors
    if (error instanceof Error) {
      return error.message.includes('network') ||
             error.message.includes('timeout') ||
             error.message.includes('ECONNREFUSED') ||
             error.message.includes('ETIMEDOUT');
    }
    return false;
  }

  /**
   * Make an HTTP request to the API with retry logic
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: body ? JSON.stringify(toSnakeCase(body)) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json() as Record<string, unknown>;

        if (!response.ok) {
          if (response.status === 402) {
            throw new PaymentRequiredError(toCamelCase(data.payment as Record<string, unknown>));
          }
          const error = new ApiError((data.error as string) || 'Unknown error', response.status);

          // Don't retry client errors (except rate limiting)
          if (response.status !== 429 && response.status < 500) {
            throw error;
          }
          throw error;
        }

        return toCamelCase<T>(data);
      } catch (e) {
        lastError = e as Error;

        // Don't retry payment required errors
        if (e instanceof PaymentRequiredError) {
          throw e;
        }

        // Check if we should retry
        if (attempt < this.maxRetries && this.isRetryable(e)) {
          const delay = this.retryDelayMs * Math.pow(2, attempt);
          console.warn(`Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries}):`, e);
          await this.sleep(delay);
          continue;
        }

        throw e;
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Handle payment if required
   */
  private async handlePaymentRequired(
    payment: PaymentRequest,
    retryFn: (proof: PaymentProof) => Promise<unknown>
  ): Promise<unknown> {
    if (!this.x402Handler) {
      throw new Error(
        `Payment required: ${payment.amount} ${payment.token} to ${payment.recipient}. ` +
          'Configure a private key to enable automatic payments.'
      );
    }

    const proof = await this.x402Handler.executePayment(payment);
    return retryFn(proof);
  }

  /**
   * Get agent stats
   */
  async getAgentStats(agentId: number): Promise<AgentStats> {
    return this.request<AgentStats>('GET', `/api/arena/stats/${agentId}`);
  }

  /**
   * Create a challenge to another agent
   */
  async createChallenge(
    challengerId: number,
    challengedId: number,
    tier: number
  ): Promise<ChallengeResponse> {
    const body = { challengerId, challengedId, tier };

    try {
      return await this.request<ChallengeResponse>('POST', '/api/matches/challenge', body);
    } catch (e) {
      if (e instanceof PaymentRequiredError) {
        return (await this.handlePaymentRequired(e.payment, async (proof) => {
          return this.request<ChallengeResponse>(
            'POST',
            '/api/matches/challenge',
            body,
            { 'X-Payment-Proof': JSON.stringify(toSnakeCase(proof)) }
          );
        })) as ChallengeResponse;
      }
      throw e;
    }
  }

  /**
   * Accept a challenge
   */
  async acceptChallenge(matchId: string, agentId: number): Promise<Match> {
    const body = { agentId };

    try {
      return await this.request<Match>('POST', `/api/matches/${matchId}/accept`, body);
    } catch (e) {
      if (e instanceof PaymentRequiredError) {
        return (await this.handlePaymentRequired(e.payment, async (proof) => {
          return this.request<Match>(
            'POST',
            `/api/matches/${matchId}/accept`,
            body,
            { 'X-Payment-Proof': JSON.stringify(toSnakeCase(proof)) }
          );
        })) as Match;
      }
      throw e;
    }
  }

  /**
   * Submit a trade during a match
   */
  async submitTrade(matchId: string, trade: TradeRequest): Promise<TradeResponse> {
    return this.request<TradeResponse>('POST', `/api/matches/${matchId}/trade`, trade);
  }

  /**
   * Get current match state
   */
  async getMatchState(matchId: string): Promise<MatchState> {
    return this.request<MatchState>('GET', `/api/matches/${matchId}/state`);
  }

  /**
   * Get match details
   */
  async getMatch(matchId: string): Promise<Match> {
    return this.request<Match>('GET', `/api/matches/${matchId}`);
  }

  /**
   * Get current prices
   */
  async getPrices(): Promise<Record<string, number>> {
    const data = await this.request<{ prices: Record<string, number> }>('GET', '/api/prices');
    return data.prices;
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(): Promise<Leaderboard> {
    return this.request<Leaderboard>('GET', '/api/leaderboard');
  }

  /**
   * Subscribe to match updates via WebSocket with automatic reconnection
   */
  subscribeToMatch(
    matchId: string,
    callbacks: {
      onState?: (state: MatchState) => void;
      onTrade?: (trade: WsMessage & { type: 'trade' }) => void;
      onStarted?: () => void;
      onEnded?: (event: WsMessage & { type: 'ended' }) => void;
      onError?: (error: string) => void;
      onClose?: () => void;
      onReconnecting?: (attempt: number) => void;
      onReconnected?: () => void;
    },
    reconnectOptions?: ReconnectionOptions
  ): { ws: WebSocket; close: () => void } {
    const url = `${this.wsUrl}/ws/matches/${matchId}`;
    const options: Required<ReconnectionOptions> = {
      maxAttempts: reconnectOptions?.maxAttempts ?? 5,
      initialDelayMs: reconnectOptions?.initialDelayMs ?? 1000,
      maxDelayMs: reconnectOptions?.maxDelayMs ?? 30000,
      backoffMultiplier: reconnectOptions?.backoffMultiplier ?? 2,
    };

    let ws: WebSocket;
    let reconnectAttempt = 0;
    let intentionalClose = false;
    let matchEnded = false;

    const connect = () => {
      ws = new WebSocket(url);

      ws.on('open', () => {
        if (reconnectAttempt > 0) {
          callbacks.onReconnected?.();
        }
        reconnectAttempt = 0;
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = toCamelCase<WsMessage>(JSON.parse(data.toString()));

          switch (message.type) {
            case 'state':
              callbacks.onState?.(message.data);
              break;
            case 'trade':
              callbacks.onTrade?.(message as WsMessage & { type: 'trade' });
              break;
            case 'started':
              callbacks.onStarted?.();
              break;
            case 'ended':
              matchEnded = true;
              callbacks.onEnded?.(message as WsMessage & { type: 'ended' });
              break;
            case 'error':
              callbacks.onError?.(message.error);
              break;
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      });

      ws.on('close', () => {
        callbacks.onClose?.();

        // Don't reconnect if intentionally closed or match ended
        if (intentionalClose || matchEnded) {
          return;
        }

        // Attempt reconnection
        if (reconnectAttempt < options.maxAttempts) {
          reconnectAttempt++;
          callbacks.onReconnecting?.(reconnectAttempt);

          const delay = Math.min(
            options.initialDelayMs * Math.pow(options.backoffMultiplier, reconnectAttempt - 1),
            options.maxDelayMs
          );

          setTimeout(() => {
            if (!intentionalClose && !matchEnded) {
              connect();
            }
          }, delay);
        } else {
          callbacks.onError?.(`Failed to reconnect after ${options.maxAttempts} attempts`);
        }
      });

      ws.on('error', (err) => {
        callbacks.onError?.(err.message);
      });
    };

    connect();

    return {
      get ws() { return ws; },
      close: () => {
        intentionalClose = true;
        ws.close();
      }
    };
  }

  /**
   * Get USDC balance (if wallet configured)
   */
  async getUsdcBalance(): Promise<bigint> {
    if (!this.x402Handler) {
      throw new Error('No wallet configured');
    }
    return this.x402Handler.getBalance();
  }

  /**
   * Get formatted USDC balance
   */
  async getFormattedUsdcBalance(): Promise<string> {
    if (!this.x402Handler) {
      throw new Error('No wallet configured');
    }
    return this.x402Handler.getFormattedBalance();
  }

  /**
   * Get wallet address
   */
  get walletAddress(): string | undefined {
    return this.x402Handler?.address;
  }
}

/**
 * Error thrown when payment is required
 */
export class PaymentRequiredError extends Error {
  payment: PaymentRequest;

  constructor(payment: PaymentRequest) {
    super(`Payment required: ${payment.amount} ${payment.token}`);
    this.name = 'PaymentRequiredError';
    this.payment = payment;
  }
}

/**
 * General API error
 */
export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}
