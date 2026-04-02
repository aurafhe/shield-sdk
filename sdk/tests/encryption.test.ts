import { describe, it, expect, beforeAll } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import {
  initEncryption,
  serializeSwapIntent,
  deserializeSwapIntent,
  encryptSwapIntent,
  validateCiphertext,
  base64ToUint8,
} from '../src/encryption.js';
import type { SwapIntent } from '../src/types.js';

describe('encryption', () => {
  const testIntent: SwapIntent = {
    tokenIn: new PublicKey('So11111111111111111111111111111111111111112'),
    tokenOut: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    amount: 1000000000n, // 1 SOL in lamports
    slippageBps: 50,
    userPublicKey: new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'),
    deadline: 1700000000,
  };

  // Generate a real Curve25519 keypair for testing
  const serverKeypair = nacl.box.keyPair();

  beforeAll(async () => {
    await initEncryption();
  });

  describe('serializeSwapIntent', () => {
    it('produces exactly 114 bytes', () => {
      const serialized = serializeSwapIntent(testIntent);
      expect(serialized.length).toBe(114);
    });

    it('serializes all fields in correct positions', () => {
      const serialized = serializeSwapIntent(testIntent);
      const view = new DataView(serialized.buffer);

      // Check tokenIn at offset 0
      const tokenInBytes = serialized.slice(0, 32);
      expect(tokenInBytes).toEqual(testIntent.tokenIn.toBytes());

      // Check tokenOut at offset 32
      const tokenOutBytes = serialized.slice(32, 64);
      expect(tokenOutBytes).toEqual(testIntent.tokenOut.toBytes());

      // Check amount at offset 64 (big-endian u64)
      const amount = view.getBigUint64(64, false);
      expect(amount).toBe(testIntent.amount);

      // Check slippageBps at offset 72 (big-endian u16)
      const slippage = view.getUint16(72, false);
      expect(slippage).toBe(testIntent.slippageBps);

      // Check userPublicKey at offset 74
      const userPubkeyBytes = serialized.slice(74, 106);
      expect(userPubkeyBytes).toEqual(testIntent.userPublicKey.toBytes());

      // Check deadline at offset 106 (big-endian u64)
      const deadline = view.getBigUint64(106, false);
      expect(deadline).toBe(BigInt(testIntent.deadline!));
    });
  });

  describe('deserializeSwapIntent', () => {
    it('roundtrip preserves all values', () => {
      const serialized = serializeSwapIntent(testIntent);
      const deserialized = deserializeSwapIntent(serialized);

      expect(deserialized.tokenIn).toEqual(testIntent.tokenIn.toBytes());
      expect(deserialized.tokenOut).toEqual(testIntent.tokenOut.toBytes());
      expect(deserialized.amount).toBe(testIntent.amount);
      expect(deserialized.slippageBps).toBe(testIntent.slippageBps);
      expect(deserialized.userPublicKey).toEqual(testIntent.userPublicKey.toBytes());
      expect(deserialized.deadline).toBe(BigInt(testIntent.deadline!));
    });

    it('throws on invalid length', () => {
      const shortBuffer = new Uint8Array(100);
      expect(() => deserializeSwapIntent(shortBuffer)).toThrow('Expected 114 bytes');
    });
  });

  describe('encryptSwapIntent', () => {
    it('returns valid EncryptedSwap with all fields populated', async () => {
      const encrypted = await encryptSwapIntent(testIntent, serverKeypair.publicKey);

      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.nonce).toBeTruthy();
      expect(encrypted.encryptionKeyId).toBe('nacl-v1');
      expect(encrypted.encryptedAt).toBeGreaterThan(0);
      expect(encrypted.userPublicKey).toBe(testIntent.userPublicKey.toBase58());
      expect(encrypted.ephemeralPublicKey).toBeTruthy();
    });

    it('produces different ciphertext for same input (random nonce + ephemeral key)', async () => {
      const encrypted1 = await encryptSwapIntent(testIntent, serverKeypair.publicKey);
      const encrypted2 = await encryptSwapIntent(testIntent, serverKeypair.publicKey);

      // Ciphertext should differ due to random nonce and ephemeral key
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);

      // Nonces should also differ
      expect(encrypted1.nonce).not.toBe(encrypted2.nonce);

      // Ephemeral keys should differ
      expect(encrypted1.ephemeralPublicKey).not.toBe(encrypted2.ephemeralPublicKey);
    });

    it('ciphertext has correct length (114 + 16 MAC = 130 bytes)', async () => {
      const encrypted = await encryptSwapIntent(testIntent, serverKeypair.publicKey);
      const ciphertext = base64ToUint8(encrypted.ciphertext);

      // NaCl box adds 16-byte Poly1305 MAC
      expect(ciphertext.length).toBe(130);
    });

    it('nonce is 24 bytes', async () => {
      const encrypted = await encryptSwapIntent(testIntent, serverKeypair.publicKey);
      const nonce = base64ToUint8(encrypted.nonce);

      expect(nonce.length).toBe(24);
    });

    it('ephemeral public key is 32 bytes', async () => {
      const encrypted = await encryptSwapIntent(testIntent, serverKeypair.publicKey);
      const ephPk = base64ToUint8(encrypted.ephemeralPublicKey);

      expect(ephPk.length).toBe(32);
    });
  });

  describe('validateCiphertext', () => {
    it('returns true for valid NaCl ciphertext length (>= 130)', () => {
      const validCiphertext = new Uint8Array(130);
      expect(validateCiphertext(validCiphertext)).toBe(true);

      const longerCiphertext = new Uint8Array(200);
      expect(validateCiphertext(longerCiphertext)).toBe(true);
    });

    it('returns false for short ciphertext', () => {
      const shortCiphertext = new Uint8Array(100);
      expect(validateCiphertext(shortCiphertext)).toBe(false);

      // 114 bytes is too short for NaCl box (needs MAC overhead)
      const barePayload = new Uint8Array(114);
      expect(validateCiphertext(barePayload)).toBe(false);
    });
  });

  describe('NaCl encrypt/decrypt roundtrip', () => {
    it('recovers original plaintext via nacl.box.open', async () => {
      const encrypted = await encryptSwapIntent(testIntent, serverKeypair.publicKey);

      const ciphertext = base64ToUint8(encrypted.ciphertext);
      const nonce = base64ToUint8(encrypted.nonce);
      const ephemeralPk = base64ToUint8(encrypted.ephemeralPublicKey);

      // Decrypt using nacl.box.open with server's secret key
      const decrypted = nacl.box.open(ciphertext, nonce, ephemeralPk, serverKeypair.secretKey);
      expect(decrypted).not.toBeNull();

      // Should match original serialized intent
      const originalSerialized = serializeSwapIntent(testIntent);
      expect(new Uint8Array(decrypted!)).toEqual(originalSerialized);

      // Verify we can deserialize it
      const deserialized = deserializeSwapIntent(new Uint8Array(decrypted!));
      expect(deserialized.amount).toBe(testIntent.amount);
    });

    it('fails to decrypt with wrong key', async () => {
      const encrypted = await encryptSwapIntent(testIntent, serverKeypair.publicKey);

      const ciphertext = base64ToUint8(encrypted.ciphertext);
      const nonce = base64ToUint8(encrypted.nonce);
      const ephemeralPk = base64ToUint8(encrypted.ephemeralPublicKey);

      // Try decrypting with a different keypair
      const wrongKeypair = nacl.box.keyPair();
      const result = nacl.box.open(ciphertext, nonce, ephemeralPk, wrongKeypair.secretKey);
      expect(result).toBeNull();
    });

    it('fails to decrypt tampered ciphertext', async () => {
      const encrypted = await encryptSwapIntent(testIntent, serverKeypair.publicKey);

      const ciphertext = base64ToUint8(encrypted.ciphertext);
      const nonce = base64ToUint8(encrypted.nonce);
      const ephemeralPk = base64ToUint8(encrypted.ephemeralPublicKey);

      // Tamper with one byte
      ciphertext[0] ^= 0xff;

      const result = nacl.box.open(ciphertext, nonce, ephemeralPk, serverKeypair.secretKey);
      expect(result).toBeNull();
    });
  });
});
