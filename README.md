# @aura/shield-sdk

The developer SDK for building dApps and web3 products on the Aura FHE coprocessor. Encrypt user data in the browser, compute on ciphertext, decrypt only when needed.

## Quick Start — Swap

```bash
npm install @aura/shield-sdk
```

```typescript
import { AuraShield } from '@aura/shield-sdk'

const shield = new AuraShield({ rpc, wallet })
await shield.init()

const result = await shield.swap({
  tokenOut: 'SOL',
  amountOut: 1_000_000_000,
  tokenIn: 'USDC',
})
console.log('TX:', result.signature)
```

Three lines. Your user's swap intent was encrypted in their browser. Token resolution, amount validation, and fee calculation all happened on ciphertext. Nobody saw plaintext until the final KMS decryption for execution.

## Build Anything on Encrypted Computation

Swaps are the first module. The SDK exposes **55 AFHE homomorphic operations** — you can build any dApp that needs private computation:

```typescript
import { initAfhe, encryptInt, encryptString, multiply, add, compareEnc, CoprocessorClient } from '@aura/shield-sdk'

await initAfhe()

// Encrypt user data client-side
const amount = encryptInt(1_000_000_000)
const token = encryptString('USDC')

// Compute on ciphertext (no decryption)
const fee = multiply(amount, encryptInt(15))  // 15 bps fee
const total = add(amount, fee)
const isValid = compareEnc(total, encryptInt(0))  // Encrypted boolean

// Submit to coprocessor for execution
const client = new CoprocessorClient('https://api.afhe.io')
const result = await client.submitTask({
  id: 'my-task',
  type: 'lending',
  account: wallet.publicKey.toBase58(),
  encrypted: { amount: total as string, token: token as string },
})
```

**Use cases beyond swaps:** lending/borrowing protection, NFT bid privacy, governance voting, limit order hiding, OTC dark pools, cross-chain bridge privacy.

## Architecture

```
@aura/shield-sdk
├── core/          55 AFHE encryption primitives
│   ├── Encrypt:   encryptInt, encryptString, encryptBinary
│   ├── Arithmetic: add, subtract, multiply, divide
│   ├── Compare:   compareEnc (returns encrypted result)
│   ├── Logic:     xor, and, or, not
│   ├── Math:      abs, sqrt, log, exp, sin, cos, tan ...
│   ├── String:    concat, substring
│   └── Crypto:    sign, verify, sm3
│
├── coprocessor/   Generic coprocessor client
│   ├── submitTask()   Submit any encrypted computation
│   ├── quote()        Get swap price quote
│   ├── prepare()      Build unsigned Jupiter tx
│   └── execute()      Submit signed tx via Jito
│
└── swap/          MEV-protected swaps (first module)
    └── AuraShield     encrypt → prepare → sign → execute
```

## How the Coprocessor Works

```
Browser                    Coprocessor Network              Solana
─────────────────          ──────────────────────           ──────
1. User inputs data
2. AFHE WASM encrypts ──►  3. Gateway receives ciphertext
   each field                 (never sees plaintext)
                           4. Nodes compute on ciphertext:
                              - EvalLUT (token resolution)
                              - CompareEnc (validation)
                              - MultiplyCipher (fees)
                              - All 55 ops available
                           5. Verification (2-node recompute)
                           6. KMS threshold decryption (T-of-N)
                           7. Result → execution ──────────► 8. On-chain settlement
                    ◄──────────────────────────────────────── 9. TX signature
```

This is not a mixer, VPN, or private mempool. The computation itself happens on encrypted data using Fully Homomorphic Encryption.

## Swap API

| Method | Description |
|--------|-------------|
| `shield.init()` | Load AFHE WASM encryption module |
| `shield.encrypt(params)` | Encrypt swap params client-side |
| `shield.getQuote(params)` | Get price quote via FHE computation |
| `shield.prepare(params)` | Build unsigned Jupiter transaction |
| `shield.execute(id, tx)` | Sign and submit via Jito |
| `shield.swap(params)` | All-in-one: encrypt + prepare + sign + execute |
| `shield.health()` | Check gateway connectivity |

## Core Encryption API

| Category | Functions |
|----------|-----------|
| **Encrypt** | `encryptInt`, `encryptString`, `encryptBinary` |
| **Arithmetic** | `add`, `subtract`, `multiply`, `divide` |
| **Compare** | `compareEnc` (encrypted result — coprocessor can't see outcome) |
| **Logic** | `xor`, `and`, `or`, `not` |
| **Math** | `abs`, `sqrt`, `log`, `exp` |
| **String** | `concat` |
| **Crypto** | `sign`, `verify`, `sm3` |

All operations return ciphertext. No decryption occurs outside the KMS.

## Gateway Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/swap/health` | Health check |
| POST | `/api/v1/quote` | Price quote (encrypted input) |
| POST | `/api/v1/swap/prepare` | Prepare unsigned transaction |
| POST | `/api/v1/swap/execute` | Submit signed transaction |
| POST | `/api/v1/tasks` | Generic encrypted task submission |

## Examples

- [Basic Swap](./examples/basic-swap) — Simplest integration
- See [docs/architecture.md](./docs/architecture.md) for detailed coprocessor flow

## Links

- **Live Demo:** [shield.afhe.io](https://shield.afhe.io)
- **Docs:** [docs.afhe.io](https://docs.afhe.io)
- **Website:** [afhe.io](https://afhe.io)

## License

MIT
