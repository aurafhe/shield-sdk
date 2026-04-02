import { PublicKey } from '@solana/web3.js';
import { AuraShieldError, ErrorCode } from './errors';
import type { SwapIntent, ShieldedSwapParams, AuraShieldConfig } from './types';

/**
 * Maximum slippage in basis points (50% = 5000 bps)
 */
const MAX_SLIPPAGE_BPS = 5000;

/**
 * Minimum slippage in basis points (0.01% = 1 bps)
 */
const MIN_SLIPPAGE_BPS = 1;

/**
 * Maximum swap amount (prevent overflow issues)
 */
const MAX_AMOUNT = BigInt('18446744073709551615'); // u64 max

/**
 * Minimum swap amount
 */
const MIN_AMOUNT = BigInt(1);

/**
 * Maximum deadline in the future (7 days)
 */
const MAX_DEADLINE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Well-known Solana token mint addresses
 */
export const KNOWN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
} as const;

/**
 * Validates a Solana public key
 */
export function validatePublicKey(
  value: PublicKey | string | undefined,
  fieldName: string
): PublicKey {
  if (!value) {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      `${fieldName} is required`
    );
  }

  try {
    const pubkey = typeof value === 'string' ? new PublicKey(value) : value;

    // Check if it's a valid base58 key (32 bytes)
    if (pubkey.toBytes().length !== 32) {
      throw new Error('Invalid key length');
    }

    return pubkey;
  } catch (err) {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      `Invalid ${fieldName}: must be a valid Solana public key`
    );
  }
}

/**
 * Validates swap amount
 */
export function validateAmount(amount: bigint | number | string | undefined): bigint {
  if (amount === undefined || amount === null) {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      'Amount is required'
    );
  }

  let parsed: bigint;
  try {
    parsed = BigInt(amount);
  } catch {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      'Amount must be a valid integer'
    );
  }

  if (parsed < MIN_AMOUNT) {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      `Amount must be at least ${MIN_AMOUNT}`
    );
  }

  if (parsed > MAX_AMOUNT) {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      'Amount exceeds maximum allowed value'
    );
  }

  return parsed;
}

/**
 * Validates slippage in basis points
 */
export function validateSlippage(slippageBps: number | undefined): number {
  // Default to 50 bps (0.5%) if not provided
  if (slippageBps === undefined || slippageBps === null) {
    return 50;
  }

  if (typeof slippageBps !== 'number' || isNaN(slippageBps)) {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      'Slippage must be a valid number'
    );
  }

  if (!Number.isInteger(slippageBps)) {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      'Slippage must be an integer (basis points)'
    );
  }

  if (slippageBps < MIN_SLIPPAGE_BPS) {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      `Slippage must be at least ${MIN_SLIPPAGE_BPS} bps (0.01%)`
    );
  }

  if (slippageBps > MAX_SLIPPAGE_BPS) {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      `Slippage cannot exceed ${MAX_SLIPPAGE_BPS} bps (50%)`
    );
  }

  return slippageBps;
}

/**
 * Validates deadline timestamp
 */
export function validateDeadline(deadline: number | undefined): number {
  // Default to 2 minutes from now if not provided
  if (deadline === undefined || deadline === null || deadline === 0) {
    return Math.floor(Date.now() / 1000) + 120;
  }

  const now = Math.floor(Date.now() / 1000);

  if (deadline < now) {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      'Deadline must be in the future'
    );
  }

  if (deadline > now + MAX_DEADLINE_SECONDS) {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      'Deadline cannot be more than 7 days in the future'
    );
  }

  return deadline;
}

/**
 * Validates that token in and out are different
 */
export function validateTokenPair(tokenIn: PublicKey, tokenOut: PublicKey): void {
  if (tokenIn.equals(tokenOut)) {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      'Token in and token out must be different'
    );
  }
}

/**
 * Validates URL format
 */
export function validateUrl(url: string | undefined, fieldName: string): string {
  if (!url) {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      `${fieldName} is required`
    );
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Invalid protocol');
    }
    return url;
  } catch {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      `Invalid ${fieldName}: must be a valid HTTP(S) URL`
    );
  }
}

/**
 * Validates complete swap intent
 */
export function validateSwapIntent(intent: Partial<SwapIntent>): SwapIntent {
  const tokenIn = validatePublicKey(intent.tokenIn, 'tokenIn');
  const tokenOut = validatePublicKey(intent.tokenOut, 'tokenOut');
  validateTokenPair(tokenIn, tokenOut);

  const amount = validateAmount(intent.amount);
  const slippageBps = validateSlippage(intent.slippageBps);
  const userPublicKey = validatePublicKey(intent.userPublicKey, 'userPublicKey');
  const deadline = validateDeadline(intent.deadline);

  return {
    tokenIn,
    tokenOut,
    amount,
    slippageBps,
    userPublicKey,
    deadline,
  };
}

/**
 * Validates shielded swap parameters
 */
export function validateShieldedSwapParams(params: Partial<ShieldedSwapParams>): {
  tokenIn: PublicKey;
  tokenOut: PublicKey;
  amount: bigint;
  slippageBps: number;
} {
  const tokenIn = validatePublicKey(params.tokenIn, 'tokenIn');
  const tokenOut = validatePublicKey(params.tokenOut, 'tokenOut');
  validateTokenPair(tokenIn, tokenOut);

  const amount = validateAmount(params.amount);
  const slippageBps = validateSlippage(params.slippageBps);

  return { tokenIn, tokenOut, amount, slippageBps };
}

/**
 * Validates SDK configuration
 */
export function validateConfig(config: Partial<AuraShieldConfig>): AuraShieldConfig {
  if (!config.network) {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      'Network is required (mainnet-beta, devnet, or testnet)'
    );
  }

  if (!['mainnet-beta', 'devnet', 'testnet'].includes(config.network)) {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      'Invalid network: must be mainnet-beta, devnet, or testnet'
    );
  }

  const rpcUrl = validateUrl(config.rpcUrl, 'rpcUrl');

  return {
    network: config.network,
    rpcUrl,
    relayerUrl: config.relayerUrl ? validateUrl(config.relayerUrl, 'relayerUrl') : undefined,
    jupiterApiUrl: config.jupiterApiUrl ? validateUrl(config.jupiterApiUrl, 'jupiterApiUrl') : undefined,
    timeoutMs: config.timeoutMs ?? 30000,
    debug: config.debug ?? false,
  };
}

/**
 * Sanitizes a string by removing control characters and trimming
 */
export function sanitizeString(value: string): string {
  // Remove control characters and trim whitespace
  return value.replace(/[\x00-\x1F\x7F]/g, '').trim();
}

/**
 * Validates that a value is a valid base64 string
 */
export function validateBase64(value: string, fieldName: string): string {
  if (!value) {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      `${fieldName} is required`
    );
  }

  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(value)) {
    throw new AuraShieldError(
      ErrorCode.INVALID_INPUT,
      `Invalid ${fieldName}: must be valid base64`
    );
  }

  return value;
}
