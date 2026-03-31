import { CoprocessorClient, GatewayError } from './client'

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

describe('coprocessor/client', () => {
  let client: CoprocessorClient

  beforeEach(() => {
    client = new CoprocessorClient('https://test-gw.example.com')
    mockFetch.mockReset()
  })

  describe('health', () => {
    test('returns true when gateway is up', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isSuccess: true, result: 'service available' }),
      })
      expect(await client.health()).toBe(true)
    })

    test('returns false when unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))
      expect(await client.health()).toBe(false)
    })
  })

  describe('quote', () => {
    test('sends encrypted intent and returns outAmount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isSuccess: true, result: '1500000000' }),
      })

      const result = await client.quote({
        id: 'test', account: 'W111',
        token_out: 'ENC_SOL', amount_out: 'ENC_1000', token_in: 'ENC_USDC',
      })
      expect(result.outAmount).toBe('1500000000')
    })

    test('rejects missing fields', async () => {
      await expect(
        client.quote({ id: '', account: 'W', token_out: 'x', amount_out: 'x', token_in: 'x' }),
      ).rejects.toThrow('Missing session id')
    })
  })

  describe('prepare', () => {
    test('returns validated SwapPrepareResult', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isSuccess: true,
          result: {
            swapTransaction: 'dGVzdA==', // valid base64
            outAmount: '1500000000',
            lastValidBlockHeight: 123,
          },
        }),
      })

      const result = await client.prepare({
        id: 'test', account: 'W111',
        token_out: 'ENC_SOL', amount_out: 'ENC_1000', token_in: 'ENC_USDC',
      })
      expect(result.swapTransaction).toBe('dGVzdA==')
      expect(result.lastValidBlockHeight).toBe(123)
    })

    test('rejects invalid swapTransaction (not base64)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isSuccess: true,
          result: {
            swapTransaction: 'not valid base64!!!',
            outAmount: '1500000000',
            lastValidBlockHeight: 123,
          },
        }),
      })

      await expect(
        client.prepare({
          id: 'test', account: 'W111',
          token_out: 'ENC_SOL', amount_out: 'ENC_1000', token_in: 'ENC_USDC',
        }),
      ).rejects.toThrow('Invalid base64')
    })

    test('rejects missing outAmount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isSuccess: true,
          result: { swapTransaction: 'dGVzdA==', outAmount: '', lastValidBlockHeight: 123 },
        }),
      })

      await expect(
        client.prepare({
          id: 'test', account: 'W111',
          token_out: 'x', amount_out: 'x', token_in: 'x',
        }),
      ).rejects.toThrow('missing outAmount')
    })

    test('rejects bad lastValidBlockHeight', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isSuccess: true,
          result: { swapTransaction: 'dGVzdA==', outAmount: '100', lastValidBlockHeight: -1 },
        }),
      })

      await expect(
        client.prepare({
          id: 'test', account: 'W111',
          token_out: 'x', amount_out: 'x', token_in: 'x',
        }),
      ).rejects.toThrow('bad lastValidBlockHeight')
    })
  })

  describe('execute', () => {
    test('returns signature on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isSuccess: true, result: { signature: '5xAbc...' } }),
      })

      const result = await client.execute({ id: 'test', signed_tx: 'dGVzdA==' })
      expect(result.signature).toBe('5xAbc...')
    })

    test('rejects missing signed_tx', async () => {
      await expect(
        client.execute({ id: 'test', signed_tx: '' }),
      ).rejects.toThrow('execute requires id and signed_tx')
    })

    test('rejects invalid base64 in signed_tx', async () => {
      await expect(
        client.execute({ id: 'test', signed_tx: 'not base64!!!' }),
      ).rejects.toThrow('Invalid base64')
    })
  })

  describe('error handling', () => {
    test('throws GatewayError on non-success response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ isSuccess: false, log: 'node timeout' }),
      })

      await expect(
        client.quote({
          id: 'x', account: 'x', token_out: 'x', amount_out: 'x', token_in: 'x',
        }),
      ).rejects.toThrow(GatewayError)
    })

    test('GatewayError has status and log', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ isSuccess: false, log: 'bad request' }),
      })

      try {
        await client.quote({ id: 'x', account: 'x', token_out: 'x', amount_out: 'x', token_in: 'x' })
        fail('should throw')
      } catch (e) {
        const err = e as GatewayError
        expect(err.status).toBe(400)
        expect(err.log).toBe('bad request')
      }
    })
  })
})
