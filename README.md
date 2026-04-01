# @aura/shield-sdk

Encrypted DeFi SDK for Solana — powered by the Aura FHE coprocessor. Protect swaps, lending, and trading from MEV with real Fully Homomorphic Encryption.

## Status

| Component | Status | Notes |
|-----------|--------|-------|
| SDK API surface | **Stable** | Types, client, AuraShield class |
| Stub encryption (dev) | **Ready** | AES-256-GCM opaque stubs — safe for development |
| AFHE WASM (production) | **Pending** | Real FHE encryption — requires `@aura/afhe-wasm` |
| Coprocessor gateway | **Ready** | Go coprocessor with 55 homomorphic operations |
| KMS threshold | **In progress** | Shamir splitting works, final decryption integration pending |
| Jito MEV protection | **Ready** | Private mempool submission |

> **Development mode** produces genuinely opaque ciphertexts (AES-256-GCM with ephemeral keys). Plaintext cannot be recovered from stub output. However, these are NOT FHE ciphertexts — the coprocessor cannot perform homomorphic operations on them. Production mode requires the AFHE WASM module.

## Quick Start

```bash
npm install @aura/shield-sdk
```

```typescript
import { AuraShield } from '@aura/shield-sdk'

const shield = new AuraShield({ rpc, wallet })
await shield.init()  // Loads encryption engine (stub in dev, AFHE WASM in prod)

const result = await shield.swap({
  tokenOut: 'SOL',
  amountOut: 1_000_000_000,
  tokenIn: 'USDC',
})
console.log('TX:', result.signature)
```

## Architecture

```
@aura/shield-sdk
├── core/          AFHE encryption primitives
│   ├── Encrypt:   encryptInt, encryptString, encryptBinary
│   ├── Arithmetic: add, subtract, multiply, divide
│   ├── Compare:   compareEnc (encrypted result)
│   ├── Logic:     xor, and, or, not
│   ├── Math:      abs, sqrt, log, exp
│   ├── String:    concat
│   └── Crypto:    sign, verify, sm3
│
├── coprocessor/   Gateway client with response validation
│   ├── health()      Gateway connectivity check
│   ├── quote()       Price quote via FHE computation
│   ├── prepare()     Unsigned Jupiter tx (validated base64)
│   └── execute()     Signed tx submission via Jito
│
└── swap/          MEV-protected swaps (first module)
    └── AuraShield    encrypt → prepare → sign → execute
```

## How the Coprocessor Works

```
Browser                    Coprocessor Network              Solana
─────────────────          ──────────────────────           ──────
1. User inputs swap
2. AFHE encrypts ────────►  3. Gateway receives ciphertext
   each field                  (never sees plaintext)
                            4. Nodes compute on ciphertext:
                               - EvalLUT (token resolution)
                               - CompareEnc (validation)
                               - MultiplyCipher (fees)
                            5. 2-node verification
                            6. KMS threshold decryption
                            7. Jupiter quote + tx ──────────► 8. Jito submission
                                                               9. Settlement
                     ◄──────────────────────────────────────── 10. TX signature
```

## Safety Guards

The SDK includes built-in protections:

- **`isStubMode()`** — Check if running with stub or real encryption
- **`requireRealAfhe()`** — Throws in stub mode (use before production submission)
- **`validateCiphertext(ct)`** — Verify ciphertext format and size
- **Opaque stubs** — Even in dev mode, ciphertexts are AES-256-GCM encrypted with ephemeral keys. Plaintext cannot be recovered from stub output.
- **Response validation** — Gateway responses are validated for structure, base64 format, and field presence before being returned to the caller
- **Console warnings** — `initAfhe()` warns when running in stub mode

## Swap API

| Method | Description |
|--------|-------------|
| `shield.init()` | Load encryption engine |
| `shield.encrypt(params)` | Encrypt swap params client-side |
| `shield.getQuote(params)` | Price quote via FHE computation |
| `shield.prepare(params)` | Build unsigned Jupiter tx |
| `shield.execute(id, tx)` | Sign and submit via Jito |
| `shield.swap(params)` | All-in-one: encrypt + prepare + sign + execute |
| `shield.health()` | Gateway connectivity check |
| `shield.ready` | Is the encryption engine loaded? |
| `shield.stubMode` | Is this stub mode (dev) or real AFHE? |

## Core Encryption API

For building custom encrypted dApps beyond swaps:

```typescript
import { initAfhe, encryptInt, encryptString, multiply, add, compareEnc } from '@aura/shield-sdk'

await initAfhe()

const amount = encryptInt(1_000_000_000)
const fee = multiply(amount, encryptInt(15))
const total = add(amount, fee)
const isValid = compareEnc(total, encryptInt(0))
```

## Gateway Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/swap/health` | Health check |
| POST | `/api/v1/quote` | Price quote (encrypted input) |
| POST | `/api/v1/swap/prepare` | Prepare unsigned transaction |
| POST | `/api/v1/swap/execute` | Submit signed transaction |

## Examples

- [Basic Swap](./examples/basic-swap) — Simplest integration

## Links

- [shield.afhe.io](https://shield.afhe.io)
- [docs.afhe.io](https://docs.afhe.io)
- [afhe.io](https://afhe.io)

## License

MIT
