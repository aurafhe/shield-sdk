import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import type { SwapIntent, EncryptedSwap, DeserializedSwapIntent } from './types.js';
import { AuraShieldError, ErrorCode } from './errors.js';

// Go WASM global function declarations (registered by afhe.wasm at runtime)
declare global {
  // eslint-disable-next-line no-var
  var encString: ((input: string, pkbBytes: Uint8Array) => string) | undefined;
  // eslint-disable-next-line no-var
  var encInt: ((input: string, pkbBytes: Uint8Array) => string) | undefined;
}

let initialized = false;

/**
 * Initialize encryption module.
 * NaCl (tweetnacl) is synchronous and requires no async init,
 * but we keep the async signature for forward compatibility with ZFHE WASM.
 */
export async function initEncryption(): Promise<void> {
  initialized = true;
}

/**
 * Check if encryption module is initialized
 */
export function isEncryptionInitialized(): boolean {
  return initialized;
}


/**
 * Convert Uint8Array to base64 string (works in browser and Node.js)
 */
export function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  // Browser fallback
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array (works in browser and Node.js)
 */
export function base64ToUint8(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  // Browser fallback
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Serialize SwapIntent to exactly 114 bytes
 *
 * Format:
 * - Offset 0, 32 bytes: tokenIn (Solana Pubkey)
 * - Offset 32, 32 bytes: tokenOut (Solana Pubkey)
 * - Offset 64, 8 bytes: amount (big-endian u64)
 * - Offset 72, 2 bytes: slippageBps (big-endian u16)
 * - Offset 74, 32 bytes: userPublicKey (Solana Pubkey)
 * - Offset 106, 8 bytes: deadline (big-endian u64, unix seconds)
 */
export function serializeSwapIntent(intent: SwapIntent): Uint8Array {
  const buffer = new Uint8Array(114);
  const view = new DataView(buffer.buffer);

  // tokenIn (32 bytes)
  buffer.set(intent.tokenIn.toBytes(), 0);

  // tokenOut (32 bytes)
  buffer.set(intent.tokenOut.toBytes(), 32);

  // amount (8 bytes, big-endian u64)
  const amountBigInt = BigInt(intent.amount);
  view.setBigUint64(64, amountBigInt, false); // false = big-endian

  // slippageBps (2 bytes, big-endian u16)
  view.setUint16(72, intent.slippageBps, false);

  // userPublicKey (32 bytes)
  buffer.set(intent.userPublicKey.toBytes(), 74);

  // deadline (8 bytes, big-endian u64)
  const deadline = BigInt(intent.deadline ?? 0);
  view.setBigUint64(106, deadline, false);

  return buffer;
}

/**
 * Deserialize 114 bytes back to swap intent components
 */
export function deserializeSwapIntent(bytes: Uint8Array): DeserializedSwapIntent {
  if (bytes.length !== 114) {
    throw new AuraShieldError(
      ErrorCode.INVALID_PARAMS,
      `Expected 114 bytes, got ${bytes.length}`
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return {
    tokenIn: bytes.slice(0, 32),
    tokenOut: bytes.slice(32, 64),
    amount: view.getBigUint64(64, false),
    slippageBps: view.getUint16(72, false),
    userPublicKey: bytes.slice(74, 106),
    deadline: view.getBigUint64(106, false),
  };
}

/**
 * Encrypt a SwapIntent for transmission to the relayer using NaCl box
 * (Curve25519 + XSalsa20-Poly1305).
 *
 * Uses an ephemeral keypair per encryption so the sender remains anonymous.
 * The ephemeral public key is included in the output for the server to decrypt.
 */
export async function encryptSwapIntent(
  intent: SwapIntent,
  encryptionPublicKey: Uint8Array
): Promise<EncryptedSwap> {
  if (!initialized) {
    throw new AuraShieldError(
      ErrorCode.NOT_INITIALIZED,
      'Encryption not initialized. Call initEncryption() first.'
    );
  }

  try {
    // Serialize the intent to 114 bytes
    const plaintext = serializeSwapIntent(intent);

    // Generate ephemeral Curve25519 keypair (anonymous sender)
    const ephemeral = nacl.box.keyPair();

    // Generate 24-byte random nonce (required by NaCl box)
    const nonce = nacl.randomBytes(24);

    // Encrypt: nacl.box(message, nonce, recipientPubKey, senderSecretKey)
    const ciphertext = nacl.box(plaintext, nonce, encryptionPublicKey, ephemeral.secretKey);

    return {
      ciphertext: uint8ToBase64(ciphertext),
      nonce: uint8ToBase64(nonce),
      encryptionKeyId: 'nacl-v1',
      encryptedAt: Math.floor(Date.now() / 1000),
      userPublicKey: intent.userPublicKey.toBase58(),
      ephemeralPublicKey: uint8ToBase64(ephemeral.publicKey),
    };
  } catch (error) {
    if (error instanceof AuraShieldError) {
      throw error;
    }
    throw new AuraShieldError(
      ErrorCode.ENCRYPTION_FAILED,
      'Failed to encrypt swap intent',
      error
    );
  }
}

/**
 * Stub field-level encryption for coprocessor gateway (development fallback).
 *
 * XORs each byte of the plaintext with 0xAA and returns bare hex.
 * This matches the Go stub engine's pureEncrypt() function in
 * services/coprocessor/pkg/fhe/stub_pure.go.
 *
 * Used when the real AFHE WASM module is not loaded (dev/test mode).
 */
export function encryptFieldStub(plaintext: string): string {
  if (plaintext.length === 0) return '';
  const bytes = new TextEncoder().encode(plaintext);
  const xored = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    xored[i] = bytes[i] ^ 0xAA;
  }
  return Array.from(xored).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Real field-level encryption using the AFHE WASM module.
 *
 * Encrypts a string field (token symbol, amount) with the AFHE public key.
 * Returns hex-encoded ciphertext compatible with the Go coprocessor's
 * DecryptString / Decrypt functions.
 *
 * @param plaintext - The field value to encrypt
 * @param pkbBytes - The AFHE public key block as Uint8Array (fetched from gateway)
 * @param isInt - If true, uses integer encryption (encInt); otherwise string encryption (encString)
 * @returns Hex-encoded ciphertext
 * @throws If WASM module is not loaded
 */
export function encryptField(
  plaintext: string,
  pkbBytes: Uint8Array,
  isInt = false,
): string {
  // Dynamic import to avoid bundling wasm-afhe when not needed
  // The functions are registered as globals by the Go WASM runtime.
  if (isInt) {
    if (typeof globalThis.encInt !== 'function') {
      throw new AuraShieldError(
        ErrorCode.NOT_INITIALIZED,
        'AFHE WASM not loaded. Cannot encrypt integer field.',
      );
    }
    const result = globalThis.encInt(plaintext, pkbBytes);
    if (typeof result !== 'string' || result === 'Invalid number of arguments') {
      throw new AuraShieldError(ErrorCode.ENCRYPTION_FAILED, `AFHE encInt failed: ${result}`);
    }
    return result;
  }

  if (typeof globalThis.encString !== 'function') {
    throw new AuraShieldError(
      ErrorCode.NOT_INITIALIZED,
      'AFHE WASM not loaded. Cannot encrypt string field.',
    );
  }
  const result = globalThis.encString(plaintext, pkbBytes);
  if (typeof result !== 'string' || result === 'Invalid number of arguments') {
    throw new AuraShieldError(ErrorCode.ENCRYPTION_FAILED, `AFHE encString failed: ${result}`);
  }
  return result;
}

/**
 * Validate that ciphertext has minimum required length.
 * NaCl box adds 16 bytes of Poly1305 MAC, so minimum is 114 + 16 = 130 bytes.
 */
export function validateCiphertext(ciphertext: Uint8Array): boolean {
  return ciphertext.length >= 130;
}
