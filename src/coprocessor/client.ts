/**
 * Coprocessor gateway client.
 *
 * Communicates with the Aura coprocessor gateway over HTTPS.
 * Validates all responses before returning to the caller.
 */

import type {
  GatewayResponse,
  SwapTaskInput,
  SwapPrepareResult,
  ExecuteRequest,
  ExecuteResult,
} from './types'

export const DEFAULT_GATEWAY_URL = 'https://api.afhe.io'

/** Error thrown when the coprocessor gateway returns an error */
export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly log?: string,
  ) {
    super(message)
    this.name = 'GatewayError'
  }
}

/**
 * HTTP client for the Aura coprocessor gateway.
 *
 * @example
 * ```ts
 * const client = new CoprocessorClient('https://api.afhe.io')
 * const quote = await client.quote(encryptedSwapIntent)
 * ```
 */
export class CoprocessorClient {
  private baseUrl: string

  constructor(gatewayUrl: string = DEFAULT_GATEWAY_URL) {
    this.baseUrl = gatewayUrl.replace(/\/$/, '')
  }

  /** The configured gateway URL */
  get url(): string {
    return this.baseUrl
  }

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  /** Check if the gateway is healthy and reachable */
  async health(): Promise<boolean> {
    try {
      const res = await this.request<string>('GET', '/api/v1/swap/health')
      return res.isSuccess
    } catch {
      return false
    }
  }

  // -------------------------------------------------------------------------
  // Swap API (maps to coprocessor gateway endpoints)
  // -------------------------------------------------------------------------

  /**
   * Get a quote for an encrypted swap.
   * The coprocessor runs FHE computation (EvalLUT, CompareEnc, DivideCipher)
   * and returns the estimated Jupiter output amount.
   */
  async quote(intent: SwapTaskInput): Promise<{ outAmount: string }> {
    validateSwapInput(intent)
    const res = await this.request<string>('POST', '/api/v1/quote', intent)
    return { outAmount: String(res.result) }
  }

  /**
   * Prepare a swap — FHE compute + 2-node verification + threshold KMS
   * decryption + unsigned Jupiter transaction.
   *
   * @returns Unsigned VersionedTransaction (base64) ready for wallet signing
   */
  async prepare(intent: SwapTaskInput): Promise<SwapPrepareResult> {
    validateSwapInput(intent)
    const res = await this.request<SwapPrepareResult>('POST', '/api/v1/swap/prepare', intent)
    const result = res.result as SwapPrepareResult
    validatePrepareResult(result)
    return result
  }

  /**
   * Execute — submit the wallet-signed transaction via Jito's private mempool.
   */
  async execute(req: ExecuteRequest): Promise<ExecuteResult> {
    if (!req.id || !req.signed_tx) {
      throw new GatewayError('execute requires id and signed_tx', 400)
    }
    validateBase64(req.signed_tx, 'signed_tx')
    const res = await this.request<ExecuteResult>('POST', '/api/v1/swap/execute', req)
    const result = res.result as ExecuteResult
    if (!result?.signature || typeof result.signature !== 'string') {
      throw new GatewayError('Gateway returned invalid execute result: missing signature', 502)
    }
    return result
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<GatewayResponse<T>> {
    const url = `${this.baseUrl}${path}`
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    }
    if (body !== undefined) {
      init.body = JSON.stringify(body)
    }

    const res = await fetch(url, init)

    let data: GatewayResponse<T>
    try {
      data = await res.json()
    } catch {
      throw new GatewayError(
        `Gateway returned non-JSON response (${res.status})`,
        res.status,
      )
    }

    if (!res.ok || !data.isSuccess) {
      throw new GatewayError(
        data.log ?? `Gateway error (${res.status})`,
        res.status,
        data.log,
      )
    }

    return data
  }
}

// ---------------------------------------------------------------------------
// Input & response validators
// ---------------------------------------------------------------------------

function validateSwapInput(intent: SwapTaskInput): void {
  if (!intent.id) throw new GatewayError('Missing session id', 400)
  if (!intent.account) throw new GatewayError('Missing wallet account', 400)
  if (!intent.token_out) throw new GatewayError('Missing encrypted token_out', 400)
  if (!intent.amount_out) throw new GatewayError('Missing encrypted amount_out', 400)
  if (!intent.token_in) throw new GatewayError('Missing encrypted token_in', 400)
}

function validatePrepareResult(result: SwapPrepareResult): void {
  if (!result) {
    throw new GatewayError('Gateway returned empty prepare result', 502)
  }
  if (!result.swapTransaction || typeof result.swapTransaction !== 'string') {
    throw new GatewayError('Gateway returned invalid prepare result: missing swapTransaction', 502)
  }
  validateBase64(result.swapTransaction, 'swapTransaction')
  if (!result.outAmount) {
    throw new GatewayError('Gateway returned invalid prepare result: missing outAmount', 502)
  }
  if (typeof result.lastValidBlockHeight !== 'number' || result.lastValidBlockHeight <= 0) {
    throw new GatewayError('Gateway returned invalid prepare result: bad lastValidBlockHeight', 502)
  }
}

function validateBase64(value: string, field: string): void {
  if (!/^[A-Za-z0-9+/=]+$/.test(value)) {
    throw new GatewayError(`Invalid base64 in ${field}`, 400)
  }
}
