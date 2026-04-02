import type { AuraShieldConfig, GatewayRequest, GatewayResponse, PrepareResult, ExecuteResult } from './types.js';
import { AuraShieldError, ErrorCode } from './errors.js';

/**
 * Client for communicating with the Go coprocessor gateway.
 *
 * Uses a two-step prepare/execute flow with field-level encrypted request bodies:
 *   1. prepare() — POSTs encrypted field values to /api/v1/swap/prepare, gets back an unsigned tx
 *   2. execute() — POSTs the signed tx to /api/v1/swap/execute, gets back the on-chain signature
 *
 * All responses are wrapped in the Go gateway envelope: { isSuccess, result, log? }
 */
export class CoprocessorClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly debug: boolean;

  constructor(config: AuraShieldConfig) {
    this.baseUrl = config.relayerUrl ?? 'http://localhost:8098';
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.debug = config.debug ?? false;
  }

  /**
   * Generic HTTP request handler with AbortController timeout.
   * Copied from RelayerClient with identical error handling semantics.
   */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = `${this.baseUrl}${path}`;

      if (this.debug) {
        process.stderr?.write?.(`[AuraShield:CoprocessorClient] ${method} ${url}\n`);
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new AuraShieldError(
          ErrorCode.RELAYER_ERROR,
          `Gateway returned ${response.status}: ${errorText}`
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof AuraShieldError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new AuraShieldError(
            ErrorCode.TIMEOUT,
            `Request timed out after ${this.timeoutMs}ms`
          );
        }

        // Network errors (fetch failed, DNS, connection refused, etc.)
        throw new AuraShieldError(
          ErrorCode.NETWORK_ERROR,
          `Network error: ${error.message}`,
          error
        );
      }

      throw new AuraShieldError(
        ErrorCode.NETWORK_ERROR,
        'Unknown network error',
        error
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse the Go gateway envelope { isSuccess, result, log } and throw on failure.
   */
  private async gatewayRequest<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> {
    const envelope = await this.request<GatewayResponse<T>>(method, path, body);
    if (!envelope.isSuccess) {
      throw new AuraShieldError(
        ErrorCode.RELAYER_ERROR,
        envelope.log ?? 'Gateway error'
      );
    }
    return envelope.result;
  }

  /**
   * Check whether the Go gateway is healthy.
   * Returns true on success, false on any error (network down, unhealthy).
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.gatewayRequest<string>('GET', '/api/v1/swap/health');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Submit field-level encrypted swap parameters to the gateway.
   * Returns the unsigned swap transaction (base64) plus routing metadata.
   *
   * @param req - GatewayRequest with XOR-0xAA hex-encoded field values
   */
  async prepare(req: GatewayRequest): Promise<PrepareResult> {
    try {
      return await this.gatewayRequest<PrepareResult>('POST', '/api/v1/swap/prepare', req);
    } catch (error) {
      if (error instanceof AuraShieldError) throw error;
      throw new AuraShieldError(ErrorCode.RELAYER_ERROR, 'Prepare failed', error);
    }
  }

  /**
   * Submit the signed transaction to the gateway for on-chain execution.
   * The id must match the session id used in the corresponding prepare() call.
   *
   * @param id - Session UUID from the prepare() call
   * @param signedTx - Base64-encoded signed transaction
   */
  async execute(id: string, signedTx: string): Promise<ExecuteResult> {
    try {
      return await this.gatewayRequest<ExecuteResult>('POST', '/api/v1/swap/execute', {
        id,
        signed_tx: signedTx, // Go gateway expects snake_case: json:"signed_tx"
      });
    } catch (error) {
      if (error instanceof AuraShieldError) throw error;
      throw new AuraShieldError(ErrorCode.RELAYER_ERROR, 'Execute failed', error);
    }
  }
}
