import { ShieldConfig, SwapParams, EncryptedIntent, SwapQuote, SwapResult } from './types'
import { loadAfheWasm, encryptSwapParams } from './encrypt'
import { CoprocessorClient, DEFAULT_API_ENDPOINT } from './client'

/**
 * AuraShield — the main entry point for the @aura/shield-sdk
 *
 * Encrypts user data client-side using FHE, submits to the
 * coprocessor network for private computation, and executes
 * the result on Solana.
 *
 * @example
 * const shield = new AuraShield({ rpc, wallet })
 * await shield.init()
 * const result = await shield.swap({ tokenOut: 'SOL', amountOut: 1e9, tokenIn: 'USDC' })
 */
export class AuraShield {
  private config: ShieldConfig
  private client: CoprocessorClient
  private initialized = false

  constructor(config: ShieldConfig) {
    this.config = {
      apiEndpoint: DEFAULT_API_ENDPOINT,
      ...config,
    }
    this.client = new CoprocessorClient(this.config.apiEndpoint)
  }

  /**
   * Initialize the SDK — loads the AFHE WASM encryption module.
   * Must be called before encrypt(), submit(), execute(), or swap().
   */
  async init(): Promise<void> {
    if (this.initialized) return
    await loadAfheWasm()
    this.initialized = true
  }

  /**
   * Encrypt swap parameters client-side using AFHE WASM.
   * No plaintext leaves the browser.
   *
   * @param params - Swap parameters (tokenOut, amountOut, tokenIn)
   * @returns Encrypted intent ready for coprocessor submission
   */
  async encrypt(params: SwapParams): Promise<EncryptedIntent> {
    this.assertInitialized()
    return encryptSwapParams(params)
  }

  /**
   * Submit an encrypted intent to the coprocessor network.
   * Token resolution, slippage validation, and fee calculation
   * all happen on ciphertext.
   *
   * @param intent - Encrypted swap intent from encrypt()
   * @returns Quote with ready-to-sign execution transaction
   */
  async submit(intent: EncryptedIntent): Promise<SwapQuote> {
    this.assertInitialized()
    return this.client.submitIntent(intent)
  }

  /**
   * Execute a swap quote by signing and submitting via Jito.
   *
   * @param quote - Quote returned by submit()
   * @returns Transaction signature and swap result
   */
  async execute(quote: SwapQuote): Promise<SwapResult> {
    this.assertInitialized()
    const { wallet } = this.config
    return this.client.executeQuote(quote, (tx) => wallet.signTransaction(tx))
  }

  /**
   * Convenience method: encrypt + submit + execute in one call.
   *
   * @param params - Swap parameters (tokenOut, amountOut, tokenIn)
   * @returns Completed swap result
   */
  async swap(params: SwapParams): Promise<SwapResult> {
    const intent = await this.encrypt(params)
    const quote = await this.submit(intent)
    return this.execute(quote)
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('AuraShield not initialized. Call shield.init() first.')
    }
  }
}
