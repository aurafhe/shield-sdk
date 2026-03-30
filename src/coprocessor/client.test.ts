import { CoprocessorClient, GatewayError } from './client'

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

describe('coprocessor/client', () => {
  let client: CoprocessorClient

  beforeEach(() => {
    client = new CoprocessorClient('https://test-gw.example.com')
    mockFetch.mockReset()
  })

  test('health returns true when gateway is up', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ isSuccess: true, result: 'service available' }),
    })
    expect(await client.health()).toBe(true)
  })

  test('health returns false when unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    expect(await client.health()).toBe(false)
  })

  test('quote sends encrypted intent', async () => {
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

  test('prepare returns swapTransaction', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        isSuccess: true,
        result: { swapTransaction: 'base64tx', outAmount: '1500000000', lastValidBlockHeight: 123 },
      }),
    })

    const result = await client.prepare({
      id: 'test', account: 'W111',
      token_out: 'ENC_SOL', amount_out: 'ENC_1000', token_in: 'ENC_USDC',
    })
    expect(result.swapTransaction).toBe('base64tx')
  })

  test('execute returns signature', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ isSuccess: true, result: { signature: '5xAbc...' } }),
    })

    const result = await client.execute({ id: 'test', signed_tx: 'signed_base64' })
    expect(result.signature).toBe('5xAbc...')
  })

  test('submitTask sends generic encrypted task', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ isSuccess: true, result: { status: 'completed' } }),
    })

    const result = await client.submitTask({
      id: 'lending-1',
      type: 'lending',
      account: 'W111',
      encrypted: { collateral: 'ENC_1000', borrowToken: 'ENC_USDC' },
    })
    expect(result.isSuccess).toBe(true)

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/v1/tasks')
    const body = JSON.parse(init.body)
    expect(body.type).toBe('lending')
    expect(body.encrypted.collateral).toBe('ENC_1000')
  })

  test('throws GatewayError on failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ isSuccess: false, log: 'node timeout' }),
    })

    await expect(client.quote({
      id: 'x', account: 'x', token_out: 'x', amount_out: 'x', token_in: 'x',
    })).rejects.toThrow(GatewayError)
  })
})
