# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in @aura/shield-sdk, please report it responsibly.

**DO NOT open a public GitHub issue for security vulnerabilities.**

Email: **security@afhe.io**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a timeline for resolution.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Current   |

## Security Model

### What the SDK Protects Against

- **MEV attacks** (sandwich, front-running, back-running) — swap intents are encrypted before leaving the browser
- **Network eavesdropping** — encrypted payloads over HTTPS
- **Malicious gateway responses** — client validates base64, field presence, block height

### Current Encryption Modes

| Mode | Status | Security Level |
|------|--------|---------------|
| **Stub** (development) | Active | AES-256-GCM with ephemeral keys. Opaque output, but NOT FHE. For development only. |
| **AFHE WASM** (production) | Pending | Full Homomorphic Encryption. Ciphertexts are lattice-based, computationally secure. |

### Trust Boundaries

| Component | Trust Level | What It Sees |
|-----------|-------------|-------------|
| User's browser | Trusted | Plaintext swap parameters |
| SDK encryption | Trusted | Plaintext → ciphertext conversion |
| Network transport | Untrusted | Encrypted payload only (HTTPS + FHE) |
| Coprocessor nodes | Semi-trusted | Ciphertext only (no secret key in compute mode) |
| KMS nodes | Semi-trusted | Each sees only their Shamir share |
| Gateway | Trusted | Plaintext after threshold KMS decryption (for Jupiter execution) |

### Known Limitations

1. **Stub mode provides no FHE security** — it uses AES-256-GCM, not homomorphic encryption. The coprocessor cannot perform homomorphic operations on stub ciphertexts.
2. **Gateway is a centralized trust point** — after KMS threshold decryption, the gateway sees plaintext to call Jupiter. This is architecturally intentional for the MVP.
3. **AFHE is a proprietary scheme** — not yet independently audited. Security audit planned before mainnet.
4. **Client does not verify transaction contents** — the SDK validates base64 format and field presence, but does not parse or verify the Solana transaction instructions returned by the gateway.

## Responsible Disclosure Timeline

- **Day 0**: Vulnerability reported
- **Day 1-2**: Acknowledgment sent
- **Day 7**: Initial assessment and severity classification
- **Day 30**: Fix developed and tested
- **Day 45**: Public disclosure (coordinated with reporter)

## Bug Bounty

We plan to launch a formal bug bounty program after mainnet deployment. In the meantime, responsible disclosures are appreciated and will be credited.
