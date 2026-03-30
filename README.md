# @aura/shield-sdk

Fully Homomorphic Encryption for Solana. Encrypt swap data in the browser, compute on ciphertext, decrypt only at execution.

## Quick Start

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

Your user's swap intent was encrypted in their browser using AFHE. Token resolution, amount validation, and fee calculation all happened on ciphertext in the coprocessor network. Plaintext only existed at two points: the user's browser and the final KMS decryption for Jupiter execution.

## How It Works

```
Browser                    Coprocessor Network              Solana
─────────────────          ──────────────────────           ──────
1. User inputs swap
2. AFHE WASM encrypts ──►  3. Gateway receives ciphertext
                           4. Nodes compute on ciphertext:
                              - Token resolution (EvalLUT)
                              - Amount validation (CompareEnc)
                              - Fee calculation (DivideCipher)
                              - All via homomorphic ops
                           5. Verification (2-node recompute)
                           6. KMS threshold decryption
                           7. Jupiter quote + swap tx ──────► 8. Jito submission
                                                              9. On-chain settlement
                    ◄──────────────────────────────────────── 10. TX signature
```

This is not a mixer, not a VPN, not a private mempool. The computation itself happens on encrypted data using 55 homomorphic operations from the AFHE SDK.

## API

### `shield.init()`
Loads the AFHE WASM encryption module. Must be called before any other method.

### `shield.encrypt(params)`
Encrypts swap parameters client-side. Each field becomes AFHE ciphertext. Returns an `EncryptedIntent` matching the coprocessor gateway's `TaskInput` schema.

### `shield.getQuote(params)`
Encrypt + submit to get a price quote. The coprocessor runs FHE computation and returns the estimated Jupiter output amount.

### `shield.prepare(params)`
Encrypt + FHE compute + verify + threshold decrypt + build unsigned Jupiter transaction. Returns a `PrepareResult` with the transaction ready for wallet signing.

### `shield.execute(sessionId, swapTransaction)`
Sign the prepared transaction and submit via Jito for MEV-protected inclusion.

### `shield.swap(params)`
Full flow in one call: encrypt + prepare + sign + execute. Returns `{ signature, outAmount, sessionId }`.

### `shield.health()`
Check if the coprocessor gateway is reachable.

## Step-by-Step Usage

For more control, use the individual methods:

```typescript
// 1. Encrypt locally (no network call)
const intent = shield.encrypt({ tokenOut: 'SOL', amountOut: 1e9, tokenIn: 'USDC' })

// 2. Prepare: FHE computation + unsigned Jupiter tx
const prepared = await shield.prepare({ tokenOut: 'SOL', amountOut: 1e9, tokenIn: 'USDC' })

// 3. Execute: sign + submit via Jito
const result = await shield.execute(prepared.sessionId, prepared.swapTransaction)
```

## Gateway API

The SDK communicates with the coprocessor gateway at these endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/swap/health` | Health check |
| POST | `/api/v1/quote` | Get price quote (encrypted input) |
| POST | `/api/v1/swap/prepare` | Prepare unsigned transaction |
| POST | `/api/v1/swap/execute` | Submit signed transaction via Jito |

## Examples

See [examples/basic-swap](./examples/basic-swap) for the simplest integration.

## Architecture

See [docs/architecture.md](./docs/architecture.md) for how the coprocessor network processes encrypted computation.

## Links

- **Live Demo:** [shield.afhe.io](https://shield.afhe.io)
- **Documentation:** [docs.afhe.io](https://docs.afhe.io)
- **Website:** [afhe.io](https://afhe.io)

## License

MIT
