import { describe, it, expect, beforeAll } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import {
  initEncryption,
  serializeSwapIntent,
  encryptSwapIntent,
  base64ToUint8,
  deserializeSwapIntent,
} from '../src/encryption.js';
import type { SwapIntent } from '../src/types.js';

describe('integration', () => {
  const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
  const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const TEST_WALLET = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU');

  // Generate a real Curve25519 keypair (simulates the relayer's key)
  const serverKeypair = nacl.box.keyPair();

  beforeAll(async () => {
    await initEncryption();
  });

  describe('full encryption flow', () => {
    it('encrypts and can be decrypted with matching key', async () => {
      const intent: SwapIntent = {
        tokenIn: SOL_MINT,
        tokenOut: USDC_MINT,
        amount: 1_000_000_000n, // 1 SOL
        slippageBps: 50,
        userPublicKey: TEST_WALLET,
        deadline: Math.floor(Date.now() / 1000) + 120,
      };

      // Encrypt
      const encrypted = await encryptSwapIntent(intent, serverKeypair.publicKey);

      // Verify encrypted structure
      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.nonce).toBeTruthy();
      expect(encrypted.userPublicKey).toBe(TEST_WALLET.toBase58());
      expect(encrypted.encryptedAt).toBeGreaterThan(0);
      expect(encrypted.ephemeralPublicKey).toBeTruthy();

      // Decrypt (simulating what the relayer would do)
      const ciphertext = base64ToUint8(encrypted.ciphertext);
      const nonce = base64ToUint8(encrypted.nonce);
      const ephemeralPk = base64ToUint8(encrypted.ephemeralPublicKey);
      const plaintext = nacl.box.open(ciphertext, nonce, ephemeralPk, serverKeypair.secretKey);

      expect(plaintext).not.toBeNull();

      // Deserialize
      const deserialized = deserializeSwapIntent(new Uint8Array(plaintext!));

      // Verify all fields match
      expect(new PublicKey(deserialized.tokenIn).toBase58()).toBe(SOL_MINT.toBase58());
      expect(new PublicKey(deserialized.tokenOut).toBase58()).toBe(USDC_MINT.toBase58());
      expect(deserialized.amount).toBe(intent.amount);
      expect(deserialized.slippageBps).toBe(intent.slippageBps);
      expect(new PublicKey(deserialized.userPublicKey).toBase58()).toBe(TEST_WALLET.toBase58());
      expect(deserialized.deadline).toBe(BigInt(intent.deadline!));
    });

    it('handles large amounts correctly', async () => {
      const intent: SwapIntent = {
        tokenIn: SOL_MINT,
        tokenOut: USDC_MINT,
        amount: 999_999_999_999_999_999n, // Large amount
        slippageBps: 100,
        userPublicKey: TEST_WALLET,
        deadline: 0, // No deadline
      };

      const encrypted = await encryptSwapIntent(intent, serverKeypair.publicKey);
      const ciphertext = base64ToUint8(encrypted.ciphertext);
      const nonce = base64ToUint8(encrypted.nonce);
      const ephemeralPk = base64ToUint8(encrypted.ephemeralPublicKey);
      const plaintext = nacl.box.open(ciphertext, nonce, ephemeralPk, serverKeypair.secretKey);

      expect(plaintext).not.toBeNull();
      const deserialized = deserializeSwapIntent(new Uint8Array(plaintext!));

      expect(deserialized.amount).toBe(intent.amount);
      expect(deserialized.deadline).toBe(0n);
    });

    it('encrypts different intents to different ciphertexts', async () => {
      const intent1: SwapIntent = {
        tokenIn: SOL_MINT,
        tokenOut: USDC_MINT,
        amount: 1_000_000_000n,
        slippageBps: 50,
        userPublicKey: TEST_WALLET,
      };

      const intent2: SwapIntent = {
        tokenIn: USDC_MINT,
        tokenOut: SOL_MINT,
        amount: 1_000_000_000n,
        slippageBps: 50,
        userPublicKey: TEST_WALLET,
      };

      const encrypted1 = await encryptSwapIntent(intent1, serverKeypair.publicKey);
      const encrypted2 = await encryptSwapIntent(intent2, serverKeypair.publicKey);

      // Different intents should produce different ciphertext
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);

      // Both should decrypt correctly
      const plaintext1 = nacl.box.open(
        base64ToUint8(encrypted1.ciphertext),
        base64ToUint8(encrypted1.nonce),
        base64ToUint8(encrypted1.ephemeralPublicKey),
        serverKeypair.secretKey
      );
      const plaintext2 = nacl.box.open(
        base64ToUint8(encrypted2.ciphertext),
        base64ToUint8(encrypted2.nonce),
        base64ToUint8(encrypted2.ephemeralPublicKey),
        serverKeypair.secretKey
      );

      expect(plaintext1).not.toBeNull();
      expect(plaintext2).not.toBeNull();

      const deserialized1 = deserializeSwapIntent(new Uint8Array(plaintext1!));
      const deserialized2 = deserializeSwapIntent(new Uint8Array(plaintext2!));

      // Verify they decrypted to different values
      expect(new PublicKey(deserialized1.tokenIn).toBase58()).toBe(SOL_MINT.toBase58());
      expect(new PublicKey(deserialized2.tokenIn).toBase58()).toBe(USDC_MINT.toBase58());
    });
  });

  describe('serialization edge cases', () => {
    it('handles minimum values', async () => {
      const intent: SwapIntent = {
        tokenIn: SOL_MINT,
        tokenOut: USDC_MINT,
        amount: 1n,
        slippageBps: 0,
        userPublicKey: TEST_WALLET,
        deadline: 0,
      };

      const serialized = serializeSwapIntent(intent);
      expect(serialized.length).toBe(114);

      const deserialized = deserializeSwapIntent(serialized);
      expect(deserialized.amount).toBe(1n);
      expect(deserialized.slippageBps).toBe(0);
    });

    it('handles maximum slippage', async () => {
      const intent: SwapIntent = {
        tokenIn: SOL_MINT,
        tokenOut: USDC_MINT,
        amount: 1_000_000_000n,
        slippageBps: 10000, // 100%
        userPublicKey: TEST_WALLET,
      };

      const serialized = serializeSwapIntent(intent);
      const deserialized = deserializeSwapIntent(serialized);
      expect(deserialized.slippageBps).toBe(10000);
    });
  });
});
