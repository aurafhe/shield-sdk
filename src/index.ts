/**
 * @aura/shield-sdk
 *
 * Fully Homomorphic Encryption for Solana.
 * Encrypt user data in the browser, compute on ciphertext.
 *
 * @example
 * ```ts
 * import { AuraShield } from '@aura/shield-sdk'
 *
 * const shield = new AuraShield({ rpc, wallet })
 * await shield.init()
 * const result = await shield.swap({ tokenOut: 'SOL', amountOut: 1_000_000_000, tokenIn: 'USDC' })
 * console.log('TX:', result.signature)
 * ```
 */

// Main class
export { AuraShield } from './shield'

// Types
export type {
  ShieldConfig,
  WalletAdapter,
  SwapParams,
  EncryptedIntent,
  QuoteResult,
  PrepareResult,
  SwapResult,
  GatewayResponse,
  ExecuteRequest,
  ExecuteResult,
} from './types'

// Low-level API (advanced usage)
export { encryptSwapParams, loadAfheWasm, isAfheLoaded, afheVersion } from './encrypt'
export { CoprocessorClient, GatewayError, DEFAULT_GATEWAY_URL } from './client'
