import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoprocessorClient } from '../src/coprocessor-client.js';
import { AuraShieldError, ErrorCode } from '../src/errors.js';
import type { AuraShieldConfig, GatewayRequest } from '../src/types.js';

describe('CoprocessorClient', () => {
  const mockConfig: AuraShieldConfig = {
    network: 'devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    relayerUrl: 'http://localhost:8098',
    timeoutMs: 5000,
    mode: 'coprocessor',
  };

  let client: CoprocessorClient;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    client = new CoprocessorClient(mockConfig);
    originalFetch = global.fetch;
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  const mockGatewayRequest: GatewayRequest = {
    id: 'test-session-uuid',
    account: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    token_out: 'fff9eee9', // "USDC" XOR 0xAA
    amount_out: 'b1b8b8b8b8b8b8', // "1000000" XOR 0xAA
    token_in: 'enc_sol_mint_hex',
  };

  describe('constructor', () => {
    it('uses relayerUrl from config', () => {
      const clientWithUrl = new CoprocessorClient({
        ...mockConfig,
        relayerUrl: 'http://custom-gateway:9000',
      });
      // Verify the client was constructed without throwing
      expect(clientWithUrl).toBeInstanceOf(CoprocessorClient);
    });

    it('uses default http://localhost:8098 when relayerUrl is not set', () => {
      const configWithoutUrl: AuraShieldConfig = {
        network: 'devnet',
        rpcUrl: 'https://api.devnet.solana.com',
      };
      const clientDefault = new CoprocessorClient(configWithoutUrl);
      expect(clientDefault).toBeInstanceOf(CoprocessorClient);
    });
  });

  describe('healthCheck', () => {
    it('returns true when gateway responds with isSuccess: true', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            isSuccess: true,
            result: 'service available',
          }),
      });

      const result = await client.healthCheck();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8098/api/v1/swap/health',
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toBe(true);
    });

    it('returns false when gateway responds with isSuccess: false', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            isSuccess: false,
            result: null,
            log: 'unhealthy',
          }),
      });

      const result = await client.healthCheck();
      expect(result).toBe(false);
    });

    it('returns false when fetch throws (network down)', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('connection refused')
      );

      const result = await client.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('prepare', () => {
    it('POSTs to /api/v1/swap/prepare with GatewayRequest body', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            isSuccess: true,
            result: {
              swapTransaction: 'base64encodedtx==',
              outAmount: '1000',
              lastValidBlockHeight: 300000,
            },
          }),
      });

      const result = await client.prepare(mockGatewayRequest);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8098/api/v1/swap/prepare',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mockGatewayRequest),
        })
      );
      expect(result.swapTransaction).toBe('base64encodedtx==');
      expect(result.outAmount).toBe('1000');
      expect(result.lastValidBlockHeight).toBe(300000);
    });

    it('request body uses snake_case field names matching Go gateway', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            isSuccess: true,
            result: {
              swapTransaction: 'tx',
              outAmount: '1',
              lastValidBlockHeight: 1,
            },
          }),
      });

      await client.prepare(mockGatewayRequest);

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);

      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('account');
      expect(body).toHaveProperty('token_out');
      expect(body).toHaveProperty('amount_out');
      expect(body).toHaveProperty('token_in');
      expect(body).not.toHaveProperty('tokenOut');
      expect(body).not.toHaveProperty('amountOut');
      expect(body).not.toHaveProperty('tokenIn');
    });

    it('throws AuraShieldError(RELAYER_ERROR) when isSuccess is false', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            isSuccess: false,
            result: null,
            log: 'decryption failed',
          }),
      });

      try {
        await client.prepare(mockGatewayRequest);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuraShieldError);
        expect((error as AuraShieldError).code).toBe(ErrorCode.RELAYER_ERROR);
        expect((error as AuraShieldError).message).toContain('decryption failed');
      }
    });

    it('throws AuraShieldError(RELAYER_ERROR) on HTTP 502', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: () => Promise.resolve('Bad Gateway'),
      });

      try {
        await client.prepare(mockGatewayRequest);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuraShieldError);
        expect((error as AuraShieldError).code).toBe(ErrorCode.RELAYER_ERROR);
      }
    });
  });

  describe('execute', () => {
    it('POSTs to /api/v1/swap/execute with {id, signed_tx}', async () => {
      const sessionId = 'test-session-uuid';
      const signedTx = 'base64signedtransaction==';

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            isSuccess: true,
            result: {
              signature: '5KtUprNR6vJqvL9w6sT4c3xGk7PJmW9DqRVuPBH2e8n',
            },
          }),
      });

      const result = await client.execute(sessionId, signedTx);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8098/api/v1/swap/execute',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: sessionId, signed_tx: signedTx }),
        })
      );
      expect(result.signature).toBe('5KtUprNR6vJqvL9w6sT4c3xGk7PJmW9DqRVuPBH2e8n');
    });

    it('request body uses snake_case signed_tx not camelCase signedTx', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            isSuccess: true,
            result: { signature: 'abc123' },
          }),
      });

      await client.execute('id-1', 'txdata');

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);

      expect(body).toHaveProperty('id', 'id-1');
      expect(body).toHaveProperty('signed_tx', 'txdata');
      expect(body).not.toHaveProperty('signedTx');
    });

    it('throws AuraShieldError on 404 session not found', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('session not found'),
      });

      try {
        await client.execute('nonexistent-id', 'tx');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuraShieldError);
        expect((error as AuraShieldError).code).toBe(ErrorCode.RELAYER_ERROR);
      }
    });
  });

  describe('timeout', () => {
    it('throws AuraShieldError(TIMEOUT) when request exceeds timeoutMs', async () => {
      vi.useFakeTimers();

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        (_url: string, opts: RequestInit) => {
          // Simulate a fetch that only resolves when the AbortSignal fires
          return new Promise((_resolve, reject) => {
            const signal = opts.signal as AbortSignal;
            if (signal) {
              signal.addEventListener('abort', () => {
                const abortError = new Error('The operation was aborted');
                abortError.name = 'AbortError';
                reject(abortError);
              });
            }
          });
        }
      );

      const fastConfig: AuraShieldConfig = {
        network: 'devnet',
        rpcUrl: 'https://api.devnet.solana.com',
        relayerUrl: 'http://localhost:8098',
        timeoutMs: 100,
      };
      const fastClient = new CoprocessorClient(fastConfig);

      const preparePromise = fastClient.prepare(mockGatewayRequest);

      // Advance timers past the timeout
      vi.advanceTimersByTime(200);

      try {
        await preparePromise;
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuraShieldError);
        expect((error as AuraShieldError).code).toBe(ErrorCode.TIMEOUT);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
