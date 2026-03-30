import type {
  EncryptedIntent,
  GatewayResponse,
  QuoteResult,
  PrepareResult,
  ExecuteResult,
  ExecuteRequest,
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

/** HTTP client for the Aura coprocessor gateway API */
export class CoprocessorClient {
  private baseUrl: string

  constructor(gatewayUrl: string = DEFAULT_GATEWAY_URL) {
    this.baseUrl = gatewayUrl.replace(/\/$/, '')
  }

  /**
   * Check if the gateway is healthy.
   */
  async health(): Promise<boolean> {
    try {
      const res = await this.request<string>('GET', '/api/v1/swap/health')
      return res.isSuccess
    } catch {
      return false
    }
  }

  /**
   * Get a quote for an encrypted swap intent.
   * The coprocessor performs token resolution, validation, and fee
   * calculation on ciphertext, then returns the Jupiter output amount.
   *
   * @param intent - Encrypted swap intent from encrypt()
   * @returns Estimated output amount
   */
  async quote(intent: EncryptedIntent): Promise<QuoteResult> {
    const res = await this.request<string>('POST', '/api/v1/quote', intent)
    return { outAmount: String(res.result) }
  }

  /**
   * Prepare a swap — runs FHE computation, verification, threshold
   * decryption, and builds an unsigned Jupiter transaction.
   *
   * @param intent - Encrypted swap intent (must include id + account)
   * @returns Unsigned transaction ready for wallet signing
   */
  async prepare(intent: EncryptedIntent): Promise<PrepareResult> {
    const res = await this.request<PrepareResult>('POST', '/api/v1/swap/prepare', intent)
    return res.result as PrepareResult
  }

  /**
   * Execute a prepared swap — submit the signed transaction via Jito.
   *
   * @param req - Session ID and base64-encoded signed transaction
   * @returns Transaction signature
   */
  async execute(req: ExecuteRequest): Promise<ExecuteResult> {
    const res = await this.request<ExecuteResult>('POST', '/api/v1/swap/execute', req)
    return res.result as ExecuteResult
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

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
