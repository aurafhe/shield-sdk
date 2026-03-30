/**
 * Generic coprocessor client.
 *
 * This client communicates with the Aura coprocessor gateway.
 * It is not swap-specific — any dApp module can use it to submit
 * encrypted tasks for FHE computation.
 */

import type {
  GatewayResponse,
  TaskInput,
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
 * Supports both high-level swap operations and generic encrypted
 * task submission for custom dApp modules.
 *
 * @example
 * ```ts
 * const client = new CoprocessorClient('https://api.afhe.io')
 *
 * // Generic task
 * const result = await client.submitTask({
 *   id: 'my-task-1',
 *   type: 'custom',
 *   account: wallet.publicKey.toBase58(),
 *   encrypted: { amount: encryptedAmount, recipient: encryptedRecipient },
 * })
 *
 * // Swap-specific
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
  // Generic task API
  // -------------------------------------------------------------------------

  /** Check if the gateway is healthy */
  async health(): Promise<boolean> {
    try {
      const res = await this.request<string>('GET', '/api/v1/swap/health')
      return res.isSuccess
    } catch {
      return false
    }
  }

  /**
   * Submit a generic encrypted task to the coprocessor.
   * Use this for custom dApp modules beyond swaps.
   *
   * @param task - Encrypted task with arbitrary fields
   * @returns Gateway response with task-specific result
   */
  async submitTask<T = unknown>(task: TaskInput): Promise<GatewayResponse<T>> {
    return this.request<T>('POST', '/api/v1/tasks', task)
  }

  // -------------------------------------------------------------------------
  // Swap-specific API
  // -------------------------------------------------------------------------

  /**
   * Get a quote for an encrypted swap.
   * Runs FHE computation and returns estimated Jupiter output.
   */
  async quote(intent: SwapTaskInput): Promise<{ outAmount: string }> {
    const res = await this.request<string>('POST', '/api/v1/quote', intent)
    return { outAmount: String(res.result) }
  }

  /**
   * Prepare a swap — FHE compute + verify + decrypt + unsigned Jupiter tx.
   */
  async prepare(intent: SwapTaskInput): Promise<SwapPrepareResult> {
    const res = await this.request<SwapPrepareResult>('POST', '/api/v1/swap/prepare', intent)
    return res.result as SwapPrepareResult
  }

  /**
   * Execute — submit signed transaction via Jito.
   */
  async execute(req: ExecuteRequest): Promise<ExecuteResult> {
    const res = await this.request<ExecuteResult>('POST', '/api/v1/swap/execute', req)
    return res.result as ExecuteResult
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
