import { CoprocessorClient, GatewayError } from './client'

// Mock fetch globally
const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

describe('CoprocessorClient', () => {
  let client: CoprocessorClient

  beforeEach(() => {
    client = new CoprocessorClient('https://test-gateway.example.com')
    mockFetch.mockReset()
  })

  describe('health', () => {
    test('returns true when gateway is healthy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isSuccess: true, result: 'service available' }),
      })

      expect(await client.health()).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-gateway.example.com/api/v1/swap/health',
        expect.objectContaining({ method: 'GET' }),
      )
    })

    test('returns false when gateway is unreachable', async () => {
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

      const intent = {
        id: 'test-id',
        account: 'Wallet111',
        token_out: 'ENC_SOL',
        amount_out: 'ENC_1000',
        token_in: 'ENC_USDC',
      }

      const result = await client.quote(intent)
      expect(result.outAmount).toBe('1500000000')

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://test-gateway.example.com/api/v1/quote')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body)).toEqual(intent)
    })
  })

  describe('prepare', () => {
    test('returns PrepareResult with swapTransaction', async () => {
      const prepareResponse = {
        swapTransaction: 'base64_unsigned_tx',
        outAmount: '1500000000',
        lastValidBlockHeight: 123456,
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isSuccess: true, result: prepareResponse }),
      })

      const result = await client.prepare({
        id: 'test-id',
        account: 'Wallet111',
        token_out: 'ENC_SOL',
        amount_out: 'ENC_1000',
        token_in: 'ENC_USDC',
      })

      expect(result.swapTransaction).toBe('base64_unsigned_tx')
      expect(result.outAmount).toBe('1500000000')
      expect(result.lastValidBlockHeight).toBe(123456)
    })
  })

  describe('execute', () => {
    test('submits signed tx and returns signature', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isSuccess: true,
          result: { signature: '5xAbC123...' },
        }),
      })

      const result = await client.execute({
        id: 'test-id',
        signed_tx: 'base64_signed_tx',
      })

      expect(result.signature).toBe('5xAbC123...')
    })
  })

  describe('error handling', () => {
    test('throws GatewayError on non-success response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({
          isSuccess: false,
          log: 'coprocessor error: node timeout',
        }),
      })

      await expect(
        client.quote({
          id: 'x',
          account: 'x',
          token_out: 'x',
          amount_out: 'x',
          token_in: 'x',
        }),
      ).rejects.toThrow(GatewayError)
    })

    test('GatewayError contains status and log', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          isSuccess: false,
          log: 'invalid request: missing token_out',
        }),
      })

      try {
        await client.quote({
          id: 'x',
          account: 'x',
          token_out: '',
          amount_out: 'x',
          token_in: 'x',
        })
        fail('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(GatewayError)
        const err = e as GatewayError
        expect(err.status).toBe(400)
        expect(err.log).toContain('invalid request')
      }
    })
  })
})
