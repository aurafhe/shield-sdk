/**
 * Core AFHE encryption engine.
 *
 * Two modes:
 *   - **Stub mode** (development): Uses AES-256-GCM to produce genuinely opaque
 *     ciphertexts. Plaintext CANNOT be recovered from stub output without the
 *     ephemeral key (which is discarded). This prevents developers from
 *     accidentally shipping reversible "encryption".
 *   - **Real mode** (production): Loads the AFHE WASM module for actual FHE.
 *     Ciphertexts are DER-encoded lattice polynomials (200+ bytes).
 *
 * The engine refuses to submit stub ciphertexts to production gateways.
 */

import { randomBytes, createCipheriv, createHmac } from 'crypto'
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
// Engine interface
// ---------------------------------------------------------------------------

interface AfheEngine {
  mode: 'stub' | 'wasm'
  loaded: boolean
  version: string
  encryptInt(value: number): EncryptedInt
  encryptString(value: string): EncryptedString
  encryptBinary(value: Uint8Array, length: number): EncryptedBinary
  add(a: Ciphertext, b: Ciphertext): Ciphertext
  subtract(a: Ciphertext, b: Ciphertext): Ciphertext
  multiply(a: Ciphertext, b: Ciphertext): Ciphertext
  divide(a: Ciphertext, b: Ciphertext): Ciphertext
  compare(a: Ciphertext, b: Ciphertext): string
  compareEnc(a: Ciphertext, b: Ciphertext): EncryptedComparison
  xor(a: Ciphertext, b: Ciphertext): Ciphertext
  and(a: Ciphertext, b: Ciphertext): Ciphertext
  or(a: Ciphertext, b: Ciphertext): Ciphertext
  not(a: Ciphertext): Ciphertext
  shiftLeft(a: Ciphertext, bias: string): Ciphertext
  shiftRight(a: Ciphertext, bias: string): Ciphertext
  abs(a: Ciphertext): Ciphertext
  power(a: Ciphertext, n: string, m: string): Ciphertext
  sqrt(a: Ciphertext): Ciphertext
  log(a: Ciphertext): Ciphertext
  exp(a: Ciphertext): Ciphertext
  concat(a: Ciphertext, b: Ciphertext): Ciphertext
  substring(input: Ciphertext, start: string, end: string): Ciphertext
  sign(input: string): AfheSignature
  verify(input: string, signature: AfheSignature): boolean
  sm3(input: string): string
}

let engine: AfheEngine | null = null

// Minimum ciphertext size for real AFHE (DER-encoded lattice polynomial)
export const MIN_REAL_CIPHERTEXT_BYTES = 200

// Stub ciphertexts are prefixed with this header for identification
const STUB_HEADER = 'AFHE_STUB_v1'

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the AFHE encryption engine.
 *
 * In development, loads a stub engine that produces opaque (AES-GCM encrypted)
 * ciphertexts. In production, loads the real AFHE WASM module.
 *
 * @param config - Optional configuration for WASM source and keys
 */
export async function initAfhe(config?: AfheConfig): Promise<void> {
  if (engine !== null) return

  if (config?.wasmUrl) {
    // Real AFHE WASM mode
    // TODO(David): Implement real WASM loading
    // const wasm = await import(config.wasmUrl)
    // engine = createWasmEngine(await wasm.init())
    throw new Error(
      'Real AFHE WASM not yet available. ' +
      'Call initAfhe() without config for stub mode, or wait for @aura/afhe-wasm.'
    )
  }

  engine = createStubEngine()

  if (typeof console !== 'undefined') {
    console.warn(
      '[shield-sdk] Running in STUB mode. Ciphertexts are opaque but NOT FHE. ' +
      'Do NOT use for production. Real AFHE WASM coming in @aura/afhe-wasm.'
    )
  }
}

/** Returns true if the AFHE engine is loaded and ready */
export function isAfheReady(): boolean {
  return engine !== null && engine.loaded
}

/** Returns true if running in stub mode (development only) */
export function isStubMode(): boolean {
  return engine?.mode === 'stub'
}

/** Returns the AFHE engine version string */
export function afheVersion(): string {
  return engine?.version ?? 'not-loaded'
}

/**
 * Throws if stub mode is active in a production context.
 * Call this before submitting to a production gateway.
 */
export function requireRealAfhe(): void {
  if (!engine) throw new Error('AFHE engine not initialized.')
  if (engine.mode === 'stub') {
    throw new Error(
      'Cannot use stub encryption in production. ' +
      'Initialize with real AFHE WASM: initAfhe({ wasmUrl: "..." })'
    )
  }
}

/**
 * Validate that a ciphertext has the expected format.
 * Real AFHE ciphertexts are DER-encoded and >= 200 bytes.
 * Stub ciphertexts start with AFHE_STUB_v1 header.
 */
export function validateCiphertext(ct: string): { valid: boolean; isStub: boolean; sizeBytes: number } {
  const isStub = ct.startsWith(STUB_HEADER)
  const sizeBytes = isStub
    ? Buffer.from(ct.slice(STUB_HEADER.length + 1), 'hex').length
    : Buffer.from(ct, 'hex').length

  return {
    valid: isStub || sizeBytes >= MIN_REAL_CIPHERTEXT_BYTES,
    isStub,
    sizeBytes,
  }
}

// ---------------------------------------------------------------------------
// Encryption primitives
// ---------------------------------------------------------------------------

export function encryptInt(value: number): EncryptedInt {
  assertReady()
  return engine!.encryptInt(value)
}

