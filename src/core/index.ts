/**
 * @aura/shield-sdk/core
 *
 * Core FHE encryption primitives.
 * This is the foundation layer — every module builds on these.
 */

export {
  initAfhe,
  isAfheReady,
  afheVersion,
  // Encryption
  encryptInt,
  encryptString,
  encryptBinary,
  // Arithmetic
  add,
  subtract,
  multiply,
  divide,
  // Comparison
  compareEnc,
  // Logic
  xor,
  and,
  or,
  not,
  // Math
  abs,
  sqrt,
  log,
  exp,
  // String
  concat,
  // Signatures
  sign,
  verify,
  sm3,
} from './encrypt'

export type {
  Ciphertext,
  EncryptedInt,
  EncryptedString,
  EncryptedBinary,
  EncryptedComparison,
  AfheSignature,
  AfheConfig,
  AfheOperation,
} from './types'
