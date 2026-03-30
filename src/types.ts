/**
 * @aura/shield-sdk — TypeScript interfaces
 */

/** Configuration for AuraShield */
export interface ShieldConfig {
  /** Solana RPC endpoint URL */
  rpc: string
  /** Wallet adapter or keypair with signTransaction */
  wallet: WalletAdapter
  /** Coprocessor API endpoint (default: https://api.afhe.io) */
  apiEndpoint?: string
}

/** Minimal wallet adapter interface */
export interface WalletAdapter {
  publicKey: { toString(): string } | null
  signTransaction(tx: unknown): Promise<unknown>
  signAllTransactions?(txs: unknown[]): Promise<unknown[]>
}

/** Raw swap parameters (plaintext input) */
export interface SwapParams {
  /** Output token mint or symbol (e.g. 'SOL' or mint address) */
  tokenOut: string
  /** Output amount in lamports/smallest unit */
  amountOut: number
  /** Input token mint or symbol (e.g. 'USDC' or mint address) */
  tokenIn: string
  /** Max slippage in basis points (default: 50) */
  slippageBps?: number
}

/** Encrypted swap intent returned by encrypt() */
export interface EncryptedIntent {
  /** AFHE ciphertext (base64-encoded) */
  ciphertext: string
  /** Ephemeral public key used for encryption */
  ephemeralPubkey: string
  /** AFHE scheme version */
  version: string
  /** Unix timestamp of encryption */
  timestamp: number
}

/** Quote returned by the coprocessor after processing encrypted intent */
export interface SwapQuote {
  /** Quote ID for execution */
  quoteId: string
  /** Estimated output amount (plaintext, revealed only at execution) */
  estimatedOut: string
  /** Price impact in basis points */
  priceImpactBps: number
  /** Fee in lamports */
  feeLamports: number
  /** Quote expiry timestamp (unix) */
  expiresAt: number
  /** Serialized transaction for signing (base64) */
  transaction: string
}

/** Result of a completed swap */
export interface SwapResult {
  /** Transaction signature */
  signature: string
  /** Confirmed slot */
  slot?: number
  /** Input amount used */
  inputAmount: string
  /** Output amount received */
  outputAmount: string
}
