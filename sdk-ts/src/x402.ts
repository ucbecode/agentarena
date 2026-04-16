import { ethers } from 'ethers';
import type { PaymentRequest, PaymentProof } from './types';

const USDC_ABI = [
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
];

/**
 * x402 Payment handler for automatic payment processing
 *
 * SECURITY: This class handles sensitive wallet credentials.
 * Custom toJSON and inspect methods prevent private key exposure in logs.
 */
export class X402Handler {
  private wallet: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;
  private usdcAddress: string;

  constructor(
    privateKey: string,
    rpcUrl: string = 'https://rpc.xlayer.tech',
    usdcAddress: string = '0x74b7F16337b8972027F6196A17a631aC6dE26d22'
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.usdcAddress = usdcAddress;
  }

  // SECURITY: Prevent private key from being logged via JSON.stringify
  toJSON() {
    return {
      address: this.wallet.address,
      usdcAddress: this.usdcAddress,
      privateKey: '[REDACTED]',
    };
  }

  // SECURITY: Prevent private key from being logged via console.log/util.inspect (Node.js)
  [Symbol.for('nodejs.util.inspect.custom')]() {
    return {
      address: this.wallet.address,
      usdcAddress: this.usdcAddress,
      privateKey: '[REDACTED]',
    };
  }

  // SECURITY: Prevent private key from appearing in string representation
  toString() {
    return `X402Handler { address: ${this.wallet.address}, usdcAddress: ${this.usdcAddress} }`;
  }

  /**
   * Execute a payment and return proof
   */
  async executePayment(request: PaymentRequest): Promise<PaymentProof> {
    const usdc = new ethers.Contract(this.usdcAddress, USDC_ABI, this.wallet);

    // Check balance
    const balance = await usdc.balanceOf(this.wallet.address);
    if (balance < BigInt(request.amount)) {
      throw new Error(
        `Insufficient USDC balance: have ${balance}, need ${request.amount}`
      );
    }

    // Execute transfer
    const tx = await usdc.transfer(request.recipient, request.amount);
    const receipt = await tx.wait();

    return {
      nonce: request.nonce,
      txHash: receipt.hash,
    };
  }

  /**
   * Get USDC balance
   */
  async getBalance(): Promise<bigint> {
    const usdc = new ethers.Contract(this.usdcAddress, USDC_ABI, this.provider);
    return usdc.balanceOf(this.wallet.address);
  }

  /**
   * Get formatted USDC balance
   */
  async getFormattedBalance(): Promise<string> {
    const balance = await this.getBalance();
    return ethers.formatUnits(balance, 6); // USDC has 6 decimals
  }

  /**
   * Get wallet address
   */
  get address(): string {
    return this.wallet.address;
  }
}

/**
 * Create a dev mode payment proof (for testing)
 */
export function createDevPaymentProof(nonce: string): PaymentProof {
  return {
    nonce,
    txHash: `DEV_PAYMENT_${crypto.randomUUID()}`,
  };
}
