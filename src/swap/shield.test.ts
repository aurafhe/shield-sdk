import { AuraShield } from './shield'

// Suppress console.warn for stub mode
beforeAll(() => { jest.spyOn(console, 'warn').mockImplementation(() => {}) })
afterAll(() => { jest.restoreAllMocks() })

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

const stubWallet = {
  publicKey: {
    toString: () => 'TestWallet111111111111111111111111111111111',
    toBase58: () => 'TestWallet111111111111111111111111111111111',
  },
  signTransaction: jest.fn(async <T>(_tx: T): Promise<T> => {
    return 'c2lnbmVkVHJhbnNhY3Rpb24=' as unknown as T
  }),
}

describe('swap/AuraShield', () => {
  let shield: AuraShield

  beforeEach(() => {
    mockFetch.mockReset()
    stubWallet.signTransaction.mockClear()
    shield = new AuraShield({
      rpc: 'https://api.devnet.solana.com',
      wallet: stubWallet,
      gatewayUrl: 'https://test-gw.example.com',
    })
  })

  test('init loads AFHE', async () => {
    expect(shield.ready).toBe(false)
    await shield.init()
    expect(shield.ready).toBe(true)
  })

  test('encrypt produces truly opaque fields', async () => {
    await shield.init()
    const intent = shield.encrypt({ tokenOut: 'SOL', amountOut: 1e9, tokenIn: 'USDC' })

    expect(intent.id).toMatch(/^shield_/)
    expect(intent.account).toBe('TestWallet111111111111111111111111111111111')
    // Must NOT contain plaintext in any form
    expect(intent.token_out).not.toContain('SOL')
    expect(intent.token_out).not.toContain('534f4c') // hex of SOL
    expect(intent.amount_out).not.toContain('1000000000')
    expect(intent.amount_out).not.toContain('3b9aca00') // hex
    expect(intent.token_in).not.toContain('USDC')
    expect(intent.token_in).not.toContain('55534443') // hex
    // Must start with stub header (opaque)
    expect(intent.token_out).toContain('AFHE_STUB_v1')
  })

  test('stubMode is true in dev', async () => {
    await shield.init()
    expect(shield.stubMode).toBe(true)
  })

  test('encrypt throws if not initialized', () => {
    expect(() =>
      shield.encrypt({ tokenOut: 'SOL', amountOut: 100, tokenIn: 'USDC' }),
    ).toThrow('not initialized')
  })

  test('swap runs full flow', async () => {
    await shield.init()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        isSuccess: true,
        result: { swapTransaction: 'dGVzdHR4cGF5bG9hZA==', outAmount: '1500000000', lastValidBlockHeight: 999 },
      }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ isSuccess: true, result: { signature: '3xYz...' } }),
    })

    const result = await shield.swap({ tokenOut: 'SOL', amountOut: 1e9, tokenIn: 'USDC' })

    expect(result.signature).toBe('3xYz...')
    expect(result.outAmount).toBe('1500000000')
    expect(result.sessionId).toMatch(/^shield_/)
    expect(stubWallet.signTransaction).toHaveBeenCalledWith('dGVzdHR4cGF5bG9hZA==')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  test('getQuote calls /api/v1/quote', async () => {
    await shield.init()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ isSuccess: true, result: '1500000000' }),
    })

    const quote = await shield.getQuote({ tokenOut: 'SOL', amountOut: 1e9, tokenIn: 'USDC' })
    expect(quote.outAmount).toBe('1500000000')
    expect(mockFetch.mock.calls[0][0]).toContain('/api/v1/quote')
  })
})
