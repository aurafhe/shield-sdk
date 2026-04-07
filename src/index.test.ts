import { AfheClient, AfheApiError } from './index'
import type { Ciphertext } from './index'

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = jest.fn()
;(globalThis as Record<string, unknown>).fetch = mockFetch

function mockOk<T>(body: T) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  })
}

function mockError(status: number, body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => JSON.stringify(body),
  })
}

function mockNetworkError(msg = 'ECONNREFUSED') {
  mockFetch.mockRejectedValueOnce(new Error(msg))
}

function mockEmptyOk() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => '',
  })
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('AfheClient — constructor', () => {
  beforeEach(() => mockFetch.mockReset())

  test('requires baseUrl', () => {
    expect(() => new AfheClient({ baseUrl: '' })).toThrow('baseUrl is required')
  })

  test('strips trailing slashes', () => {
    const c = new AfheClient({ baseUrl: 'https://localhost:8443///' })
    mockOk({ status: 'ok' })
    c.health()
    expect(mockFetch.mock.calls[0][0]).toBe('https://localhost:8443/health')
  })

  test('accepts custom fetch implementation', async () => {
    const customFetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => '{"status":"ok"}',
    })
    const c = new AfheClient({ baseUrl: 'https://x', fetch: customFetch as unknown as typeof fetch })
    await c.health()
    expect(customFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('sends custom headers on POST requests', async () => {
    const c = new AfheClient({ baseUrl: 'https://x', headers: { 'X-Tenant': 'acme' } })
    mockOk({ ok: true })
    await c.init()
    const headers = mockFetch.mock.calls[0][1].headers
    expect(headers['X-Tenant']).toBe('acme')
    expect(headers['Content-Type']).toBe('application/json')
  })

  test('does NOT send Content-Type on GET requests', async () => {
    const c = new AfheClient({ baseUrl: 'https://x' })
    mockOk({ status: 'ok' })
    await c.health()
    const headers = mockFetch.mock.calls[0][1].headers
    expect(headers['Content-Type']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Health & discovery
// ---------------------------------------------------------------------------

describe('AfheClient — health & discovery', () => {
  let client: AfheClient
  beforeEach(() => { mockFetch.mockReset(); client = new AfheClient({ baseUrl: 'https://x' }) })

  test('health returns status', async () => {
    mockOk({ status: 'ok' })
    const res = await client.health()
    expect(res.status).toBe('ok')
    expect(mockFetch.mock.calls[0][0]).toContain('/health')
    expect(mockFetch.mock.calls[0][1].method).toBe('GET')
  })

  test('functions returns arity groups', async () => {
    mockOk({ arity1: ['EncryptInt'], arity2: ['AddCipherInt'], arity3: ['CMux'] })
    const fns = await client.functions()
    expect(fns.arity1).toContain('EncryptInt')
    expect(fns.arity2).toContain('AddCipherInt')
    expect(fns.arity3).toContain('CMux')
  })
})

// ---------------------------------------------------------------------------
// Init / keys
// ---------------------------------------------------------------------------

describe('AfheClient — init / keys', () => {
  let client: AfheClient
  beforeEach(() => { mockFetch.mockReset(); client = new AfheClient({ baseUrl: 'https://x' }) })

  test('init calls POST /init', async () => {
    mockOk({ ok: true })
    const res = await client.init()
    expect(res.ok).toBe(true)
    expect(mockFetch.mock.calls[0][1].method).toBe('POST')
  })

  test('keygen with defaults', async () => {
    mockOk({ skipped: true, skb_file: 'f/skb', pkb_file: 'f/pkb', dictb_file: 'f/dictb' })
    const res = await client.keygen()
    expect(res.skipped).toBe(true)
  })

  test('keygen passes options', async () => {
    mockOk({ skipped: false, skb_file: 'x', pkb_file: 'x', dictb_file: 'x' })
    await client.keygen({ force: true, m: 2 })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.force).toBe(true)
    expect(body.m).toBe(2)
  })

  test('load returns loaded keys', async () => {
    mockOk({ loaded: ['skb', 'pkb', 'dictb'] })
    const res = await client.load({ skb: 'f/skb', pkb: 'f/pkb', dictb: 'f/dictb' })
    expect(res.loaded).toEqual(['skb', 'pkb', 'dictb'])
  })
})

// ---------------------------------------------------------------------------
// Encrypt / decrypt
// ---------------------------------------------------------------------------

describe('AfheClient — encrypt / decrypt', () => {
  let client: AfheClient
  beforeEach(() => { mockFetch.mockReset(); client = new AfheClient({ baseUrl: 'https://x' }) })

  test('encryptInt calls POST /encrypt/int with value as string', async () => {
    mockOk({ ciphertext: 'CT_17' })
    const ct = await client.encryptInt(17)
    expect(ct).toBe('CT_17')
    expect(mockFetch.mock.calls[0][0]).toContain('/encrypt/int')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.value).toBe('17')
    expect(body.public).toBe(false)
  })

  test('encryptInt with value 0 sends "0"', async () => {
    mockOk({ ciphertext: 'CT_0' })
    await client.encryptInt(0)
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).value).toBe('0')
  })

  test('encryptFloat sends float domain', async () => {
    mockOk({ ciphertext: 'CT' })
    await client.encryptFloat(3.14)
    expect(mockFetch.mock.calls[0][0]).toContain('/encrypt/float')
  })

  test('encryptString sends string domain', async () => {
    mockOk({ ciphertext: 'CT' })
    await client.encryptString('hello')
    expect(mockFetch.mock.calls[0][0]).toContain('/encrypt/string')
  })

  test('encryptString with empty string sends ""', async () => {
    mockOk({ ciphertext: 'CT' })
    await client.encryptString('')
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).value).toBe('')
  })

  test('encryptBinary sends binary domain', async () => {
    mockOk({ ciphertext: 'CT' })
    await client.encryptBinary(25)
    expect(mockFetch.mock.calls[0][0]).toContain('/encrypt/binary')
  })

  test('encryptPublicInt uses public: true', async () => {
    mockOk({ ciphertext: 'CT_PUB' })
    await client.encryptPublicInt(42)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.public).toBe(true)
  })

  test('encryptPublicFloat uses public: true', async () => {
    mockOk({ ciphertext: 'CT' })
    await client.encryptPublicFloat(3.14)
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).public).toBe(true)
  })

  test('encryptPublicString uses public: true', async () => {
    mockOk({ ciphertext: 'CT' })
    await client.encryptPublicString('hello')
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).public).toBe(true)
  })

  test('encryptPublicBinary uses public: true', async () => {
    mockOk({ ciphertext: 'CT' })
    await client.encryptPublicBinary(25)
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).public).toBe(true)
  })

  test('encryptInt rejects NaN', async () => {
    await expect(client.encryptInt(NaN)).rejects.toThrow('invalid value')
  })

  test('encryptFloat rejects Infinity', async () => {
    await expect(client.encryptFloat(Infinity)).rejects.toThrow('invalid value')
  })

  test('encryptFloat rejects -Infinity', async () => {
    await expect(client.encryptFloat(-Infinity)).rejects.toThrow('invalid value')
  })

  test('decryptInt calls POST /decrypt/int', async () => {
    mockOk({ plaintext: '42' })
    const pt = await client.decryptInt('CT_SUM' as Ciphertext)
    expect(pt).toBe('42')
    expect(mockFetch.mock.calls[0][0]).toContain('/decrypt/int')
  })

  test('decryptFloat', async () => {
    mockOk({ plaintext: '3.14' })
    expect(await client.decryptFloat('CT' as Ciphertext)).toBe('3.14')
  })

  test('decryptString', async () => {
    mockOk({ plaintext: 'hello' })
    expect(await client.decryptString('CT' as Ciphertext)).toBe('hello')
  })

  test('decryptBinary', async () => {
    mockOk({ plaintext: '25' })
    expect(await client.decryptBinary('CT' as Ciphertext)).toBe('25')
  })
})

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