export function encryptString(value: string): EncryptedString {
  assertReady()
  return engine!.encryptString(value)
}

export function encryptBinary(value: Uint8Array, length: number): EncryptedBinary {
  assertReady()
  return engine!.encryptBinary(value, length)
}

// ---------------------------------------------------------------------------
// Homomorphic arithmetic
// ---------------------------------------------------------------------------

export function add(a: Ciphertext, b: Ciphertext): Ciphertext { assertReady(); return engine!.add(a, b) }
export function subtract(a: Ciphertext, b: Ciphertext): Ciphertext { assertReady(); return engine!.subtract(a, b) }
export function multiply(a: Ciphertext, b: Ciphertext): Ciphertext { assertReady(); return engine!.multiply(a, b) }
export function divide(a: Ciphertext, b: Ciphertext): Ciphertext { assertReady(); return engine!.divide(a, b) }

// ---------------------------------------------------------------------------
// Homomorphic comparison
// ---------------------------------------------------------------------------

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

export function concat(a: Ciphertext, b: Ciphertext): Ciphertext { assertReady(); return engine!.concat(a, b) }

// ---------------------------------------------------------------------------
// Digital signatures & hash
// ---------------------------------------------------------------------------

export function sign(input: string): AfheSignature { assertReady(); return engine!.sign(input) }
export function verify(input: string, signature: AfheSignature): boolean { assertReady(); return engine!.verify(input, signature) }
export function sm3(input: string): string { assertReady(); return engine!.sm3(input) }

// ---------------------------------------------------------------------------
// Internal: assertion
// ---------------------------------------------------------------------------

function assertReady(): void {
  if (engine === null) {
    throw new Error('AFHE engine not initialized. Call initAfhe() first.')
  }
}

// ---------------------------------------------------------------------------
// Stub engine: AES-256-GCM encrypted output (opaque, not reversible)
// ---------------------------------------------------------------------------

function createStubEngine(): AfheEngine {
  // Ephemeral key — generated once per session, never stored, never exported.
  // This ensures stub ciphertexts are genuinely opaque even in development.
  const ephemeralKey = randomBytes(32)

  function opaqueEncrypt(plaintext: Buffer, typeTag: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', ephemeralKey, iv)
    const taggedPlaintext = Buffer.concat([Buffer.from(typeTag + ':'), plaintext])
    const encrypted = Buffer.concat([cipher.update(taggedPlaintext), cipher.final()])
    const authTag = cipher.getAuthTag()
    // Format: HEADER:iv(24hex):authTag(32hex):ciphertext(hex)
    const ct = `${STUB_HEADER}:${iv.toString('hex')}${authTag.toString('hex')}${encrypted.toString('hex')}`
    return ct
  }

  function opaqueOp(op: string, ...inputs: string[]): string {
    // Operations on stub ciphertexts produce new opaque ciphertexts.
    // We encrypt the operation metadata so the result is still opaque.
    const opData = Buffer.from(JSON.stringify({ op, n: inputs.length, t: Date.now() }))
    return opaqueEncrypt(opData, op)
  }

  return {
    mode: 'stub',
    loaded: true,
    version: '0.1.0-stub',

    encryptInt: (v) => opaqueEncrypt(Buffer.from(v.toString()), 'int') as EncryptedInt,
    encryptString: (v) => opaqueEncrypt(Buffer.from(v), 'str') as EncryptedString,
    encryptBinary: (v, _l) => opaqueEncrypt(Buffer.from(v), 'bin') as EncryptedBinary,

    add: (a, b) => opaqueOp('add', a, b) as Ciphertext,
    subtract: (a, b) => opaqueOp('sub', a, b) as Ciphertext,
    multiply: (a, b) => opaqueOp('mul', a, b) as Ciphertext,
    divide: (a, b) => opaqueOp('div', a, b) as Ciphertext,

    compare: () => opaqueOp('cmp'),
    compareEnc: (a, b) => opaqueOp('cmpEnc', a, b) as EncryptedComparison,

    xor: (a, b) => opaqueOp('xor', a, b) as Ciphertext,
    and: (a, b) => opaqueOp('and', a, b) as Ciphertext,
    or: (a, b) => opaqueOp('or', a, b) as Ciphertext,
    not: (a) => opaqueOp('not', a) as Ciphertext,

    shiftLeft: (a, _bias) => opaqueOp('shl', a) as Ciphertext,
    shiftRight: (a, _bias) => opaqueOp('shr', a) as Ciphertext,

    abs: (a) => opaqueOp('abs', a) as Ciphertext,
    power: (a, _n, _m) => opaqueOp('pow', a) as Ciphertext,
    sqrt: (a) => opaqueOp('sqrt', a) as Ciphertext,
    log: (a) => opaqueOp('log', a) as Ciphertext,
    exp: (a) => opaqueOp('exp', a) as Ciphertext,

    concat: (a, b) => opaqueOp('concat', a, b) as Ciphertext,
    substring: (input, _start, _end) => opaqueOp('substr', input) as Ciphertext,

    sign: (input) => {
      const sig = createHmac('sha256', ephemeralKey).update(input).digest('hex')
      return `${STUB_HEADER}:sig:${sig}` as AfheSignature
    },
    verify: (_input, sig) => sig.startsWith(`${STUB_HEADER}:sig:`),
    sm3: (input) => createHmac('sha256', ephemeralKey).update(`sm3:${input}`).digest('hex'),
  }
}
