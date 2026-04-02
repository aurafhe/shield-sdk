import type { AuraShieldConfig, EncryptedSwap, SwapSubmission, SwapResult } from './types.js';
import { SwapStatus } from './types.js';
import { AuraShieldError, ErrorCode } from './errors.js';
import { base64ToUint8 } from './encryption.js';

/**
 * Default relayer URLs by network.
 * Note: These are placeholder URLs for development.
 * In production, always provide an explicit relayerUrl in config.
 */
const DEFAULT_RELAYER_URLS: Record<string, string> = {
  'mainnet-beta': 'http://localhost:3001', // Must be configured explicitly for mainnet
  devnet: 'http://localhost:3001',
  testnet: 'http://localhost:3001',
};

/**
 * Response from relayer health check endpoint
 */
export interface HealthCheckResponse {
  status: string;
  version: string;
  latencyMs: number;
}

/**
 * Client for communicating with the Aura Shield relayer
 */
export class RelayerClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly debug: boolean;

  constructor(config: AuraShieldConfig) {
    // Require explicit relayer URL for mainnet
    if (config.network === 'mainnet-beta' && !config.relayerUrl) {
      throw new AuraShieldError(
        ErrorCode.INVALID_PARAMS,
        'relayerUrl is required for mainnet-beta. No default relayer is available for mainnet.'
      );
    }

    this.baseUrl = config.relayerUrl ?? DEFAULT_RELAYER_URLS[config.network];
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.debug = config.debug ?? false;
  }

  /**
   * Generic HTTP request handler with timeout
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
        // Debug logging gated behind config flag
        process.stderr?.write?.(`[AuraShield] ${method} ${url}\n`);
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
          `Relayer returned ${response.status}: ${errorText}`
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

        // Network errors (fetch failed, DNS, etc.)
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
   * Submit an encrypted swap to the relayer
   */
  async submitEncryptedSwap(encrypted: EncryptedSwap): Promise<SwapSubmission> {
    try {
      return await this.request<SwapSubmission>('POST', '/api/v1/swap', encrypted);
    } catch (error) {
      if (error instanceof AuraShieldError) {
        throw error;
      }
      throw new AuraShieldError(
        ErrorCode.RELAYER_ERROR,
        'Failed to submit encrypted swap',
        error
      );
    }
  }

  /**
   * Get the current status of a swap
   */
  async getSwapStatus(swapId: string): Promise<SwapSubmission> {
    try {
      return await this.request<SwapSubmission>('GET', `/api/v1/swap/${swapId}`);
    } catch (error) {
      if (error instanceof AuraShieldError) {
        throw error;
      }
      throw new AuraShieldError(
        ErrorCode.RELAYER_ERROR,
        `Failed to get status for swap ${swapId}`,
        error
      );
    }
  }

  /**
   * Poll for swap settlement until terminal state or timeout
   */
  async awaitSettlement(
    swapId: string,
    pollIntervalMs: number = 1000,
    maxWaitMs: number = 60000
  ): Promise<SwapResult> {
    const startTime = Date.now();
    const terminalStates = new Set([
      SwapStatus.SETTLED,
      SwapStatus.FAILED,
      SwapStatus.EXPIRED,
      SwapStatus.CANCELLED,
    ]);

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const submission = await this.getSwapStatus(swapId);

        if (terminalStates.has(submission.status)) {
          // Map to SwapResult status (only SETTLED or FAILED are valid)
          const resultStatus = submission.status === SwapStatus.SETTLED
            ? SwapStatus.SETTLED
            : SwapStatus.FAILED;

          return {
            swapId,
            status: resultStatus,
            txSignature: submission.txSignature ?? '',
            totalTimeMs: Date.now() - startTime,
            amountOut: submission.estimatedOutput,
            error: submission.status !== SwapStatus.SETTLED
              ? `Swap ${submission.status}`
              : undefined,
          };
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      } catch (error) {
        // On error, continue polling unless it's a critical error
        if (error instanceof AuraShieldError && error.code === ErrorCode.NETWORK_ERROR) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          continue;
        }
        throw error;
      }
    }

    throw new AuraShieldError(
      ErrorCode.TIMEOUT,
      `Swap ${swapId} did not settle within ${maxWaitMs}ms`
    );
  }

  /**
   * Get the relayer's encryption public key
   */
  async getEncryptionPublicKey(): Promise<Uint8Array> {
    try {
      const response = await this.request<{ publicKey: string }>(
        'GET',
        '/api/v1/keys/encryption'
      );
      return base64ToUint8(response.publicKey);
    } catch (error) {
      if (error instanceof AuraShieldError) {
        throw error;
      }
      throw new AuraShieldError(
        ErrorCode.RELAYER_ERROR,
        'Failed to get encryption public key',
        error
      );
    }
  }

  /**
   * Check relayer health and measure latency
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const startTime = Date.now();

    try {
      const response = await this.request<{ status: string; version: string }>(
        'GET',
        '/health'
      );

      return {
        ...response,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      if (error instanceof AuraShieldError) {
        throw error;
      }
      throw new AuraShieldError(
        ErrorCode.RELAYER_ERROR,
        'Health check failed',
        error
      );
    }
  }
}
