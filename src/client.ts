import { EncryptedIntent, SwapQuote, SwapResult } from './types'

export const DEFAULT_API_ENDPOINT = 'https://api.afhe.io'

/** HTTP client for the Aura coprocessor API */
export class CoprocessorClient {
  private endpoint: string

  constructor(endpoint: string = DEFAULT_API_ENDPOINT) {
    this.endpoint = endpoint.replace(/\/$/, '')
  }

  /**
   * Submit an encrypted swap intent to the coprocessor network.
   * The coprocessor performs token resolution, slippage validation,
   * and fee calculation — all on ciphertext.
   *
   * @param intent - Encrypted swap intent from encryptSwapParams()
   * @returns Quote with execution transaction (ready to sign)
   */
  async submitIntent(intent: EncryptedIntent): Promise<SwapQuote> {
    // TODO: Replace stub with real coprocessor API call
    // const res = await fetch(`${this.endpoint}/v1/intents`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(intent),
    // })
    // if (!res.ok) throw new Error(`Coprocessor error: ${res.status}`)
    // return res.json()

    // Stub: simulate API response
    await new Promise((resolve) => setTimeout(resolve, 100))
    return {
      quoteId: `stub-quote-${Date.now()}`,
      estimatedOut: '1000000000',
      priceImpactBps: 12,
      feeLamports: 5000,
      expiresAt: Math.floor(Date.now() / 1000) + 60,
      transaction: 'STUB_TX_BASE64_PLACEHOLDER',
    }
  }

  /**
   * Execute a swap quote — signs and submits via Jito.
   *
   * @param quote - Quote returned by submitIntent()
   * @param signTransaction - Wallet signing function
   * @returns Transaction signature and confirmed result
   */
  async executeQuote(
    quote: SwapQuote,
    signTransaction: (tx: unknown) => Promise<unknown>
  ): Promise<SwapResult> {
    // TODO: Replace stub with real execution
    // const signedTx = await signTransaction(deserializeTx(quote.transaction))
    // const sig = await sendAndConfirmViajito(signedTx)

    await signTransaction(quote.transaction)
    return {
      signature: `stub-sig-${Date.now()}`,
      inputAmount: 'stub-in',
      outputAmount: quote.estimatedOut,
    }
  }
}
