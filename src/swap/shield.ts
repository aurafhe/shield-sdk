/**
 * AuraShield — MEV-protected swaps on Solana.
 *
 * Built on core/ (FHE encryption) and coprocessor/ (gateway client).
 * This is the first module of the SDK — demonstrates how any dApp
 * can leverage the Aura coprocessor for encrypted computation.
 */

import { initAfhe, isAfheReady, isStubMode, encryptInt, encryptString } from '../core'
import { CoprocessorClient, DEFAULT_GATEWAY_URL } from '../coprocessor'
import type { SwapTaskInput, SwapPrepareResult } from '../coprocessor'
import type { SwapParams, SwapResult, ShieldConfig } from './types'

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

  /** Initialize — loads the AFHE WASM encryption module */
  async init(): Promise<void> {
    if (this.initialized) return
    await initAfhe()
    this.initialized = true
  }

  /** True if the AFHE module is loaded and ready */
  get ready(): boolean {
    return this.initialized && isAfheReady()
  }

  /** True if running in stub mode (development only — no real FHE) */
  get stubMode(): boolean {
    return isStubMode()
  }

  /** Check if the coprocessor gateway is reachable */
  async health(): Promise<boolean> {
    return this.client.health()
  }

  /**
   * Encrypt swap parameters client-side.
   * Each field becomes AFHE ciphertext — no plaintext leaves the browser.
   */
  encrypt(params: SwapParams): SwapTaskInput {
    this.assertReady()
    const account = this.getWalletAddress()
    return {
      id: generateSessionId(),
      account,
      token_out: encryptString(params.tokenOut) as string,
      amount_out: encryptInt(params.amountOut) as string,
      token_in: encryptString(params.tokenIn) as string,
    }
  }

  /** Get a price quote for an encrypted swap */
  async getQuote(params: SwapParams): Promise<{ outAmount: string }> {
    const intent = this.encrypt(params)
    return this.client.quote(intent)
  }

  /** Prepare: encrypt + FHE compute + verify + unsigned Jupiter tx */
  async prepare(params: SwapParams): Promise<SwapPrepareResult & { sessionId: string }> {
    const intent = this.encrypt(params)
    const result = await this.client.prepare(intent)
    return { ...result, sessionId: intent.id }
  }

  /** Execute: sign the prepared tx and submit via Jito */
  async execute(sessionId: string, swapTransaction: string): Promise<SwapResult> {
    this.assertReady()
    const signedTx = await this.config.wallet.signTransaction(swapTransaction)
    const result = await this.client.execute({
      id: sessionId,
      signed_tx: typeof signedTx === 'string' ? signedTx : String(signedTx),
    })
    return { signature: result.signature, outAmount: '', sessionId }
  }

  /** One-call swap: encrypt + prepare + sign + execute */
  async swap(params: SwapParams): Promise<SwapResult> {
    const prepared = await this.prepare(params)
    const result = await this.execute(prepared.sessionId, prepared.swapTransaction)
    return { ...result, outAmount: prepared.outAmount }
  }

  // -----------------------------------------------------------------------

  private assertReady(): void {
    if (!this.initialized) throw new Error('AuraShield not initialized. Call shield.init() first.')
  }

  private getWalletAddress(): string {
    const pk = this.config.wallet.publicKey
    if (!pk) throw new Error('Wallet not connected — publicKey is null.')
    return pk.toBase58?.() ?? pk.toString()
  }
}

function generateSessionId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 10)
  return `shield_${ts}_${rand}`
}
