import type { SwapParams, EncryptedIntent } from './types'

/**
 * AFHE encryption engine interface.
 * Real implementation calls the AFHE WASM module.
 * Stub implementation produces placeholder ciphertexts for testing.
 */
interface AfheEngine {
  loaded: boolean
  version: string
  encryptInt(value: number): string
  encryptString(value: string): string
}

let engine: AfheEngine | null = null

/**
 * Load the AFHE WASM encryption module.
 * Called automatically by AuraShield.init().
 */
export async function loadAfheWasm(): Promise<void> {
  if (engine !== null) return

  // TODO(David): Replace stub with real AFHE WASM loader
  // const wasm = await import('@aura/afhe-wasm')
  // const mod = await wasm.default()
  // engine = {
  //   loaded: true,
  //   version: mod.version(),
  //   encryptInt: (v) => mod.EncryptPublic(v.toString()),
  //   encryptString: (v) => mod.EncryptPublicString(v),
  // }

  // Stub: produces deterministic hex-like ciphertexts for testing
  engine = {
    loaded: true,
    version: '0.1.0-stub',
    encryptInt(value: number): string {
      const hex = value.toString(16).padStart(16, '0')
      return `STUB_ENC_INT_${hex}`
    },
    encryptString(value: string): string {
      const hex = Buffer.from(value).toString('hex')
      return `STUB_ENC_STR_${hex}`
    },
  }
}

/** Returns true if the AFHE WASM module is loaded */
export function isAfheLoaded(): boolean {
  return engine !== null && engine.loaded
}

/** Returns the AFHE engine version string */
export function afheVersion(): string {
  return engine?.version ?? 'not-loaded'
}

/**
 * Encrypt swap parameters client-side using the AFHE engine.
 * Each field is encrypted individually so the coprocessor can
 * operate on them homomorphically.
 *
 * @param params  - Plaintext swap parameters
 * @param account - User's Solana wallet address (base58, NOT encrypted)
 * @returns EncryptedIntent matching the gateway's TaskInput schema
 */
export function encryptSwapParams(params: SwapParams, account: string): EncryptedIntent {
  if (engine === null) {
    throw new Error('AFHE WASM not loaded. Call shield.init() first.')
  }

  const id = generateSessionId()

  return {
    id,
    account,
    token_out: engine.encryptString(params.tokenOut),
    amount_out: engine.encryptInt(params.amountOut),
    token_in: engine.encryptString(params.tokenIn),
  }
}

/** Generate a unique session ID for correlating quote→prepare→execute */
function generateSessionId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 10)
  return `shield_${ts}_${rand}`
}
