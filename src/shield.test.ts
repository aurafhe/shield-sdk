import { AuraShield } from './shield'

// Mock fetch
const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

const stubWallet = {
  publicKey: {
    toString: () => 'TestWallet1111111111111111111111111111111111',
    toBase58: () => 'TestWallet1111111111111111111111111111111111',
  },
  signTransaction: jest.fn(async <T>(tx: T): Promise<T> => `signed_${tx}` as unknown as T),
}

describe('AuraShield', () => {
  let shield: AuraShield

  beforeEach(() => {
    mockFetch.mockReset()
    stubWallet.signTransaction.mockClear()
    shield = new AuraShield({
      rpc: 'https://api.devnet.solana.com',
      wallet: stubWallet,
      gatewayUrl: 'https://test-gateway.example.com',
    })
  })

  test('init() loads AFHE WASM', async () => {
    expect(shield.ready).toBe(false)
    await shield.init()
    expect(shield.ready).toBe(true)
  })

  test('encrypt() returns EncryptedIntent with wallet address', async () => {
    await shield.init()
    const intent = shield.encrypt({
      tokenOut: 'SOL',
      amountOut: 1_000_000_000,
      tokenIn: 'USDC',
    })

    expect(intent.account).toBe('TestWallet1111111111111111111111111111111111')
    expect(intent.id).toMatch(/^shield_/)
    expect(intent.token_out).not.toBe('SOL')
    expect(intent.amount_out).not.toBe('1000000000')
    expect(intent.token_in).not.toBe('USDC')
  })

  test('encrypt() throws if not initialized', () => {
    expect(() =>
      shield.encrypt({ tokenOut: 'SOL', amountOut: 100, tokenIn: 'USDC' }),
    ).toThrow('not initialized')
  })

  test('getQuote() calls /api/v1/quote with encrypted data', async () => {
    await shield.init()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ isSuccess: true, result: '1500000000' }),
    })

    const quote = await shield.getQuote({
      tokenOut: 'SOL',
      amountOut: 1_000_000_000,
      tokenIn: 'USDC',
    })

    expect(quote.outAmount).toBe('1500000000')

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://test-gateway.example.com/api/v1/quote')
    const body = JSON.parse(init.body)
    // Verify encrypted fields are sent, not plaintext
    expect(body.token_out).not.toBe('SOL')
    expect(body.account).toBe('TestWallet1111111111111111111111111111111111')
  })

  test('swap() runs full encrypt→prepare→sign→execute flow', async () => {
    await shield.init()

    // Mock prepare
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        isSuccess: true,
        result: {
          swapTransaction: 'base64_unsigned_tx',
          outAmount: '1500000000',
          lastValidBlockHeight: 999,
        },
      }),
    })

    // Mock execute
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        isSuccess: true,
        result: { signature: '3xYz789...' },
      }),
    })

    const result = await shield.swap({
      tokenOut: 'SOL',
      amountOut: 1_000_000_000,
      tokenIn: 'USDC',
    })

    expect(result.signature).toBe('3xYz789...')
    expect(result.outAmount).toBe('1500000000')
    expect(result.sessionId).toMatch(/^shield_/)

    // Verify wallet was asked to sign
    expect(stubWallet.signTransaction).toHaveBeenCalledWith('base64_unsigned_tx')

    // Verify 2 API calls: prepare + execute
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch.mock.calls[0][0]).toContain('/api/v1/swap/prepare')
    expect(mockFetch.mock.calls[1][0]).toContain('/api/v1/swap/execute')
  })

  test('health() returns true when gateway is up', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ isSuccess: true, result: 'service available' }),
    })

    expect(await shield.health()).toBe(true)
  })
})
