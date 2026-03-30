import {
  initAfhe,
  isAfheReady,
  afheVersion,
  encryptInt,
  encryptString,
  add,
  subtract,
  multiply,
  divide,
  compareEnc,
  xor,
  sm3,
  sign,
  verify,
} from './encrypt'

describe('core/encrypt', () => {
  beforeAll(async () => {
    await initAfhe()
  })

  test('initAfhe loads the engine', () => {
    expect(isAfheReady()).toBe(true)
    expect(afheVersion()).toMatch(/^\d+\.\d+\.\d+/)
  })

  describe('encryption', () => {
    test('encryptInt produces tagged ciphertext', () => {
      const ct = encryptInt(1_000_000_000)
      expect(ct).toContain('ENC_INT_')
      expect(ct).not.toContain('1000000000')
    })

    test('encryptString produces tagged ciphertext', () => {
      const ct = encryptString('SOL')
      expect(ct).toContain('ENC_STR_')
      expect(ct).not.toBe('SOL')
    })
  })

  describe('homomorphic arithmetic', () => {
    test('add returns a new ciphertext', () => {
      const a = encryptInt(100)
      const b = encryptInt(200)
      const result = add(a, b)
      expect(result).toContain('ADD_')
    })

    test('subtract returns a new ciphertext', () => {
      const result = subtract(encryptInt(200), encryptInt(100))
      expect(result).toContain('SUB_')
    })

    test('multiply returns a new ciphertext', () => {
      const result = multiply(encryptInt(10), encryptInt(20))
      expect(result).toContain('MUL_')
    })

    test('divide returns a new ciphertext', () => {
      const result = divide(encryptInt(100), encryptInt(10))
      expect(result).toContain('DIV_')
    })
  })

  describe('homomorphic comparison', () => {
    test('compareEnc returns encrypted result', () => {
      const result = compareEnc(encryptInt(100), encryptInt(200))
      expect(result).toContain('CMP_')
    })
  })

  describe('homomorphic logic', () => {
    test('xor returns a new ciphertext', () => {
      const result = xor(encryptInt(0xFF), encryptInt(0x0F))
      expect(result).toContain('XOR_')
    })
  })

  describe('signatures', () => {
    test('sign produces a signature', () => {
      const sig = sign('hello')
      expect(sig).toContain('STUB_SIG_')
    })

    test('verify returns true for stub', () => {
      const sig = sign('hello')
      expect(verify('hello', sig)).toBe(true)
    })
  })

  describe('hash', () => {
    test('sm3 produces a hash', () => {
      const hash = sm3('test data')
      expect(hash).toContain('STUB_SM3_')
    })
  })
})
