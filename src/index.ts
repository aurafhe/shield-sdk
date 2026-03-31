/**
 * @aura/shield-sdk
 *
 * The developer SDK for building dApps and web3 products on the
 * Aura FHE coprocessor. Encrypt user data in the browser, compute
 * on ciphertext, decrypt only when needed.
 *
 * ## Architecture
 *
 * ```
 * core/          — 55 AFHE encryption primitives (encrypt, arithmetic, logic, math)
 * coprocessor/   — Generic coprocessor client (submit any encrypted task)
 * swap/          — MEV-protected swaps (first module, built on core + coprocessor)
 * ```
 *
 * ## Quick Start (Swap)
 *
 * ```ts
 * import { AuraShield } from '@aura/shield-sdk'
 *
 * const shield = new AuraShield({ rpc, wallet })
 * await shield.init()
 * const result = await shield.swap({ tokenOut: 'SOL', amountOut: 1e9, tokenIn: 'USDC' })
 * ```
 *
 * ## Custom dApp (Advanced)
 *
 * ```ts
 * import { initAfhe, encryptInt, encryptString, CoprocessorClient } from '@aura/shield-sdk'
 *
 * await initAfhe()
 * const client = new CoprocessorClient('https://api.afhe.io')
 *
 * const result = await client.submitTask({
 *   id: 'my-task',
 *   type: 'lending',
 *   account: wallet.publicKey.toBase58(),
 *   encrypted: {
 *     collateralAmount: encryptInt(1_000_000_000),
 *     borrowToken: encryptString('USDC'),
 *   },
 * })
 * ```
 */

// ---------------------------------------------------------------------------
// Swap module (most common use case)
// ---------------------------------------------------------------------------
export { AuraShield } from './swap'
export type { SwapParams, SwapResult, ShieldConfig } from './swap'

// ---------------------------------------------------------------------------
// Core FHE primitives (for building custom encrypted dApps)
// ---------------------------------------------------------------------------
export {
  initAfhe,
  isAfheReady,
  isStubMode,
  afheVersion,
  requireRealAfhe,
  validateCiphertext,
  MIN_REAL_CIPHERTEXT_BYTES,
  encryptInt,
  encryptString,
  encryptBinary,
  add,
  subtract,
  multiply,
  divide,
  compareEnc,
  xor,
  and,
  or,
  not,
  abs,
  sqrt,
  log,
  exp,
  concat,
  sign,
  verify,
  sm3,
} from './core'

export type {
  Ciphertext,
  EncryptedInt,
  EncryptedString,
  EncryptedBinary,
  EncryptedComparison,
  AfheSignature,
  AfheConfig,
  AfheOperation,
} from './core'

// ---------------------------------------------------------------------------
// Coprocessor client
// ---------------------------------------------------------------------------
export { CoprocessorClient, GatewayError, DEFAULT_GATEWAY_URL } from './coprocessor'

export type {
  GatewayResponse,
  SwapTaskInput,
  TaskOutput,
  SwapPrepareResult,
  ExecuteRequest,
  ExecuteResult,
  WalletAdapter,
} from './coprocessor'
