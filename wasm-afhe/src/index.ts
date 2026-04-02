/**
 * @aura-shield/wasm-afhe — Field-level FHE encryption via Go WASM.
 *
 * Provides encryptString and encryptInt for the coprocessor path.
 * Decryption is intentionally NOT exposed — the browser must never
 * have access to the secret key (skb).
 */

export { loadAFHEWasm, isAFHELoaded } from './loader.js';

/**
 * Encrypt a plaintext string using the AFHE public key.
 * Returns hex-encoded ciphertext.
 *
 * @param plaintext - The string to encrypt (e.g., "SOL", "USDC")
 * @param pkbBytes - The public key block file contents as Uint8Array
 * @throws If WASM module is not loaded or encryption fails
 */
export function encryptString(plaintext: string, pkbBytes: Uint8Array): string {
  if (typeof globalThis.encString !== 'function') {
    throw new Error('AFHE WASM module not loaded. Call loadAFHEWasm() first.');
  }
  const result = globalThis.encString(plaintext, pkbBytes);
  if (typeof result !== 'string' || result === 'Invalid number of arguments') {
    throw new Error(`AFHE encString failed: ${result}`);
  }
  return result;
}

/**
 * Encrypt a plaintext integer using the AFHE public key.
 * Returns hex-encoded ciphertext.
 *
 * @param value - The integer to encrypt (passed as string, e.g., "1000000")
 * @param pkbBytes - The public key block file contents as Uint8Array
 * @throws If WASM module is not loaded or encryption fails
 */
export function encryptInt(value: string, pkbBytes: Uint8Array): string {
  if (typeof globalThis.encInt !== 'function') {
    throw new Error('AFHE WASM module not loaded. Call loadAFHEWasm() first.');
  }
  const result = globalThis.encInt(value, pkbBytes);
  if (typeof result !== 'string' || result === 'Invalid number of arguments') {
    throw new Error(`AFHE encInt failed: ${result}`);
  }
  return result;
}
