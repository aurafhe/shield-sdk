/** Swap module types */

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

/** Result returned by shield.swap() */
export interface SwapResult {
  /** Solana transaction signature */
  signature: string
  /** Output amount received */
  outAmount: string
  /** Session ID used for this swap */
  sessionId: string
}

/** SDK configuration */
export interface ShieldConfig {
  /** Solana RPC endpoint URL */
  rpc: string
  /** Wallet adapter with signTransaction */
  wallet: import('../coprocessor').WalletAdapter
  /** Coprocessor gateway endpoint (default: https://api.afhe.io) */
  gatewayUrl?: string
}
