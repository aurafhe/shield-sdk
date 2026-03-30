/**
 * @aura/shield-sdk
 *
 * Fully Homomorphic Encryption for Solana.
 * Encrypt user data in the browser, compute on ciphertext.
 *
 * @example
 * import { AuraShield } from '@aura/shield-sdk'
 *
 * const shield = new AuraShield({ rpc, wallet })
 * await shield.init()
 * const result = await shield.swap({ tokenOut: 'SOL', amountOut: 1_000_000_000, tokenIn: 'USDC' })
 */

// Main class
export { AuraShield } from './shield'

// Types
export type {
  ShieldConfig,
  WalletAdapter,
  SwapParams,
  EncryptedIntent,
  SwapQuote,
  SwapResult,
} from './types'

// Low-level API (for advanced usage)
export { encryptSwapParams, loadAfheWasm } from './encrypt'
export { CoprocessorClient, DEFAULT_API_ENDPOINT } from './client'
