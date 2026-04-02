import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RelayerClient } from '../src/relayer-client.js';
import { AuraShieldError, ErrorCode } from '../src/errors.js';
import type { AuraShieldConfig, EncryptedSwap, SwapStatus } from '../src/types.js';

describe('RelayerClient', () => {
  const mockConfig: AuraShieldConfig = {
    network: 'devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    relayerUrl: 'https://test-relayer.example.com',
    timeoutMs: 5000,
  };

  let client: RelayerClient;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    client = new RelayerClient(mockConfig);
    originalFetch = global.fetch;
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  const mockEncryptedSwap: EncryptedSwap = {
    ciphertext: 'dGVzdGNpcGhlcnRleHQ=',
    nonce: 'dGVzdG5vbmNl',
    encryptionKeyId: 'nacl-v1',
    encryptedAt: Math.floor(Date.now() / 1000),
    userPublicKey: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    ephemeralPublicKey: Buffer.from(new Uint8Array(32).fill(99)).toString('base64'),
  };

  describe('submitEncryptedSwap', () => {
    it('sends POST to /api/v1/swap', async () => {
      const mockResponse = {
        swapId: 'swap-123',
        status: 'received' as SwapStatus,
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.submitEncryptedSwap(mockEncryptedSwap);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-relayer.example.com/api/v1/swap',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mockEncryptedSwap),
        })
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getSwapStatus', () => {
    it('sends GET to /api/v1/swap/:id', async () => {
      const mockResponse = {
        swapId: 'swap-123',
        status: 'executing' as SwapStatus,
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.getSwapStatus('swap-123');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-relayer.example.com/api/v1/swap/swap-123',
        expect.objectContaining({
          method: 'GET',
        })
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('awaitSettlement', () => {
    it('resolves when status becomes settled', async () => {
      const responses = [
        { swapId: 'swap-123', status: 'executing' },
        { swapId: 'swap-123', status: 'executing' },
        { swapId: 'swap-123', status: 'settled', txSignature: 'sig123' },
      ];

      let callCount = 0;
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
        const response = responses[Math.min(callCount++, responses.length - 1)];
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(response),
        });
      });

      const result = await client.awaitSettlement('swap-123', 10, 1000);

      expect(result.status).toBe('settled');
      expect(result.txSignature).toBe('sig123');
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('throws TIMEOUT when max wait exceeded', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ swapId: 'swap-123', status: 'executing' }),
        })
      );

      await expect(
        client.awaitSettlement('swap-123', 10, 50)
      ).rejects.toThrow(AuraShieldError);

      try {
        await client.awaitSettlement('swap-123', 10, 50);
      } catch (error) {
        expect((error as AuraShieldError).code).toBe(ErrorCode.TIMEOUT);
      }
    });

    it('resolves on failed status', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            swapId: 'swap-123',
            status: 'failed',
            error: 'Slippage exceeded',
          }),
      });

      const result = await client.awaitSettlement('swap-123', 10, 1000);
      expect(result.status).toBe('failed');
    });
  });

  describe('error handling', () => {
    it('wraps HTTP 500 errors in AuraShieldError with RELAYER_ERROR code', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      try {
        await client.submitEncryptedSwap(mockEncryptedSwap);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuraShieldError);
        expect((error as AuraShieldError).code).toBe(ErrorCode.RELAYER_ERROR);
        expect((error as AuraShieldError).message).toContain('500');
      }
    });

    it('wraps network errors with NETWORK_ERROR code', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('fetch failed')
      );

      try {
        await client.submitEncryptedSwap(mockEncryptedSwap);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuraShieldError);
        expect((error as AuraShieldError).code).toBe(ErrorCode.NETWORK_ERROR);
      }
    });
  });

  describe('getEncryptionPublicKey', () => {
    it('fetches and decodes base64 public key', async () => {
      const base64Key = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ publicKey: base64Key }),
      });

      const result = await client.getEncryptionPublicKey();

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(32);
    });
  });

  describe('healthCheck', () => {
    it('returns status and latency', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', version: '0.1.0' }),
      });

      const result = await client.healthCheck();

      expect(result.status).toBe('ok');
      expect(result.version).toBe('0.1.0');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});
