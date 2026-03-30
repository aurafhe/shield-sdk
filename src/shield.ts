import type {
  ShieldConfig,
  SwapParams,
  EncryptedIntent,
  PrepareResult,
  SwapResult,
  QuoteResult,
} from './types'
import { loadAfheWasm, encryptSwapParams, isAfheLoaded } from './encrypt'
import { CoprocessorClient, DEFAULT_GATEWAY_URL } from './client'

/**
 * AuraShield — the main entry point for the @aura/shield-sdk.
 *
 * Encrypts user swap data client-side using AFHE, submits to the
 * coprocessor network for homomorphic computation, and executes
 * the result on Solana via Jupiter + Jito.
 *
 * @example
 * ```ts
 * import { AuraShield } from '@aura/shield-sdk'
 *
 * const shield = new AuraShield({ rpc, wallet })
 * await shield.init()
 *
 * const result = await shield.swap({
 *   tokenOut: 'SOL',
 *   amountOut: 1_000_000_000,
 *   tokenIn: 'USDC',
 * })
 * console.log('TX:', result.signature)
 * ```
 */
export class AuraShield {
  private config: ShieldConfig
  private client: CoprocessorClient
  private initialized = false

  constructor(config: ShieldConfig) {
    this.config = {
      gatewayUrl: DEFAULT_GATEWAY_URL,
      ...config,
    }
    this.client = new CoprocessorClient(this.config.gatewayUrl)
  }

  /** Initialize the SDK — loads the AFHE WASM encryption module. */
  async init(): Promise<void> {
    if (this.initialized) return
    await loadAfheWasm()
    this.initialized = true
  }

  /** Returns true if the AFHE module is loaded and ready. */
  get ready(): boolean {
    return this.initialized && isAfheLoaded()
  }

  /**
   * Check if the coprocessor gateway is healthy and reachable.
   */
  async health(): Promise<boolean> {
    return this.client.health()
  }

  /**
   * Encrypt swap parameters client-side.
   * Each field is encrypted individually with AFHE so the coprocessor
   * can perform homomorphic operations on them.
   *
   * @param params - Plaintext swap parameters
   * @returns Encrypted intent matching the gateway TaskInput schema
   */
  encrypt(params: SwapParams): EncryptedIntent {
    this.assertInitialized()
    const account = this.getWalletAddress()
    return encryptSwapParams(params, account)
  }

  /**
   * Get a price quote for an encrypted swap.
   * The coprocessor runs FHE computation and returns the estimated
   * Jupiter output — without ever seeing the plaintext intent.
   */
  async getQuote(params: SwapParams): Promise<QuoteResult> {
    const intent = this.encrypt(params)
    return this.client.quote(intent)
  }

  /**
   * Prepare a swap — encrypt, compute on ciphertext, verify, decrypt
   * only the final output, and return an unsigned Jupiter transaction.
   *
   * @param params - Swap parameters
   * @returns Unsigned transaction ready for wallet signing
   */
  async prepare(params: SwapParams): Promise<PrepareResult & { sessionId: string }> {
    const intent = this.encrypt(params)
    const result = await this.client.prepare(intent)
    return { ...result, sessionId: intent.id }
  }

  /**
   * Execute a prepared swap — sign the transaction and submit via Jito.
   *
   * @param sessionId - Session ID from prepare()
   * @param swapTransaction - Base64 unsigned tx from prepare()
   * @returns Transaction signature
   */
  async execute(sessionId: string, swapTransaction: string): Promise<SwapResult> {
    this.assertInitialized()
    const { wallet } = this.config

    // Deserialize, sign, and re-serialize the transaction.
    // The wallet adapter handles the actual signing.
    const signedTx = await wallet.signTransaction(swapTransaction)

    const result = await this.client.execute({
      id: sessionId,
      signed_tx: typeof signedTx === 'string' ? signedTx : String(signedTx),
    })

    return {
      signature: result.signature,
      outAmount: '',
      sessionId,
    }
  }

  /**
   * One-call swap: encrypt → prepare → sign → execute.
   *
   * @param params - Swap parameters (tokenOut, amountOut, tokenIn)
   * @returns Completed swap result with transaction signature
   */
  async swap(params: SwapParams): Promise<SwapResult> {
    const prepared = await this.prepare(params)
    const result = await this.execute(prepared.sessionId, prepared.swapTransaction)
    return {
      ...result,
      outAmount: prepared.outAmount,
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('AuraShield not initialized. Call shield.init() first.')
    }
  }

  private getWalletAddress(): string {
    const pk = this.config.wallet.publicKey
    if (!pk) {
      throw new Error('Wallet not connected — publicKey is null.')
    }
    return pk.toBase58?.() ?? pk.toString()
  }
}
