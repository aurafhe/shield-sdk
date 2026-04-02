import { describe, it, expect } from 'vitest';
import { encryptFieldStub } from '../src/encryption.js';

describe('encryptFieldStub', () => {
  it('returns empty string for empty input', () => {
    expect(encryptFieldStub('')).toBe('');
  });

  it('produces bare hex output with no 0x prefix', () => {
    const result = encryptFieldStub('USDC');
    expect(result).toMatch(/^[0-9a-f]+$/);
    expect(result).not.toMatch(/^0x/);
  });

  it('output length equals plaintext.length * 2', () => {
    const input = 'USDC';
    const result = encryptFieldStub(input);
    expect(result.length).toBe(input.length * 2);

    const input2 = '1000000';
    const result2 = encryptFieldStub(input2);
    expect(result2.length).toBe(input2.length * 2);
  });

  it('XOR-encrypts "USDC" with 0xAA to produce "fff9eee9"', () => {
    // U=0x55 XOR 0xAA=0xFF, S=0x53 XOR 0xAA=0xF9, D=0x44 XOR 0xAA=0xEE, C=0x43 XOR 0xAA=0xE9
    expect(encryptFieldStub('USDC')).toBe('fff9eee9');
  });

  it('round-trips "1000000" correctly', () => {
    const plaintext = '1000000';
    const encrypted = encryptFieldStub(plaintext);

    // Hex-decode and XOR each byte with 0xAA to recover original
    const bytes: number[] = [];
    for (let i = 0; i < encrypted.length; i += 2) {
      bytes.push(parseInt(encrypted.slice(i, i + 2), 16) ^ 0xaa);
    }
    const recovered = new TextDecoder().decode(new Uint8Array(bytes));
    expect(recovered).toBe(plaintext);
  });

  it('round-trips a long SOL mint address correctly', () => {
    const solMint = 'So11111111111111111111111111111111111111112';
    const encrypted = encryptFieldStub(solMint);

    expect(encrypted.length).toBe(solMint.length * 2);

    // Hex-decode and XOR each byte with 0xAA to recover original
    const bytes: number[] = [];
    for (let i = 0; i < encrypted.length; i += 2) {
      bytes.push(parseInt(encrypted.slice(i, i + 2), 16) ^ 0xaa);
    }
    const recovered = new TextDecoder().decode(new Uint8Array(bytes));
    expect(recovered).toBe(solMint);
  });
});
