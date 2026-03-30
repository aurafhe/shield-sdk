/**
 * Core AFHE encryption engine.
 *
 * Exposes the 55 AFHE SDK operations as typed TypeScript functions.
 * In production, these call the AFHE WASM module loaded in the browser.
 * In stub mode, they produce tagged placeholder ciphertexts for testing.
 *
 * This is the foundation layer — every module (swap, lending, governance, etc.)
 * builds on these primitives.
 */

import type {
  Ciphertext,
  EncryptedInt,
  EncryptedString,
  EncryptedBinary,
  EncryptedComparison,
  AfheSignature,
  AfheConfig,
} from './types'

// ---------------------------------------------------------------------------
// Engine interface (real WASM or stub)
// ---------------------------------------------------------------------------

interface AfheEngine {
  loaded: boolean
  version: string

  // Encryption
  encryptInt(value: number): EncryptedInt
  encryptString(value: string): EncryptedString
  encryptBinary(value: Uint8Array, length: number): EncryptedBinary

  // Arithmetic (all operate on ciphertext)
  add(a: Ciphertext, b: Ciphertext): Ciphertext
  subtract(a: Ciphertext, b: Ciphertext): Ciphertext
  multiply(a: Ciphertext, b: Ciphertext): Ciphertext
  divide(a: Ciphertext, b: Ciphertext): Ciphertext

  // Comparison
  compare(a: Ciphertext, b: Ciphertext): string // plaintext result
  compareEnc(a: Ciphertext, b: Ciphertext): EncryptedComparison

  // Logic
  xor(a: Ciphertext, b: Ciphertext): Ciphertext
  and(a: Ciphertext, b: Ciphertext): Ciphertext
  or(a: Ciphertext, b: Ciphertext): Ciphertext
  not(a: Ciphertext): Ciphertext

  // Shifts
  shiftLeft(a: Ciphertext, bias: string): Ciphertext
  shiftRight(a: Ciphertext, bias: string): Ciphertext

  // Math
  abs(a: Ciphertext): Ciphertext
  power(a: Ciphertext, n: string, m: string): Ciphertext
  sqrt(a: Ciphertext): Ciphertext
  log(a: Ciphertext): Ciphertext
  exp(a: Ciphertext): Ciphertext

  // String
  concat(a: Ciphertext, b: Ciphertext): Ciphertext
  substring(input: Ciphertext, start: string, end: string): Ciphertext

  // Signature
  sign(input: string): AfheSignature
  verify(input: string, signature: AfheSignature): boolean

  // Hash
  sm3(input: string): string
}

let engine: AfheEngine | null = null

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the AFHE encryption engine.
 * Loads the WASM module (or stub for testing).
 * Must be called before any encryption or computation.
 */
export async function initAfhe(_config?: AfheConfig): Promise<void> {
  if (engine !== null) return

  // TODO(David): Replace stub with real AFHE WASM loader
  // const wasm = await import('@aura/afhe-wasm')
  // const mod = await wasm.init(config?.wasmUrl)
  // engine = createWasmEngine(mod)

  engine = createStubEngine()
}

/** Returns true if the AFHE engine is loaded and ready */
export function isAfheReady(): boolean {
  return engine !== null && engine.loaded
}

/** Returns the AFHE engine version string */
export function afheVersion(): string {
  return engine?.version ?? 'not-loaded'
}

// ---------------------------------------------------------------------------
// Encryption primitives
// ---------------------------------------------------------------------------

/** Encrypt an integer using the AFHE public key */
export function encryptInt(value: number): EncryptedInt {
  assertReady()
  return engine!.encryptInt(value)
}

/** Encrypt a string using the AFHE public key */
export function encryptString(value: string): EncryptedString {
  assertReady()
  return engine!.encryptString(value)
}

/** Encrypt binary data using the AFHE public key */
export function encryptBinary(value: Uint8Array, length: number): EncryptedBinary {
  assertReady()
  return engine!.encryptBinary(value, length)
}

// ---------------------------------------------------------------------------
// Homomorphic arithmetic (operates on ciphertext — no decryption)
// ---------------------------------------------------------------------------

/** Add two encrypted values: result = a + b (all ciphertext) */
export function add(a: Ciphertext, b: Ciphertext): Ciphertext {
  assertReady()
  return engine!.add(a, b)
}

/** Subtract two encrypted values: result = a - b */
export function subtract(a: Ciphertext, b: Ciphertext): Ciphertext {
  assertReady()
  return engine!.subtract(a, b)
}

/** Multiply two encrypted values: result = a * b */
export function multiply(a: Ciphertext, b: Ciphertext): Ciphertext {
  assertReady()
  return engine!.multiply(a, b)
}