describe('AfheClient — arithmetic', () => {
  let client: AfheClient
  beforeEach(() => { mockFetch.mockReset(); client = new AfheClient({ baseUrl: 'https://x' }) })

  const CT = (v: string) => v as Ciphertext

  test('addInt dispatches AddCipherInt', async () => {
    mockOk({ result: 'CT_SUM' })
    const ct = await client.addInt(CT('CA'), CT('CB'))
    expect(ct).toBe('CT_SUM')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.fn).toBe('AddCipherInt')
    expect(body.args).toEqual(['CA', 'CB'])
  })

  test('addFloat dispatches AddCipherFloat', async () => {
    mockOk({ result: 'R' })
    await client.addFloat(CT('A'), CT('B'))
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('AddCipherFloat')
  })

  test('subInt dispatches SubstractCipherInt', async () => {
    mockOk({ result: 'R' })
    await client.subInt(CT('A'), CT('B'))
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('SubstractCipherInt')
  })

  test('subFloat dispatches SubstractCipherFloat', async () => {
    mockOk({ result: 'R' })
    await client.subFloat(CT('A'), CT('B'))
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('SubstractCipherFloat')
  })

  test('mulInt dispatches MultiplyCipherInt', async () => {
    mockOk({ result: 'R' })
    await client.mulInt(CT('A'), CT('B'))
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('MultiplyCipherInt')
  })

  test('mulFloat dispatches MultiplyCipherFloat', async () => {
    mockOk({ result: 'R' })
    await client.mulFloat(CT('A'), CT('B'))
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('MultiplyCipherFloat')
  })

  test('divInt dispatches DivideCipherInt', async () => {
    mockOk({ result: 'R' })
    await client.divInt(CT('A'), CT('B'))
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('DivideCipherInt')
  })

  test('divFloat dispatches DivideCipherFloat', async () => {
    mockOk({ result: 'R' })
    await client.divFloat(CT('A'), CT('B'))
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('DivideCipherFloat')
  })
})

