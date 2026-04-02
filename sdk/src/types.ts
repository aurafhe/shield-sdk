import type { PublicKey } from '@solana/web3.js';

/**
 * User's swap parameters before encryption
 */
export interface SwapIntent {
  tokenIn: PublicKey;
  tokenOut: PublicKey;
  amount: bigint;
  slippageBps: number;
  userPublicKey: PublicKey;
  deadline?: number;
}

/**
 * Encrypted payload that leaves the user's device
 */
export interface EncryptedSwap {
  ciphertext: string; // base64
  nonce: string; // base64
  encryptionKeyId: string;
  encryptedAt: number; // unix timestamp
  userPublicKey: string; // base58 - NOT encrypted, needed for routing
  ephemeralPublicKey: string; // base64 - ephemeral Curve25519 key for NaCl box decryption
}

/**
 * Swap processing status
 */
export enum SwapStatus {
  RECEIVED = 'received',
  DECRYPTED = 'decrypted',
  QUOTED = 'quoted',
  EXECUTING = 'executing',
  SETTLED = 'settled',
  FAILED = 'failed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

/**
 * Response from relayer after accepting encrypted swap
 */
export interface SwapSubmission {
  swapId: string;
  status: SwapStatus;
  txSignature?: string;
  estimatedOutput?: string;
}

/**
 * Final result of a completed swap
 */
export interface SwapResult {
  swapId: string;
  status: SwapStatus.SETTLED | SwapStatus.FAILED;
  amountOut?: string;
  executedPrice?: number;
  txSignature: string;
  route?: string[];
  totalTimeMs: number;
  error?: string;
}

/**
 * SDK configuration
 */
export interface AuraShieldConfig {
  network: 'mainnet-beta' | 'devnet' | 'testnet';
  rpcUrl: string;
  relayerUrl?: string;
  jupiterApiUrl?: string;
  timeoutMs?: number;
  debug?: boolean;
  mode?: 'relay' | 'coprocessor'; // default 'relay'
}

/**
 * Subset of Jupiter API quote response
 */
export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
}

/**
 * Parameters for shieldedSwap
 */
export interface ShieldedSwapParams {
  tokenIn: PublicKey | string;
  tokenOut: PublicKey | string;
  amount: bigint;
  slippageBps?: number;
}

/**
 * Deserialized swap intent (raw bytes for pubkeys)
 */
export interface DeserializedSwapIntent {
  tokenIn: Uint8Array;
  tokenOut: Uint8Array;
  amount: bigint;
  slippageBps: number;
  userPublicKey: Uint8Array;
  deadline: bigint;
}

/**
 * Field-level encrypted request body for the Go coprocessor gateway.
 * Field values are XOR-0xAA hex-encoded ciphertexts (stub).
 */
export interface GatewayRequest {
  id: string;
  account: string;
  token_out: string;
  amount_out: string;
  token_in: string;
}

/**
 * Standard response envelope from the Go gateway.
 */
export interface GatewayResponse<T = unknown> {
  isSuccess: boolean;
  result: T;
  log?: string;
}

/**
 * Result returned from /api/v1/swap/prepare — the unsigned swap transaction.
 */
export interface PrepareResult {
  swapTransaction: string;
  outAmount: string;
  lastValidBlockHeight: number;
}

/**
 * Result returned from /api/v1/swap/execute — the on-chain transaction signature.
 */
export interface ExecuteResult {
  signature: string;
}

/**
 * Parameters for a coprocessor-mode swap.
 * The signTransaction callback receives a base64-encoded unsigned transaction.
 */
export interface CoprocessorSwapParams {
  tokenIn: PublicKey | string;
  tokenOut: PublicKey | string;
  amount: bigint;
  slippageBps?: number;
  signTransaction: (txBase64: string) => Promise<string>;
}