/** Divide two encrypted values: result = a / b */
export function divide(a: Ciphertext, b: Ciphertext): Ciphertext {
  assertReady()
  return engine!.divide(a, b)
}

// ---------------------------------------------------------------------------
// Homomorphic comparison
// ---------------------------------------------------------------------------

/**
 * Compare two encrypted values.
 * Returns an encrypted result (-1, 0, or 1) — the coprocessor
 * never learns which value is larger.
 */
export function compareEnc(a: Ciphertext, b: Ciphertext): EncryptedComparison {
  assertReady()
  return engine!.compareEnc(a, b)
}

// ---------------------------------------------------------------------------
// Homomorphic logic
// ---------------------------------------------------------------------------

export function xor(a: Ciphertext, b: Ciphertext): Ciphertext { assertReady(); return engine!.xor(a, b) }
export function and(a: Ciphertext, b: Ciphertext): Ciphertext { assertReady(); return engine!.and(a, b) }
export function or(a: Ciphertext, b: Ciphertext): Ciphertext { assertReady(); return engine!.or(a, b) }
export function not(a: Ciphertext): Ciphertext { assertReady(); return engine!.not(a) }

// ---------------------------------------------------------------------------
// Homomorphic math
// ---------------------------------------------------------------------------

export function abs(a: Ciphertext): Ciphertext { assertReady(); return engine!.abs(a) }
export function sqrt(a: Ciphertext): Ciphertext { assertReady(); return engine!.sqrt(a) }
export function log(a: Ciphertext): Ciphertext { assertReady(); return engine!.log(a) }
export function exp(a: Ciphertext): Ciphertext { assertReady(); return engine!.exp(a) }

// ---------------------------------------------------------------------------
// Encrypted string operations
// ---------------------------------------------------------------------------

/** Concatenate two encrypted strings */
export function concat(a: Ciphertext, b: Ciphertext): Ciphertext {
  assertReady()
  return engine!.concat(a, b)
}

// ---------------------------------------------------------------------------
// Digital signatures
// ---------------------------------------------------------------------------

/** Generate an AFHE digital signature */
export function sign(input: string): AfheSignature {
  assertReady()
  return engine!.sign(input)
}

/** Verify an AFHE digital signature */
export function verify(input: string, signature: AfheSignature): boolean {
  assertReady()
  return engine!.verify(input, signature)
}

/** Compute SM3 hash */
export function sm3(input: string): string {
  assertReady()
  return engine!.sm3(input)
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function assertReady(): void {
  if (engine === null) {
    throw new Error('AFHE engine not initialized. Call initAfhe() first.')
  }
}

function createStubEngine(): AfheEngine {
  const tag = (prefix: string, data: string): Ciphertext =>
    `${prefix}_${data}` as Ciphertext

  return {
    loaded: true,
    version: '0.1.0-stub',

    encryptInt: (v) => tag('ENC_INT', v.toString(16).padStart(16, '0')) as EncryptedInt,
    encryptString: (v) => tag('ENC_STR', Buffer.from(v).toString('hex')) as EncryptedString,
    encryptBinary: (v, l) => tag('ENC_BIN', Buffer.from(v).toString('hex').slice(0, l * 2)) as EncryptedBinary,

    add: (a, b) => tag('ADD', `${a}|${b}`),
    subtract: (a, b) => tag('SUB', `${a}|${b}`),
    multiply: (a, b) => tag('MUL', `${a}|${b}`),
    divide: (a, b) => tag('DIV', `${a}|${b}`),

    compare: () => '0',
    compareEnc: (a, b) => tag('CMP', `${a}|${b}`) as EncryptedComparison,

    xor: (a, b) => tag('XOR', `${a}|${b}`),
    and: (a, b) => tag('AND', `${a}|${b}`),
    or: (a, b) => tag('OR', `${a}|${b}`),
    not: (a) => tag('NOT', `${a}`),

    shiftLeft: (a, bias) => tag('SHL', `${a}|${bias}`),
    shiftRight: (a, bias) => tag('SHR', `${a}|${bias}`),

    abs: (a) => tag('ABS', `${a}`),
    power: (a, n, m) => tag('POW', `${a}|${n}|${m}`),
    sqrt: (a) => tag('SQRT', `${a}`),
    log: (a) => tag('LOG', `${a}`),
    exp: (a) => tag('EXP', `${a}`),

    concat: (a, b) => tag('CONCAT', `${a}|${b}`),
    substring: (input, start, end) => tag('SUBSTR', `${input}|${start}|${end}`),

    sign: (input) => `STUB_SIG_${Buffer.from(input).toString('hex')}` as AfheSignature,
    verify: () => true,
    sm3: (input) => `STUB_SM3_${Buffer.from(input).toString('hex')}`,
  }
}
