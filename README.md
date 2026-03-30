# @aura/shield-sdk

Fully Homomorphic Encryption for Solana. Encrypt user data in the browser, compute on ciphertext, decrypt only when needed — one function call.

> **[IMAGE: Network tab comparison — Jupiter plaintext vs Shield ciphertext]**

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
  tokenIn: 'USDC'
})
```

That's it. Your user's swap intent was encrypted in their browser. Token resolution, amount validation, and fee calculation all happened on ciphertext. Nobody saw plaintext until the final execution.

## What This Does

The AFHE SDK encrypts user data client-side using Fully Homomorphic Encryption (FHE). The encrypted data is processed by Aura's coprocessor network — all computation happens on ciphertext. No node in the pipeline ever sees plaintext.

This is not a mixer, not a VPN, not a private mempool. The computation itself happens on encrypted data.

## How It Works

1. User's browser encrypts swap intent via AFHE WASM
2. Encrypted payload sent to coprocessor network
3. Coprocessor performs token resolution, validation, fees — all on ciphertext
4. KMS decrypts only the final output for execution
5. Swap executes via Jupiter + Jito

## API

### `shield.init()`
Loads the AFHE WASM encryption module.

### `shield.encrypt({ tokenOut, amountOut, tokenIn })`
Encrypts swap parameters client-side. Returns encrypted intent.

### `shield.submit(encryptedIntent)`
Submits encrypted intent to the coprocessor network. Returns quote.

### `shield.execute(quote)`
Signs and submits the swap transaction via Jito.

### `shield.swap({ tokenOut, amountOut, tokenIn })`
Convenience method: encrypt + submit + execute in one call.

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