// ---------------------------------------------------------------------------
// Bitwise
// ---------------------------------------------------------------------------

describe('AfheClient — bitwise', () => {
  let client: AfheClient
  beforeEach(() => { mockFetch.mockReset(); client = new AfheClient({ baseUrl: 'https://x' }) })
  const CT = (v: string) => v as Ciphertext

  test('xor dispatches XORCipher', async () => {
    mockOk({ result: 'R' })
    await client.xor(CT('A'), CT('B'))
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('XORCipher')
  })

  test('and dispatches ANDCipher', async () => {
    mockOk({ result: 'R' })
    await client.and(CT('A'), CT('B'))
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('ANDCipher')
  })

  test('or dispatches ORCipher', async () => {
    mockOk({ result: 'R' })
    await client.or(CT('A'), CT('B'))
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('ORCipher')
  })

  test('not dispatches NOTCipher with 1 arg', async () => {
    mockOk({ result: 'R' })
    await client.not(CT('A'))
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.fn).toBe('NOTCipher')
    expect(body.args).toEqual(['A'])
  })

  test('shiftLeft coerces bias to string', async () => {
    mockOk({ result: 'R' })
    await client.shiftLeft(CT('C'), 2)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.fn).toBe('ShiftLeft')
    expect(body.args).toEqual(['C', '2'])
  })

  test('shiftRight dispatches ShiftRight', async () => {
    mockOk({ result: 'R' })
    await client.shiftRight(CT('C'), '3')
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('ShiftRight')
  })

  test('rotateLeft dispatches RotateLeft', async () => {
    mockOk({ result: 'R' })
    await client.rotateLeft(CT('C'), 4)
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('RotateLeft')
  })

  test('rotateRight dispatches RotateRight', async () => {
    mockOk({ result: 'R' })
    await client.rotateRight(CT('C'), 4)
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('RotateRight')
  })

  test('cmux passes 3 args', async () => {
    mockOk({ result: 'R' })
    await client.cmux(CT('S'), CT('A'), CT('B'))
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.fn).toBe('CMux')
    expect(body.args).toEqual(['S', 'A', 'B'])
  })
})

// ---------------------------------------------------------------------------
// Cross-type, string, scientific
// ---------------------------------------------------------------------------

