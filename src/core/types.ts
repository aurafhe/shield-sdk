/**
 * Core FHE types for the Aura Shield SDK.
 *
 * These types represent encrypted values produced by the AFHE engine.
 * They are opaque to the application — you cannot inspect their contents,
 * only pass them to homomorphic operations or submit them to the coprocessor.
 */

/** An encrypted value (hex-encoded AFHE ciphertext) */
export type Ciphertext = string & { readonly __brand: 'Ciphertext' }

/** Encrypted integer */
export type EncryptedInt = Ciphertext & { readonly __kind: 'int' }

/** Encrypted string */
export type EncryptedString = Ciphertext & { readonly __kind: 'string' }

/** Encrypted binary data */
export type EncryptedBinary = Ciphertext & { readonly __kind: 'binary' }

/** Digital signature produced by AFHE */
export type AfheSignature = string & { readonly __brand: 'AfheSignature' }

/** Result of an encrypted comparison: encrypted -1, 0, or 1 */
export type EncryptedComparison = Ciphertext & { readonly __kind: 'comparison' }

/**
 * AFHE engine configuration.
 * Passed to init() to configure key paths or WASM source.
 */
export interface AfheConfig {
  /** URL or path to the AFHE WASM module */
  wasmUrl?: string
  /** Base64-encoded public key block (for client-side encryption) */
  publicKey?: string
  /** Base64-encoded dictionary block (for homomorphic operations) */
  dictionary?: string
}

/**
 * Categories of AFHE operations available.
 * Each maps to real homomorphic operations in the AFHE SDK (55 functions).
 */
export type AfheOperation =
  // Encryption
  | 'encrypt' | 'encryptPublic' | 'decrypt'
  | 'encryptString' | 'encryptPublicString' | 'decryptString'
  | 'encryptBinary' | 'encryptPublicBinary' | 'decryptBinary'
  // Arithmetic
  | 'add' | 'subtract' | 'multiply' | 'divide'
  // Comparison
  | 'compare' | 'compareEnc'
  // Logic
  | 'xor' | 'and' | 'or' | 'not'
  // Shifts
  | 'shiftLeft' | 'shiftRight' | 'rotateLeft' | 'rotateRight'
  // Math
  | 'abs' | 'power' | 'sqrt' | 'log' | 'exp'
  | 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan'
  | 'sinh' | 'cosh' | 'tanh' | 'asinh' | 'acosh' | 'atanh'
  // Complex
  | 'addComplex' | 'subtractComplex' | 'multiplyComplex'
  | 'distanceComplex' | 'argComplex' | 'expComplex'
  // Transform
  | 'fft' | 'ifft'
  // String
  | 'concat' | 'substring'
  // Signature
  | 'sign' | 'verify'
  // Hash
  | 'sm3'
