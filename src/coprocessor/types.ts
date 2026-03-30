/**
 * Coprocessor gateway API types.
 *
 * These match the Go types in the coprocessor's pkg/types/task.go.
 * Any dApp module (swap, lending, NFT, governance) uses these to
 * communicate with the Aura coprocessor network.
 */

/** Standard API response envelope from the gateway */
export interface GatewayResponse<T = unknown> {
  isSuccess: boolean
  result?: T
  log?: string
}

/**
 * Generic encrypted task input sent to the coprocessor.
 *
 * The `type` field determines how the coprocessor processes the task.
 * The `encrypted` object contains arbitrary AFHE ciphertext fields.
 */
export interface TaskInput {
  /** Client-provided UUID for session correlation */
  id: string
  /** Task type (e.g. 'swap', 'lend', 'vote', 'transfer') */
  type: string
  /** User's Solana wallet address (base58) — NOT encrypted */
  account: string
  /** Encrypted fields — keys and values are task-type specific */
  encrypted: Record<string, string>
  /** Optional plaintext metadata (non-sensitive) */
  metadata?: Record<string, string | number>
}

/**
 * Swap-specific task input — the most common task type.
 * Matches Go `TaskInput` in the coprocessor gateway.
 */
export interface SwapTaskInput {
  id: string
  account: string
  token_out: string
  amount_out: string
  token_in: string
}

/** Task output from the coprocessor (all fields are ciphertext) */
export interface TaskOutput {
  encInputMint: string
  encOutputMint: string
  encAmount: string
  encFee: string
  commitment: string
}

/** Swap prepare result — unsigned Jupiter transaction */
export interface SwapPrepareResult {
  swapTransaction: string
  outAmount: string
  lastValidBlockHeight: number
}

/** Execute request — signed transaction submission */
export interface ExecuteRequest {
  id: string
  signed_tx: string
}

/** Execute result — Jito submission result */
export interface ExecuteResult {
  signature: string
}

/** Minimal wallet adapter interface */
export interface WalletAdapter {
  publicKey: { toString(): string; toBase58?(): string } | null
  signTransaction<T>(tx: T): Promise<T>
  signAllTransactions?<T>(txs: T[]): Promise<T[]>
}
