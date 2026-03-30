/**
 * @aura/shield-sdk — TypeScript interfaces
 *
 * These types match the coprocessor gateway API (Go types in pkg/types/task.go).
 */

// ---------------------------------------------------------------------------
// SDK Configuration
// ---------------------------------------------------------------------------

/** Configuration for AuraShield */
export interface ShieldConfig {
  /** Solana RPC endpoint URL */
  rpc: string
  /** Wallet adapter or keypair with signTransaction */
  wallet: WalletAdapter
  /** Coprocessor gateway endpoint (default: https://api.afhe.io) */
  gatewayUrl?: string
}

/** Minimal wallet adapter interface (compatible with @solana/wallet-adapter) */
export interface WalletAdapter {
  publicKey: { toString(): string; toBase58?(): string } | null
  signTransaction<T>(tx: T): Promise<T>
  signAllTransactions?<T>(txs: T[]): Promise<T[]>
}

// ---------------------------------------------------------------------------
// Swap Parameters (user-facing, plaintext)
// ---------------------------------------------------------------------------

/** Raw swap parameters — plaintext input from the user */
export interface SwapParams {
  /** Output token mint or symbol (e.g. 'SOL' or mint address) */
  tokenOut: string
  /** Output amount in lamports / smallest unit */
  amountOut: number
  /** Input token mint or symbol (e.g. 'USDC' or mint address) */
  tokenIn: string
  /** Max slippage in basis points (default: 50) */
  slippageBps?: number
}

// ---------------------------------------------------------------------------
// Encrypted Intent (client → gateway)
// ---------------------------------------------------------------------------

/**
 * Encrypted swap intent — matches Go `TaskInput`.
 *
 * Fields `token_out`, `amount_out`, `token_in` are AFHE ciphertext hex strings.
 * The gateway and coprocessor nodes never see the plaintext values.
 */
export interface EncryptedIntent {
  /** Client-provided UUID for session correlation */
  id: string
  /** User's Solana wallet address (base58) — NOT encrypted */
  account: string
  /** Encrypted token symbol or mint (hex ciphertext) */
  token_out: string
  /** Encrypted amount in base units (hex ciphertext) */
  amount_out: string
  /** Encrypted target token symbol or mint (hex ciphertext) */
  token_in: string
}

// ---------------------------------------------------------------------------
// Gateway API Response Envelope
// ---------------------------------------------------------------------------

/** Standard API response from the coprocessor gateway — matches Go `JSONResult` */
export interface GatewayResponse<T = unknown> {
  isSuccess: boolean
  result?: T
  log?: string
}

// ---------------------------------------------------------------------------
// Quote & Prepare Responses
// ---------------------------------------------------------------------------

/** Quote response — estimated output for an encrypted swap */
export interface QuoteResult {
  /** Jupiter estimated output amount (string) */
  outAmount: string
}

/**
 * Prepare response — unsigned transaction ready for wallet signing.
 * Matches Go `SwapResult`.
 */
export interface PrepareResult {
  /** Base64-encoded unsigned VersionedTransaction */
  swapTransaction: string
  /** Jupiter output amount */
  outAmount: string
  /** Block height after which the tx expires */
  lastValidBlockHeight: number
}

// ---------------------------------------------------------------------------
// Execute Request & Response
// ---------------------------------------------------------------------------

/** Execute request — signed transaction submission. Matches Go `ExecuteRequest`. */
export interface ExecuteRequest {
  /** Same UUID from prepare step */
  id: string
  /** Base64-encoded signed VersionedTransaction */
  signed_tx: string
}

/** Execute response — Jito submission result. Matches Go `ExecuteResult`. */
export interface ExecuteResult {
  /** Solana transaction signature (base58) */
  signature: string
}

// ---------------------------------------------------------------------------
// High-level Swap Result (returned to caller)
// ---------------------------------------------------------------------------

/** Final result returned by shield.swap() */
export interface SwapResult {
  /** Solana transaction signature */
  signature: string
  /** Output amount received */
  outAmount: string
  /** Session ID used for this swap */
  sessionId: string
}
