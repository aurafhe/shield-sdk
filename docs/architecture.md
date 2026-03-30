# Architecture

How the Aura coprocessor network processes encrypted computation.

## Overview

```
Browser                    Coprocessor Network          Solana
───────────────────────    ─────────────────────────    ──────────────────
User inputs swap params
         │
         ▼
AFHE WASM encrypts data ──► Gateway receives ciphertext
         │                          │
         │                          ▼
         │                  Node cluster processes
         │                  encrypted computation:
         │                  - Token resolution
         │                  - Slippage validation
         │                  - Fee calculation
         │                  (all on ciphertext)
         │                          │
         │                          ▼
         │                  KMS decrypts only the
         │                  final execution output
         │                          │
         │                          ▼
         │                  Returns signed transaction ──► Jupiter + Jito
         │                                                        │
         │                                                        ▼
         │                                               Swap executed on-chain
         │                                                        │
         └──────────────────────────────────────────────────── Result
```

## Components

### AFHE WASM (Client-side)
The encryption module runs entirely in the user's browser. It uses the AFHE (Approximate Fully Homomorphic Encryption) scheme to encrypt swap parameters before they leave the device. The WASM module is loaded via `shield.init()` and uses `shield.encrypt()` to produce ciphertext.

**Key property:** No plaintext ever leaves the user's browser.

### Coprocessor Gateway
The gateway receives encrypted intents from SDK clients. It routes intents to the node cluster for processing. The gateway never sees plaintext — it only handles ciphertext.

### Node Cluster
A set of FHE computation nodes that perform all business logic on encrypted data. This includes token price resolution, slippage validation, route optimization, and fee calculation. The nodes operate on ciphertext throughout, without ever decrypting intermediate values.

### KMS (Key Management Service)
The KMS is the only component authorized to decrypt. It decrypts only the final output — the execution parameters needed to build the swap transaction. The KMS operates in a trusted execution environment (TEE) and only decrypts after the computation has been validated.

### Jupiter + Jito Integration
The decrypted execution parameters are used to build a swap transaction via Jupiter aggregator. The transaction is submitted via Jito for MEV-protected, prioritized inclusion.

## Data Flow

1. **Input:** User provides `{ tokenOut, amountOut, tokenIn }`
2. **Encrypt:** AFHE WASM produces ciphertext + ephemeral public key
3. **Submit:** Ciphertext sent to coprocessor gateway
4. **Compute:** Node cluster resolves tokens, validates slippage, calculates fees — all on ciphertext
5. **Decrypt:** KMS decrypts only the final execution output
6. **Execute:** Transaction built with Jupiter, submitted via Jito
7. **Confirm:** Signature returned to client

## Privacy Guarantees

- Token amounts encrypted before leaving the browser
- Route computation happens on ciphertext
- No node in the pipeline sees plaintext user data
- Only the final transaction output is decrypted

## Security Model

This is not a mixer or a private mempool. The computation itself happens on encrypted data using Fully Homomorphic Encryption. The coprocessor network cannot learn the user's swap intent from the ciphertext.

The current implementation uses stub encryption while the AFHE WASM module is in development. The API surface and types will remain stable when the real FHE module is integrated.

## Further Reading

- [AFHE Documentation](https://docs.afhe.io)
- [Jupiter Swap API](https://station.jup.ag/docs/apis/swap-api)
- [Jito Block Engine](https://docs.jito.wtf/)
