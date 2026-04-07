import { AfheClient, AfheApiError } from './index'

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AfheClient', () => {
  let client: AfheClient

  beforeEach(() => {
    mockFetch.mockReset()
    client = new AfheClient({ baseUrl: 'https://localhost:8443' })
  })

  test('constructor requires baseUrl', () => {
    expect(() => new AfheClient({ baseUrl: '' })).toThrow('baseUrl is required')
  })

  test('constructor strips trailing slashes', () => {
    const c = new AfheClient({ baseUrl: 'https://localhost:8443///' })
    mockOk({ status: 'ok' })
    c.health()
    expect(mockFetch.mock.calls[0][0]).toBe('https://localhost:8443/health')
  })

  // ---- health / discovery ------------------------------------------------

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

  // ---- init / keys -------------------------------------------------------

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

  // ---- encrypt / decrypt -------------------------------------------------

  test('encryptInt calls POST /encrypt/int', async () => {
    mockOk({ ciphertext: 'CT_17' })
    const ct = await client.encryptInt(17)
    expect(ct).toBe('CT_17')
    expect(mockFetch.mock.calls[0][0]).toContain('/encrypt/int')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.value).toBe('17')
    expect(body.public).toBe(false)
  })

  test('encryptPublicFloat uses public: true', async () => {
    mockOk({ ciphertext: 'CT_PUB' })
    await client.encryptPublicFloat(3.14)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.public).toBe(true)
    expect(mockFetch.mock.calls[0][0]).toContain('/encrypt/float')
  })

  test('encryptString sends string domain', async () => {
    mockOk({ ciphertext: 'CT_STR' })
    await client.encryptString('hello')
    expect(mockFetch.mock.calls[0][0]).toContain('/encrypt/string')
  })

  test('encryptBinary sends binary domain', async () => {
    mockOk({ ciphertext: 'CT_BIN' })
    await client.encryptBinary(25)
    expect(mockFetch.mock.calls[0][0]).toContain('/encrypt/binary')
  })

  test('decryptInt calls POST /decrypt/int', async () => {
    mockOk({ plaintext: '42' })
    const pt = await client.decryptInt('CT_SUM')
    expect(pt).toBe('42')
    expect(mockFetch.mock.calls[0][0]).toContain('/decrypt/int')
  })

  test('decryptFloat', async () => {
    mockOk({ plaintext: '3.14' })
    expect(await client.decryptFloat('CT')).toBe('3.14')
  })

  test('decryptString', async () => {
    mockOk({ plaintext: 'hello' })
    expect(await client.decryptString('CT')).toBe('hello')
  })

  test('decryptBinary', async () => {
    mockOk({ plaintext: '25' })
    expect(await client.decryptBinary('CT')).toBe('25')
  })

  // ---- arithmetic --------------------------------------------------------

  test('addInt dispatches AddCipherInt', async () => {
    mockOk({ result: 'CT_SUM' })
    const ct = await client.addInt('CA', 'CB')
    expect(ct).toBe('CT_SUM')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.fn).toBe('AddCipherInt')
    expect(body.args).toEqual(['CA', 'CB'])
  })

  test('subFloat dispatches SubstractCipherFloat', async () => {
    mockOk({ result: 'R' })
    await client.subFloat('A', 'B')
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('SubstractCipherFloat')
  })

  test('mulInt dispatches MultiplyCipherInt', async () => {
    mockOk({ result: 'R' })
    await client.mulInt('A', 'B')
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('MultiplyCipherInt')
  })

  test('divFloat dispatches DivideCipherFloat', async () => {
    mockOk({ result: 'R' })
    await client.divFloat('A', 'B')
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('DivideCipherFloat')
  })

  // ---- bitwise -----------------------------------------------------------

  test('xor dispatches XORCipher', async () => {
    mockOk({ result: 'R' })
    await client.xor('A', 'B')
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('XORCipher')
  })

  test('not dispatches NOTCipher with 1 arg', async () => {
    mockOk({ result: 'R' })
    await client.not('A')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.fn).toBe('NOTCipher')
    expect(body.args).toEqual(['A'])
  })

  test('shiftLeft coerces bias to string', async () => {
    mockOk({ result: 'R' })
    await client.shiftLeft('C', 2)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.fn).toBe('ShiftLeft')
    expect(body.args).toEqual(['C', '2'])
  })

  test('cmux passes 3 args', async () => {
    mockOk({ result: 'R' })
    await client.cmux('S', 'A', 'B')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.fn).toBe('CMux')
    expect(body.args).toEqual(['S', 'A', 'B'])
  })

  // ---- cross-type --------------------------------------------------------

  test('compare dispatches Compare', async () => {
    mockOk({ result: 'R' })
    await client.compare('A', 'B')
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('Compare')
  })

  test('abs dispatches ABSCipher', async () => {
    mockOk({ result: 'R' })
    await client.abs('A')
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('ABSCipher')
  })

  // ---- string ops --------------------------------------------------------

  test('concatString dispatches ConcatString', async () => {
    mockOk({ result: 'R' })
    await client.concatString('A', 'B')
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('ConcatString')
  })

  test('substring coerces start/end to strings', async () => {
    mockOk({ result: 'R' })
    await client.substring('C', 0, 5)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.fn).toBe('Substring')
    expect(body.args).toEqual(['C', '0', '5'])
  })

  // ---- scientific --------------------------------------------------------

  test('sqrt dispatches SqrtCipher', async () => {
    mockOk({ result: 'R' })
    await client.sqrt('C')
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('SqrtCipher')
  })

  test('power passes n and m as strings', async () => {
    mockOk({ result: 'R' })
    await client.power('C', 3, 1)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.fn).toBe('PowerCipher')
    expect(body.args).toEqual(['C', '3', '1'])
  })

  test('sin dispatches SinCipher', async () => {
    mockOk({ result: 'R' })
    await client.sin('C')
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).fn).toBe('SinCipher')
  })

  // ---- signing -----------------------------------------------------------

  test('genSign dispatches GenSign', async () => {
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
  })

  // ---- error handling ----------------------------------------------------

  test('non-2xx throws AfheApiError with server message', async () => {
    mockError(400, { error: 'unknown fn "Foo"' })
    await expect(client.call('Foo', [])).rejects.toThrow(AfheApiError)
    try {
      mockError(400, { error: 'unknown fn "Bar"' })
      await client.call('Bar', [])
    } catch (err) {
      const e = err as AfheApiError
      expect(e.status).toBe(400)
      expect(e.message).toBe('unknown fn "Bar"')
    }
  })

  test('non-JSON response throws AfheApiError', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => 'not json',
    })
    await expect(client.health()).rejects.toThrow('non-JSON response')
  })

  // ---- timeout -----------------------------------------------------------

  test('timeout creates AbortController', async () => {
    const c = new AfheClient({ baseUrl: 'https://x', timeoutMs: 5000 })
    mockOk({ status: 'ok' })
    await c.health()
    // The call should have been made (timeout didn't fire)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