describe('AfheClient — cross-type / string / scientific', () => {
  let client: AfheClient
  beforeEach(() => { mockFetch.mockReset(); client = new AfheClient({ baseUrl: 'https://x' }) })
  const CT = (v: string) => v as Ciphertext

  test('compare dispatches Compare', async () => {
    mockOk({ result: 'R' })
    await client.compare(CT('A'), CT('B'))
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('Compare')
  })

  test('abs dispatches ABSCipher', async () => {
    mockOk({ result: 'R' })
    await client.abs(CT('A'))
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('ABSCipher')
  })

  test('concatString dispatches ConcatString', async () => {
    mockOk({ result: 'R' })
    await client.concatString(CT('A'), CT('B'))
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('ConcatString')
  })

  test('substring coerces start/end to strings', async () => {
    mockOk({ result: 'R' })
    await client.substring(CT('C'), 0, 5)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.fn).toBe('Substring')
    expect(body.args).toEqual(['C', '0', '5'])
  })

  test('sqrt dispatches SqrtCipher', async () => {
    mockOk({ result: 'R' })
    await client.sqrt(CT('C'))
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('SqrtCipher')
  })

  test('log dispatches LogCipher', async () => {
    mockOk({ result: 'R' })
    await client.log(CT('C'))
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('LogCipher')
  })

  test('exp dispatches ExpCipher', async () => {
    mockOk({ result: 'R' })
    await client.exp(CT('C'))
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('ExpCipher')
  })

  test('power passes n and m as strings', async () => {
    mockOk({ result: 'R' })
    await client.power(CT('C'), 3, 1)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.fn).toBe('PowerCipher')
    expect(body.args).toEqual(['C', '3', '1'])
  })

  test.each([
    ['sin', 'SinCipher'],
    ['cos', 'CosCipher'],
    ['tan', 'TanCipher'],
    ['asin', 'AsinCipher'],
    ['acos', 'AcosCipher'],
    ['atan', 'AtanCipher'],
    ['sinh', 'SinhCipher'],
    ['cosh', 'CoshCipher'],
    ['tanh', 'TanhCipher'],
    ['asinh', 'AsinhCipher'],
    ['acosh', 'AcoshCipher'],
    ['atanh', 'AtanhCipher'],
  ] as const)('%s dispatches %s', async (method, fn) => {
    mockOk({ result: 'R' })
    await (client[method] as (c: Ciphertext) => Promise<Ciphertext>)(CT('C'))
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe(fn)
  })
})

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

describe('AfheClient — signing', () => {
  let client: AfheClient
  beforeEach(() => { mockFetch.mockReset(); client = new AfheClient({ baseUrl: 'https://x' }) })

  test('genSign dispatches GenSign via /call', async () => {
    mockOk({ result: 'SIG' })
    const sig = await client.genSign('hello')
    expect(sig).toBe('SIG')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.fn).toBe('GenSign')
    expect(body.args).toEqual(['hello'])
  })

  test('verify calls POST /verify', async () => {
    mockOk({ valid: true })
    const v = await client.verify('msg', 'sig')
    expect(v).toBe(true)
    expect(mockFetch.mock.calls[0][0]).toContain('/verify')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.input).toBe('msg')
    expect(body.sign).toBe('sig')
  })

  test('verifySign is an alias for verify', async () => {
    mockOk({ valid: false })
    const v = await client.verifySign('msg', 'badsig')
    expect(v).toBe(false)
    expect(mockFetch.mock.calls[0][0]).toContain('/verify')
  })
})

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('AfheClient — error handling', () => {
  let client: AfheClient
  beforeEach(() => { mockFetch.mockReset(); client = new AfheClient({ baseUrl: 'https://x' }) })

  test('non-2xx throws AfheApiError with server error message', async () => {
    mockError(400, { error: 'unknown fn "Foo"' })
    try {
      await client.call('Foo', [])
      fail('should throw')
    } catch (err) {
      expect(err).toBeInstanceOf(AfheApiError)
      const e = err as AfheApiError
      expect(e.status).toBe(400)
      expect(e.message).toBe('unknown fn "Foo"')
      expect(e.name).toBe('AfheApiError')
      expect(e.body).toEqual({ error: 'unknown fn "Foo"' })
    }
  })

  test('non-2xx without error field uses generic message', async () => {
    mockError(503, { detail: 'overloaded' })
    try {
      await client.health()
      fail('should throw')
    } catch (err) {
      const e = err as AfheApiError
      expect(e.status).toBe(503)
      expect(e.message).toContain('HTTP 503')
    }
  })

  test('non-JSON response throws AfheApiError', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, text: async () => 'not json',
    })
    await expect(client.health()).rejects.toThrow('non-JSON response')
  })

  test('empty 200 response throws AfheApiError', async () => {
    mockEmptyOk()
    await expect(client.health()).rejects.toThrow('empty response body')
  })

  test('network error (fetch rejects) wraps in AfheApiError with status 0', async () => {
    mockNetworkError('ECONNREFUSED')
    try {
      await client.health()
      fail('should throw')
    } catch (err) {
      expect(err).toBeInstanceOf(AfheApiError)
      const e = err as AfheApiError
      expect(e.status).toBe(0)
      expect(e.message).toContain('ECONNREFUSED')
      expect(e.message).toContain('network error')
    }
  })

  test('DNS failure wraps in AfheApiError', async () => {
    mockNetworkError('getaddrinfo ENOTFOUND api.afhe.io')
    await expect(client.health()).rejects.toThrow('network error')
  })

  test('AfheApiError instanceof works correctly', async () => {
    mockError(400, { error: 'bad' })
    try {
      await client.call('X', [])
    } catch (err) {
      expect(err instanceof AfheApiError).toBe(true)
      expect(err instanceof Error).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Timeout & signals
// ---------------------------------------------------------------------------

describe('AfheClient — timeout & signals', () => {
  beforeEach(() => mockFetch.mockReset())

  test('timeout creates AbortController', async () => {
    const c = new AfheClient({ baseUrl: 'https://x', timeoutMs: 5000 })
    mockOk({ status: 'ok' })
    await c.health()
    expect(mockFetch).toHaveBeenCalledTimes(1)
    // Signal should be passed to fetch
    expect(mockFetch.mock.calls[0][1].signal).toBeDefined()
  })

  test('user signal is passed when no timeout', async () => {
    const c = new AfheClient({ baseUrl: 'https://x' })
    const controller = new AbortController()
    mockOk({ status: 'ok' })
    await c.health(controller.signal)
    expect(mockFetch.mock.calls[0][1].signal).toBe(controller.signal)
  })

  test('already-aborted signal rejects immediately', async () => {
    const c = new AfheClient({ baseUrl: 'https://x' })
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    mockFetch.mockRejectedValueOnce(new Error('cancelled'))
    await expect(c.health(controller.signal)).rejects.toThrow('network error')
  })
})

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

describe('AfheClient — retries', () => {
  beforeEach(() => mockFetch.mockReset())

  jest.setTimeout(15_000)

  test('retries on 5xx then succeeds', async () => {
    const c = new AfheClient({ baseUrl: 'https://x', retries: 2 })
    mockError(503, { error: 'overloaded' })
    mockOk({ status: 'ok' })
    const res = await c.health()
    expect(res.status).toBe('ok')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  test('does NOT retry on 4xx', async () => {
    const c = new AfheClient({ baseUrl: 'https://x', retries: 2 })
    mockError(400, { error: 'bad request' })
    await expect(c.health()).rejects.toThrow('bad request')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  test('retries on network error then succeeds', async () => {
    const c = new AfheClient({ baseUrl: 'https://x', retries: 1 })
    mockNetworkError('ECONNREFUSED')
    mockOk({ status: 'ok' })
    const res = await c.health()
    expect(res.status).toBe('ok')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  test('exhausts retries and throws last error', async () => {
    const c = new AfheClient({ baseUrl: 'https://x', retries: 1 })
    mockNetworkError('fail1')
    mockNetworkError('fail2')
    await expect(c.health()).rejects.toThrow('fail2')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  test('no retries by default', async () => {
    const c = new AfheClient({ baseUrl: 'https://x' })
    mockNetworkError('fail')
    await expect(c.health()).rejects.toThrow()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

describe('AfheClient — exports', () => {
  test('default export is AfheClient', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('./index')
    expect(mod.default).toBe(mod.AfheClient)
  })

  test('AfheApiError is exported', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('./index')
    expect(mod.AfheApiError).toBeDefined()
    expect(new mod.AfheApiError('x', 0, null)).toBeInstanceOf(Error)
  })
})
